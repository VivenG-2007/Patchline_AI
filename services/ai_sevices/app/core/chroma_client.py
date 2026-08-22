"""
Chroma Cloud client for the RAG memory pipeline (app/core/memory_store.py).

Chroma's Python SDK is synchronous only (no native asyncio client for
CloudClient as of chromadb 1.5.x), so every call site dispatches through
asyncio.to_thread — this service is FastAPI/async end-to-end (see
app/core/db.py's motor client), and a blocking network call made directly on
the event loop would stall every other in-flight request while it waits on
Chroma's API.

get_collection() lazily builds one process-wide CloudClient + Collection
handle (mirrors app/core/db.py's _client/_db singleton pattern) so the
TLS handshake and API-key auth only happen once per process, not once per
request.
"""

from __future__ import annotations

import asyncio
from typing import Optional

import chromadb
from chromadb.api import ClientAPI
from chromadb.api.models.Collection import Collection

from app.config import get_settings

_client: Optional[ClientAPI] = None
_collection: Optional[Collection] = None


def _build_client() -> ClientAPI:
    settings = get_settings()
    if not settings.chroma_api_key:
        raise RuntimeError("CHROMA_API_KEY is not configured")
    # tenant/database may be None — CloudClient resolves them from the API
    # key's scope as long as the key is scoped to a single database.
    return chromadb.CloudClient(
        tenant=settings.chroma_tenant or None,
        database=settings.chroma_database or None,
        api_key=settings.chroma_api_key,
    )


def _get_collection_sync() -> Collection:
    global _client, _collection
    if _collection is not None:
        return _collection
    settings = get_settings()
    if _client is None:
        _client = _build_client()
    # "cosine" matches this pipeline's prior brute-force cosine-similarity
    # behavior (the old app/services/embeddings.py:cosine_similarity path) —
    # Chroma's HNSW index defaults to "l2" otherwise, which would silently
    # change what "similar" means without this.
    _collection = _client.get_or_create_collection(
        name=settings.chroma_collection,
        metadata={"hnsw:space": "cosine"},
    )
    return _collection


async def get_collection() -> Collection:
    """Returns the (lazily-created) finding_memory collection, connecting to
    Chroma Cloud on first use. Raises if CHROMA_API_KEY is unset or the
    connection fails — callers (memory_store.py) are expected to catch this
    alongside their other best-effort error handling."""
    return await asyncio.to_thread(_get_collection_sync)


def reset() -> None:
    """Test-only: drop the cached client/collection so the next
    get_collection() call rebuilds them against current settings."""
    global _client, _collection
    _client = None
    _collection = None
