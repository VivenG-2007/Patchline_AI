# Architecture

```
                         ┌───────────────────────┐
                         │        Vercel          │
                         │   frontend (Next.js)   │
                         └───────────┬─────────────┘
                                     │ HTTPS, credentials: include
                                     ▼
                    ┌────────────────────────────────────┐
                    │        main-service (Azure)         │
                    │  Supabase · Redis · rate limiting   │
                    │  verifies JWT locally (RS256)       │
                    └───────┬───────────────────┬─────────┘
                            │                    │
                 JWT verified locally  ┌─────────┘  JWT verified locally
                            │          │            (proxy /api/proxy/*)
                            ▼          ▼
        ┌─────────────────────┐   ┌───────────────────────────┐
        │   auth-service        │   │  ai-storage-service        │
        │   (Azure)              │   │  (Azure)                    │
        │   MongoDB (users)      │   │  MongoDB · Redis · Azure Blob│
        │   owns JWT PRIVATE key │   │  AI provider abstraction    │
        └─────────────────────┘   └───────────────────────────┘
```

## Why three independent backends

- **auth-service** is the only service that ever touches the JWT **private** key. It signs
  access tokens (short-lived, 15m default) and refresh tokens (7d default, rotated on every
  use, individually revocable via a MongoDB `RefreshToken` collection).
- **main-service** and **ai-storage-service** each hold only the **public** key and verify
  every request's JWT signature locally with `jsonwebtoken` (`RS256`). Neither ever calls
  auth-service to check a token. This means:
  - The system keeps working for already-logged-in users even if auth-service is briefly down.
  - Verification is a cheap local CPU operation, not a network hop — important for the
    main-service throughput target (see `docs/load-testing.md`).
- **ai-storage-service** (Python/FastAPI — the other two services are Node/Express) is
  deliberately generic: a pluggable AI provider layer
  (`services/ai-storage-service/app/services/ai_providers/`) plus Azure Blob + MongoDB +
  Redis.

## Key rotation

`JWT_KID` is embedded in every signed token's header. `JWT_PREVIOUS_PUBLIC_KEY_BASE64` gives
a dual-key handover window during rotation — see docs/security.md's "JWT key rotation"
section for the actual procedure.

## Symmetric vs asymmetric JWTs

This deployment uses **RS256 (asymmetric)**: the tradeoff is a slightly heavier token and
key-management step (`npm run generate-keys`) in exchange for auth-service being the only
service that can *issue* tokens, while every other service can only *verify* them.

---

## The scan → fix pipeline

This is the part that actually makes Patchline a SAST product rather than a generic
auth-microservice template — worth documenting precisely, because a diagram of this
pipeline circulates informally (screenshots, onboarding decks) and drifts from what's
actually implemented as the code evolves. This section is the source of truth; if the two
disagree, trust this file (or better, trust the code and file a correction here).

