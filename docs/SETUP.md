# Super Banking — Complete Setup Guide

> **First-time developer?** Follow this guide top-to-bottom to go from a fresh PingOne trial account + fresh repo clone to a running local demo with all three auth flows operational.

---

## 1. Prerequisites

### Software

| Requirement | Version | Check |
|-------------|---------|-------|
| Node.js | 18 LTS or 20 LTS | `node -v` |
| npm | 9+ (bundled with Node) | `npm -v` |
| Git | Any recent | `git --version` |

### Accounts

- **PingOne** free trial at [pingidentity.com](https://www.pingidentity.com/) — you need:
  - Your **Environment ID** (UUID, found under Environments → *your environment* → Settings)
  - Your **Region** suffix: `com`, `eu`, `ca`, `ap`, or `asia`
- Optional for full agent demo: **Groq** free API key at [console.groq.com](https://console.groq.com) (or Google Gemini)

### Clone the repo

```bash
git clone https://github.com/<org>/Banking.git
cd Banking
```

---

## 2. PingOne Application Configuration

You need **three PingOne OAuth applications** (two for browser login, one worker for Management API calls).

**Source of truth:** See [PINGONE_RESOURCES_AND_SCOPES_MATRIX.md](./PINGONE_RESOURCES_AND_SCOPES_MATRIX.md) for authoritative resource server, application, and scope definitions.

### 2.1 Create the Banking API Resource (custom scopes)

Before creating the apps, define the Resource that the custom `banking:*` scopes belong to.

1. PingOne Admin → **Environment** → **Resources** (or **APIs**)
2. Click **Add Resource** → give it any name (e.g. `Super Banking Banking API`)
3. **Audience**: `banking_mcp_01` (or your preferred value; must match `REACT_APP_ENDUSER_AUDIENCE`)
4. Add the following **custom scopes** (consolidated from 14 to 6 scopes):

```
banking:general:read
banking:general:write
banking:admin
banking:sensitive
banking:ai:agent
```

**Note:** Consolidated from 14 scopes to 6 scopes (57% reduction). All capabilities preserved through broader scopes. See [PINGONE_RESOURCES_AND_SCOPES_MATRIX.md](./PINGONE_RESOURCES_AND_SCOPES_MATRIX.md) for the complete scope matrix.

### 2.2 Admin OIDC Application (`admin_client_id`)

Used for **staff login** (`/admin`) and **RFC 8693 Token Exchange** to MCP.

| Setting | Value |
|---------|-------|
| Type | OIDC Web App (or single-page, depending on your template) |
| Grant types | Authorization Code, Refresh Token |
| PKCE enforcement | Required (S256) |
| Redirect URI (local) | `http://localhost:3001/api/auth/oauth/callback` |
| Redirect URI (hosted) | `https://<your-domain>/api/auth/oauth/callback` |
| Token auth method | `client_secret_basic` or `client_secret_post` |
| Required scopes | `openid profile email offline_access banking:general:read banking:general:write banking:admin banking:sensitive banking:ai:agent` |
| Token Exchange | **Enable** if using MCP agent delegation (RFC 8693) |

**Copy the Client ID and Client Secret** — you will use these as `PINGONE_AI_CORE_CLIENT_ID` / `PINGONE_AI_CORE_CLIENT_SECRET`.

### 2.3 End-User OIDC Application (`user_client_id`)

Used for **customer login** (`/dashboard`).

| Setting | Value |
|---------|-------|
| Type | OIDC Web App |
| Grant types | Authorization Code, Refresh Token |
| PKCE enforcement | Required (S256) |
| Redirect URI (local) | `http://localhost:3001/api/auth/oauth/user/callback` |
| Redirect URI (hosted) | `https://<your-domain>/api/auth/oauth/user/callback` |
| Required scopes | `openid profile email offline_access banking:ai:agent banking:general:read banking:general:write` |

**Critical:** Must include `banking:ai:agent` for agent delegation to work. See [PINGONE_RESOURCES_AND_SCOPES_MATRIX.md](./PINGONE_RESOURCES_AND_SCOPES_MATRIX.md) for authoritative scope definitions.

**Copy the Client ID and Client Secret** — these become `PINGONE_AI_CORE_USER_CLIENT_ID` / `PINGONE_AI_CORE_USER_CLIENT_SECRET`.

### 2.4 Management Worker Application (client credentials)

Used by the BFF to call PingOne Management API (read users etc.).

| Setting | Value |
|---------|-------|
| Type | Worker (Client Credentials) |
| Grant types | Client Credentials |
| Required API permissions | `p1:read:user`, `p1:update:user` (assign via Roles or Resource Permissions) |

You can generate a long-lived token from this app and set `PINGONE_MANAGEMENT_API_TOKEN`, **or** set its credentials as `PINGONE_MANAGEMENT_CLIENT_ID` / `PINGONE_MANAGEMENT_CLIENT_SECRET` for the BFF to obtain tokens dynamically.

### 2.5 Create test users

Create at least two PingOne directory users in your environment:

| Username | Role | Notes |
|----------|------|-------|
| `bankadmin` (or any) | Admin | Must exist in PingOne; the BFF's `dataStore` role is set at first login |
| `bankuser` (or any) | Customer | Standard user |

---

## 3. Environment Variables

All three services (BFF, UI, MCP server) read environment variables from `.env` files. The root `.env.example` is the authoritative catalog.

### Quick setup

```bash
# BFF — the primary service
cp banking_api_server/.env.example banking_api_server/.env

# MCP server (optional for local dev)
cp banking_mcp_server/.env.example banking_mcp_server/.env
```

The React UI reads `REACT_APP_*` vars from the **root** `.env` or from its own `.env` file at build time (CRA). For local dev, set them in `/Banking/.env` or in `banking_api_ui/.env`.

### Required variables reference

| Variable | Service | Where to get it | Required? |
|----------|---------|-----------------|-----------|
| `PINGONE_ENVIRONMENT_ID` | BFF | PingOne Admin → Environment → Settings | ✅ Yes |
| `PINGONE_REGION` | BFF | `com` / `eu` / `ca` / `ap` / `asia` | ✅ Yes |
| `PINGONE_AI_CORE_CLIENT_ID` | BFF | Admin OIDC app → Client ID | ✅ Yes |
| `PINGONE_AI_CORE_CLIENT_SECRET` | BFF | Admin OIDC app → Client Secret | ✅ Yes |
| `PINGONE_AI_CORE_USER_CLIENT_ID` | BFF | End-user OIDC app → Client ID | ✅ Yes |
| `PINGONE_AI_CORE_USER_CLIENT_SECRET` | BFF | End-user OIDC app → Client Secret | ✅ Yes |
| `SESSION_SECRET` | BFF | Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` | ✅ Yes |
| `PUBLIC_APP_URL` | BFF | `http://localhost:3000` (local) or your hosted domain | ✅ Yes |
| `REACT_APP_API_URL` | UI | `http://localhost:3001` (local) | ✅ Yes |
| `REACT_APP_ENDUSER_AUDIENCE` | UI | Audience you set on the Banking API resource (§2.1) | ✅ Yes |
| `PINGONE_MANAGEMENT_API_TOKEN` | BFF | Worker app → generate token, or set worker credentials | Optional |
| `MCP_SERVER_URL` | BFF | WebSocket URL of deployed MCP server | Optional |
| `GROQ_API_KEY` | BFF | console.groq.com | Optional (enables NL intents) |
| `REDIS_URL` or `UPSTASH_REDIS_REST_URL` | BFF | Upstash free tier at upstash.com | Optional locally; **required on Vercel** |

> **Config UI alternative:** Instead of `.env` files, launch the app and visit **`http://localhost:3000/config`** to enter PingOne credentials via the browser UI. Settings are encrypted and saved to `banking_api_server/data/persistent/config.db` (SQLite). Either method works.

---

## 4. Running Locally

### Option A — All services in one command (recommended)

```bash
# From repo root
./run-bank.sh
```

`run-bank.sh` starts the BFF and UI concurrently. Check the script header for `PORT` defaults (typically 4000/3002 when using this script vs. the 3001/3000 defaults in `.env.example`). Ensure `banking_api_ui/.env` → `REACT_APP_API_PORT` matches.

### Option B — Start services individually

```bash
# Terminal 1 — BFF
cd banking_api_server && npm install && node server.js

# Terminal 2 — React UI
cd banking_api_ui && npm install && npm start

# Terminal 3 — MCP server (optional; only needed for AI agent flows)
cd banking_mcp_server && npm install && npm start
```

Default ports:

| Service | Port (default) |
|---------|---------------|
| React UI | 3000 |
| BFF | 3001 |
| MCP server | 8080 |

---

## 5. Verifying the Setup

Run through each flow once after startup:

### Flow 1 — Admin login (Authorization Code + PKCE)

1. Visit `http://localhost:3000/marketing`
2. Click **Log In as Admin** (or go to `/admin`)
3. You should be redirected to PingOne → log in with your admin user
4. After callback, land on `/admin`
5. ✅ Admin panel visible, config shows "Connected"

### Flow 2 — Customer login (Authorization Code + PKCE)

1. Visit `http://localhost:3000/marketing`
2. Click **Log In** (customer)
3. PingOne login → land on `/dashboard`
4. ✅ Account cards and transactions visible

### Flow 3 — AI agent (optional, needs MCP server running)

1. Log in as admin (Flow 1)
2. Open the **AI Agent** FAB (floating button, bottom-right)
3. Type a natural-language banking request (e.g. "Show my accounts")
4. ✅ Agent responds with data via MCP tool calls

### Flow 4 — CIBA step-up (optional, needs `CIBA_ENABLED=true`)

1. Log in as customer (Flow 2)
2. Attempt a high-value transfer (above `STEP_UP_AMOUNT_THRESHOLD`, default $250)
3. ✅ App prompts for out-of-band approval (check email / push device)

---

## 6. Vercel Deployment

For production / hosted deployment, see the dedicated guide:

👉 **[docs/VERCEL_SETUP.md](./VERCEL_SETUP.md)**

Key points compared to local:
- Session store **must** be Upstash Redis (`UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`) — Vercel serverless has no persistent memory
- `PUBLIC_APP_URL` must be your Vercel production URL (no trailing slash)
- All PingOne redirect URIs must include the Vercel domain
- Run `npm run setup:vercel` to auto-populate Vercel environment variables

---

## 7. Troubleshooting

### `invalid_state` error after PingOne redirect

**Cause:** Session cookie was lost between the `/authorize` redirect and the callback. Common on Vercel without Redis.  
**Fix:** Set `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`. See [docs/VERCEL_SETUP.md](./VERCEL_SETUP.md).

### `invalid_client` from PingOne token endpoint

**Cause:** Wrong client ID / secret, or wrong token auth method.  
**Fix:** Verify `PINGONE_AI_CORE_CLIENT_ID` / `_SECRET` match the PingOne app exactly. Check `admin_token_endpoint_auth_method` in `/config` matches your PingOne app setting (`basic` vs `post`).

### `invalid_scope` on authorization request

**Cause:** A scope in the request does not exist on the PingOne application or resource.  
**Fix:** Check §2.1 — all `banking:*` scopes must be added to the PingOne Resource and assigned to the OIDC app. See [docs/PINGONE_APP_SCOPE_MATRIX.md](./PINGONE_APP_SCOPE_MATRIX.md) for the full scope matrix.

### Blank dashboard / no accounts after login

**Cause:** BFF cannot connect to PingOne JWKS for token validation, or `REACT_APP_API_URL` points to wrong port.  
**Fix:** Check `REACT_APP_API_URL` in the UI env matches the BFF port. Visit `/api/auth/debug` to see session state. Enable `DEBUG_OAUTH=true` in the BFF for verbose logging.

### MCP tool calls return 401 / "missing scope"

**Cause:** Token exchange is not enabled on the admin PingOne app, or `REACT_APP_AI_AGENT_AUDIENCE` doesn't match the MCP resource audience.  
**Fix:** Enable Token Exchange on the admin OIDC app (§2.2). Verify `REACT_APP_AI_AGENT_AUDIENCE` matches the audience configured in the MCP server's `PINGONE_BASE_URL` environment. See [docs/PINGONE_MAY_ACT_ONE_TOKEN_EXCHANGE.md](./PINGONE_MAY_ACT_ONE_TOKEN_EXCHANGE.md) for the 1-exchange delegated chain setup.

### Logout doesn't redirect / silently fails

**Cause:** PingOne OIDC app is missing `postLogoutRedirectUris`.
**Fix:** Use the automatic fix endpoint (choose your setup):

**Standard development (UI on port 3000, API on port 3001):**
```bash
curl -X POST http://localhost:3001/api/admin/app-config/fix-logout-urls \
  -H "Content-Type: application/json" \
  -H "Cookie: <your-session-cookie>" \
  -d '{"publicAppUrl": "http://localhost:3000"}'
```

**run-bank.sh development (UI on port 4000, API on port 3002):**
```bash
curl -X POST http://localhost:3002/api/admin/app-config/fix-logout-urls \
  -H "Content-Type: application/json" \
  -H "Cookie: <your-session-cookie>" \
  -d '{"publicAppUrl": "http://localhost:4000"}'
```

Or manually add logout URIs in PingOne Console → Applications → your app → Settings → Sign-Off URLs. Add both `:3000` and `:4000` for maximum flexibility.

### Audit PingOne app configuration

Run the built-in audit to check both apps for common issues:
```bash
curl http://localhost:3001/api/admin/app-config/audit/all \
  -H "Cookie: <your-session-cookie>"
```
Returns structured report with issues (missing logout URIs, PKCE not enforced, missing localhost URIs, etc.) and passes.

---

## 8. API Reference — Admin App Config

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/admin/app-config/admin` | GET | Get Admin OIDC app PingOne config |
| `/api/admin/app-config/user` | GET | Get User OIDC app PingOne config |
| `/api/admin/app-config/fix-logout-urls` | POST | Fix logout URLs on both apps |
| `/api/admin/app-config/audit/all` | GET | Audit both apps for issues |

All endpoints require authentication (session cookie or Bearer token).
