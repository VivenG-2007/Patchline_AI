# Onboarding — new team member

Read this once, top to bottom, before touching code. It'll save you from re-asking
questions that are already answered here or in the linked docs.

## What this project is

One frontend + three independent backends, already wired together with auth, caching,
databases, and file storage. You are **not** building infrastructure this weekend — you're
building on top of infrastructure that already works. Your job is almost entirely in:

- `frontend/app/` — the UI
- `services/main-service/src/controllers/` — your product's core logic
- `services/ai-storage-service/app/routers/ai.py` — your AI use case (Python/FastAPI)

Everything else (JWT auth, rate limiting, CORS, Docker, deploy scripts) you should rarely
need to touch. If you find yourself editing `middleware/auth.js` or anything in
`auth-service`, stop and ask first — that's shared plumbing every service depends on.

## Advantages of building on this template

**You skip the boring, error-prone setup work.** Auth alone (password hashing, token
issuing, refresh rotation, secure cookies) is a multi-day task to get right and easy to get
subtly wrong. It's already done and tested here.

**No single point of failure in auth.** Every backend verifies JWTs itself using a shared
public key — none of them call auth-service to check if a token is valid. If auth-service
goes down mid-hackathon, everyone who's already logged in keeps working. Only new logins are
affected.

**Adding a feature usually touches one service, not three.** Because main-service's AI/file
proxy is a dumb forward (not a route registry), adding a new AI endpoint means editing
ai-storage-service and the frontend — nothing else needs to "know" the route exists. See
`docs/api.md` for the current route list.

**Caching and rate limiting are already there.** Redis-backed response caching
(`cacheResponse()`) and rate limiting are one line to add to any new route — you don't
reinvent them per endpoint.

**It's honest about performance, not hand-wavy.** The `~3k req/s` figure quoted anywhere in
these docs is a *benchmark target*, not a guarantee — and `load-test/` has real scripts to
measure your actual endpoints instead of trusting a marketing number.

**Deploys are already scripted.** Push to `main` and GitHub Actions deploys the backend that
changed (only that one, via path filters) to Azure. Vercel auto-deploys the frontend. Nobody
should be manually SFTP-ing files anywhere.

**It survives being handed off.** Every service is self-contained with its own
`.env.example`, `Dockerfile`, and `package.json` — if this hackathon repo needs to be split
apart or reused for a different project later, any one service folder can be lifted out and
still runs.

## Getting started (first 20 minutes)

1. **Read `README.md` fully.** It's short and answers "how do I run this" completely.
2. **Ask the team lead for the two things not in the repo:**
   - The already-generated `JWT_PRIVATE_KEY_BASE64` / `JWT_PUBLIC_KEY_BASE64` pair (don't
     regenerate your own — everyone must share the same keypair or nobody's tokens verify
     against anybody else's running services)
   - Supabase and MongoDB connection strings, and the Azure Blob connection string, if
     they're already provisioned for this project
3. **Clone, install, run:**
   ```bash
   git clone <repo> && cd patchline
   npm run install:all
   # paste the shared keys into services/auth-service/.env,
   # services/main-service/.env, and services/ai-storage-service/.env
   npm run docker:up        # or npm run dev if you have local Mongo/Redis already
   ```
4. **Confirm it's alive:** open `http://localhost:3000` — the landing page's "Live status"
   panel should show `auth-service` and `main-service` as online. If either shows
   unreachable, something in step 3 is off — check that service's terminal output first.
5. **Register a test account** through the UI and click around `/dashboard` and `/upload` —
   this exercises all three backends end to end and confirms your local env is fully wired
   before you start changing anything.

## Where to look things up

| Question | Read this |
|---|---|
| "How does login actually work?" | `docs/architecture.md` § Request flow |
| "What routes exist right now?" | `docs/api.md` |
| "How do I add a new endpoint?" | `docs/api.md`, then mirror an existing controller/route pair in the relevant service |
| "How do I deploy my change?" | `docs/deployment.md` |
| "Is this secure enough to actually use?" | `docs/security.md` |
| "How fast is this really?" | `docs/load-testing.md` — run the scripts yourself, don't guess |
| "Something's broken and I don't know why" | `README.md` § Troubleshooting, then check `/health` and `/ready` on the service that's misbehaving |

## Rules of thumb for this codebase specifically

- **Never commit a `.env` file.** Only `.env.example` files are meant to be in git. If you
  accidentally commit real credentials, rotate them immediately, don't just delete the commit.
- **Never put a database URI, service-role key, or the JWT private key in `frontend/`.**
  Anything in `frontend/.env.local` ends up in the browser bundle unless it's the one
  documented exception (`JWT_PUBLIC_KEY_BASE64`, used server-side only by `middleware.ts`).
- **New route = new controller function + new route line**, mirroring what's already there.
  Don't invent a new pattern for validation, error handling, or auth — copy the shape of an
  existing route in the same file.
- **If two of you are touching the same service at once, coordinate.** Nothing here prevents
  merge conflicts; the services being independent doesn't mean two people editing
  `ai-storage-service` simultaneously won't collide.