```
Developer pushes / opens a PR
        │
        ▼
GitHub repo — webhook fires (push / pull_request)
        │  HMAC-SHA256 signature verified against GITHUB_WEBHOOK_SECRET
        │  (services/main-service/src/controllers/githubController.js)
        ▼
main-service: POST /api/github/webhook
        │  enqueues a scan job, responds 202 Accepted immediately —
        │  the webhook handler never blocks on the scan itself
        ▼
Redis + BullMQ  (scanner-scan queue)
        │  SCAN_WORKER_CONCURRENCY concurrent jobs per worker instance ×
        │  worker instance count — see docs/deployment.md § 8
        ▼
Scan worker (services/main-service/src/workers/scannerWorkers.js)
        │  calls ai-storage-service POST /api/v1/scanner/scan
        ▼
File collection (ai-storage-service, app/routers/scanner.py)
        │  fetches the repo tree + file contents via the GitHub REST API
        │  (git/trees + raw.githubusercontent.com) — NOT a local git clone.
        │  Deliberate: this service never clones or executes target-repo
        │  code, only reads file contents over HTTPS. See docs/security.md.
        │  Language selection is a file-extension allowlist
        │  (_SCANNABLE_EXTENSIONS), not a parser/AST step of its own.
        ▼
Deterministic scanner (app/services/deterministic_scanner.py — orchestrator)
        ├─ Semgrep SAST — semgrep-rules/patchline-rules.yml, real AST/pattern
        │  matching via the Semgrep engine (which is tree-sitter-based
        │  internally, but that's Semgrep's own parser — not the step below)
        ├─ Tree-sitter AST — app/services/scanning/treesitter_engine.py,
        │  Patchline's own in-process AST step: parses each file once
        │  (Python, JS/TS/TSX, PHP; C/C++ parse but have no detector rules
        │  yet) and re-derives the same categories from real syntax nodes
        │  (e.g. a call whose argument is a `binary_operator`/interpolated
        │  string, not a literal) — independent of Semgrep, and a
        │  same-process fallback if the semgrep binary is unavailable
        └─ Regex rules — app/services/scanning/regex_rules.py, plain-text
           pattern matching, used for hardcoded-secret detection (a text-
           shape problem even for real SAST tools) and as a same-process
           fallback if neither of the above is available
        │  Findings from all three engines are grouped by (file, line,
        │  category); each group collapses to one finding with an
        │  `evidence` list of every engine that independently caught it
        ▼
AI supplemental scan + evaluation — model tier "scan" (gpt-4.1-mini)
        │  runs over every file batch; validates/explains/prioritizes the
        │  deterministic findings (given each finding's cross-engine
        │  evidence + the specific Tree-sitter AST node at that line, not
        │  just the raw snippet) and reduces false positives
        ▼
Findings persisted: Supabase/Postgres (findings, scan status, audit trail)
        │  + best-effort Jira ticket creation if the user has Jira connected
        │  (never fails the scan job itself — see jiraService.js)
        ▼
Human reviews findings in the UI, clicks Approve on one
        │
        ▼
Fix worker (scanner-fix queue) → ai-storage-service
POST /api/v1/scanner/generate-and-verify-fix
        │  1. Generate a patch — model tier "fix" (gpt-5.2)
        │  2. Verify the patch — model tier "verify" (codex-5.3), a full
        │     re-run of the SAME deterministic scanner (Semgrep + Tree-sitter
        │     + regex) against the patched file, plus an AI correctness check
        ▼
   ┌────┴────┐
 PASS       FAIL
   │           │
   ▼           ▼
GitHub PR   Retry (up to MAX_FIX_ATTEMPTS = 3), then FIX_NEEDS_REVIEW
(branch +      for a human to handle manually
 commit +
 PR via
 githubService.createPullRequest)
```

### What's real vs. what's aspirational in circulated diagrams

A diagram of this pipeline has been passed around (onboarding materials, this doc's own
earlier draft) that's mostly accurate but overstates a few components as literally
implemented when they're either not present or work differently:

- **"Clone" the repository** — doesn't happen. See "File collection" above; this is a
  deliberate security posture (no local exec surface for untrusted repo content), not an
  oversight to "fix" toward matching the diagram.
- **Tree-sitter as its own pipeline stage** — this one used to be aspirational (see git
  history) but is now real: `app/services/scanning/treesitter_engine.py` is a
  Patchline-orchestrated AST step, independent of Semgrep's internal parser, that runs
  alongside Semgrep and regex_rules and feeds the same deduped/evidence-tagged finding list.
  One thing the old circulated diagram still gets wrong, though: it's not a
  `TREE-SITTER → {SEMGREP, PATCHLINE REGEX RULES}` fan-out where Tree-sitter feeds the other
  two engines' input. All three engines parse/scan the same source independently and in
  parallel; Tree-sitter's output only meets the other two afterward, at the aggregator's
  dedupe-by-`(file, line, category)` step (see deterministic_scanner.py), where it
  contributes corroborating evidence rather than upstream input.
- **RBAC** — main-service's User model has a `role` field and an unused `requireRole()`
  middleware (leftover from the auth-microservice template this was built from), but no
  endpoint actually gates on it. There is no admin/user permission tiering in the product
  today. Removing the field means reshaping the JWT payload across auth-service,
  main-service, and ai-storage-service, so it's left as a deliberate call for whoever adds
  real permission tiers rather than an incidental cleanup. (`src/routes/itemsRoutes.js`,
  the unrelated CRUD demo route this note used to also flag, has since been removed — it
  had nothing to do with scanning.)
