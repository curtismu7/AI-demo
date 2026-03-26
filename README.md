# Banking Demo — PingOne Edition

Standalone AI-powered banking demo using PingOne for authentication and **RFC 8693 Token Exchange** so the AI agent can securely access banking data on behalf of users.

This is a **completely standalone** project — it can be handed to anyone and run independently.

## Components

| Component | Port | Description |
|---|---|---|
| `banking_api_ui` | 3000 | React frontend (admin + end-user dashboards) |
| `banking_api_server` | 3001 | Express REST API — **Backend-for-Frontend (BFF)** with PingOne OAuth; tokens stay server-side |
| `banking_mcp_server` | 8080 | MCP tool server for the AI agent |
| `langchain_agent` | 8000 | LangChain + OpenAI AI banking agent |

## Quick Start

```bash
# 1. Start the API server
cd banking_api_server && npm install && npm run dev

# 2. Start the React UI
cd banking_api_ui && npm install && npm start

# 3. Configure PingOne credentials at http://localhost:3000/config
#    (no .env file needed — all config stored in SQLite via the UI)
```

## Configuration

Visit **http://localhost:3000/config** to enter your PingOne credentials.
Settings are stored encrypted in `banking_api_server/data/persistent/config.db` (SQLite locally)
or Vercel KV in production — **no `.env` file required**.

```

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│              Banking Digital Assistant                    │
│                                                           │
│  banking_api_ui (:3000)   ←→   banking_api_server (:3001) │
│       React UI                  Express banking API        │
│                                    ↑ JWT validation        │
│                                    │ via PingOne JWKS      │
│                                                           │
│  langchain_agent (:8888)  ←→   banking_mcp_server (:8080) │
│    LangChain + OpenAI           MCP tools for banking      │
│           ↓ Token Exchange                                 │
│    oauth-playground (:3001)  (or PingOne directly)        │
└─────────────────────────────────────────────────────────┘
                        ↓
              PingOne (auth.pingone.com)
              Environment: b9817c16-...
```

## Key Changes from Original (ForgeRock/PingOne AI IAM Core → PingOne)

| Component | Before | After |
|---|---|---|
| AS endpoints | `openam-*.forgeblocks.com/am/oauth2/...` | `auth.pingone.com/{envId}/as/...` |
| Token validation | PingOne AI IAM Core introspection (HTTP call) | PingOne JWKS (JWT signature) |
| Token Exchange | Not implemented | Implemented — `banking_api_server/services/agentMcpTokenService.js` performs RFC 8693 exchange on every `POST /api/mcp/tool` when `MCP_RESOURCE_URI` is set |
| MCP server config | `PINGONE_BASE_URL=*.pingidentity.com` | `PINGONE_BASE_URL=https://auth.pingone.com/{envId}/as` |

## Services

| Service | Port | Description |
|---|---|---|
| `banking_api_server` | 3001 | Express REST API — banking accounts, transactions, admin |
| `banking_api_ui` | 3000 | React frontend for admin/customer portal |
| `banking_mcp_server` | 8080 | TypeScript MCP server — exposes banking tools to AI agents |
| `langchain_agent` | 8888 | LangChain agent + WebSocket frontend |

## Quick Start

1. **Install dependencies** (first time only):
   ```bash
   cd banking_api_server && npm install
   cd ../banking_mcp_server && npm install
   cd ../banking_api_ui && npm install
   ```

2. **Start the banking API server** (primary service):
   ```bash
   cd banking_api_server && npm start
   ```

3. **Start the MCP server** (for AI agent tool calls):
   ```bash
   cd banking_mcp_server
   cp .env.development .env
   npm start
   ```

4. **Start the UI**:
   ```bash
   cd banking_api_ui && npm start
   ```

## Token Exchange Flow (RFC 8693)

The **Backend-for-Frontend (BFF)** — the `banking_api_server` — performs RFC 8693 Token Exchange on the **server side** — the browser never sees raw OAuth tokens. On every `POST /api/mcp/tool` call, `agentMcpTokenService.js` runs:

```
1. Retrieve user's access token (T1) from server-side session
2. POST {issuer}/as/token
     grant_type = urn:ietf:params:oauth:grant-type:token-exchange
     subject_token = T1  (user's access token)
     subject_token_type = urn:ietf:params:oauth:token-type:access_token
     audience = <MCP_RESOURCE_URI>          ← binds audience to MCP server
     scope = <tool-specific scopes>         ← e.g. banking:accounts:read
3. PingOne validates may_act claim on T1, issues T2 (MCP-audience token)
4. Backend-for-Frontend (BFF) opens WebSocket to banking_mcp_server with T2 as Bearer
```

