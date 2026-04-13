# Integrations — BX Finance Banking Demo

*Last updated: April 2026 (Phase 140)*

---

## PingOne (Primary Identity Provider)

All auth flows go through PingOne. BFF makes all calls server-side — no direct PingOne calls from browser.

### OAuth 2.0 / OIDC Flows
| Flow | Route | Service |
|------|-------|---------|
| Admin Auth Code + PKCE | `GET /api/auth/oauth/login` | `banking_api_server/routes/oauth.js` |
| Admin callback | `GET /api/auth/oauth/callback` | `banking_api_server/routes/oauth.js` |
| User Auth Code + PKCE | `GET /api/auth/oauth/user/login?return_to=<path>` | `banking_api_server/routes/oauthUser.js` |
| User callback | `GET /api/auth/oauth/user/callback` | `banking_api_server/routes/oauthUser.js` |
| CIBA backchannel | `POST /api/auth/ciba/*` | `banking_api_server/routes/ciba.js` |
| Token Exchange (RFC 8693) | `GET /api/pingone-test/exchange-*` | `banking_api_server/routes/pingoneTestRoutes.js` |
| Client Credentials (agent) | Internal service call | `banking_api_server/services/oauthUserService.js` |
| Step-up auth | `GET /api/auth/oauth/user/stepup` | `banking_api_server/routes/oauthUser.js` |

### PingOne API Endpoints Called (by BFF)
| Endpoint | Purpose | Service |
|----------|---------|---------|
| `GET /v1/environments/{envId}/applications` | List apps | `pingoneManagementService.js` |
| `GET /v1/environments/{envId}/applications/{appId}/grants` | App resource grants | `pingoneManagementService.js` |
| `GET /v1/environments/{envId}/resourceServers` | Resource servers | `pingoneManagementService.js` |
| `GET /v1/environments/{envId}/resources/{id}/scopes` | Scopes | `pingoneManagementService.js` |
| `GET /v1/environments/{envId}/users` | List users (up to 50) | `pingOneUserService.js` |
| `GET /v1/environments/{envId}/tokenPolicies` | Token/SPEL policies | `pingoneManagementService.js` |
| `POST /v1/environments/{envId}/as/token` | Token exchange | `oauthUserService.js` |
| `POST /v1/environments/{envId}/users/{id}/devices` | MFA device enrollment | `banking_api_server/routes/mfaTest.js` |
| `GET /v1/environments/{envId}/users/{id}/devices` | List MFA devices | `banking_api_server/routes/mfaTest.js` |

### Important PingOne Config (stored in `configStore`)
| Config Key | Env Override | Description |
|-----------|-------------|----|
| `pingone_environment_id` | `PINGONE_ENVIRONMENT_ID` | Tenant UUID |
| `pingone_resource_mcp_server_uri` | `MCP_SERVER_URI` | Audience for MCP server token exchange |
| `pingone_resource_mcp_gateway_uri` | `MCP_GATEWAY_URI` | Audience for MCP gateway exchange |
| `pingone_resource_agent_gateway_uri` | `AGENT_GATEWAY_URI` | Audience for agent token exchange |
| `pingone_worker_token_client_id` | — | Worker/management app client ID |
| `pingone_worker_token_client_secret` | — | Worker/management app secret |

### Session Storage (OAuth Tokens)
Tokens are stored **server-side only** in `req.session.oauthTokens`:
- `accessToken` — user or admin OAuth access token
- `idToken` — OIDC id token
- `refreshToken` — refresh token
- `expiresAt` — expiry timestamp
- `postLoginReturnToPath` — SPA path to redirect to after login (supports `?return_to=`)

---

## Session Stores

### Upstash Redis (Vercel/Production)
- **Client**: `@vercel/kv` (REST) or `@upstash/redis`
- **Config**: `KV_REST_API_URL` + `KV_REST_API_TOKEN`
- **Service**: `banking_api_server/services/upstashSessionStore.js`
- **Note**: Required for Vercel multi-instance deployments — shared session state

### SQLite (Local Dev Fallback)
- **Package**: `better-sqlite3`  
- **Service**: `banking_api_server/services/sqliteSessionStore.js`
- Also used for `configStore` (runtime config persistence)

---

## AI Model Providers

### Groq (Primary / Default)
- **Package**: `@langchain/groq`
- **Key**: `GROQ_API_KEY` (recommended)
- **Fallback**: Keyword-based NL parser if key missing
- **Used by**: `banking_api_server/services/bankingAgentLangChainService.js`

### Anthropic (Configurable)
- **Package**: `@langchain/anthropic`
- **Key**: `ANTHROPIC_API_KEY` (optional)
- **Used by**: LangGraph agent when configured

### Google Gemini (NL Intent)
- **File**: `banking_api_server/services/geminiNlIntent.js`
- **Status**: Present but not primary path

---

## Brave Search
- **Service**: `banking_api_server/services/braveSearchService.js`
- **Purpose**: Agent web search tool
- **Key**: `BRAVE_API_KEY` (optional)

---

## MCP Server (WebSocket)
- **Protocol**: Model Context Protocol (WebSocket)
- **External server**: `banking_mcp_server/` — hosted separately
- **BFF integration**: `banking_api_server/routes/mcpExchangeMode.js` — exchanges tokens and proxies tool calls
- **Auth**: Token exchange via PingOne before establishing MCP session

---

## Vercel Platform
- **Deployment**: `vercel.json` — serverless functions, SPA rewrite
- **KV Store**: Upstash Redis via `@vercel/kv`
- **Serverless entry**: `banking_api_server/api/handler.js`
- **Cold start concern**: Session from one instance may not be visible on another without Upstash

---

## Email (Optional / Demo)
- **Service**: `banking_api_server/services/emailService.js`
- **Used for**: MFA enrollment (email OTP device)
- **Provider**: Not hardcoded — via PingOne MFA flows

---

## Environment-Specific Notes
- `PingOne region`: `PINGONE_REGION` env var (default: `com`). Affects base URL: `auth.pingone.{region}`
- `PUBLIC_APP_URL`: Critical — all OAuth redirect URIs are derived from this value
- `ADMIN_ROLE` / `USER_ROLE`: Defaults `admin` / `customer` — used to distinguish session types
