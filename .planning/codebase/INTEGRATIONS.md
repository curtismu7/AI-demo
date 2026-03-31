# External Integrations

**Analysis Date:** 2026-03-31

## APIs & External Services

### Identity & Auth

**PingOne (Primary IdP — all auth flows):**
- Used in: `banking_api_server/`, `banking_mcp_server/`, `langchain_agent/`
- Flows implemented:
  - Authorization Code + PKCE — admin (staff) login and end-user (customer) login
  - Client Credentials — worker apps (agent bootstrap, Authorize worker)
  - CIBA (backchannel) — step-up MFA for high-value transactions
  - Token Exchange (RFC 8693) — `on_behalf_of` delegated chain (BFF → agent actor token)
  - Token Introspection — optional live validation (`PINGONE_INTROSPECTION_ENDPOINT`)
  - Token Revocation — logout / session cleanup (`banking_api_server/services/tokenRevocation.js`)
- Management API: `/v1/environments/{envId}/users` — CRUD users, enable/disable MFA devices
- JWKS: fetched for offline JWT signature validation; cached + rate-limited (`JWKS_CACHE_MAX_AGE`)
- Auth env vars (BFF):
  - `PINGONE_ENVIRONMENT_ID`, `PINGONE_REGION`
  - Admin app: `PINGONE_CORE_CLIENT_ID`, `PINGONE_CORE_CLIENT_SECRET`, `PINGONE_CORE_REDIRECT_URI`
  - User app: `PINGONE_CORE_USER_CLIENT_ID`, `PINGONE_CORE_USER_CLIENT_SECRET`, `PINGONE_CORE_USER_REDIRECT_URI`
  - Multiple alias env vars supported: `PINGONE_AI_CORE_*`, `PINGONE_ADMIN_*` (see `.env.example`)
- Auth env vars (MCP server): `PINGONE_BASE_URL`, `PINGONE_CLIENT_ID`, `PINGONE_CLIENT_SECRET`, `PINGONE_INTROSPECTION_ENDPOINT`
- Auth env vars (agent): `PINGONE_BASE_URL`, `PINGONE_TOKEN_ENDPOINT`, `PINGONE_AUTHORIZATION_ENDPOINT`

**PingOne Authorize (optional — policy-based authorization):**
- Used in: `banking_api_server/services/pingOneAuthorizeService.js`, `banking_api_server/routes/authorize.js`
- Evaluates transactions against a Trust Framework policy (PDP)
- Activated by `AUTHORIZE_ENABLED=true`
- Worker app for Client Credentials flow: `PINGONE_AUTHORIZE_WORKER_CLIENT_ID`, `PINGONE_AUTHORIZE_WORKER_CLIENT_SECRET`
- Policy ID: `PINGONE_AUTHORIZE_POLICY_ID`

### AI / LLM Services

**Groq (primary NL intent):**
- Used in: `banking_api_server/services/groqNlIntent.js`
- Endpoint: `https://api.groq.com/openai/v1/chat/completions` (OpenAI-compatible)
- Default model: `llama-3.1-8b-instant`
- Auth: `GROQ_API_KEY`
- Model override: `GROQ_MODEL`
- Purpose: parse user natural-language messages into structured banking intents
- Fallback chain: Groq → Gemini → heuristic

**Google Gemini (fallback NL intent):**
- Used in: `banking_api_server/services/geminiNlIntent.js`
- Auth: `GEMINI_API_KEY` (alias: `GOOGLE_AI_API_KEY`)
- Default model: `gemini-1.5-flash`
- Model override: `GEMINI_MODEL`

**OpenAI (LangChain agent LLM):**
- Used in: `langchain_agent/src/agent/langchain_mcp_agent.py` via `langchain.ChatOpenAI`
- Auth: `OPENAI_API_KEY`
- Model: configured via `LANGCHAIN_MODEL_NAME`
- Supports LLM token streaming (`LANGCHAIN_STREAM_LLM_TOKENS=true`)

**Groq (LangChain agent LLM — alternative):**
- Available via `groq>=0.4.0` in `langchain_agent/requirements.txt`
- Swapped at config time; same `LANGCHAIN_MODEL_NAME` convention

