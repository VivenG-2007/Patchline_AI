# Deployment

## Azure — the three backend services

Each of `services/auth-service`, `services/main-service`, `services/ai-storage-service` deploys
independently to its own **Azure App Service** (Linux). auth-service and main-service run
natively on the **Node 18** App Service runtime; ai-storage-service is **Python/FastAPI** and
is deployed as a **container** (Web App for Containers) using its Dockerfile, since it runs
under gunicorn with multiple uvicorn workers rather than Azure's built-in Python runtime.

### 1. Create the App Services

```bash
az group create --name hackathon-rg --location eastus

# auth-service and main-service: native Node runtime
for svc in auth main; do
  az appservice plan create --name "plan-$svc" --resource-group hackathon-rg --sku B1 --is-linux
  az webapp create --name "your-$svc-service" --resource-group hackathon-rg \
    --plan "plan-$svc" --runtime "NODE:18-lts"
done

# ai-storage-service: Web App for Containers, pointed at a placeholder image —
# the GitHub Actions workflow (docs § 4 below) overwrites this on every deploy
az appservice plan create --name "plan-ai-storage" --resource-group hackathon-rg --sku B1 --is-linux
az webapp create --name "your-ai-storage-service" --resource-group hackathon-rg \
  --plan "plan-ai-storage" --deployment-container-image-name "mcr.microsoft.com/appsvc/staticsite:latest"
az webapp config appsettings set --name "your-ai-storage-service" --resource-group hackathon-rg \
  --settings WEBSITES_PORT=5002
```

Recommended SKU:

- **B1/B2** for auth-service and ai-storage-service — bursty, not latency-critical
- **P0v3 / P1v3** (Premium v3) for main-service if you're pushing toward the ~3k req/s
  benchmark target in `docs/load-testing.md` — v3-series gives you a dedicated vCPU class
  and better autoscale headroom than the B-series burstable plans

### 2. Configure autoscaling (main-service)

```bash
az monitor autoscale create --resource-group hackathon-rg \
  --resource "your-main-service" --resource-type Microsoft.Web/sites \
  --name main-autoscale --min-count 2 --max-count 10 --count 2

az monitor autoscale rule create --resource-group hackathon-rg \
  --autoscale-name main-autoscale \
  --condition "CpuPercentage > 70 avg 5m" --scale out 2
```

Stateless design (no in-memory session state, Redis-backed rate limiting) means main-service
can scale horizontally without sticky sessions.

### 3. Environment variables

Set each service's `.env.example` keys via `az webapp config appsettings set` or the Portal's
Configuration blade — **never** commit `.env` files. Example:

```bash
az webapp config appsettings set --name your-auth-service --resource-group hackathon-rg \
  --settings JWT_PRIVATE_KEY_BASE64="$(cat private-key-base64.txt)" \
             MONGODB_URI="mongodb+srv://..."
```

### 4. GitHub Actions (included, path-filtered)

`.github/workflows/deploy-<service>.yml` deploys each service only when its own folder
changes, using Azure's OIDC federated login (no long-lived client secret in GitHub).

To set up the federated credential on your App Registration:

```bash
az ad app federated-credential create --id <app-registration-object-id> --parameters '{
  "name": "github-main-deploy",
  "issuer": "https://token.actions.githubusercontent.com",
  "subject": "repo:<org>/<repo>:ref:refs/heads/main",
  "audiences": ["api://AzureADTokenExchange"]
}'
```

**Known gotcha:** if GitHub appends a numeric suffix to your org/repo name during a rename
grace period, the OIDC `sub` claim GitHub sends won't match the subject you registered
(`AADSTS700213`). Check the exact repo name GitHub is currently using and re-create the
federated credential with that suffixed value if you hit this.

Add these repository secrets per service (`AUTH_SERVICE_...`, `MAIN_SERVICE_...`,
`AI_STORAGE_SERVICE_...`): `AZURE_CLIENT_ID`, `AZURE_APP_NAME`, plus shared
`AZURE_TENANT_ID` / `AZURE_SUBSCRIPTION_ID` / `AZURE_RESOURCE_GROUP`.

