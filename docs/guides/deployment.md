<!-- generated-by: gsd-doc-writer -->

# Deployment Guide

Deploy BX Finance to production using **Vercel for the BFF + UI** and **separate container hosting for MCP services**. This guide covers all deployment scenarios — serverless, containerized, and hybrid architectures.

---

## Architecture Overview

BX Finance is a **service-oriented system** with distinct deployment needs:

| Service | Type | Deployment | Reason |
|---|---|---|---|
| `banking_api_server` (BFF) | Node.js/Express | Vercel serverless | Stateless request handler; Upstash Redis for sessions |
| `banking_api_ui` | React SPA | Vercel static | Static files served from Vercel edge |
| `banking_mcp_server` | TypeScript/Node | Docker + Railway/Render/Fly | Requires WebSocket (not supported on Vercel) |
| `banking_mcp_gateway` | TypeScript/Node | Docker + Railway/Render/Fly | Routes & policies; orchestrates token exchange |
| `banking_agent_service` | TypeScript/Node | Docker + Railway/Render/Fly | LangGraph reasoning engine |
| `banking_hitl_service` | Node.js/Express | Docker + Railway/Render/Fly | Consent flow orchestration |
| `banking_mcp_invest` | TypeScript/Node | Docker + Railway/Render/Fly | Optional specialized tools |
| `banking_mortgage_service` | Node.js/Express | Docker + Railway/Render/Fly | Optional mortgage backend |

**Key principle:** BFF (banking_api_server) is the sole OAuth token custodian and entry point. It orchestrates MCP calls to remote services via WebSocket or HTTPS.

---

## Vercel Deployment (BFF + UI)

### Prerequisites

- A Vercel account (free tier sufficient)
- Your banking-demo repository pushed to GitHub
- PingOne credentials (from `npm run setup:fresh`)
- Upstash Redis account (free tier: 10K commands/day, included in Vercel Free)

### Step 1: Connect GitHub to Vercel

