# Production readiness — current state

Written after closing three specific gaps: the finding/scan state machine, real
deterministic-rescan verification, and the "invalid token after 15 minutes" bug.
This is an honest snapshot, not a checklist to blindly clear — some items are
genuinely fine to defer for a hackathon-derived deployment, others aren't.

## What's already solid

- **Stateless services, Redis-backed queues** — main-service holds no in-process
  state (scan records live in Redis, jobs in BullMQ), so it horizontally scales
  without sticky sessions. Verified this holds for the new state-machine code too
  (`scanStore.transitionFix/transitionScan` read-modify-write against Redis, no
  local caching). auth-service and ai-storage-service now hold no meaningful
  in-process state either — the one thing they were still keeping locally
  (rate-limit counters) moved to Redis this session, so all three backend
  services can run as N replicas behind a load balancer with no sticky
  sessions and no per-instance drift in enforced limits.
- **Auth**: RS256 with a private/public key split (only auth-service ever sees
  the private key), refresh-token rotation with revocation on reuse, bcrypt
  cost-12 password hashing, `tokenVersion` for "log out everywhere."
- **OAuth token handling**: AES-256-GCM at rest, CSRF-state binding on the
  OAuth `start`/`callback` round trip, secrets never reach the frontend.
- **Idempotency**: BullMQ `jobId` reuse on scan/fix enqueue prevents duplicate
  jobs from double-clicks; refresh-token rotation prevents replay.
- **Defense in depth**: main-service verifies JWTs locally *and* ai-storage-service
  verifies them locally too (not just trusting the internal-service token) — now
  extended to the state machine as well (both services independently reject an
  illegal fix transition, not just main-service).
- Structured JSON logs with request-id correlation across all three services.

## Fixed this session

1. **No state machine** → explicit transition tables now enforced in both
   main-service (`src/services/{findingState,scanState}.js`) and
   ai-storage-service (`app/services/state_machine.py`), with bounded retries
   (`MAX_FIX_ATTEMPTS = 3`). Approving an already-verified finding, re-approving
   mid-flight, or calling ai-storage-service's fix endpoint directly all now
   fail with 409 instead of silently proceeding.
2. **AI-opinion-only verification** → `generate_and_verify_fix` now runs the
   same deterministic regex rule that raised the original finding against the
   post-fix content (`_rescan_verify_fix`), with the AI review kept as a
   secondary/explanatory signal. AI-sourced findings (no regex rule to
   re-check) still fall back to AI-only verification — documented in the
   response's `details` field so it's visible, not hidden.
3. **"Invalid token" after ~15 min** → the Next.js edge `middleware.ts` was
   redirecting to `/login` the instant the short-lived `access_token` expired,
   without ever attempting the refresh the client-side axios interceptor
   already knew how to do. Fixed by having middleware attempt a server-side
   refresh first; also added a matching interceptor to `authApi` in
   `lib/api.ts` (previously only `mainApi` had one), since direct calls like
   `/api/auth/me` had the same gap.
4. **In-memory rate limiting on auth-service and ai-storage-service** → both
   now use the same Redis-backed approach main-service already had.
   auth-service gained `src/config/redis.js` (identical pattern to
   main-service's) and its `rateLimiter.js` now uses `rate-limit-redis`
   instead of the package default in-memory store; ai-storage-service's
   `slowapi` limiter now passes `storage_uri=settings.redis_url` instead of
   defaulting to in-process counters — no new infra, since this service
   already held a Redis connection for other state. Both services now ping
   Redis at boot and fail fast if it's unreachable (mirroring the existing
   Mongo/Redis startup checks), and ai-storage-service's `/ready` reports
   Redis health alongside Mongo. Net effect: every stateful piece each
   service owns (rate-limit counters included) now lives in Redis/Mongo, not
   process memory — the whole backend can scale horizontally without a
   service silently losing its own rate limits the moment it isn't the only
   replica handling traffic.