- **Grafana** — not present anywhere in this codebase (no compose service, no dashboards,
  no dependency). Elasticsearch **is** real — already provisioned in `docker-compose.yml`
  and wired to ai-storage-service via `ES_URL`, though check what it's actually indexing
  before assuming it covers "logs/search" in the way a diagram implies.
- **Audit logs** — Supabase persists scan/fix status transitions and findings (the state
  machine in `scanStore.js`/`findingState.js` doubles as an audit trail of sorts), but there
  is no dedicated, queryable audit-log feature or table beyond that.

---

## Memory: keyword search vs. RAG retrieval

Two separate things in this codebase both answer "have we seen something like this before?",
and it's worth being precise about which is which:

- **`app/core/es_client.py`** — Elasticsearch-backed **keyword/full-text** search over past
  findings, powering the frontend's command-K search bar (`GET /api/v1/search`). Falls back to
  a Mongo regex scan if ES isn't configured (`app/routers/search.py`). This existed before the
  RAG addition below and still only does lexical matching — it has no notion of "similar in
  meaning."
- **`app/core/memory_store.py`** — the actual RAG piece: **semantic** retrieval, added so that
  fix generation isn't cold every time. This is the "Remember" step:

  ```
  Scan findings (per scan)                     New finding (fix requested)
          │                                              │
          ▼                                              ▼
  Embed finding text                           Embed finding text
  (app/services/embeddings.py)                 (same embed() call)
          │                                              │
          ▼                                              ▼
  Upsert into MongoDB                          Cosine-similarity scan over this
  finding_memory collection                    owner's finding_memory docs that
  (index_finding)                              already have a fix attached
                                                (retrieve_similar, top_k=3)
                                                          │
                                                          ▼
                                                Top-k similar past findings +
                                                their fix outcomes spliced into
                                                the fix-generation prompt as
                                                "SIMILAR PAST FIXES" context
                                                          │
                                                          ▼
                                                _generate_fix (gpt-5.2) generates
                                                the patch with that prior art
                                                          │
                                                          ▼
                                                record_fix_outcome writes the
                                                result back onto the same memory
                                                doc, closing the loop for the
                                                next similar finding
  ```

  - **Storage**: plain MongoDB (`finding_memory` collection, one doc per
    `(scanId, findingId)`) — not a dedicated vector database. Similarity search is brute-force
    cosine similarity in Python over one owner's stored vectors, capped at
    `MEMORY_SEARCH_SCAN_LIMIT` (500) documents per call. This is a deliberate scale tradeoff,
    not an oversight — see `memory_store.py`'s module docstring for the reasoning and for what
    swapping in a real ANN index (pgvector/Qdrant/Atlas Vector Search) would touch.
  - **Embeddings**: `app/services/embeddings.py`, same provider-selection pattern as
    `ai_providers/`. Defaults to `EMBEDDING_PROVIDER=mock` — a deterministic hash-based vector
    with zero dependencies, so the whole index → retrieve → augment path runs and can be
    exercised with no API key. It is **not** semantically meaningful (it won't actually cluster
    similar findings) — set `EMBEDDING_PROVIDER=azure_openai` +
    `AZURE_OPENAI_EMBEDDING_DEPLOYMENT` for real retrieval quality.
  - **What gets embedded**: finding title, category, description, severity, and file path
    (`memory_store._embedding_text`) — not a code diff. `Finding` (the Pydantic model in
    `routers/scanner.py`) doesn't carry a stored snippet today, so a diagram showing "code diff"
    feeding the embedder is aspirational until that field exists; text-level finding metadata is
    what's actually indexed.
  - **Degrades like everything else here**: disabled via `RAG_MEMORY_ENABLED=false`, or any
    embedding/Mongo failure, only logs a warning — indexing and retrieval can never fail a scan
    or a fix. Retrieval only returns memory docs that already have a fix attempt recorded
    (verified or needs-review both count as prior art); an un-attempted similar finding has
    nothing to contribute and is skipped.
