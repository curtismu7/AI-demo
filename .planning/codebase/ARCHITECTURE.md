# Architecture — BX Finance Banking Demo

*Last updated: April 2026 (Phase 140)*

---

## Pattern

**BFF (Backend for Frontend) + SPA.** The Express server is both the BFF and the static file server. Tokens never reach the browser — all OAuth flows are server-side. The React SPA communicates only with its own BFF.

```
Browser (React SPA)
    │  /api/* — cookie session
    ▼
BFF (Express — banking_api_server)
    ├── OAuth flows → PingOne (auth.pingone.com)
    ├── Management API → PingOne (api.pingone.com)
    ├── Token storage → Session (Redis/SQLite)
    ├── Agent → LangGraph (Groq/Anthropic)
    └── MCP tools → banking_mcp_server (WS)
```

---

## Layers

### 1. Session Layer
Express session middleware with a tiered store (Upstash → Redis → SQLite → memory).  
Key session fields:
- `req.session.user` — authenticated user object
- `req.session.oauthTokens` — `{ accessToken, idToken, refreshToken, expiresAt }`
- `req.session.oauthType` — `'admin'` | `'user'`
- `req.session.postLoginReturnToPath` — SPA path for post-login redirect
- `req.session.oauthState` / `oauthCodeVerifier` — PKCE values

**Cookie restore pattern**: On Vercel cold starts, a signed `_auth` cookie (`banking_api_server/services/authStateCookie.js`) allows the `/api/auth/oauth/status` middleware to restore user identity even when the session hits a different instance. The access token in this path is a `_cookie_session` stub — not a real JWT.

### 2. Middleware Layer
Order in `server.js` (simplified):
```
helmet → cors → rate-limit → morgan → session →
correlationId → logActivity → delegationAudit →
sessionRestore (from _auth cookie) →
audValidation → routes
```

Key middleware files:
- `banking_api_server/middleware/auth.js` — `authenticateToken`, `requireSession`
- `banking_api_server/middleware/actClaimValidator.js` — RFC 8693 `act`/`may_act` validation
- `banking_api_server/middleware/agentSessionMiddleware.js` — guards agent tool calls
- `banking_api_server/middleware/delegationAuditMiddleware.js` — logs delegation chains

### 3. Route Layer (47 route files)
All routes under `banking_api_server/routes/`. Mounted in `server.js`:

| Prefix | File | Auth |
|--------|------|------|
| `/api/auth/oauth` | `oauth.js` | none (admin PKCE) |
| `/api/auth/oauth/user` | `oauthUser.js` | none (user PKCE) |
| `/api/auth/ciba` | `ciba.js` | none |
| `/api/auth/mfa` | `mfa.js` | none |
| `/api/mfa/test` | `mfaTest.js` | session |
| `/api/pingone-test` | `pingoneTestRoutes.js` | session |
| `/api/banking-agent` | `bankingAgentRoutes.js` | session |
| `/api/banking-agent` (NL) | `bankingAgentNlRoutes.js` | session |
| `/api/langchain` | `langchainConfig.js` | session |
| `/api/tokens` | `tokens.js` | `authenticateToken` |
| `/api/accounts` | `accounts.js` | `authenticateToken` |
| `/api/transactions` | `transactions.js` | `requireSession + authenticateToken` |
| `/api/admin` | `admin.js` | `authenticateToken` |
| `/api/admin/management` | `adminManagement.js` | none |
| `/api/mcp/inspector` | `mcpInspector.js` | none |
| `/api/mcp` | `mcpExchangeMode.js` | session |
| `/api/api-calls` | `apiCallTracker.js` | none |
| `/api/authorize` | `authorize.js` | none |
| `/api/introspect` | `introspect.js` | none |
| `/.well-known/oauth-protected-resource` | `protectedResourceMetadata.js` | none |

### 4. Service Layer (81 service files)
`banking_api_server/services/` — all business logic. Key services:

| Service | Role |
|---------|------|
| `oauthUserService.js` | Auth Code + PKCE flow, token exchange |
| `bankingAgentLangChainService.js` | LangGraph agent executor |
| `pingoneManagementService.js` | PingOne Management API (apps, resources, users) |
| `pingOneUserService.js` | PingOne user read/update |
| `configStore.js` | Runtime config (SQLite-backed, merges env + stored values) |
| `apiCallTrackerService.js` | In-memory tracker of API calls per sessionId |
| `agentMcpTokenService.js` | MCP token exchange + consent gate |
| `upstashSessionStore.js` | Upstash REST session store |
| `sqliteSessionStore.js` | SQLite session store (local dev) |
| `tokenIntrospectionService.js` | RFC 7662 token introspection |
| `auditLogger.js` | Structured audit log for auth events |
| `delegationChainValidationService.js` | RFC 8693 act chain validation |
| `bffSessionGating.js` | Validates session has real (non-stub) tokens |
| `scopePolicyEngine.js` | Scope policy enforcement for agent tools |

### 5. Frontend Layer

**State management**: React context + hooks (no Redux/Zustand).

Key contexts (`banking_api_ui/src/context/`):
- `VerticalContext.js` — industry vertical (banking, insurance, etc.)
- `ThemeContext.js` — light/dark mode
- `AgentUiModeContext.js` — FAB vs embedded dock mode
- `ExchangeModeContext.js` — MCP token exchange mode
- `TokenChainContext.js` — token chain visualization state

Key hooks (`banking_api_ui/src/hooks/`):
- `useChatWidget.js` — banking agent chat state
- `useCurrentUserTokenEvent.js` — user token change events
- `useDemoMode.js` — demo scenario mode
- `useResourceIndicators.js` — resource indicator RFC support

**HTTP**: All API calls via `banking_api_ui/src/services/apiClient.js`. Never calls PingOne directly. Uses proxy via BFF.

---

## OAuth Data Flow (User Login)

```
1. User clicks Login → /api/auth/oauth/user/login?return_to=/pingone-test
2. BFF stores return_to in session, generates state + code_verifier + nonce
3. BFF redirects browser to PingOne /as/authorize with PKCE challenge
4. User authenticates in PingOne
5. PingOne redirects to /api/auth/oauth/user/callback?code=...&state=...
6. BFF validates state, exchanges code for tokens at /as/token
7. BFF stores tokens in req.session.oauthTokens (server-side only)
8. BFF regenerates session (anti-fixation), sets _auth cookie
9. BFF redirects to ${origin}${postLoginReturnToPath}?oauth=success
10. SPA: App.js detects ?oauth=success, polls /api/auth/oauth/user/status
11. App.js once-shot useEffect strips ?oauth from URL
```

---

## Token Exchange Flow (RFC 8693)

```
Exchange 1 — User → MCP:
  subjectToken = req.session.oauthTokens.accessToken (user)
  actorToken = agent client_credentials token
  audience = pingone_resource_mcp_server_uri
  → MCP token with act.client_id = agent app

Exchange 2 — User+Agent → MCP gateway:
  Same as Exchange 1 but different audience

Exchange 3 — User → Agent → MCP (3-hop):
  Step 1: User token → Agent token (singel exchange)
  Step 2: [User token, Agent token] → MCP token (double exchange)
```

All exchanges: `banking_api_server/routes/pingoneTestRoutes.js` + `banking_api_server/services/oauthUserService.js::performTokenExchange*`.

---

## Agent Architecture

```
User NL input
    │
    ▼
bankingAgentNlRoutes.js → POST /api/banking-agent
    │
    ▼
bankingAgentLangChainService.js
    │ LangGraph StateGraph
    ├── agentMcpTokenService.js (token exchange + consent)
    ├── mcpLocalTools.js (local tool registry)
    └── braveSearchService.js (web search)
```

The agent uses LangGraph `StateGraph` with tool nodes. Each tool call checks `bffSessionGating` to ensure real tokens exist (not `_cookie_session` stub).

HITL (Human-in-the-Loop): Agent pauses for user consent before sensitive operations, using `HTTP 428` response with `X-Consent-Required` header.

---

## MCP Inspection / Debug

`/api/mcp/inspector` — debug endpoint for viewing MCP messages.  
`/api/api-calls` — per-session API call tracker (in-memory, `banking_api_server/services/apiCallTrackerService.js`).  
`/pingone-test` — comprehensive test page for all OAuth flows, token exchanges, entity inspection.  
`/mfa-test` — comprehensive MFA test page (OTP, FIDO2, enrollment, device management).