5. **No automated tests for the state machine.** Added
   `test/findingState.test.js` (14 cases) and `test/scanState.test.js`
   (8 cases) in main-service, and `tests/test_state_machine.py` (13 cases) in
   ai-storage-service — happy path, both terminal states, double-approval,
   skip-ahead, the retry-attempt-cap boundary, and the BullMQ-retry self-loop.
6. **No reconciliation job for stuck `FIX_PROCESSING`.** Added
   `app/services/reconciliation.py`: a periodic sweep (default every 5 min)
   that finds any finding stuck in `FIX_PROCESSING` for longer than
   `stuck_fix_processing_minutes` (default 30) and moves it to `FIX_FAILED` —
   the same outcome a normal caught exception already produces, so it becomes
   retryable again via the existing state machine with no special-casing.
   Runs as a background task started/cancelled in `main.py`'s `lifespan`. A
   finding entering `FIX_PROCESSING` now also records `processingStartedAt`
   so the sweep has something to compare against.
7. **GitHub token revocation on disconnect.** `disconnect()` now calls
   GitHub's `DELETE /applications/{client_id}/token` (`githubConfig.revokeToken`,
   Basic-auth'd as the OAuth App) before deleting the local record — best
   effort, the local record is always deleted regardless of whether the
   revoke call succeeds, so a GitHub API hiccup can't leave a user stuck
   mid-disconnect. Does *not* solve token *expiry* — classic OAuth App tokens
   still don't expire on their own, that's inherent to the token type — so a
   token remains live until someone actively disconnects it (now meaningfully,
   at GitHub's end too) or you migrate to a GitHub App. See `docs/security.md`.
8. **CORS wildcard now fails fast in production.** All three services throw
   at startup if `CORS_ORIGINS` contains `*` while `NODE_ENV`/`ENVIRONMENT`
   is `production`, with a comment explaining why (it's the CSRF defense).
   Scoped to production only so local/dev setups with a wildcard for
   convenience aren't broken.
9. **Key rotation now has a dual-key handover window.** All three services
   try the current public key, then fall back to an optional
   `JWT_PREVIOUS_PUBLIC_KEY_BASE64` if configured. Rotating `JWT_KID` no
   longer has to mean an instant mass-logout — see the new "JWT key rotation"
   section in `docs/security.md` for the actual procedure.
10. **Semgrep rule pack validated end-to-end.** Previous session shipped
    `semgrep-rules/patchline-rules.yml` (24 AST rules) but only
    YAML/structure-validated it — no sandbox network access to actually
    install `semgrep`. This session: installed it, ran
    `semgrep --config semgrep-rules/patchline-rules.yml --validate`, which
    caught a real bug (`xss-dangerously-set`'s JSX pattern didn't parse —
    fixed). Then built `semgrep-rules/test_*.{py,js,tsx,php,html,txt}`,
    annotated fixtures (`ruleid:`/`ok:` comments) covering all 24 rules with
    a true-positive and true-negative case each, plus
    `semgrep-rules/validate_rules.py` to run the real rule pack against
    them and assert all 60 expectations *and* that no rule has zero
    fixture coverage (a silently-dead rule otherwise). Standalone script,
    not a pytest case — matches `tests/test_deterministic_scanner.py`'s
    existing policy of never shelling out to the real `semgrep` binary
    from the unit-test suite, and sidesteps `semgrep scan --test` itself
    crashing with `IndexError: tuple index out of range` on a single-file
    rule config (upstream bug, semgrep/semgrep#11391, still open on the
    latest release). Run it with
    `cd services/ai-storage-service/semgrep-rules && python3
    validate_rules.py` before changing any rule's pattern.
11. **Rule pack expanded to 78 rules across 11 languages and validated the
    same way.** A much larger community-contributed pack (SQLi, XSS,
    command injection, path traversal, weak crypto, hardcoded secrets,
    NoSQL injection, log forging, insecure deserialization; Python, JS/TS,
    Java, C#, Go, Ruby, PHP, plus taint-mode rules) replaced the 24-rule
    pack, after fixing bugs the contributed version still had:
    - `patterns:` combines children with AND, not OR — several rules listed
      alternatives as direct `patterns:` siblings instead of nesting them
      under `pattern-either:`, so they could structurally never match
      anything (fixed across ~15 rules).
    - `crypto-md5`/`crypto-sha1` mixed Ruby's `::` syntax into a pattern
      shared across 7 languages — a multi-language rule's patterns must
      each parse as valid syntax in *every* declared language, so this
      broke the pattern for all 7, not just Ruby. Split into
      `crypto-md5`/`crypto-md5-ruby` (and same for sha1).
    - `"..."` inside a string literal is not a wildcard in Semgrep —
      `Cipher.getInstance("DES/...")` only ever matched that literal
      3-character text, never real code. `crypto-des`/`crypto-ecb-mode`
      switched to `pattern-regex` for the Java/C# Cipher-string checks.
    - `cmdi-py-subprocess-string-arg`'s `metavariable-regex` was a sibling
      of `patterns:` at the rule's top level instead of nested inside it —
      silently ignored, so the rule flagged *every* `subprocess.run/call/
      Popen` call regardless of argument type, including safe list args.
    - `crypto-weak-random-java` had a duplicate `languages:` key (Semgrep
      rejects the whole rule file on a duplicate key — 0 rules would have
      loaded, not just this one skipped) and an always-true regex branch
      that fired on any `new Random()` regardless of context, contradicting
      the rule's own "used near security-sensitive naming" message.
    - `crypto-rc4` declared Go support with no pattern that could ever
      match Go's real RC4 API (`crypto/rc4`'s `rc4.NewCipher`) — added it.
    - Same `xss-dangerously-set` JSX bug as the original 24-rule pack.
    Fixture coverage extended to match: `semgrep-rules/test_*.{py,js,tsx,
    java,cs,go,rb,php,html,txt}` plus `cipher_wrapper.go` for the Go-only
    ECB-wrapper rule — **193/193 annotation checks pass, all 78 rules
    confirmed firing** via the same `validate_rules.py` harness. Extension
    coverage in `_SCANNABLE_EXTENSIONS` (ai-storage-service/app/routers/
    scanner.py) already included every language this pack now targets, so
    no scanner-side change was needed for the new rules to actually run
    against fetched files.
12. **Scanner workers now have a real horizontal-scaling story.**
    `src/worker.js` (a standalone `node src/worker.js` process) existed in
    code but wasn't wired into `docker-compose.yml` or the Azure deployment
    docs — the only way to run scan/fix workers was in-process with the API,
    coupling scan throughput and HTTP throughput to the same scaling lever.
    `docker-compose.yml` now runs a dedicated `worker` service (2 replicas
    by default, `docker compose up --scale worker=N` to change it) using
    the same image with its command overridden — it runs *alongside*
    main-service's inline workers rather than requiring them to be
    disabled first, since BullMQ is built for multiple concurrent consumers
    on one queue. `docs/deployment.md` § 8 adds the equivalent Azure
    App Service setup (separate plan, `npm run worker` startup command,
    its own autoscale rule, and the appsetting to turn off main-service's
    inline workers once it's deployed so capacity isn't double-counted).
    Also bumped the concurrency defaults (`SCAN_WORKER_CONCURRENCY` 3→5,
    `FIX_WORKER_CONCURRENCY` 3→4) with an explicit comment in `.env.example`
    on the actual constraint: each concurrent scan job fans out into its
    own bounded AI-call concurrency inside ai-storage-service (4–6 calls),
    so total peak AI-provider load is roughly `workers × concurrency × 6`
    — check that against your actual rate-limit tier before scaling
    workers up further, since over-scaling here fails as 429s from the AI
    provider, not from Patchline.
13. **`docs/architecture.md` rewritten — it was stale template content that
    predated the scan/fix pipeline entirely** (no mention of BullMQ,
    GitHub webhooks, Semgrep, Jira, or scan/fix at all; it was leftover
    from the generic auth-microservice template this was built from). It
    now documents the actual pipeline stage-by-stage, sourced from reading
    the real controllers/workers/routers rather than from any diagram, and
    calls out where a diagram that's circulated for this system (onboarding
    materials) overstates what's implemented: no repo cloning (file
    content is fetched via the GitHub API on purpose — see docs/security.md),
    no separate tree-sitter pipeline stage (Semgrep's engine is tree-sitter-
    based internally, but nothing in this codebase orchestrates it as its
    own step feeding both engines), no working RBAC (a `role` field and
    unused `requireRole()` middleware exist, no endpoint enforces it —
    likely template boilerplate, same as the unrelated `itemsRoutes.js`
    still mounted in main-service), and no Grafana anywhere in the repo
    (Elasticsearch is real and already wired up; Grafana isn't).

## Fixed this session (2026-08-20)

Went through the codebase end to end looking specifically for speed/reliability
issues on top of the prior sessions' security/state-machine work — connection
pool sizes, outbound timeouts, retry/backoff behavior, N+1 query patterns,
blocking Redis calls, Docker build shape, and the one item the previous
session had explicitly flagged as still outstanding:

- **Removed the vestigial `/api/items` demo CRUD route** —
  `src/routes/itemsRoutes.js` and `src/controllers/itemsController.js` in
  main-service were unrelated auth-microservice-template boilerplate, not
  called by the frontend (confirmed against `frontend/app/dashboard/page.tsx`,
  which never referenced it despite a stale doc comment saying it did — that
  comment is fixed too), and not worth carrying into a production build.
  Deleted both files, unmounted the route and its `cacheResponse` usage
  from `app.js`, and updated the five docs/load-test references that
  pointed at it (`README.md`, `docs/api.md`, `docs/frontend-api-reference.md`,
  `docs/load-testing.md`, `load-test/main-benchmark.js`). Net effect besides
  the cleanup itself: one less blocking `redis.keys()` call in the codebase
  (`itemsController.js`'s cache-invalidation helper used `KEYS`, which scans
  the whole keyspace and blocks Redis while it does — the kind of thing that's
  invisible at demo scale and a real latency spike under production load;
  it's gone now along with the route, not patched in place, since nothing
  else needs that invalidation pattern).
- **Audited for the usual perf/reliability failure modes and found the
  existing implementation already covers them** — worth recording so a
  future pass doesn't waste time re-checking the same ground: every outbound
  HTTP call (GitHub, Jira, AI providers, ai-storage-service proxy) already
  has an explicit timeout via `httpClient.js`'s `AbortSignal.timeout()`
  wrapper or per-call `httpx` timeouts; Mongo (`maxPoolSize: 20`) and Redis
  (`retryStrategy` with capped backoff) both have real pool/retry
  configuration rather than defaults; the Python service runs behind
  gunicorn with 4 uvicorn workers rather than a single dev process; both
  Dockerfiles are multi-stage with non-root users and healthchecks; the one
  sequential per-item loop found (`githubController.disconnect`, deleting
  webhooks for each watched repo) is a low-frequency, small-N admin action
  where sequential best-effort deletion is the correct choice, not an
  oversight. No changes made in these areas because there was nothing
  concrete to fix — see "Real gaps" below for what's genuinely still open.
- **AI-finding quality pass — dedup, severity, category, confidence.**
  Followed up on an external review of `_ai_supplemental_scan` (ai-storage-service)
  that checked five specific claims against the actual code; four were real,
  one (file-path normalization) turned out already handled by this
  architecture's GitHub-API-only file collection and was left alone. Fixed:
  - **Severity scale.** AI findings were normalized with a bare
    `item.get("severity", "INFO").upper()` — no whitelist, so a model could
    return a 5th value ("INFO", outside the deterministic engines' strict
    CRITICAL/HIGH/MEDIUM/LOW scale) or any arbitrary string. This was
    already visibly wrong on `app/scanner/page.tsx`: the per-severity
    summary badges only iterated 4 values while the pie chart on the same
    page iterated 5, so the same finding set produced two different totals
    on screen. Added `app/services/severity.py` — a single `normalize()`
    both the AI layer and `semgrep_engine._severity_for` now route through
    — and removed the frontend's 5th INFO bucket from both displays so they
    can't disagree again.
  - **Category.** The AI supplemental prompt never actually asked the model
    for a `category` field, so every AI finding came back with
    `category: null` regardless of what the constructor tried to pass.
    Added `category` to the prompt's JSON spec with a defined label set,
    parsed with an `"Other"` fallback.
  - **Confidence signal.** AI findings had no way to distinguish a confident
    call from a guess — every finding looked equally authoritative next to
    a deterministic one. Rather than a second AI verification pass (2x the
    cost per finding), added a `confidence` field to the same prompt/call
    (`high`/`medium`/`low`, with explicit instruction to under-call rather
    than over-call it), stored on `Finding`, and surfaced as a "Low
    confidence — verify before fixing" badge in the scanner UI.
  - **Dedup.** The AI-vs-deterministic duplicate check only matched an exact
    `(file, line)` plus a keyword from one of 5 hardcoded category strings
    (SQLi/XSS/command-injection/secrets/weak-crypto) — anything with an
    off-by-one line, or a deterministic category outside those 5 (any of
    the other ~73 semgrep-rules categories, or a treesitter-only one),
    passed straight through uncaught. Replaced with a ±2-line window plus a
    normalized-title Jaccard-similarity fallback (`_title_similarity`),
    which still lets a genuinely distinct finding sharing a line survive
    (low title overlap → not a duplicate). Also added dedup among AI
    findings themselves (`_dedupe_ai_findings`) — there was previously none
    at all, so two batches independently flagging the same underlying issue
    both survived as separate findings.
  New tests: `tests/test_severity.py`, `tests/test_ai_dedup.py`. Honest
  limitation carried forward from the review: title-similarity is a token-
  overlap heuristic, not semantic — a duplicate phrased with genuinely
  different vocabulary will still slip through, and "confidence" is the
  model self-rating, not an independent check. If either becomes a real
  problem in practice, the next step is an embedding-based similarity check
  for dedup and/or a second AI pass judging the first for confidence — both
  larger pieces of work, deliberately not taken on here.

## Real gaps before a real production deployment

- **No sandboxing for whatever code review the AI fix step reads/writes** —
  the platform never *executes* the target repo's code (good), but a
  production version handling untrusted repos should still isolate the
  clone/read step. Currently `_collect_repo_files` reads via the GitHub API
  directly (not a local clone), which is actually a reasonable mitigation
  already in place — just worth confirming that stays true if this evolves
  toward local test execution ("the fix is generated ... tested" in the
  product spec implies more than a rescan eventually).
- **GitHub OAuth App tokens still don't expire on their own**, even with
  revocation-on-disconnect now in place (see item 7 above) — that part is
  inherent to classic OAuth Apps, not fixable without migrating to a GitHub
  App with installation tokens. Still the documented fix if this needs to
  handle untrusted/other people's repos at scale, since it also removes the
  "one shared GitHub identity" multi-tenant limitation called out in the
  product spec.
- **Unused RBAC scaffolding remains** — the `role` field on the User model
  and `requireRole()` middleware in `src/middleware/auth.js` are leftover
  from the auth-microservice template this was built from (see
  `docs/architecture.md`'s "what's aspirational" section — a diagram that's
  circulated for this system depicts this as real RBAC, which it isn't; no
  endpoint gates on it today). Left in place deliberately, not fixed this
  session: `role` is already threaded into the JWT payload issued by
  auth-service and verified locally by both main-service and
  ai-storage-service, so removing it is a token-shape change across three
  services, not an incidental cleanup — worth doing as its own pass once
  it's decided whether real permission tiers are coming or not. Until then
  it's inert: an admin-labeled user gets nothing an ordinary user doesn't.
- **Unit Test Infrastructure Offline Redis Dependency** — `services/main-service/test/health.test.js`
  requires `src/app` which transitively instantiates `ioredis` clients. When Redis is un-reachable,
  `ioredis` retries indefinitely, causing offline unit test runs to hang. Unit tests should mock
  Redis connections or configure capped retry counts for test environments.
- **Lack of Circuit Breakers for External AI API Calls** — If the underlying LLM provider (e.g. OpenAI/Anthropic/Azure OpenAI)
  experiences outage, rate limits (429), or elevated latency, `ai-storage-service` worker calls will fail or queue up without backoff.
  A circuit breaker and provider fallback mechanism should be implemented.
- **Database Schema Management & Production Indexing** — Mongo models rely on runtime index creation, and Supabase tables require automated migration scripts in CI/CD rather than manual setup.

## Audit Session (2026-08-22) — Verification & Priority Action Items

1. **Service Dependency Audit**:
   - `auth-service` unit tests passed cleanly (`corsGuard`, `health`, `jwtRotation`).
   - `main-service` dependency installation succeeded; health tests revealed the offline Redis handle retry behavior documented above.
2. **Architecture Evaluation**:
   - Overall Architecture Rating: **8.5 / 10 (Production Ready Baseline for Microservice MVP)**.
   - Core strengths: RS256 token verification without central auth bottlenecks, decoupled worker processes, deterministic static analysis before AI fallback, state-machine backed scan/fix state transitions.

## Consolidated Production Action Plan (What to Change)

| Priority | Area | Action Required | Status / Note |
|---|---|---|---|
| P0 | Unit Tests | Add Redis connection mocking/stubbing or capped retry strategies in `main-service/test` so test suites pass offline without live Redis. | Open |
| P0 | GitHub Integration | Migrate from GitHub OAuth App to GitHub App (Installation Tokens) to enforce short-lived scoped tokens per tenant. | Open |
| P1 | AI Resilience | Add circuit breaker & multi-provider fallback (e.g., Anthropic primary with OpenAI secondary) for `ai-storage-service`. | Open |
| P1 | DB & Migrations | Formalize Supabase/PostgreSQL SQL migrations and explicit Mongo index creation scripts. | Open |
| P2 | RBAC Cleanup | Either fully wire `requireRole` middleware across sensitive endpoints or remove inert `role` field from JWT payload. | Open |
| P2 | Sandboxing | Implement isolated ephemeral execution containers (Docker/gVisor) if fix verification evolves from AST re-scanning to running test suites. | Deferred |

## Net assessment

The core safety property the product spec cares about most — a human has to
approve before AI touches code, and AI can never merge — is now actually
enforced by code, not just by the UI not exposing a button for it. That's the
right bar for a hackathon demo and a reasonable starting point for a real
deployment. Between this session and the previous ones, every item that was
purely additive (tests, a reconciliation sweep, CORS/key-rotation hardening,
GitHub token revocation, the Semgrep rule pack expanding to 78 rules across
11 languages with a real validation suite behind it, scanner workers gaining
an actual horizontal-scaling path, and architecture docs that now describe
the real pipeline instead of a stale template) has been closed. What's left
— sandboxing the read/write path for untrusted repos, the GitHub OAuth App →
GitHub App migration for true token expiry and multi-tenant support, clearing out the vestigial RBAC template boilerplate, and fixing unit test offline Redis stubs — are either genuine architecture-level decisions or a deliberate cleanup pass, not gaps that were simply left undone, and are reasonable to execute as the system scales.

