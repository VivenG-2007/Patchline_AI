# API reference

Base URLs are whatever you set in each service's `.env` (`PORT`) — defaults below.

Every authenticated route accepts the token as **either** `Authorization: Bearer <token>` or
the `access_token` httpOnly cookie. The frontend uses cookies; use the Bearer form for curl/Postman.

## auth-service — `http://localhost:5000`

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/register` | public | `{ name, email, password }` → creates user, sets cookies, returns `{ user, accessToken }` |
| POST | `/api/auth/login` | public | `{ email, password }` → sets cookies, returns `{ user, accessToken }` |
| POST | `/api/auth/refresh` | refresh cookie | rotates the refresh token, returns a new access token |
| POST | `/api/auth/logout` | none required | revokes the current refresh token, clears cookies |
| POST | `/api/auth/logout-all` | access token | bumps `tokenVersion`, revokes every refresh token for the user |
| GET | `/api/auth/me` | access token | returns the current user |
| POST | `/api/auth/verify` | public | optional remote check: `{ token }` → `{ valid, payload }` (NOT on the main request path — every service verifies locally) |
| GET | `/api/auth/jwks` | public | returns the current public key + kid |
| GET | `/health` `/ready` `/metrics` | public | liveness / readiness / basic process metrics |

## main-service — `http://localhost:5001` (public: authenticated)

| Method | Path | Auth | Description |
|---|---|---|---|
| ANY | `/api/proxy/*` | access token | forwards to ai-storage-service, e.g. `/api/proxy/api/ai/chat`, `/api/proxy/api/files/upload` |
| GET | `/api/jira/oauth/start` | access token | full-page redirect to Atlassian's OAuth consent screen — link to this, don't fetch() it |
| GET | `/api/jira/oauth/callback` | public (state-verified) | Atlassian redirects here after consent; not JWT-protected since Atlassian carries no app token — the one-time `state` param (bound to a user id in Redis) authenticates it instead. Redirects the browser to `FRONTEND_URL/jira?connected=true` or `?error=...` |
| GET | `/api/jira/status` | access token | `{ connected: boolean, siteName?, siteUrl? }` for the current user |
| DELETE | `/api/jira/disconnect` | access token | deletes the current user's stored Jira OAuth tokens |
| POST | `/api/jira/issues` | access token | `{ summary, description, issueType? }` → creates a ticket using the caller's own connected Jira account, returns `{ issue: { key, id, url } }`. 409 `JIRA_NOT_CONNECTED` if they haven't connected yet, 503 if Jira OAuth isn't configured on the server at all |
| GET | `/api/jira/issues/:key` | access token | looks up a ticket's current status using the caller's own Jira token, e.g. `/api/jira/issues/HACK-42` |
| GET | `/api/github/oauth/start` | access token | full-page redirect to GitHub's OAuth consent screen — link to this, don't fetch() it |
| GET | `/api/github/oauth/callback` | public (state-verified) | GitHub redirects here after consent; same `state`-based auth pattern as Jira's callback. Redirects the browser to `FRONTEND_URL/github?connected=true` or `?error=...` |
| GET | `/api/github/status` | access token | `{ connected: boolean, username?, avatarUrl? }` for the current user |
| DELETE | `/api/github/disconnect` | access token | deletes the current user's stored GitHub OAuth token |
| GET | `/api/github/repos` | access token | lists the caller's own GitHub repositories (`?perPage=` optional, default 30) |
| POST | `/api/github/issues` | access token | `{ owner, repo, title, body? }` → creates an issue in that repo using the caller's own GitHub token, returns `{ issue: { number, url, title } }`. 409 `GITHUB_NOT_CONNECTED` if not connected yet |
| GET | `/health` `/ready` `/metrics` | public | `/ready` also reports Redis connectivity |

## ai-storage-service — `http://localhost:5002` (internal: reached via main-service's proxy, or directly for admin/internal tooling)

**Python / FastAPI.** Interactive OpenAPI docs are auto-generated and available at
`http://localhost:5002/docs` while the service is running — useful for exploring/testing
routes without curl.

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/ai/chat` | access token | `{ messages: [{role, content}], model?, conversationId? }` → persists to `Conversation` |
| POST | `/api/ai/generate` | access token | `{ prompt, model? }` → single-shot generation, no persistence |
| POST | `/api/ai/analyze` | access token | `{ input, instructions?, model? }` → wraps input with an instruction prefix |
| GET | `/api/files` | access token | list the caller's uploaded files |
| POST | `/api/files/upload` | access token | multipart `file` field → uploads to Azure Blob, returns `{ file }` |
| GET | `/api/files/:id` | access token | streams the file back (never buffered fully in memory) |
| DELETE | `/api/files/:id` | access token | deletes from Blob + MongoDB |
| GET | `/health` `/ready` `/metrics` | public | `/metrics` also reports the active `AI_PROVIDER` |

## Error shape (all services)

```json
{
  "error": {
    "message": "human-readable message",
    "code": "MACHINE_READABLE_CODE",
    "requestId": "uuid — also present as the x-request-id response header"
  }
}
```

## Admin-only

None of the sample routes are admin-gated out of the box. `main-service/src/middleware/auth.js`
exports `requireRole('admin')` — add it to any route where `req.user.role !== 'admin'` should
403 (the `role` claim comes straight from the JWT, set at registration in auth-service).
