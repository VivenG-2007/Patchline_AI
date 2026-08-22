"""
Vector memory for the scan -> fix pipeline's "Remember" step.

Context: app/core/es_client.py already gives this service full-text/keyword
search over past findings (powers the frontend's command-K search bar). What
it does NOT give the pipeline is semantic recall at fix-generation time —
"has something like this been fixed before, and how" — which is what an
agent-hub framing means by "Memory Management: vector DB retrieval". This
module adds that.

  - Storage: a Chroma Cloud collection (app/core/chroma_client.py), one point
    per (scanId, findingId), holding the embedding vector plus the finding's
    title/description/category/severity/file and — once a fix is generated
    and verified — the fix outcome, all as point metadata. No separate
    MongoDB collection for this: Chroma is the source of truth for both the
    vector and the metadata it's retrieved with.
  - Similarity search: Chroma's own HNSW ANN index, scoped server-side to one
    owner's findings that already have a recorded fix via a `where` filter
    (ownerId + hasFix) on the query itself — no need to pull candidates into
    this process to score them, unlike a brute-force scan.
  - Degrades like es_client.py: disabled via RAG_MEMORY_ENABLED, or any
    embedding/Chroma failure, only logs a warning and returns — it can never
    fail a scan or a fix.
"""

from __future__ import annotations

import asyncio
import datetime
from typing import Any, Optional

from app.config import get_settings
from app.core import chroma_client
from app.core.logging import get_logger
from app.services import embeddings

logger = get_logger()


def is_enabled() -> bool:
    return get_settings().rag_memory_enabled


def _doc_id(scan_id: str, finding_id: str) -> str:
    return f"{scan_id}:{finding_id}"


def _embedding_text(finding: dict) -> str:
    parts = [
        finding.get("title") or "",
        finding.get("category") or "",
        finding.get("description") or "",
        f"severity:{finding.get('severity') or ''}",
        f"file:{finding.get('file') or ''}",
    ]
    return "\n".join(p for p in parts if p)


async def index_finding(owner_id: str, scan_id: str, repo: str, finding: dict) -> None:
    """Best-effort: embed one finding and upsert it into the Chroma
    finding_memory collection."""
    if not is_enabled():
        return
    finding_id = finding.get("id")
    if not finding_id:
        return
    try:
        vector = await embeddings.embed(_embedding_text(finding))
        collection = await chroma_client.get_collection()
        metadata: dict[str, Any] = {
            "ownerId": owner_id,
            "scanId": scan_id,
            "findingId": finding_id,
            "repo": repo,
            "title": finding.get("title") or "",
            "category": finding.get("category") or "",
            "severity": finding.get("severity") or "",
            "file": finding.get("file") or "",
            "embeddingProvider": get_settings().embedding_provider,
            "indexedAt": datetime.datetime.utcnow().isoformat() + "Z",
            "hasFix": False,
        }
        await asyncio.to_thread(
            collection.upsert,
            ids=[_doc_id(scan_id, finding_id)],
            embeddings=[vector],
            metadatas=[metadata],
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning("memory_index_finding_failed", scan_id=scan_id, finding_id=finding_id, error=str(exc))


async def record_fix_outcome(
    scan_id: str,
    finding_id: str,
    summary: str,
    verified: bool,
    method: str,
    finding: Optional[dict] = None,
    owner_id: Optional[str] = None,
    repo: Optional[str] = None,
) -> None:
    """Best-effort: attach the fix outcome to the finding's memory point once
    generate_and_verify_fix finishes. If the point was not pre-indexed, upsert it directly
    so Chroma memory is ALWAYS updated."""
    if not is_enabled():
        return
    doc_id = _doc_id(scan_id, finding_id)
    try:
        collection = await chroma_client.get_collection()
        existing = await asyncio.to_thread(collection.get, ids=[doc_id], include=["metadatas"])
        metadatas = existing.get("metadatas") or []

        if metadatas and metadatas[0]:
            metadata = dict(metadatas[0])
            metadata["hasFix"] = True
            metadata["fixSummary"] = summary
            metadata["fixVerified"] = verified
            metadata["fixVerificationMethod"] = method
            metadata["fixRecordedAt"] = datetime.datetime.utcnow().isoformat() + "Z"
            await asyncio.to_thread(collection.update, ids=[doc_id], metadatas=[metadata])
        else:
            # Point missing — construct metadata and upsert into Chroma
            f_dict = finding or {}
            emb_text = _embedding_text(f_dict) if f_dict else summary
            vector = await embeddings.embed(emb_text)
            metadata = {
                "ownerId": owner_id or "",
                "scanId": scan_id,
                "findingId": finding_id,
                "repo": repo or "",
                "title": f_dict.get("title") or summary or "Vulnerability Fix",
                "category": f_dict.get("category") or "",
                "severity": f_dict.get("severity") or "",
                "file": f_dict.get("file") or "",
                "hasFix": True,
                "fixSummary": summary,
                "fixVerified": verified,
                "fixVerificationMethod": method,
                "fixRecordedAt": datetime.datetime.utcnow().isoformat() + "Z",
            }
            await asyncio.to_thread(
                collection.upsert,
                ids=[doc_id],
                embeddings=[vector],
                metadatas=[metadata],
            )
            logger.info("memory_record_fix_outcome_upserted", scan_id=scan_id, finding_id=finding_id)
    except Exception as exc:  # noqa: BLE001
        logger.warning("memory_record_fix_outcome_failed", scan_id=scan_id, finding_id=finding_id, error=str(exc))


async def retrieve_similar(owner_id: str, finding: dict, top_k: int = 3) -> list[dict[str, Any]]:
    """Semantic retrieval for the fix-generation prompt. Returns memory points with exact
    similarity scores computed from ChromaDB vector distance."""
    if not is_enabled():
        return []
    try:
        query_vector = await embeddings.embed(_embedding_text(finding))
        collection = await chroma_client.get_collection()
        result = await asyncio.to_thread(
            collection.query,
            query_embeddings=[query_vector],
            n_results=top_k,
            where={"$and": [{"ownerId": {"$eq": owner_id}}, {"hasFix": {"$eq": True}}]},
            include=["metadatas", "distances"],
        )
        metadatas = (result.get("metadatas") or [[]])[0]
        distances = (result.get("distances") or [[]])[0]
        items: list[dict[str, Any]] = []
        for metadata, distance in zip(metadatas, distances):
            similarity = round(max(0.0, min(1.0, 1.0 - distance)), 4)
            items.append(
                {
                    "similarity": similarity,
                    "title": metadata.get("title"),
                    "category": metadata.get("category"),
                    "severity": metadata.get("severity"),
                    "file": metadata.get("file"),
                    "fixSummary": metadata.get("fixSummary"),
                    "verified": bool(metadata.get("fixVerified", False)),
                }
            )
        return items
    except Exception as exc:  # noqa: BLE001
        logger.warning("memory_retrieve_similar_failed", owner_id=owner_id, error=str(exc))
        return []