**ai-storage-service's workflow is container-based**, not a plain code deploy: it builds the
Dockerfile, pushes the image to GitHub Container Registry (`ghcr.io`, using the automatic
`GITHUB_TOKEN` — no extra registry credentials needed), then points the App Service at the new
image tag with `az webapp config container set` and restarts it. This needs the App Service
to already exist as "Web App for Containers" (step 1 above) — the workflow deploys new images
to it, it doesn't create the App Service itself.

### 5. Health checks & monitoring

- Point Azure's built-in Health Check (Portal → Monitoring → Health check) at `/health` for
  each App Service so unhealthy instances are cycled out automatically
- Enable Application Insights on each App Service for request timing, dependency tracking,
  and to visualize the `x-request-id` you'll see in the structured pino logs
- `/ready` reflects actual dependency state (Mongo/Redis connectivity) — use it for readiness
  gates, `/health` for liveness

### 6. Custom domains & HTTPS

App Service provisions a free managed certificate for custom domains
(`az webapp config ssl create --hostname ... `). Since the frontend (Vercel) and backends
(Azure) are different origins, cookies must be `SameSite=None; Secure` (already the default
in `services/auth-service/.env.example`) — this requires HTTPS on both sides, which Azure App
Service and Vercel both provide by default.

### 7. Deployment slots

For zero-downtime deploys, add a `staging` slot per App Service and swap after a smoke test:

```bash
az webapp deployment slot create --name your-main-service --resource-group hackathon-rg --slot staging
# deploy to slot, verify /health, then:
az webapp deployment slot swap --name your-main-service --resource-group hackathon-rg --slot staging
```

### 8. Scanner workers as their own scalable service

By default, main-service's scan/fix BullMQ workers run in-process with the API
(`DISABLE_INLINE_WORKERS=false`) — the simplest thing that works, and fine for low
volume. But it means scaling scan throughput and scaling API request throughput are
the same lever: an autoscale rule tuned for HTTP CPU load (§2 above) isn't the same
shape as what a burst of 50 webhook-triggered scans needs, and vice versa. The same
`main-service` Docker image already supports running as a **standalone worker
process** instead — `node src/worker.js` (or `npm run worker`) — with no code
changes, so this is a deployment-topology decision, not a development one.

**Locally**, `docker-compose.yml` already runs this as its own `worker` service
(alongside main-service's inline workers, not instead of them — BullMQ is built for
multiple concurrent consumers on one queue). Scale it with:

```bash
docker compose up --scale worker=4
```

**On Azure**, deploy it as a fourth App Service, same runtime as main-service, with
its startup command overridden and inline workers on the API turned off so scan
capacity isn't accidentally double-counted or duplicated across both:

```bash
az appservice plan create --name plan-worker --resource-group hackathon-rg --sku B1 --is-linux
az webapp create --name your-scanner-worker --resource-group hackathon-rg \
  --plan plan-worker --runtime "NODE:18-lts"
az webapp config set --name your-scanner-worker --resource-group hackathon-rg \
  --startup-file "npm run worker"
az webapp config appsettings set --name your-scanner-worker --resource-group hackathon-rg \
  --settings REDIS_URL="..." AI_STORAGE_SERVICE_URL="..." INTERNAL_SERVICE_TOKEN="..." \
             SCAN_WORKER_CONCURRENCY=5 FIX_WORKER_CONCURRENCY=4
# The worker process makes no inbound HTTP calls of its own, so it doesn't need a
# public health-check endpoint the way the other App Services do — Azure's
# "Always On" setting (not the /health check) is what keeps it running.
az webapp config set --name your-scanner-worker --resource-group hackathon-rg --always-on true

# Then turn off main-service's inline workers, since the standalone worker now
# owns the scan/fix queues:
az webapp config appsettings set --name your-main-service --resource-group hackathon-rg \
  --settings DISABLE_INLINE_WORKERS=true

# Autoscale the worker plan on queue depth rather than CPU — a scan job is I/O-bound
# (mostly waiting on ai-storage-service/the AI provider), so CPU on the worker
# process itself is a poor proxy for "is there a backlog." A Redis-list-length-based
# custom metric is more accurate if you have Application Insights wired up; a
# time-based or coarse CPU rule is a reasonable placeholder until then:
az monitor autoscale create --resource-group hackathon-rg \
  --resource "your-scanner-worker" --resource-type Microsoft.Web/sites \
  --name worker-autoscale --min-count 1 --max-count 6 --count 2
az monitor autoscale rule create --resource-group hackathon-rg \
  --autoscale-name worker-autoscale \
  --condition "CpuPercentage > 60 avg 5m" --scale out 1
```