Optional delegation path (`USE_AGENT_ACTOR_FOR_MCP=true`):
```
     actor_token = <agent client_credentials token>   ← agent acts on behalf of user
     actor_token_type = urn:ietf:params:oauth:token-type:access_token
     → T2 carries  act: { sub: "<agent-client-id>" }  per RFC 8693 §4.1
```

The exchange is **dormant until configured** — if `MCP_RESOURCE_URI` is not set, T1 is forwarded directly (safe for local dev). To activate:

| Env var | Purpose |
|---|---|
| `MCP_RESOURCE_URI` | Audience URI for the MCP server (activates the exchange) |
| `USE_AGENT_ACTOR_FOR_MCP` | `true` to add `actor_token` (adds `act` claim to T2) |
| `AGENT_OAUTH_CLIENT_ID` | Agent OAuth client ID (required when actor path is on) |

Required in PingOne: enable the token-exchange grant type on the Backend-for-Frontend (BFF) client and configure a `may_act` / actor policy so PingOne will accept the exchange.

## PingOne Configuration Required

In your PingOne environment (`b9817c16-9910-4415-b67e-4ac687da74d9`), you need:

1. **Worker App** (client_credentials) — for MCP server & agent token
   - Already configured: `66a4686b-9222-4ad2-91b6-03113711c9aa`

2. **Web Application** (auth_code + PKCE) — for user login
   - Already configured: `a4f963ea-0736-456a-be72-b1fa4f63f81f`

3. **Token Exchange** policy on the Backend-for-Frontend (BFF) client — allows the Backend-for-Frontend (BFF) to exchange user tokens for MCP-audience tokens
   - In PingOne: Applications → your Backend-for-Frontend (BFF) app → Grant Types → enable **Token Exchange**
   - Add a Token Exchange policy: subject token issuer = this PingOne environment; allowed audience = value of `MCP_RESOURCE_URI`
   - Add a `may_act` claim to tokens issued to end-users (Attribute Mappings) so the Backend-for-Frontend (BFF)'s client_id appears in `may_act.client_id`

## MCP Security Gateway — Potential Architecture

> **Note:** This is not how the app is currently set up. It illustrates how an **MCP Security Gateway** 
> (as defined by Ping Identity) could be introduced to centralize identity enforcement between the 
> Banking Agent and the Banking MCP Server — without changing either endpoint's code.

```mermaid
flowchart LR
    subgraph Customer["🏦 Banking App Infrastructure"]
        direction TB
        GATEWAY["🔴 MCP Security Gateway\n(policy enforcement point)"]
        MCP_SERVER["Banking MCP Server\n:8080\ntools: balance · transfer · transactions"]
    end

    subgraph PingCloud["☁️ Ping"]
        PING["Ping Identity Platform\n(PingOne)\n• token validation\n• policy evaluation\n• step-up MFA decisions"]
    end

    BANKING_AGENT["🤖 Banking Agent\n(LangChain FAB)\n:8888"]

    BANKING_AGENT -- "1. MCP tool call\n(access_token in header)" --> GATEWAY
    GATEWAY -- "3. Forward validated\nrequest (adapted)" --> MCP_SERVER
    MCP_SERVER -- "tool result" --> GATEWAY
    GATEWAY -- "response" --> BANKING_AGENT
    GATEWAY <-- "2. Enforce identity &\nsecurity rules\n(token introspect, policy eval,\nstep-up triggers)" --> PING

    style GATEWAY fill:#c0392b,color:#fff,stroke:#922b21
    style PING fill:#e8a0a0,color:#333,stroke:#c0392b
    style BANKING_AGENT fill:#f0f0f0,stroke:#333
    style MCP_SERVER fill:#f0f0f0,stroke:#333
```

**How it would work in practice:**

| Step | Current (no gateway) | With MCP Security Gateway |
|---|---|---|
| 1. Agent calls MCP tool | Direct WebSocket to `:8080` | HTTPS call to gateway — MCP traffic intercepted |
| 2. Identity enforcement | MCP server validates token itself | Gateway calls PingOne to validate token, evaluate policies, trigger step-up MFA |
| 3. Downstream adaptation | Token passed as-is | Gateway can exchange token, strip/add claims, or adapt auth scheme for the MCP server |

**Key benefits this would add to the banking demo:**
- Centralised audit log of every MCP tool call
- Policy-driven step-up MFA before high-risk tools (e.g. `transfer_funds`)
- Token exchange at the gateway — MCP server never sees the user's raw token
- Swap out the MCP server without changing agent auth logic

---

## Vercel Deployment

