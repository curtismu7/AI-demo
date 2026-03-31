# Architecture

**Analysis Date:** 2026-03-31

## Pattern Overview

**Overall:** Backend-for-Frontend (BFF) + MCP Tool Server Monorepo

**Key Characteristics:**
- All OAuth tokens are held server-side in the BFF (`banking_api_server`); the browser only holds an httpOnly session cookie (`connect.sid`)
- The React SPA (`banking_api_ui`) calls BFF exclusively via `bffAxios` (cookie-based, no Authorization header from browser)
- The BFF performs RFC 8693 Token Exchange to mint delegated MCP access tokens before proxying tool calls to `banking_mcp_server`
- `banking_mcp_server` is a stateful TypeScript process (WebSocket / JSON-RPC 2.0); the BFF connects via `ws://` (not HTTP REST)
- Vercel routes all `/api/*` traffic to `api/handler.js`, which re-exports the Express app — same codebase runs locally and serverless

## Layers

**React SPA (`banking_api_ui/`):**
- Purpose: Browser client; renders admin and customer views
- Location: `banking_api_ui/src/`
- Contains: React components (74 in `components/`), pages, hooks, contexts, services
- Depends on: BFF — all API traffic via `bffAxios` or `apiClient`
- Used by: End users and admin operators in browser

**BFF Express Server (`banking_api_server/`):**
- Purpose: Token custodian, OAuth orchestrator, banking API gateway, MCP proxy
- Location: `banking_api_server/server.js` (entry), `banking_api_server/routes/`, `banking_api_server/services/`, `banking_api_server/middleware/`
- Contains: 20 route modules, 36 service modules, 10 middleware modules
- Depends on: PingOne OAuth (AS), banking data store (`banking_api_server/data/store.js`), `banking_mcp_server` (WebSocket), Redis/Upstash (sessions)
- Used by: React SPA (browser), MCP Inspector, LangChain agent

**MCP Tool Server (`banking_mcp_server/`):**
- Purpose: MCP 2025-11-25 JSON-RPC tool server; executes banking tool calls on behalf of the BFF
- Location: `banking_mcp_server/src/index.ts` (entry), `banking_mcp_server/src/`
- Contains: `tools/` (registry, provider, validator, auth challenge handler), `auth/`, `banking/`, `server/`, `storage/`, `utils/`
- Depends on: `banking_api_server` HTTP API (via `BankingAPIClient`); PingOne token introspection
- Used by: BFF (`banking_api_server`) over WebSocket (`mcpWebSocketClient.js`)

**Vercel Serverless Entry (`api/handler.js`):**
- Purpose: Thin adapter — re-exports `banking_api_server/server.js` for Vercel's `@vercel/node` runtime
- Location: `api/handler.js`
- Contains: One line: `module.exports = require('../banking_api_server/server')`
- All `/api/*` requests are rewritten by `vercel.json` to this handler

**LangChain Agent (`langchain_agent/`):**
- Purpose: Optional Python agent that drives banking operations via the BFF
- Location: `langchain_agent/`
- Status: Optional; not part of primary Vercel deployment

## Data Flow

**Admin Login (Authorization Code + PKCE):**

1. Browser → `GET /api/auth/oauth/login` → BFF generates PKCE pair, stores state+verifier in `_pkce` cookie
2. BFF → 302 redirect → PingOne `/as/authorize` (admin app client)
3. PingOne → 302 callback → `GET /api/auth/oauth/callback` → BFF exchanges code → receives access+refresh+id tokens
4. BFF stores tokens in `req.session.oauthTokens`; session persisted to Upstash/Redis
5. BFF writes signed `_auth` cookie (user identity only, no tokens) for cold-start recovery
6. BFF → 302 → `/admin` (React SPA)

**User Login (Authorization Code + PKCE):**
- Same flow via `/api/auth/oauth/user/login` → `/api/auth/oauth/user/callback` (separate user-app OAuth client)

**SPA → BFF API Call (authenticated):**