## Data Storage

### Session Store (BFF)

**Priority order on startup (`banking_api_server/server.js`):**

1. **Upstash Redis REST (`banking_api_server/services/upstashSessionStore.js`)** — *preferred for Vercel*
   - HTTP-based; no persistent TCP connection (cold-start safe)
   - Auth: `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`
   - Alternative keys: `KV_REST_API_URL` + `KV_REST_API_TOKEN`
   - Client: `@vercel/kv` ^3.0.0
   - Circuit-breaker with in-memory fallback cache (45s TTL); protects against quota overages

2. **Redis TCP/TLS (`connect-redis` + `redis` 5.11)** — self-hosted or explicit `REDIS_URL`
   - Auth: `REDIS_URL` (wire protocol URL)
   - Less reliable on Vercel serverless due to cold-start TCP races

3. **Memory store** — development fallback; sessions lost on process restart

### Config Store (BFF)

**`banking_api_server/services/configStore.js`** — runtime config persistence:
- **Vercel KV** (when `KV_REST_API_URL` set): stores PingOne settings set via admin UI
- **SQLite** (local, when no KV): `data/config.db` via `better-sqlite3` ^12.8.0
- In-memory cache on top of both backends; env vars always win over stored config

### Token Storage (MCP Server)

**`banking_mcp_server/src/storage/EncryptedTokenStorage.ts`:**
- File-based AES-encrypted token store; path: `TOKEN_STORAGE_PATH=./data/tokens`
- Encryption key: `ENCRYPTION_KEY`

**`banking_mcp_server/src/storage/BankingSessionManager.ts`:**
- In-memory WebSocket session management; file-backed optional
- Session path: `SESSION_STORAGE_PATH=./data/sessions`

### Agent Storage (optional)

**Redis token cache (`langchain_agent`):**
- `redis>=4.5.0`; optional; activated when Redis is available

**SQLAlchemy persistent store (`langchain_agent`):**
- `sqlalchemy>=2.0.0` + `alembic>=1.10.0`; optional; for long-lived agent state

## Authentication & Identity

**Auth Provider:** PingOne (see above)

**Session implementation (BFF):**
- `express-session` ^1.19.0 with pluggable store
- PKCE state stored in signed cookies (`banking_api_server/services/pkceStateCookie.js`)
- Auth state cookie for multi-step auth (`banking_api_server/services/authStateCookie.js`)
- `SESSION_SECRET` env var (required; 32-byte random hex)
- `CONFIG_ENCRYPTION_KEY` for encrypting sensitive config at rest

**Agent token encryption:**
- `cryptography>=41.0.0` (Fernet) in `langchain_agent/`
- `ENCRYPTION_MASTER_KEY` + `ENCRYPTION_SALT`

## Monitoring & Observability

**Error Tracking:** Not integrated (no Sentry or similar detected)

**Metrics (MCP Server):**
- Optional Prometheus-style metrics endpoint: `ENABLE_METRICS=true`, `METRICS_PORT=9090`
- `banking_mcp_server/src/utils/Logger.ts` — structured JSON logging

**Logs (BFF):**
- `morgan` 1.10 HTTP access logs
- `console.*` with prefixed tags (e.g., `[oauth-config]`, `[circuit-breaker]`)
- `LOG_LEVEL`, `DEBUG_OAUTH`, `DEBUG_TOKENS`, `MCP_LOG_VERBOSE` env flags

**Agent trace server:**
- `langchain_agent/src/api/trace_server.py` + `integrated_trace_server.py` — inspector HTTP endpoint
- Default port: `HEALTH_HTTP_PORT=8081`; UI reads via `REACT_APP_LANGCHAIN_INSPECTOR_URL`

## CI/CD & Deployment

