# Security

## Baseline, applied on every backend service

- `helmet()` for standard security headers
- CORS locked to `CORS_ORIGINS` (comma-separated allow-list), `credentials: true`
- Rate limiting on every route, Redis-backed on all three services (`rate-limit-redis` on
  main-service/auth-service, `slowapi`'s redis storage on ai-storage-service) — limits are
  shared across however many replicas of a service are running, not reset per-instance, so
  every service can scale horizontally without weakening its own rate limits
- Request size limits (`express.json({ limit: ... })`, multer file-size cap)
- `express-validator` input validation on every mutating route
- Centralized error handler that never leaks stack traces in production
  (`NODE_ENV=production` strips internal error messages down to a generic one)
- Request IDs (`x-request-id`) on every request/response/log line for tracing across services
- Structured JSON logs via `pino` — compatible with Azure Log Stream / Application Insights ingestion

## Passwords & tokens

- Passwords hashed with `bcryptjs`, cost factor 12
- Access tokens: 15 minutes, RS256
- Refresh tokens: 7 days, RS256, **rotated on every use** — the old token is marked `revoked`
  in MongoDB the moment a new one is issued, so a replayed stolen refresh token fails
- `User.tokenVersion` lets you invalidate every outstanding refresh token for a user in one
  write (`POST /api/auth/logout-all`) — use this for "log out everywhere" / suspected compromise
- Cookies: `httpOnly`, `Secure`, `SameSite=None` (required for the Vercel↔Azure cross-site
  setup) — set `COOKIE_DOMAIN` if frontend and backend ever share a parent domain

### JWT key rotation

Rotating `JWT_KID` (i.e. generating a new RS256 key pair and switching auth-service to it) used
to invalidate every live session the instant it happened — every service verifies tokens against
a single hardcoded public key, so anything signed under the old key would fail immediately after
the switch, access tokens (15m) and 7-day refresh tokens alike.

All three services (`auth-service`, `main-service`, `ai-storage-service`) now support a **dual-key
handover window**: each tries the current public key first, then falls back to an optional
`JWT_PREVIOUS_PUBLIC_KEY_BASE64` if that's configured (`auth-service/src/utils/jwt.js#verifyToken`,
`main-service/src/middleware/auth.js#verifyLocal`, `ai-storage-service/app/core/security.py#_verify`).
To rotate without logging everyone out:

1. Generate a new key pair (`npm run generate-keys` in `auth-service`).
2. On **all three services**, move the *old* `JWT_PUBLIC_KEY_BASE64` value into
   `JWT_PREVIOUS_PUBLIC_KEY_BASE64` (and the old `JWT_KID` into `JWT_PREVIOUS_KID` on
   `auth-service`), then set `JWT_PUBLIC_KEY_BASE64`/`JWT_KID` to the new values. On
   `auth-service`, also set the new `JWT_PRIVATE_KEY_BASE64` — it's the only service that signs.
3. Deploy. New tokens are signed with the new key; tokens already in users' hands (up to 7 days
   old) keep verifying against the previous key.
4. Once 7 days have passed since the deploy (past `JWT_REFRESH_EXPIRES_IN`, the longest-lived
   token type), remove `JWT_PREVIOUS_PUBLIC_KEY_BASE64`/`JWT_PREVIOUS_KID` from all three services
   — nothing signed under the old key can still be outstanding.

`GET /api/auth/jwks` on auth-service reflects both keys while a rotation is in progress, as a
convenience for double-checking what's actually configured across services.

## File uploads (ai-storage-service)

- MIME-type allow-list (`src/middleware/upload.js`) rejects unexpected file types before
  they reach Azure
- Size cap via `MAX_UPLOAD_BYTES` (default 25MB), enforced by multer before the buffer is fully read
- Filenames sanitized (`sanitizeFilename`) before being used in the blob path
- Blob names are namespaced by `ownerId/uuid.ext` — never trust the client's filename as a path
- Files are streamed on download (`stream.pipe(res)`), never buffered fully server-side

## Secrets