1. Browser sends `GET /api/accounts/my` with session cookie
2. `refreshIfExpiring` middleware checks token expiry; silently refreshes if within window
3. `authenticateToken` middleware validates JWT from `req.session.oauthTokens.accessToken` against PingOne JWKS
4. Route handler reads from in-memory `dataStore`, returns JSON

**SPA → MCP Tool Proxy (delegated):**

1. Browser → `POST /api/mcp/tool` with `{tool, params}` + session cookie
2. BFF resolves token via `agentMcpTokenService`:
   - Reads user access token from session
   - If `USE_AGENT_ACTOR_FOR_MCP=true`: mints RFC 8693 delegated token (user sub + agent actor)
   - Else: uses user token directly or performs basic exchange to MCP audience
3. Token Resolution checks `agentMcpScopePolicy` for tool permission
4. `mcpToolAuthorizationService.evaluateMcpFirstToolGate()` runs PingOne Authorize gate
5. BFF calls `mcpWebSocketClient.callTool()` over WebSocket connection to `banking_mcp_server`
6. `BankingMCPServer` receives JSON-RPC `tools/call` message
7. `MCPMessageHandler` routes to `BankingToolProvider.executeTool()`
8. `BankingToolProvider` validates params, checks scope, calls `BankingAPIClient` → BFF HTTP API
9. Response flows back: MCP server → WebSocket → BFF → HTTP response with `tokenEvents` metadata

**Token Exchange (RFC 8693 — 3-token chain):**

1. User access token (sub=user, aud=banking API)
2. Agent access token (Client Credentials for `AGENT_OAUTH_CLIENT_ID`)
3. BFF calls PingOne `/as/token` with `grant_type=urn:ietf:params:oauth:grant-type:token-exchange`
   - `subject_token` = user access token
   - `actor_token` = agent access token (when `on_behalf` chain enabled)
   - `requested_token_type` = `urn:ietf:params:oauth:token-type:access_token`
   - `resource` = `MCP_RESOURCE_URI`
4. PingOne returns MCP access token with `act` claim (agent identity) + `may_act` constraint

**State Management (UI):**
- React contexts: `SpinnerContext`, `EducationUIContext`, `TokenChainContext`, `AgentUiModeContext`, `IndustryBrandingContext`, `ThemeContext`
- `TokenChainContext` displays live `tokenEvents` metadata from MCP proxy responses
- Service singletons: `apiTrafficStore.js`, `mcpCallStore.js`, `toastLogStore.js` (in-memory stores for UI panels)

## Key Abstractions

**`configStore` (BFF):**
- Purpose: Runtime-mutable config loaded from PingOne or env vars; all OAuth config reads go through this
- File: `banking_api_server/services/configStore.js`
- Pattern: Singleton with `configStore.getEffective(key)` — never read env vars directly in route handlers

**`authenticateToken` (BFF):**
- Purpose: Express middleware that validates Bearer tokens (JWT or session-backed) and sets `req.user`
- File: `banking_api_server/middleware/auth.js`
- Pattern: Checks `Authorization: Bearer` header first, then `req.session.oauthTokens.accessToken`; validates against PingOne JWKS via `tokenValidationService`

**`BankingToolRegistry` (MCP):**
- Purpose: Static map of all MCP tool names → definition (description, schema, required scopes, handler name)
- File: `banking_mcp_server/src/tools/BankingToolRegistry.ts`
- Pattern: `BankingToolRegistry.getTool(name)` → `BankingToolDefinition`; add tools by adding entries to `TOOLS` map

**`BankingToolProvider` (MCP):**
- Purpose: Executes a named tool: validates params, checks auth scopes, calls `BankingAPIClient`
- File: `banking_mcp_server/src/tools/BankingToolProvider.ts`
- Pattern: `provider.executeTool(toolName, params, session, agentToken)` → `BankingToolResult`

