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

## Why Three Independent Backends

- **`auth-service`** is the only service that ever touches the JWT **private** key. It signs access tokens (short-lived, 15m default) and refresh tokens (7d default, rotated on every use, individually revocable via a MongoDB `RefreshToken` collection).
- **`main-service`** and **`ai-storage-service`** each hold only the **public** key and verify every request's JWT signature locally with `jsonwebtoken` / `PyJWT` (`RS256`). Neither ever calls `auth-service` to check a token. This means:
  - The system keeps working for already-logged-in users even if `auth-service` is briefly down.
  - Verification is a cheap local CPU operation, not a network hop — critical for high API throughput (see [`docs/load-testing.md`](file:///c:/Users/viven/Desktop/launchpadx/docs/load-testing.md)).
- **`ai-storage-service`** (Python/FastAPI — the other two services are Node/Express) is deliberately generic: a pluggable AI provider layer (`services/ai-storage-service/app/services/ai_providers/`) plus Azure Blob Storage + MongoDB + Redis + Elasticsearch.

---

## Key Rotation

`JWT_KID` is embedded in every signed token's header. `JWT_PREVIOUS_PUBLIC_KEY_BASE64` provides a dual-key handover window during rotation — see [`docs/security.md`](file:///c:/Users/viven/Desktop/launchpadx/docs/security.md)'s **JWT key rotation** section for the step-by-step procedure.

## Symmetric vs Asymmetric JWTs

This deployment uses **RS256 (asymmetric)**: the tradeoff is a slightly heavier token and key-management step (`npm run generate-keys`) in exchange for `auth-service` being the only service that can *issue* tokens, while every other service can only *verify* them.

---

## The Scan → Fix Pipeline

This section documents the SAST vulnerability detection and fix pipeline.

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
        │  matching via the Semgrep engine
        ├─ Tree-sitter AST — app/services/scanning/treesitter_engine.py,
        │  Patchline's own in-process AST step: parses each file once
        │  (Python, JS/TS/TSX, PHP; C/C++ parse but have no detector rules yet)
        │  and re-derives categories from real syntax nodes
        └─ Regex rules — app/services/scanning/regex_rules.py, plain-text
           pattern matching, used for hardcoded-secret detection
        │  Findings from all three engines are grouped by (file, line, category);
        │  each group collapses to one finding with an evidence list
        ▼
AI supplemental scan + evaluation — model tier "scan" (gpt-4.1-mini)
        │  runs over every file batch; validates/explains/prioritizes the
        │  deterministic findings and reduces false positives
        ▼
Findings persisted: Supabase/Postgres (findings, scan status, audit trail)
        │  + best-effort Jira ticket creation if the user has Jira connected
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
(branch +   for a human to handle manually
 commit +
 PR via
 githubService.createPullRequest)
```

### What's Real vs. What's Aspirational in Circulated Diagrams

> [!NOTE]
> Diagrams of this pipeline used in onboarding materials or slides drift as the code evolves. This section is the source of truth for current implementation details:

- **"Clone" the repository** — does not happen. File collection reads via GitHub API REST calls directly. This is a deliberate security posture (no local code execution surface for untrusted repo content).
- **Tree-sitter AST engine** — `app/services/scanning/treesitter_engine.py` is a Patchline-orchestrated AST step running alongside Semgrep and `regex_rules.py`. All three engines parse/scan source code independently, and findings are deduplicated by `(file, line, category)` in `deterministic_scanner.py`.
- **RBAC (Role-Based Access Control)** — `main-service` User model carries a `role` field and an unused `requireRole()` middleware. Currently, no endpoint gates on role tiers.
- **Grafana / Elasticsearch** — Grafana is not present. Elasticsearch is provisioned in `docker-compose.yml` and connected to `ai-storage-service` via `ES_URL` for full-text search.
- **Audit logs** — Supabase persists scan/fix status transitions and findings (state machine in `scanStore.js` / `findingState.js`), serving as an audit trail.

---

## Memory: Keyword Search vs RAG Retrieval

Two separate modules handle finding lookup and retrieval:

- **`app/core/es_client.py`** — Elasticsearch-backed **keyword / full-text** search over past findings, powering the frontend's command-K search bar (`GET /api/v1/search`). Falls back to a MongoDB regex scan if Elasticsearch is disabled (`app/routers/search.py`).
- **`app/core/memory_store.py`** — RAG **semantic retrieval**: embeds finding metadata and indexes vectors into MongoDB (`finding_memory` collection). When generating a fix, top-k similar past findings and their fix outcomes are retrieved (`retrieve_similar`) and injected into the prompt as prior art context.

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