1. Go to [vercel.com](https://vercel.com)
2. Click **"New Project"** → **"Import Git Repository"**
3. Select your `banking-demo` GitHub repo
4. Click **"Import"**

Vercel will auto-detect the monorepo and set the **root directory** to `/` (correct).

### Step 2: Configure Build Settings

In **Settings → Build & Development Settings**:

| Setting | Value | Note |
|---|---|---|
| Build Command | Auto-detected | Vercel skips root build; focuses on `api/` and `banking_api_ui/` |
| Output Directory | Empty | Static files from `banking_api_ui/build/` are served automatically |
| Install Command | Auto-detected | Runs `npm ci` in the root and relevant service dirs |

**Root `package.json` has no build command** — Vercel builds only the UI app and the API function separately.

### Step 3: Set Environment Variables

In **Settings → Environment Variables**, add:

#### Session Store (Required)

| Variable | Value | Where to get |
|---|---|---|
| `UPSTASH_REDIS_REST_URL` | `https://*-upstash.io` | Upstash Console → Database → REST API tab → URL |
| `UPSTASH_REDIS_REST_TOKEN` | `Bearer eyJ...` | Upstash Console → REST API tab → Token |

**Get Upstash credentials:**
1. Go to [upstash.com](https://upstash.com) → **"Create Database"** → **"Global"** (recommended)
2. In the database detail page, click **"REST API"** tab
3. Copy the URL and Token into Vercel env vars (exactly as shown — with `https://` prefix and `Bearer ` prefix for token)

#### PingOne OAuth (Required)

Copy these from your `.env` (from `npm run setup:fresh`):

| Variable | Value | Note |
|---|---|---|
| `PINGONE_ENVIRONMENT_ID` | Your env UUID | From PingOne Admin Console → Settings |
| `PINGONE_REGION` | `com` (or your region) | `com`, `eu`, `ca`, `asia` — match your PingOne region |
| `PINGONE_ADMIN_CLIENT_ID` | Web app client ID | OAuth app for BFF ↔ PingOne |
| `PINGONE_ADMIN_CLIENT_SECRET` | Client secret | **Must be quoted** if special chars |
| `PINGONE_USER_CLIENT_ID` | Web app client ID | OAuth app for customer login |
| `PINGONE_USER_CLIENT_SECRET` | Client secret | **Must be quoted** |

#### BFF Configuration (Required)

| Variable | Value | How to generate |
|---|---|---|
| `SESSION_SECRET` | 32+ random chars | `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `NODE_ENV` | `production` | Disables dev middleware; enables strict validation |

**Never set these in production:**
```
SKIP_TOKEN_SIGNATURE_VALIDATION=false    # Always validate JWT signatures
REDIS_URL=...                             # Use UPSTASH_REDIS_REST_URL instead (HTTP, not TCP)
```

#### Optional: MCP Services (if deploying separately)

If your MCP server, gateway, or agent is running on Railway/Render/Fly:

| Variable | Value |
|---|---|
| `MCP_SERVER_URL` | `wss://your-mcp.railway.app` |
| `PINGONE_MCP_TOKEN_EXCHANGER_CLIENT_ID` | Client ID for token exchange actor |
| `PINGONE_MCP_TOKEN_EXCHANGER_CLIENT_SECRET` | Client secret |
| `PINGONE_RESOURCE_MCP_SERVER_URI` | Audience URI for MCP resource (e.g., `https://mcp-server.banking-demo.com`) |

#### PingOne OAuth Redirect URIs

After you get your Vercel URL (e.g., `https://banking-demo.vercel.app`), update **PingOne Applications**:

**For admin login app:**
- Redirect URI: `https://<your-vercel-url>/api/auth/oauth/callback`
- Post Logout Redirect URI: `https://<your-vercel-url>/`

**For customer login app:**
- Redirect URI: `https://<your-vercel-url>/api/auth/oauth/user/callback`
- Post Logout Redirect URI: `https://<your-vercel-url>/dashboard`

### Step 4: Deploy

Once environment variables are set, click **"Deploy"**. Vercel will:

1. Clone the repo
2. Run `npm install` in the root and service directories
3. Build the React UI (`npm run build` in `banking_api_ui/`)
4. Package the BFF (`banking_api_server`) as a serverless function via the Vercel build config
5. Serve static files from `banking_api_ui/build/` with SPA fallback to `index.html`

**Expected build time:** 3–5 minutes on first deploy; 1–2 minutes on redeploy (with cache).

### Step 5: Verify Deployment

After the deploy completes and shows **"Ready"**:

1. Open your Vercel URL (e.g., `https://banking-demo.vercel.app`)
2. Sign out if needed, then sign in with a demo account
3. Check the `/api/auth/debug` endpoint for session health:

```bash
curl https://<your-vercel-url>/api/auth/debug | jq
```

Expected output:
```json
{
  "sessionStoreType": "upstash-rest",
  "sessionStoreHealthy": true,
  "sessionRestored": false,
  "tokenValidationMode": "jwt",
  "nodeEnv": "production"
}
```

If `sessionStoreHealthy: false` → Check Upstash credentials and network access.

---

## Session Store Setup: Upstash Redis

### Why Upstash (not TCP Redis)?

Vercel's serverless environment kills TCP connections between invocations. A connection pooled via `node-redis` (wire protocol) incurs a TLS handshake on every cold start, racing the session read/write window.

**Upstash REST API** uses HTTP — stateless by design:
- No connection pooling needed
- Works behind Vercel's connection-reset firewall
- Supports TTL natively (for session expiry)
- Free tier: 10,000 commands/day (sufficient for dev/demo)

### Local Testing with Upstash

If you want to test Upstash-backed sessions locally (optional):

```bash
export UPSTASH_REDIS_REST_URL="https://your-upstash-url"
export UPSTASH_REDIS_REST_TOKEN="Bearer your-token"
./run-demo.sh
```

Check that login still works and sessions persist across restarts.

### Session TTL and Cleanup

Sessions stored in Upstash expire automatically after 30 days (configurable via PingOne token lifetime). Expired sessions are cleaned up by Upstash's TTL mechanism — no manual cleanup needed.

---

## Docker Deployment (MCP Services)

The MCP server, gateway, and agent services require Docker. You have several hosting options:

### Option A: Railway (Recommended for simplicity)

Railway is Vercel's sibling platform with free credits and a straightforward GitHub integration.

#### 1. Create a Railway project for each service

```bash
# Log in to Railway CLI
railway login

# From the repo root, deploy banking_mcp_server
cd banking_mcp_server
railway init                        # Name: "banking-mcp-server"
railway service add Dockerfile      # Uses ./Dockerfile
railway up                          # Deploys to production
```

Repeat for:
- `banking_mcp_gateway`
- `banking_agent_service`
- `banking_hitl_service`
- `banking_mcp_invest` (optional)

#### 2. Get the deployed URL

After deployment, Railway assigns a domain (e.g., `https://banking-mcp-server-prod.railway.app`).

```bash
railway domain                      # Shows assigned domain
```

#### 3. Set Vercel env vars

In Vercel **Settings → Environment Variables**, add:

```
MCP_SERVER_URL=wss://banking-mcp-server-prod.railway.app
MCP_GATEWAY_URL=wss://banking-mcp-gateway-prod.railway.app
BANKING_AGENT_SERVICE_URL=https://banking-agent-service-prod.railway.app
```

Then redeploy Vercel (`git push` triggers auto-redeploy).

### Option B: Render.com

Similar to Railway but uses a `render.yaml` config file.

```yaml
# Create render.yaml in the repo root
services:
  - type: web
    name: banking-mcp-server
    dir: banking_mcp_server/
    dockerfilePath: Dockerfile
    healthCheckPath: /.well-known/mcp-server
    envVars:
      - key: PORT
        value: 8080
      - key: PINGONE_ENVIRONMENT_ID
        fromDatabase:
          name: config
          property: PINGONE_ENVIRONMENT_ID
```

Connect your repo and Render will auto-deploy on push.

### Option C: Fly.io

Fly.io uses `fly.toml` for configuration:

```toml
# fly.toml
app = "banking-mcp-server"
primary_region = "iad"

[env]
  PINGONE_ENVIRONMENT_ID = "your-id"
  PORT = 8080

[[services]]
  internal_port = 8080
  processes = ["app"]
```

Deploy:
```bash
fly deploy
```

### Dockerfile Best Practices

All Dockerfiles in the repo follow a **multi-stage build pattern**:

```dockerfile
# Build stage
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build:prod && npm prune --production

# Production stage
FROM node:20-alpine
RUN addgroup -g 1001 -S appgroup && adduser -S appuser -u 1001 -G appgroup
WORKDIR /app
COPY --from=builder --chown=appuser:appgroup /app/dist ./dist
COPY --from=builder --chown=appuser:appgroup /app/node_modules ./node_modules
USER appuser
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=15s CMD curl -f http://localhost:8080/health
CMD ["node", "dist/index.js"]
```

This reduces image size by excluding dev dependencies and runs as non-root.

### Environment Variables for Containerized Services

All services read from environment variables at startup (no `.env` file needed in production):

```bash
# Railway / Render / Fly env var settings
PINGONE_ENVIRONMENT_ID=b9817c16-...
PINGONE_REGION=com
PINGONE_ADMIN_CLIENT_ID=...
PINGONE_ADMIN_CLIENT_SECRET="..."    # Quote if special chars
PORT=8080                            # Render/Railway override this; defaults to service port
NODE_ENV=production
```

**Health checks:** Each service exposes a health endpoint:
- MCP server: `GET /.well-known/mcp-server`
- BFF: `GET /health`
- Agent service: `GET /health` or `GET /api/health`

---

## Post-Deploy Verification Checklist

After deploying to Vercel + containerized services, verify:

### 1. BFF is healthy

```bash
curl https://<vercel-url>/health
# Expected: 200 OK, JSON with service status
```

### 2. Session store works

```bash
curl https://<vercel-url>/api/auth/debug | jq '.sessionStoreHealthy'
# Expected: true
```

### 3. UI loads

```bash
curl -I https://<vercel-url>/
# Expected: 200 OK (SPA HTML served with MIME type text/html)
```

### 4. Admin login works

1. Visit https://<vercel-url>/
2. Click **Sign In → Admin**
3. Enter admin credentials from your PingOne test users
4. After callback, verify you see the admin dashboard

### 5. Customer login works

1. Sign out (top-right menu)
2. Click **Sign In → Customer**
3. Enter customer credentials
4. Verify the customer dashboard loads with accounts/transactions

### 6. MCP tools are available (if deployed)

After customer login:
1. Open the **agent sidebar** (right-side panel)
2. Click a tool (e.g., "Get Accounts")
3. Verify the Token Chain shows token exchange events
4. Check that `act` claim is present (if dual-token path is configured)

### 7. Agent service responds

```bash
curl https://<agent-service-url>/health
# Expected: 200 OK
```

### 8. MCP Gateway routes correctly

```bash
curl wss://<mcp-gateway-url>/.well-known/mcp-gateway
# Expected: WebSocket upgrade or gateway metadata
```

---

## Common Deployment Issues

| Symptom | Cause | Fix |
|---|---|---|
| `sessionStoreHealthy: false` | Bad Upstash credentials | Re-enter correct `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` in Vercel env vars |
| Build fails with `MODULE_NOT_FOUND` | Missing TypeScript build in containerized service | Verify `npm run build` runs before launch in Dockerfile; check `npm ci` includes dev deps |
| `invalid_redirect_uri` on login | Vercel URL doesn't match PingOne redirect URI | Update PingOne OAuth app redirects to actual Vercel domain |
| MCP tools show "connecting…" indefinitely | `MCP_SERVER_URL` not set | Add `MCP_SERVER_URL=wss://your-deployed-mcp.app` to Vercel env vars |
| Upstash `timeout` errors | Rate limit or network partition | Check Upstash dashboard for throttling; increase plan if needed; add retry logic in `configStore.js` |
| `ECONNREFUSED` from BFF to containerized service | Service not started or port mismatch | Verify service health endpoint; check port matches env var (PORT=8080 by default) |
| WebSocket upgrade fails | Vercel doesn't support WebSocket | MCP **must** be on Railway/Render/Fly, not Vercel; BFF calls it via `MCP_SERVER_URL` |
| Cold start takes >30s | Vercel re-spinning instances | Normal; subsequent requests are fast. Upstash REST timeout is generous (5s by default) |
| `SKIP_TOKEN_SIGNATURE_VALIDATION not found` | ENV var not unset after dev | Verify it's NOT set in Vercel (leave it unset for production); sign out and back in |

---

## CI/CD Pipeline

The repository includes a GitHub Actions workflow (`.github/workflows/test.yml`) that runs tests on every push/PR:

| Step | Command | Services |
|---|---|---|
| Checkout | `actions/checkout@v4` | — |
| Node setup | `actions/setup-node@v4` (Node 20) | — |
| API tests | `npm test -- --forceExit` | `banking_api_server` |
| UI tests | `npm test -- --watchAll=false` | `banking_api_ui` |

The test suite is **required to pass** before merging to `main`. Vercel auto-previews on PR — if tests fail, the build is still attempted but deploys to a preview URL (not production).

### Triggering a Vercel Deploy

```bash
git push origin main        # Auto-deploys to production
# OR
git push origin feature-x   # Auto-deploys preview URL
```

No additional webhook or CLI command needed — Vercel auto-detects your GitHub push.

---

## Scaling Considerations

### When to scale Vercel BFF

- **Concurrent requests > 100/min** — Vercel auto-scales serverless functions; no configuration needed
- **Memory constraints** — Increase via Vercel Pro plan (default 512 MB; up to 3 GB)
- **Regional latency** — Enable Vercel Edge Functions for request routing (Enterprise)

### When to scale MCP services

- **Throughput > 1000 tool calls/min** — Deploy multiple instances behind a load balancer
  ```bash
  railway run --scale=3    # Railway: 3 concurrent processes
  ```
- **Memory constraints** — Increase plan on Railway/Render/Fly
- **Regional latency** — Deploy regional instances and route via BFF

---

## Disaster Recovery

### Backup & Restore

**Session data (Upstash)** is ephemeral and expires after 30 days — no backup needed.

**Application data** (user accounts, transactions):
- Local dev: stored in `banking_api_server/data/banking.db` (SQLite)
- Production: implement periodic exports via `/api/export` (if exposed) or PingOne Management API

### Rollback Procedure

**Vercel rollback** (within 30 days):
1. Go to Vercel Dashboard → Deployments
2. Find the previous stable deployment
3. Click **"Promote to Production"**

**Containerized service rollback** (Railway/Render/Fly):
- Railway: Rollback via CLI `railway rollback`
- Render: Re-deploy previous commit (`git revert` then push)
- Fly.io: Use `fly releases` and `fly releases rollback`

### Monitoring & Alerts

**Vercel monitoring:**
- Vercel Dashboard → Project → Analytics
- Check `sessionStoreHealthy` at `/api/auth/debug` periodically

**Upstash monitoring:**
- Upstash Console → Database → Stats
- Set up alerts for `commands/day` or latency spikes

**Container monitoring (optional):**
- Railway: Built-in logs and CPU/memory graphs
- Render: Built-in logs and metrics
- Fly.io: `fly logs -a app-name`

---

## Summary

| Deployment Path | Services | Infrastructure | Cost |
|---|---|---|---|
| **Vercel Only** (local MCP) | BFF + UI (Vercel) | Vercel Free (+ mkcert local) | Free (during dev) |
| **Vercel + Railway** (recommended) | BFF + UI (Vercel), MCP/Gateway/Agent (Railway) | Vercel Free + Railway Free | Free (generous free tiers) |
| **Vercel + Render** | BFF + UI (Vercel), MCP/Gateway/Agent (Render) | Vercel Free + Render | Free tier available |
| **Full Docker** (enterprise) | All services (self-hosted Kubernetes or VPS) | AWS/Azure/GCP | Pay-as-you-go |

**For educational demos / proof-of-concept:** Vercel + Railway is the fastest and most cost-effective path.

<!-- VERIFY: Upstash free tier limits (10K commands/day), Vercel Free tier limits (100GB/month bandwidth), Railway/Render/Fly pricing are subject to change and should be verified against current provider documentation -->