- Nothing in this repo's source ever contains a real secret — every credential is an
  environment variable, and `.env` is gitignored everywhere (`.env.example` is the only
  committed file)
- The JWT **private** key exists only in auth-service's environment. Committing it, or
  pasting it into the frontend's `.env.local`, defeats the entire "other services can't forge
  tokens" property described in `docs/architecture.md`
- `SUPABASE_SERVICE_ROLE_KEY` bypasses Supabase Row Level Security — it lives only in
  main-service, never in `NEXT_PUBLIC_*`

## Third-party OAuth integrations (Jira, GitHub)

Both follow the identical pattern — each user connects **their own** account, there's no
shared service-account credential, and neither integration trusts a JWT on the callback
route (Atlassian/GitHub's redirect carries none).

- **Shared CSRF-state helper** (`src/utils/oauthState.js`): `/oauth/start` for either
  provider generates a random `state` value and binds it to the calling user's id in Redis
  (5-minute TTL, one-time use — deleted the instant the callback consumes it). The callback
  refuses to proceed without a `state` that resolves to a real, still-logged-in user. This is
  what stops an attacker from tricking a victim into completing an OAuth flow that gets
  attributed to the attacker's session instead of the victim's. It's in Redis rather than
  instance memory specifically because `/oauth/start` and `/oauth/callback` can land on
  different backend instances — see `docs/architecture.md` on statelessness.
- **Tokens encrypted at rest**: both `jira_connections` and `github_connections` in Supabase
  store tokens encrypted with AES-256-GCM (`src/utils/crypto.js`), under one shared
  `OAUTH_TOKEN_ENCRYPTION_KEY_BASE64` — generate with `openssl rand -base64 32` and treat it
  with the same care as the JWT private key. A leaked database dump alone isn't enough to
  reconstruct a usable session without this key too.
- **The callback route is intentionally public** (no `requireAuth`) for both providers — the
  `state` check is what authenticates the callback instead of a JWT; don't add `requireAuth`
  back onto either callback route or the flow breaks.
- **Client secrets** (`JIRA_CLIENT_SECRET`, `GITHUB_CLIENT_SECRET`) live only in
  main-service's environment, never in the frontend. If either leaks, regenerate it in the
  respective developer console and every connected user will need to reconnect.
- **GitHub token revocation on disconnect**: `disconnect` calls GitHub's
  `DELETE /applications/{client_id}/token` (`githubConfig.revokeToken`, Basic-auth'd as the
  OAuth App itself) before deleting our stored copy, so disconnecting actually invalidates the
  credential at GitHub too, not just locally. Best-effort — the local record is deleted
  regardless of whether the revoke call succeeds, so disconnect can't get stuck because of a
  transient GitHub API error. Jira's disconnect does not yet do the equivalent revocation call
  for its provider.

**Where they differ**: Jira's tokens expire (1 hour) and rotate on refresh — `jiraService.js`
checks expiry and refreshes automatically on every call. Classic GitHub OAuth App tokens
**don't expire and there's no refresh token** — that's inherent to the OAuth App token type,
not something `revokeToken` changes — so a leaked GitHub token stays valid indefinitely until
someone actively disconnects it (which now revokes it server-side) or you migrate to a GitHub
App, which does support short-lived, refreshable tokens. That migration is still the right
long-term fix if this needs to handle untrusted/other people's repos at scale; revocation-on-
disconnect is the practical mitigation available without that larger change.

## Internal service-to-service trust

`INTERNAL_SERVICE_TOKEN` is attached by main-service's proxy as `x-internal-service-token`
when calling ai-storage-service. It's **not** the primary trust mechanism (ai-storage-service
re-verifies the caller's own JWT regardless) — treat it as an extra signal you can check in
`ai-storage-service` if you later add routes that should only ever be called by main-service,
never directly by the frontend.

## What's intentionally left to you

- Row Level Security policies on your Supabase tables (the service-role key bypasses RLS by
  design — enforce authorization in main-service's route handlers, as the sample `items`
  routes do with `.eq('owner_id', req.user.id)`)
- A WAF / Azure Front Door in front of the App Services if you need DDoS protection beyond
  App Service's own limits