The app is deployed to Vercel as a single serverless function (`api/handler.js`) with the React UI served as static files. Vercel spins up multiple function instances, so sessions must be persisted externally in [Upstash Redis](https://upstash.com).

### Quick Vercel Setup

Run the interactive setup wizard — it detects conflicts, validates Upstash connectivity, generates a session secret, and optionally pushes values to Vercel via the CLI:

```bash
npm run setup:vercel
```

To check your current config without making changes:

```bash
npm run setup:vercel:check
```

The wizard writes a `.env.vercel.local` file (gitignored). Copy these values to **Vercel Dashboard → Project → Settings → Environment Variables**.

### Required Environment Variables

| Variable | Description |
|---|---|
| `UPSTASH_REDIS_REST_URL` | Upstash REST URL (`https://…upstash.io`) |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash REST token |
| `SESSION_SECRET` | 32+ char random string — generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `PINGONE_ENVIRONMENT_ID` | PingOne env ID |
| `PINGONE_REGION` | `com` / `eu` / `ca` / `asia` |
| `PINGONE_AI_CORE_CLIENT_ID` | Admin OAuth client ID |
| `PINGONE_AI_CORE_CLIENT_SECRET` | Admin OAuth client secret |
| `PINGONE_AI_CORE_REDIRECT_URI` | `https://<vercel-url>/api/auth/oauth/callback` |
| `PINGONE_AI_CORE_USER_CLIENT_ID` | Customer OAuth client ID |
| `PINGONE_AI_CORE_USER_CLIENT_SECRET` | Customer OAuth client secret |
| `PINGONE_AI_CORE_USER_REDIRECT_URI` | `https://<vercel-url>/api/auth/oauth/user/callback` |
| `REACT_APP_CLIENT_URL` | `https://<vercel-url>.vercel.app` |
| `MCP_SERVER_URL` | `wss://…` — deploy `banking_mcp_server` to Railway/Render/Fly (Vercel doesn't support WebSocket) |
| `NODE_ENV` | `production` |
| `CORS_ORIGIN` | Same as `REACT_APP_CLIENT_URL` |

> **Important:** Do NOT set `REDIS_URL` to an `https://` URL — it must be `redis://` or `rediss://` wire protocol, or use `UPSTASH_REDIS_REST_URL` instead. The setup wizard detects and fixes this automatically.

> **Important:** Never set `SKIP_TOKEN_SIGNATURE_VALIDATION=true` — the server will refuse to start in production.

### Session Store: Why Upstash REST?

Vercel's serverless environment kills TCP connections between invocations. `node-redis` (wire protocol) is unreliable because every cold start incurs a TLS handshake that races the session read/write window. The app uses `@vercel/kv` (Upstash REST API over HTTP) — stateless by design, no connection to re-establish.

### Post-Deploy Verification

After deploying, sign out and back in, then check:

```
GET /api/auth/debug
```

You want:
- `sessionStoreType: "upstash-rest"`
- `sessionStoreHealthy: true`
- `sessionRestored: false` (after a fresh login — not a cookie-only fallback)

### PingOne Redirect URIs

Add these to your PingOne application after getting your Vercel URL:
- Admin: `https://<your-vercel-url>/api/auth/oauth/callback`
- Customer: `https://<your-vercel-url>/api/auth/oauth/user/callback`

### Common Vercel Issues

| Symptom | Cause | Fix |
|---|---|---|
| `sessionStoreHealthy: false` | Bad Upstash credentials | Run `npm run setup:vercel` to re-enter and test |
| `sessionRestored: true` + `accessTokenStub: true` | Session store failing silently | Check `sessionStoreError` in `/api/auth/debug` |
| `invalid_state` on login | No session store | Add `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` |
| `session_error` redirect | Session write failed before PingOne redirect | Fix session store; sign out and try again |
| Agent shows "connecting…" | `MCP_SERVER_URL` not set | Set `MCP_SERVER_URL=wss://…` in Vercel env vars |
| Build fails with lint error | `CI=true` treats warnings as errors | Ensure `"CI": "false"` in `vercel.json` build.env |
| Redirect URI mismatch | PingOne URI ≠ Vercel URL | Update PingOne app redirect URIs |

---

## Environment Files

| File | Purpose |
|---|---|
| `.env.vercel.example` | Template for all Vercel environment variables |
| `.env.vercel.local` | Your local copy (gitignored) — generated by `npm run setup:vercel` |
| `banking_api_server/.env` | Local dev config (PingOne credentials, port) |
| `banking_mcp_server/.env.development` | MCP server config (copy to `.env` before running) |
| `langchain_agent/.env` | Agent config (OpenAI key, PingOne endpoints) |
| `banking_api_ui/.env` | React frontend config |
