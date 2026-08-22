# Frontend API reference

Every endpoint the frontend actually calls, grouped by which client in
`frontend/lib/api.ts` calls it. Verified against the live controller code
(not just the route file), so response shapes below are what the backend
really sends, not just what the frontend assumes.

**Error shape — identical across all three backends** (Node's `errorHandler.js`
and FastAPI's `errors.py` were built to match on purpose):
```json
{ "error": { "message": "string", "code": "SOME_CODE", "requestId": "uuid" } }
```
Validation errors (`express-validator` / FastAPI's `RequestValidationError`)
add a `"details"` array to that same `error` object.

Auth: unless noted "Public", every endpoint requires the `access_token`
cookie (`requireAuth` / `require_auth`), sent automatically via
`withCredentials: true` on both `authApi` and `mainApi`.

---

## `authApi` → auth-service (`NEXT_PUBLIC_AUTH_API_URL`, default `:5000`)

### `POST /api/auth/register` — Public
Called by: `AuthContext.register()`
```json
// Request
{ "name": "string (1-120)", "email": "string", "password": "string (min 8)" }

// Response 201
{ "user": { "id": "string", "name": "string", "email": "string", "role": "user|admin" },
  "accessToken": "jwt" }
```
Also sets `access_token` + `refresh_token` httpOnly cookies. 409 `EMAIL_TAKEN` if the email exists.

### `POST /api/auth/login` — Public
Called by: `AuthContext.login()`
```json
// Request
{ "email": "string", "password": "string" }

// Response 200 — same shape as register
{ "user": {...}, "accessToken": "jwt" }
```
401 `INVALID_CREDENTIALS` on bad email/password.

### `POST /api/auth/refresh` — Public (reads `refresh_token` cookie)
Called by: the shared axios interceptor in `lib/api.ts` (not called directly by any page) and `middleware.ts` server-side.
```json
// Request: no body — refresh_token cookie only
// Response 200 — same shape as login, rotates both cookies
{ "user": {...}, "accessToken": "jwt" }
```
401 `NO_REFRESH_TOKEN` / `REFRESH_REVOKED` / `REFRESH_STALE` / `INVALID_REFRESH`.

### `POST /api/auth/logout`
Called by: `AuthContext.logout()`
```json
// Request: none
// Response 200
{ "message": "Logged out" }
```
Clears both cookies; revokes the one refresh token used.

### `GET /api/auth/me`
Called by: `AuthContext` on mount (`refreshUser()`)
```json
// Response 200
{ "user": { "id": "string", "name": "string", "email": "string", "role": "user|admin" } }
```
404 if the user was deleted after the token was issued.

*(Not called by the frontend today, but exist on this service: `POST /api/auth/logout-all`, `POST /api/auth/verify`, `GET /api/auth/jwks`.)*

---

## `mainApi` → main-service (`NEXT_PUBLIC_MAIN_API_URL`, default `:5001`)

### GitHub (`githubApi`)

**`GET /api/github/status`** — `github/page.tsx`, onboarding status check
```json
// Response 200
{ "connected": false }
// or
{ "connected": true, "username": "string", "avatarUrl": "string|null", "scopes": "string" }
```

**`GET /api/github/oauth/start?redirect=<path>`** — full-page navigation (not axios), built by `githubApi.connectUrl()`. Redirects to GitHub's consent screen.

**`GET /api/github/oauth/callback`** — Public. GitHub redirects here after consent; app then redirects the browser to `${FRONTEND_URL}${returnTo}?connected=true&provider=github` (or `?error=...`).

**`DELETE /api/github/disconnect`**
```json
// Response 200
{ "message": "GitHub disconnected" }
```

**`GET /api/github/repos`** — `scanner/page.tsx`, `github/page.tsx`
```json
// Response 200
{ "repos": [ { "id": 123, "fullName": "owner/repo", "private": false, "url": "string", "description": "string|null", "updatedAt": "ISO8601" } ] }
```

**`POST /api/github/issues`** — available via `githubApi.createIssue()` (not currently wired to any page's UI)
```json
// Request
{ "owner": "string", "repo": "string", "title": "string (1-250)", "body": "string (optional)" }
// Response 201
{ "issue": { "number": 42, "url": "string", "title": "string" } }
```

### Jira (`jiraApi`)

**`GET /api/jira/status`** — `jira/page.tsx`, onboarding status check
```json
// Response 200
{ "connected": false }
// or
{ "connected": true, "siteName": "string", "siteUrl": "string" }
```

**`GET /api/jira/oauth/start?redirect=<path>`** — full-page navigation, built by `jiraApi.connectUrl()`.

**`GET /api/jira/oauth/callback`** — Public, same pattern as GitHub's.

**`DELETE /api/jira/disconnect`**
```json
{ "message": "Jira disconnected" }
```

**`POST /api/jira/issues`** — `jira/page.tsx` manual "create ticket" form
```json
// Request
{ "summary": "string (1-250)", "description": "string (1-5000)", "issueType": "string (optional, default 'Task')" }
// Response 201
{ "issue": { "key": "HACK-12", "id": "10001", "url": "https://your-site.atlassian.net/browse/HACK-12" } }
```

**`GET /api/jira/issues/:key`** — available via `jiraApi.getIssue()` (not currently wired to any page's UI)
```json
// Response 200
{ "issue": { ...raw Jira Cloud REST v3 issue object... } }
```

### Scanner (`scannerApi`)

**`POST /api/scanner/scan`** — `scanner/page.tsx` "Run scan"
```json
// Request
{ "repoOwner": "string", "repoName": "string", "branch": "string (optional, default 'main')" }
// Response 202 (work is queued, not done yet)
{ "scanId": "scan-xxxxxxxxxx", "status": "QUEUED", "repo": "owner/repo",
  "message": "Scan queued for background processing. Poll GET /api/scanner/status/:scanId for progress and results." }
```

**`GET /api/scanner/status/:scanId`** — `scanner/page.tsx` polls this after both `scan` and `approve-fix`
```json
// Response 200 — shape grows as the scan/fix progresses
{
  "scanId": "scan-xxxxxxxxxx",
  "userId": "string",
  "repoOwner": "string", "repoName": "string", "repo": "owner/repo", "branch": "string",
  "status": "QUEUED | PROCESSING | COMPLETED_WAITING_APPROVAL | SCAN_FAILED",
  "createdAt": "ISO8601", "startedAt": "ISO8601", "completedAt": "ISO8601",
  "findingsCount": 3,
  "findings": [
    { "id": "F-1", "title": "string", "severity": "CRITICAL|HIGH|MEDIUM|LOW",
      "file": "path/to/file", "line": 42, "description": "string",
      "suggestedFix": "string|null", "source": "deterministic|ai",
      "ruleKey": "string|null", "category": "string|null",
      "confidence": "high|medium|low|null (only ever set for source=\"ai\")" }
  ],
  "blobUri": "string|null", "scanTier": "string", "aiAnalysisNote": "string|null",
  "jiraTicket": { "key": "HACK-12", "id": "10001", "url": "string" },
  "error": "string (only present on SCAN_FAILED)",
  "fixes": {
    "F-1": {
      "status": "FIX_QUEUED | FIX_PROCESSING | FIX_VERIFIED | FIX_NEEDS_REVIEW | FIX_FAILED",
      "attempts": 1, "previousStatus": "string",
      "queuedAt": "ISO8601", "startedAt": "ISO8601", "completedAt": "ISO8601",
      "verified": true, "verificationMethod": "deterministic_rescan|ai_review_only",
      "fixBranch": "fix/ai-vuln-f-1-a1b2c3", "summary": "string", "details": "string",
      "pullRequest": { "number": 7, "url": "string", "title": "string" },
      "error": "string (only present on FIX_FAILED)"
    }
  }
}
```
404 `SCAN_NOT_FOUND` (Redis TTL'd it or it never existed), 403 `FORBIDDEN` if it's not your scan.

**`POST /api/scanner/approve-fix`** — `scanner/page.tsx` "Approve & fix" button (the human-approval gate)
```json
// Request
{ "scanId": "scan-xxxxxxxxxx", "findingId": "F-1" }
// Response 202
{ "scanId": "scan-xxxxxxxxxx", "findingId": "F-1", "status": "FIX_QUEUED",
  "message": "Fix queued for background processing. Poll GET /api/scanner/status/:scanId for progress and results." }
```
409 if the finding isn't in an approvable state (already queued/verified, or retry budget exhausted) — `code` is `INVALID_TRANSITION` or `FIX_ATTEMPTS_EXHAUSTED`. 404 `FINDING_NOT_FOUND` / `SCAN_NOT_FOUND`, 403 `FORBIDDEN`.

**`GET /api/scanner/history?limit=20`** — available via `scannerApi.history()` (not currently wired to any page's UI). Proxies straight through to ai-storage-service's own `/api/v1/scanner/history` and returns its response unchanged.

### AI + Files (via `/api/proxy/*` → forwarded to ai-storage-service)

These go through `mainApi.post('/api/proxy/api/ai/...')` etc. — main-service forwards the request as-is (same method/body/headers) to ai-storage-service and relays the response verbatim.

**`aiApi.chat()` → `POST /api/proxy/api/ai/chat`** — `upload/page.tsx`
```json
// Request
{ "messages": [ { "role": "user", "content": "string" } ], "model": "string (optional)", "conversation_id": "string (optional)" }
// Response 200
{ "content": "string", "usage": { "...token counts, provider-dependent..." }, "cached": false }
```

**`aiApi.analyze()` → `POST /api/proxy/api/ai/analyze`** — available via `lib/api.ts` (not currently wired to any page's UI)
```json
// Request
{ "input": "string (1-8000 chars)", "instructions": "string (optional)", "model": "string (optional)" }
// Response 200 — same ChatResponse shape as /chat
{ "content": "string", "usage": {...}, "cached": false }
```

**`filesApi.upload()` → `POST /api/proxy/api/files/upload`** — `upload/page.tsx`
```
// Request: multipart/form-data, field name "file"
// Allowed content-types: image/*, video/*, audio/*, application/pdf, text/*, application/json
// Response 201
{ "file": { "id": "string", "ownerId": "string", "blobName": "string", "originalName": "string",
             "mimeType": "string", "sizeBytes": 12345, "container": "string",
             "metadata": {}, "createdAt": "ISO8601" } }
```

**`filesApi.list()` → `GET /api/proxy/api/files`** — available via `lib/api.ts` (not currently wired to any page's UI)
```json
// Response 200
{ "files": [ {...same shape as above...} ] }
```

*(Also proxied but not currently called by any page: `GET /api/proxy/api/files/:id` — streams the file back; `DELETE /api/proxy/api/files/:id` → 204.)*

---

## Not called by the frontend at all (documented for completeness)

- `POST /api/v1/scanner/generate-and-verify-fix` (ai-storage-service) — only ever called server-to-server, by main-service's fix worker. Never hit directly by the browser.
- `GET /jwks` (auth-service) — for future JWKS-aware clients / key rotation tooling, not consumed by this frontend today.