**Sizing SCAN_WORKER_CONCURRENCY / FIX_WORKER_CONCURRENCY:** real scan throughput is
`(worker instance count) × (concurrency per instance)`, not concurrency alone — more,
smaller workers survive a single instance restarting without losing all in-flight
capacity, the way more replicas of any stateless service do. But each concurrent scan
job also fans out into its own bounded AI-provider call concurrency inside
ai-storage-service (`_AI_BATCH_CONCURRENCY` / the `asyncio.Semaphore(6)` in
`app/routers/scanner.py`, currently 4–6). So (worker count) × (concurrency) × (~6) is
roughly your peak concurrent AI-provider call count across the whole deployment —
check that against your actual OpenAI/Azure OpenAI rate limit tier before scaling
workers up aggressively; the failure mode of over-scaling here is 429s from the AI
provider, not from Patchline itself.

## OAuth app registration (Jira, GitHub — optional integrations)

Both integrations need one shared piece of setup first: generate
`OAUTH_TOKEN_ENCRYPTION_KEY_BASE64` with `openssl rand -base64 32` and set it on main-service
— this one key encrypts stored tokens for both providers.

### Jira

Register an OAuth 2.0 (3LO) app once at https://developer.atlassian.com/console/myapps/ :

1. Create app → "OAuth 2.0 integration"
2. **Permissions** → add the Jira API scopes: `read:jira-work`, `write:jira-work`,
   `read:jira-user`, `offline_access` (the last one is what makes Jira issue a refresh token)
3. **Authorization** → set the callback URL to your deployed main-service's exact URL:
   `https://your-main-service.azurewebsites.net/api/jira/oauth/callback` — this must match
   `JIRA_REDIRECT_URI` byte-for-byte, including scheme and trailing slash
4. Copy the **Client ID** and **Secret** into main-service's `JIRA_CLIENT_ID` /
   `JIRA_CLIENT_SECRET`
5. Create the `jira_connections` table in Supabase — the `create table` statement is in
   `docs/security.md`

### GitHub

Register an OAuth App once at https://github.com/settings/developers → "New OAuth App":

1. **Homepage URL** → your frontend's deployed URL (e.g. `https://your-app.vercel.app`)
2. **Authorization callback URL** → your deployed main-service's exact URL:
   `https://your-main-service.azurewebsites.net/api/github/oauth/callback` — must match
   `GITHUB_REDIRECT_URI` byte-for-byte
3. Copy the **Client ID** and generate a **Client Secret**, set them as `GITHUB_CLIENT_ID` /
   `GITHUB_CLIENT_SECRET`
4. Create the `github_connections` table in Supabase — the `create table` statement is in
   `docs/security.md`
5. Unlike Jira, there's no refresh-token setup step — classic GitHub OAuth App tokens don't
   expire

If you switch environments (localhost → staging → prod), each provider needs its **own**
registration or at least its own callback URL added to the same app — `JIRA_REDIRECT_URI` /
`GITHUB_REDIRECT_URI` each only ever point at one URL at a time.

## Vercel — the frontend

1. Import the repo in Vercel, set the **root directory** to `frontend/`
2. Add environment variables (Project Settings → Environment Variables):
   - `NEXT_PUBLIC_AUTH_API_URL` = your deployed auth-service URL
   - `NEXT_PUBLIC_MAIN_API_URL` = your deployed main-service URL
   - `JWT_PUBLIC_KEY_BASE64`, `JWT_ISSUER`, `JWT_AUDIENCE` — server-only, used by `middleware.ts`
     for edge route protection (never prefixed `NEXT_PUBLIC_`, so it never reaches the browser
     bundle — safe to store since it's the *public* key)
3. Vercel auto-deploys on push to `main`; no extra workflow file needed