**Vercel (UI + BFF):**
- Config: `vercel.json` at repo root
- Routes: `/api/(.*)` → `/api/handler` (Express adapter), filesystem passthrough, SPA `index.html` fallback
- Security headers in `vercel.json`: CSP (allows `*.pingone.com`, `*.pingidentity.com`), HSTS, X-Frame-Options DENY, Referrer-Policy
- Build: `cd banking_api_ui && npm run build`
- Output: `banking_api_ui/build/`
- Install: `npm install --prefix banking_api_server && npm install --prefix banking_api_ui`
- Build env: `CI=false`, `GENERATE_SOURCEMAP=false`, `DEMO_MODE=true`
- Production URL: `https://banking-demo-puce.vercel.app` (hardcoded fallback in `vercelPublicUrl.js`)

**Railway / Render / Fly.io (MCP Server):**
- Docker: `banking_mcp_server/Dockerfile`, `docker-compose.dev.yml`, `docker-compose.prod.yml`
- Exposes port `MCP_SERVER_PORT=8080`
- Not deployed on Vercel (WebSocket + long-running process incompatible with serverless)

**Replit (optional alternative):**
- Detected via `REPL_ID` / `REPLIT_DEPLOYMENT` env vars
- `REPLIT_MANAGED_OAUTH` mode changes OAuth redirect behavior

## Internal Service Communication

**BFF → MCP Server:**
- WebSocket client (`ws` ^8.19.0) in `banking_api_server/`
- URL: `MCP_SERVER_URL=ws://localhost:8080`
- BFF sends agent bearer token via `MCP_SERVER_RESOURCE_URI` for RFC 8707 audience validation
- Max concurrent connections: `MCP_WS_MAX_CONCURRENT=8`
- MCP local tools also available inline (`banking_api_server/services/mcpLocalTools.js`)

**BFF → LangChain Agent:**
- Agent connects inbound to BFF WebSocket (BFF acts as WebSocket server for chat)
- `MCP_SERVER_BANKING_ENDPOINT` points agent to MCP server

**MCP Server → BFF Banking API:**
- REST calls from `banking_mcp_server/src/banking/BankingAPIClient.ts`
- Base URL: `BANKING_API_BASE_URL=http://localhost:3001`
- Timeout: `BANKING_API_TIMEOUT=30000ms`; retries: `BANKING_API_MAX_RETRIES=3`
- Circuit breaker: `BANKING_API_CIRCUIT_BREAKER_THRESHOLD=5`

## Webhooks & Callbacks

**Incoming:**
- `/api/auth/oauth/callback` — PingOne Authorization Code callback (admin/staff)
- `/api/auth/oauth/user/callback` — PingOne Authorization Code callback (end-user)
- `banking_mcp_server` `/auth/callback` (`OAUTH_REDIRECT_URI=http://localhost:8080/auth/callback`) — agent PKCE callback

**Outgoing:**
- CIBA notification endpoint (optional): `CIBA_NOTIFICATION_ENDPOINT`; alternative to polling mode
- PingOne Authorize PDP evaluate endpoint (optional): called by `pingOneAuthorizeService.js`

## Environment Configuration Summary

**Required (BFF production):**
- `PINGONE_ENVIRONMENT_ID`, `PINGONE_CORE_CLIENT_ID`, `PINGONE_CORE_CLIENT_SECRET`
- `PINGONE_CORE_USER_CLIENT_ID`, `PINGONE_CORE_USER_CLIENT_SECRET`
- `PINGONE_CORE_REDIRECT_URI`, `PINGONE_CORE_USER_REDIRECT_URI`
- `SESSION_SECRET`
- `PUBLIC_APP_URL` (Vercel — stable OAuth origin)

**Required (Vercel multi-instance sessions):**
- `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`
- OR `KV_REST_API_URL` + `KV_REST_API_TOKEN`

**Optional features:**
- `GROQ_API_KEY` — enable Groq NL intent parsing in BFF
- `GEMINI_API_KEY` — enable Gemini NL intent fallback in BFF
- `AUTHORIZE_ENABLED=true` + Authorize creds — enable PingOne Authorize policy gate
- `CIBA_ENABLED=true` — enable CIBA step-up MFA
- `ENABLE_TOKEN_INTROSPECTION=true` + `PINGONE_INTROSPECTION_ENDPOINT` — live token validation
- `OPENAI_API_KEY` — enable LangChain agent
- `MCP_SERVER_URL` — connect BFF to external MCP server

---

*Integration audit: 2026-03-31*