**`agentMcpTokenService` (BFF):**
- Purpose: Resolves the access token to send to MCP; handles RFC 8693 exchange chain and attaches `tokenEvents` for UI
- File: `banking_api_server/services/agentMcpTokenService.js`
- Pattern: `resolveAgentMcpToken(req, tool)` → `{ token, tokenEvents, userSub }`

**`bffAxios` (UI):**
- Purpose: Axios instance for all BFF calls; sends session cookie, no Authorization header
- File: `banking_api_ui/src/services/bffAxios.js`
- Pattern: Import and use instead of plain `axios` for any `/api/*` call

**`dataStore` (BFF):**
- Purpose: In-memory banking data (users, accounts, transactions); loaded from `bootstrapData.json` + `sampleData.js`
- Location: `banking_api_server/data/store.js`, `banking_api_server/data/bootstrapData.json`
- Pattern: Singleton accessed directly in route handlers

## Entry Points

**Local Development (BFF):**
- Location: `banking_api_server/server.js`
- Triggers: `node server.js` or `npm start` (default port 3001)
- Responsibilities: Full Express app init, session store selection, middleware chain, route registration

**Local Development (React SPA):**
- Location: `banking_api_ui/src/index.js`
- Triggers: `npm start` in `banking_api_ui/` (port 3000 or `REACT_APP_API_PORT`)
- Proxy: `banking_api_ui/src/setupProxy.js` forwards `/api/*` to `localhost:3001` in dev

**Vercel Production:**
- Location: `api/handler.js`
- Triggers: All `/api/*` requests via `vercel.json` rewrite rule `{ "src": "/api/(.*)", "dest": "/api/handler" }`
- Static: React build served from `banking_api_ui/build/` as `outputDirectory`
- SPA fallback: `{ "src": "/.*", "dest": "/index.html" }` handles client-side routing

**MCP Server:**
- Location: `banking_mcp_server/src/index.ts`
- Triggers: `npm start` in `banking_mcp_server/` (WebSocket on default port 8080)
- Responsibilities: Loads config, initializes `BankingAuthenticationManager`, `BankingSessionManager`, `BankingAPIClient`, `BankingToolProvider`, starts `BankingMCPServer`

## Error Handling

**Strategy:** Layered — middleware catches at the BFF boundary; tool errors surface in `BankingToolResult.error`

**Patterns:**
- BFF: `oauthErrorHandler.js` middleware catches OAuth-specific errors and maps to RFC 6749 JSON responses
- Token resolution failures: `throwTokenResolutionError()` in `agentMcpTokenService.js` attaches `tokenEvents` array so the UI Token Chain panel shows exactly what failed
- MCP tool errors: `BankingToolProvider` wraps all errors and returns `{ error: string, success: false }` — never throws to the WebSocket layer
- Session loss: `restoreSessionFromCookie` middleware rebuilds session identity from signed `_auth` cookie on cold starts; Upstash re-fetch recovers tokens

## Cross-Cutting Concerns

**Logging:** `morgan('combined')` for HTTP access logs; structured `logger` utility in `banking_api_server/utils/logger.js`; `correlationIdMiddleware` attaches `X-Request-ID` to all requests
**Validation:** JWT validation via PingOne JWKS in `tokenValidationService.js`; scope enforcement in `middleware/scopeEnforcement.js`; `requireScopes([...])` guard used on authenticated routes
**Authentication:** Session cookie (`connect.sid`) for browser; Bearer token (`Authorization: Bearer`) for programmatic clients and MCP server; `authenticateToken` middleware handles both paths
**Delegation Audit:** `delegationAuditMiddleware` extracts `act`/`may_act` claims from tokens on every request for audit trail (`exchangeAuditStore.js`)
**Security Headers:** Helmet CSP, HSTS, X-Frame-Options, Referrer-Policy applied globally in `server.js`
**Rate Limiting:** Global limiter (15 min window) + tighter auth limiter (1 min) via `express-rate-limit`; several hot polling paths are excluded from the global bucket

---

*Architecture analysis: 2026-03-31*
