# Banking App — AI Architecture & Token Standards

---

## 1. Standards Reference

| Standard | RFC / Spec | Used For | Why It Matters |
|---|---|---|---|
| **OAuth 2.0** | RFC 6749 | Authorization framework for all token flows | Industry baseline — defines grant types, scopes, token endpoints |
| **PKCE** | RFC 7636 | Code exchange in auth code flow (S256) | Prevents auth code interception; required for public/Backend-for-Frontend (BFF) clients |
| **JWT** | RFC 7519 | Access tokens, ID tokens, may_act/act claims | Self-contained, verifiable tokens — no DB lookup needed |
| **JWKS** | RFC 7517 | Token signature verification | Public key discovery — verify PingOne-signed tokens without a shared secret |
| **OIDC Core** | OIDC 1.0 | ID token, userinfo, discovery | Standard user identity on top of OAuth 2.0 |
| **OIDC CIBA** | OIDC CIBA 1.0 | Backchannel auth (email challenge, no redirect) | Decouples consumption device from auth device — enables AI agent auth flows |
| **Token Exchange** | RFC 8693 | Backend-for-Frontend (BFF)/AI agent gets scoped delegated token | Proper delegation — new token has narrowed scope + `act` claim identifying actor |
| **`may_act` / `act`** | RFC 8693 §4.1 | Delegation chain in JWTs | `may_act` = who MAY act; `act` = who IS acting — enables auditable multi-hop delegation |
| **Token Introspection** | RFC 7662 | MCP server validates tokens with PingOne | Zero-trust: every request proves token is still active, not just well-formed |
| **Token Revocation** | RFC 7009 | Invalidate tokens on logout | Ensures session destroy also kills the PingOne token — prevents replay |
| **Backend-for-Frontend (BFF) Pattern** | IETF draft | Tokens stay server-side; browser gets session cookie only | Prevents XSS token theft; no token ever reaches browser JavaScript |
| **MCP Protocol** | Anthropic MCP 2024-11-05 | AI agent ↔ tool server communication | Standardised tool calling over JSON-RPC / WebSocket |
| **Session Fixation Prevention** | OWASP | `req.session.regenerate()` after OAuth callback | New session ID post-login prevents pre-auth session hijacking |

### 1a. RFCs and specifications we follow (explicit list)

Use this list for compliance slides and diagram legends.

| ID | Document | Role in this app |
|----|----------|------------------|
| **RFC 6749** | OAuth 2.0 Authorization Framework | Auth code, client credentials, token endpoint; base for all grants |
| **RFC 6750** | OAuth 2.0 Bearer Token Usage | `Authorization: Bearer` to Banking API and MCP-related calls |
| **RFC 7636** | PKCE | Auth code flow for the SPA/Backend-for-Frontend (BFF) (`code_challenge` S256) |
| **RFC 7662** | OAuth 2.0 Token Introspection | MCP server validates tokens with PingOne |
| **RFC 8693** | OAuth 2.0 Token Exchange | Backend-for-Frontend (BFF) may exchange session token for MCP-audience token when `MCP_SERVER_RESOURCE_URI` / `mcp_resource_uri` is configured |
| **RFC 7009** | OAuth 2.0 Token Revocation | Target: revoke on logout (not fully wired end-to-end) |
| **RFC 7517** | JSON Web Key (JWK) | JWKS URI for verifying JWT signatures |
| **RFC 7519** | JSON Web Token (JWT) | Access tokens, ID tokens, optional `act` / delegation claims per deployment |
| **RFC 7591** | OAuth 2.0 Dynamic Client Registration | Optional for agent/client registration flows |
| **JSON-RPC 2.0** | jsonrpc.org spec | MCP messages over WebSocket (`initialize`, `tools/list`, `tools/call`) |
| **OpenID Connect Core 1.0** | OIDF | ID Token, `openid` scope, UserInfo |
| **OpenID Connect CIBA** | OIDF CIBA Core 1.0 | Back-channel consent (e.g. email approval); poll `grant_type` per PingOne |
| **MCP protocol** | MCP `2024-11-05` | Tool discovery and invocation semantics (this server uses WS + JSON-RPC) |

**Patterns (not single RFCs):** Backend-for-Frontend (BFF) (tokens server-side, session cookie to browser); OWASP session fixation mitigation.

**Which are implemented today vs. gaps:**

| Standard | Status |
|---|---|
| OAuth 2.0 Auth Code + PKCE (RFC 6749 + 7636) | ✅ Done |
| Bearer token usage (RFC 6750) | ✅ Done |
| JWKS / JWT validation (RFC 7517 + 7519) | ✅ Done |
| OIDC Core (ID token, userinfo) | ✅ Done |
| OIDC CIBA (poll / email flow) | ✅ Done (Backend-for-Frontend (BFF) + agent integration as configured) |
| Backend-for-Frontend (BFF) session pattern | ✅ Done |
| MCP Protocol (`2024-11-05`) + JSON-RPC 2.0 | ✅ Done |
| Scope enforcement (API + MCP) | ✅ Done |
| Token Introspection (RFC 7662) on MCP server | ✅ Done |
| RFC 8693 Token Exchange | ✅ When `mcp_resource_uri` / `MCP_SERVER_RESOURCE_URI` is set on Backend-for-Frontend (BFF); PingOne must allow grant + policies |
| `act` / `may_act` on exchanged tokens | ⚠️ Depends on PingOne token issuance / policy (app supports consuming delegated tokens) |
| Token Revocation (RFC 7009) on logout | ❌ Target; unified logout clears session |
| Token Refresh | ❌ Routes exist; refresh logic incomplete |

---

## 2. Token Exchange — Before vs After

### BEFORE: Token Passed by Reference (Current)

The user's raw access token is shared from the Backend-for-Frontend (BFF) session directly into the MCP server.
There is no delegation record. The MCP server cannot distinguish "user calling directly"
from "Backend-for-Frontend (BFF) acting on user's behalf."

```
┌────────────┐     session cookie      ┌──────────────────────┐
│  Browser   │ ─────────────────────── │   Banking Backend-for-Frontend (BFF)        │
│  (React)   │                         │   (Port 3001)        │
└────────────┘                         │                      │
                                       │  session = {         │
                                       │    accessToken: T1   │ ← user's raw token
                                       │    (sub=user123)     │
                                       │  }                   │
                                       └──────────┬───────────┘
                                                  │
                                    POST /api/mcp/tool
                                    agentToken = T1   ← same token, no delegation
                                                  │
                                       ┌──────────▼───────────┐
                                       │   MCP Server         │
                                       │   (Port 8080)        │
                                       │                      │
                                       │  Validates T1        │
                                       │  sub  = user123  ✅  │
                                       │  aud  = ?        ⚠️  │  ← aud not enforced
                                       │  act  = ?        ❌  │  ← no delegation record
                                       └──────────┬───────────┘
                                                  │
                                    calls Banking API with T1
                                                  │
                                       ┌──────────▼───────────┐
                                       │   Banking API        │
                                       │   /api/accounts      │
                                       └──────────────────────┘

Problems:
  ✗  MCP server cannot prove the Backend-for-Frontend (BFF) sent the token (no act claim)
  ✗  Token scoped for browser use, not MCP use (same aud)
  ✗  If T1 leaks anywhere in the chain, attacker has full user token
  ✗  No audit trail of delegation
```

---

### AFTER: RFC 8693 Token Exchange (Target)

The Backend-for-Frontend (BFF) exchanges the user token for a **new, narrowly-scoped, delegated token**
with `act` identifying the Backend-for-Frontend (BFF) as the actor. The MCP server gets a token it can
validate is properly delegated — not a raw user token.

```
┌────────────┐    session cookie       ┌──────────────────────────────────────┐
│  Browser   │ ──────────────────────  │   Banking Backend-for-Frontend (BFF)  (Port 3001)           │
│  (React)   │                         │                                      │
└────────────┘                         │  session = {                         │
                                       │    accessToken: T1 (user, aud=Backend-for-Frontend (BFF))   │
                                       │  }                                   │
                                       │                                      │
                                       │  Before calling MCP:                 │
                                       │  POST /token (Token Exchange)        │
                                       │  ┌──────────────────────────────┐   │
                                       │  │ grant_type = token-exchange   │   │
                                       │  │ subject_token = T1            │   │
                                       │  │ subject_token_type = access   │   │
                                       │  │ audience = mcp-server-uri     │   │
                                       │  │ scope = banking:accounts:read │   │ ← downscoped
                                       │  └──────────────────────────────┘   │
                                       └──────────────┬───────────────────────┘
                                                      │
                                             ┌────────▼────────┐
                                             │    PingOne      │
                                             │                 │
                                             │  Validates T1   │
                                             │  Checks may_act │
                                             │  Issues T2:     │
                                             │  {              │
                                             │   sub: user123  │ ← still the user
                                             │   aud: mcp-uri  │ ← scoped to MCP
                                             │   act: {        │
                                             │    client_id:   │
                                             │    bff-client   │ ← Backend-for-Frontend (BFF) is the actor
                                             │   }             │
                                             │   scope: narrow │ ← only what MCP needs
                                             │  }              │
                                             └────────┬────────┘
                                                      │ T2 (delegated)
                                       ┌──────────────▼───────────────────────┐
                                       │   MCP Server  (Port 8080)            │
                                       │                                      │
                                       │  Validates T2:                       │
                                       │  sub  = user123          ✅           │ ← who the action is for
                                       │  aud  = mcp-server-uri   ✅           │ ← correct audience
                                       │  act  = bff-client       ✅           │ ← who sent it
                                       │  scope = accounts:read   ✅           │ ← narrow scope
                                       │  exp  = (valid)          ✅           │
                                       └──────────────┬───────────────────────┘
                                                      │
                                         Calls Banking API with T2
                                                      │
                                       ┌──────────────▼───────────┐
                                       │   Banking API            │
                                       │   /api/accounts          │
                                       │                          │
                                       │  Audit log records:      │
                                       │  "user123 accessed via   │
                                       │   bff-client delegation" │
                                       └──────────────────────────┘

Benefits:
  ✓  MCP token scoped only to MCP (aud = mcp-server-uri)
  ✓  act claim proves Backend-for-Frontend (BFF) is the actor — full audit trail
  ✓  T1 (user's browser token) never leaves the Backend-for-Frontend (BFF)
  ✓  Scope is downscoped to only what the tool needs
  ✓  PingOne validates the delegation policy before issuing T2
```

---

### AI Agent Token Exchange (LangChain → MCP)

```
┌─────────────────────────────────────────────────────┐
│  LangChain Agent (Python)                           │
│                                                     │
│  Has: CIBA token T_ciba for user123                 │
│       (obtained via /bc-authorize + poll)           │
│                                                     │
│  POST /token (Token Exchange)                       │
│  ┌─────────────────────────────────────────┐        │
│  │ grant_type    = token-exchange           │        │
│  │ subject_token = T_ciba                  │        │
│  │ actor_token   = ai_agent_client_creds   │        │ ← AI agent's own identity
│  │ audience      = mcp-server-uri          │        │
│  │ scope         = banking:transactions:read│        │
│  └─────────────────────────────────────────┘        │
└───────────────────────┬─────────────────────────────┘
                        │
               ┌────────▼────────┐
               │    PingOne      │
               │                 │
               │  Checks:        │
               │  T_ciba valid?  │
               │  may_act allows │
               │  ai_agent?      │
               │                 │
               │  Issues T3:     │
               │  {              │
               │   sub: user123  │
               │   aud: mcp-uri  │
               │   act: {        │
               │    client_id:   │
               │    ai-agent     │ ← AI agent is the actor
               │   }             │
               │  }              │
               └────────┬────────┘
                        │ T3
               ┌────────▼──────────────┐
               │   MCP Server          │
               │                       │
               │  sub  = user123  ✅   │
               │  aud  = mcp-uri  ✅   │
               │  act  = ai-agent ✅   │ ← knows this came from the AI agent
               └───────────────────────┘
```

---

## 3. Full App Flow — AI Agent Perspective

### Component Map

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│  BROWSER (User Device)                                                           │
│                                                                                  │
│  ┌──────────────────┐        ┌──────────────────┐                               │
│  │  React UI        │        │  Chat Interface  │                               │
│  │  Port 3000       │        │  (future)        │                               │
│  │                  │        │                  │                               │
│  │  - Login page    │        │  - Sends msgs    │                               │
│  │  - Dashboard     │        │    to LangChain  │                               │
│  │  - CIBA panel    │        │  - Shows AI resp │                               │
│  └────────┬─────────┘        └────────┬─────────┘                               │
└───────────┼──────────────────────────┼──────────────────────────────────────────┘
            │ HTTP (session cookie)     │ HTTP/WS
            │                          │
┌───────────▼──────────────────────────┼──────────────────────────────────────────┐
│  BANKING Backend-for-Frontend (BFF)  │                                          │
│  Port 3001  (Vercel: same domain)    │                                          │
│                                      │                                          │
│  ┌─────────────────────────────┐     │                                          │
│  │  OAuth Routes               │     │                                          │
│  │  /api/auth/oauth/login      │     │                                          │
│  │  /api/auth/oauth/callback   │     │                                          │
│  │  /api/auth/oauth/user/*     │     │                                          │
│  │  /api/auth/ciba/*           │     │                                          │
│  └────────────┬────────────────┘     │                                          │
│               │                      │                                          │
│  ┌────────────▼────────────────┐     │                                          │
│  │  Session Store              │     │                                          │
│  │  { accessToken (T1)         │     │                                          │
│  │    idToken, refreshToken }  │     │                                          │
│  └────────────┬────────────────┘     │                                          │
│               │                      │                                          │
│  ┌────────────▼────────────────┐     │                                          │
│  │  MCP Proxy                  │     │                                          │
│  │  POST /api/mcp/tool         │     │                                          │
│  │  → Token Exchange (future)  │     │                                          │
│  │  → WS to MCP Server         │     │                                          │
│  └────────────┬────────────────┘     │                                          │
│               │  WebSocket           │                                          │
└───────────────┼──────────────────────┼──────────────────────────────────────────┘
                │                      │ HTTP/WS
                │             ┌────────▼──────────────────────────────────────────┐
                │             │  LANGCHAIN AGENT (MCP Host)                      │
                │             │  Python process                                   │
                │             │                                                   │
                │             │  ┌────────────────────────────────────────────┐  │
                │             │  │  LangChainMCPAgent                         │  │
                │             │  │  - ChatOpenAI LLM (function calling)       │  │
                │             │  │  - ConversationMemory (multi-turn)         │  │
                │             │  │  - MCPToolProvider (tool bridge)           │  │
                │             │  │  - OAuthAuthenticationManager (CIBA)       │  │
                │             │  └───────────────┬────────────────────────────┘  │
                │             │                  │  WS (JSON-RPC)                │
                │             └──────────────────┼───────────────────────────────┘
                │                                │
┌───────────────▼────────────────────────────────▼───────────────────────────────┐
│  MCP SERVER  (Port 8080)                                                        │
│                                                                                 │
│  ┌──────────────────────────────────────────────────────────────────────────┐  │
│  │  AuthenticationIntegration                                               │  │
│  │  - initialize  → validate agentToken via PingOne introspection           │  │
│  │  - tools/list  → return available tools                                  │  │
│  │  - tools/call  → check scopes → execute tool → return result             │  │
│  └───────────────────────────────┬──────────────────────────────────────────┘  │
│                                  │                                              │
│  ┌───────────────────────────────▼──────────────────────────────────────────┐  │
│  │  BankingToolRegistry                                                     │  │
│  │  - list_accounts       (scope: banking:accounts:read)                    │  │
│  │  - get_account_balance (scope: banking:accounts:read)                    │  │
│  │  - list_transactions   (scope: banking:transactions:read)                │  │
│  │  - transfer            (scope: banking:transactions:write)               │  │
│  │  - deposit             (scope: banking:transactions:write)               │  │
│  │  - withdraw            (scope: banking:transactions:write)               │  │
│  └───────────────────────────────┬──────────────────────────────────────────┘  │
└───────────────────────────────────┼────────────────────────────────────────────┘
                                    │ HTTP (Bearer token)
┌───────────────────────────────────▼────────────────────────────────────────────┐
│  BANKING API SERVER  (Port 3001 — same process as Backend-for-Frontend (BFF) on Vercel)               │
│                                                                                 │
│  ┌────────────────────────────────────────────────────────────────────────┐    │
│  │  auth.js middleware                                                    │    │
│  │  - authenticateToken()  → validates JWT (JWKS, iss, exp, aud)         │    │
│  │  - requireScopes()      → checks scope claim against route map        │    │
│  └───────────────────────────────┬────────────────────────────────────────┘    │
│                                  │                                              │
│  GET  /api/accounts              │  Scope: banking:accounts:read               │
│  GET  /api/accounts/:id/balance  │  Scope: banking:accounts:read               │
│  GET  /api/transactions          │  Scope: banking:transactions:read            │
│  POST /api/transactions/transfer │  Scope: banking:transactions:write           │
│  POST /api/transactions/deposit  │  Scope: banking:transactions:write           │
│  POST /api/transactions/withdraw │  Scope: banking:transactions:write           │
│                                  │                                              │
│  ┌───────────────────────────────▼────────────────────────────────────────┐    │
│  │  Data Store (in-memory / JSON)                                         │    │
│  └────────────────────────────────────────────────────────────────────────┘    │
└────────────────────────────────────────────────────────────────────────────────┘
                                    │
                             ┌──────▼──────┐
                             │  PingOne    │
                             │            │
                             │  /authorize │
                             │  /token     │
                             │  /userinfo  │
                             │  /bc-auth.  │ ← CIBA
                             │  /jwks      │
                             │  /introspect│
                             │  /signoff   │
                             └────────────┘
```

---

## 4. Detailed Flow — User Logs In via Browser

```
Browser                   Backend-for-Frontend (BFF) (3001)               PingOne
   │                          │                       │
   │  GET /api/auth/oauth/    │                       │
   │       user/login         │                       │
   │ ────────────────────►   │                       │
   │                          │  Generate state,      │
   │                          │  PKCE verifier,       │
   │                          │  redirect_uri (from   │
   │                          │  request host)        │
   │                          │                       │
   │                          │  Store in session:    │
   │                          │  { state, verifier,   │
   │                          │    redirectUri }      │
   │                          │                       │
   │  302 → PingOne /authorize│                       │
   │ ◄────────────────────   │                       │
   │                          │                       │
   │  GET /authorize?         │                       │
   │   client_id=...          │                       │
   │   redirect_uri=.../user/ │                       │
   │   callback               │                       │
   │   code_challenge=...     │                       │
   │ ──────────────────────────────────────────────► │
   │                          │                       │
   │                          │           Login UI    │
   │                          │           shown       │
   │                          │                       │
   │  User enters credentials │                       │
   │ ──────────────────────────────────────────────► │
   │                          │                       │
   │  302 → /user/callback    │                       │
   │        ?code=AUTH_CODE   │                       │
   │        &state=...        │                       │
   │ ◄─────────────────────────────────────────────  │
   │                          │                       │
   │  GET /api/auth/oauth/    │                       │
   │       user/callback      │                       │
   │ ────────────────────►   │                       │
   │                          │  Validate state ✅    │
   │                          │  POST /token          │
   │                          │   code=AUTH_CODE      │
   │                          │   code_verifier=...   │
   │                          │   redirect_uri=...    │
   │                          │ ─────────────────►   │
   │                          │                       │
   │                          │  { access_token: T1   │
   │                          │    refresh_token: R1  │
   │                          │    id_token: ID1 }    │
   │                          │ ◄─────────────────   │
   │                          │                       │
   │                          │  session.regenerate() │ ← prevents session fixation
   │                          │  session.oauthTokens  │
   │                          │   = { T1, R1, ID1 }   │
   │                          │                       │
   │  302 → /dashboard        │                       │
   │  Set-Cookie: session=... │ ← httpOnly, secure    │
   │ ◄────────────────────   │                       │
```

---

## 5. Detailed Flow — AI Agent (LangChain) Makes a Tool Call

```
User Email              LangChain Agent          MCP Server (8080)      Backend-for-Frontend (BFF) (3001)         PingOne
    │                        │                         │                    │                  │
    │  "Show my accounts"    │                         │                    │                  │
    │ ─────────────────►    │                         │                    │                  │
    │                        │                         │                    │                  │
    │                        │  WS Connect             │                    │                  │
    │                        │ ───────────────────►   │                    │                  │
    │                        │                         │                    │                  │
    │                        │  MCP initialize         │                    │                  │
    │                        │  { agentToken: T_ai }   │                    │                  │
    │                        │ ───────────────────►   │                    │                  │
    │                        │                         │  POST /introspect  │                  │
    │                        │                         │  token=T_ai        │                  │
    │                        │                         │ ──────────────────────────────────►  │
    │                        │                         │  { active: true    │                  │
    │                        │                         │    aud: mcp-uri    │                  │
    │                        │                         │    sub: ai-agent } │                  │
    │                        │                         │ ◄──────────────────────────────────  │
    │                        │                         │                    │                  │
    │                        │  handshake OK           │                    │                  │
    │                        │ ◄───────────────────   │                    │                  │
    │                        │                         │                    │                  │
    │                        │  LLM decides:           │                    │                  │
    │                        │  call list_accounts     │                    │                  │
    │                        │                         │                    │                  │
    │                        │  tools/call             │                    │                  │
    │                        │  { name: list_accounts  │                    │                  │
    │                        │    login_hint: email }  │                    │                  │
    │                        │ ───────────────────►   │                    │                  │
    │                        │                         │                    │                  │
    │                        │                  No user token in session    │                  │
    │                        │                  → Initiate CIBA             │                  │
    │                        │                         │  POST /bc-authorize│                  │
    │                        │                         │  login_hint=email  │                  │
    │                        │                         │ ──────────────────────────────────►  │
    │                        │                         │  { auth_req_id,    │                  │
    │                        │                         │    expires_in: 300 │                  │
    │                        │                         │    interval: 5 }   │                  │
    │                        │                         │ ◄──────────────────────────────────  │
    │                        │                         │                    │                  │
    │  📧 Email: "Approve    │                         │                    │                  │
    │  Banking App access"   │                         │                    │                  │
    │ ◄────────────────────────────────────────────────────────────────────────────────────  │
    │                        │                         │                    │                  │
    │  Agent tells user:     │                         │                    │                  │
    │  "Check your email"    │                         │                    │                  │
    │ ◄─────────────────    │                         │                    │                  │
    │                        │                         │                    │                  │
    │  User clicks Approve   │                         │                    │                  │
    │ ─────────────────────────────────────────────────────────────────────────────────────► │
    │                        │                         │                    │                  │
    │                        │                  Poll: POST /token           │                  │
    │                        │                  auth_req_id=...             │                  │
    │                        │                         │ ──────────────────────────────────►  │
    │                        │                         │  { access_token: T_user              │
    │                        │                         │    scope: banking:* }│                │
    │                        │                         │ ◄──────────────────────────────────  │
    │                        │                         │                    │                  │
    │                        │                         │ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┤
    │                        │                         │  [TARGET: Token Exchange]             │
    │                        │                         │  POST /token                          │
    │                        │                         │  subject_token=T_user                 │
    │                        │                         │  audience=banking-api                 │
    │                        │                         │  scope=banking:accounts:read          │
    │                        │                         │  → Issues T_delegated with act claim  │
    │                        │                         │ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┤
    │                        │                         │                    │                  │
    │                        │                         │  GET /api/accounts │                  │
    │                        │                         │  Authorization:    │                  │
    │                        │                         │  Bearer T_delegated│                  │
    │                        │                         │ ─────────────────►│                  │
    │                        │                         │                    │  Validate token   │
    │                        │                         │                    │  Check scopes     │
    │                        │                         │  [ accounts data ] │                  │
    │                        │                         │ ◄─────────────────│                  │
    │                        │                         │                    │                  │
    │                        │  tool result            │                    │                  │
    │                        │ ◄───────────────────   │                    │                  │
    │                        │                         │                    │                  │
    │                        │  LLM formats response   │                    │                  │
    │                        │                         │                    │                  │
    │  "You have 2 accounts: │                         │                    │                  │
    │   Checking $2,400      │                         │                    │                  │
    │   Savings $11,200"     │                         │                    │                  │
    │ ◄─────────────────    │                         │                    │                  │
```

*Dashed boxes = target state (token exchange not yet implemented)*

---

## 6. Detailed Flow — Browser User Calls MCP via Backend-for-Frontend (BFF) Proxy

```
Browser (React)          Backend-for-Frontend (BFF) /api/mcp/tool         MCP Server (8080)     Banking API
     │                          │                         │                    │
     │  POST /api/mcp/tool      │                         │                    │
     │  Cookie: session=...     │                         │                    │
     │  { tool: "list_accounts" │                         │                    │
     │    params: {} }          │                         │                    │
     │ ───────────────────────► │                         │                    │
     │                          │                         │                    │
     │                          │  Extract T1 from session│                    │
     │                          │                         │                    │
     │                          │  [TARGET: Token Exchange]                    │
     │                          │  POST PingOne /token    │                    │
     │                          │  subject_token=T1       │                    │
     │                          │  audience=mcp-server    │                    │
     │                          │  → Issues T2 with act   │                    │
     │                          │    claim (bff-client)   │                    │
     │                          │                         │                    │
     │                          │  WS Connect             │                    │
     │                          │ ───────────────────►   │                    │
     │                          │                         │                    │
     │                          │  MCP initialize         │                    │
     │                          │  { agentToken: T2 }     │                    │
     │                          │ ───────────────────►   │                    │
     │                          │                         │                    │
     │                          │  handshake OK (T2 valid)│                    │
     │                          │ ◄───────────────────   │                    │
     │                          │                         │                    │
     │                          │  tools/call             │                    │
     │                          │  { list_accounts }      │                    │
     │                          │ ───────────────────►   │                    │
     │                          │                         │  GET /api/accounts │
     │                          │                         │  Bearer T2         │
     │                          │                         │ ─────────────────► │
     │                          │                         │  [ accounts ]      │
     │                          │                         │ ◄───────────────── │
     │                          │                         │                    │
     │                          │  tool result            │                    │
     │                          │ ◄───────────────────   │                    │
     │                          │                         │                    │
     │                          │  WS Close               │                    │
     │                          │ ───────────────────►   │                    │
     │                          │                         │                    │
     │  200 { accounts: [...] } │                         │                    │
     │ ◄─────────────────────── │                         │                    │
```

---

## 7. CIBA Flow Detail (Email Approval)

```
Backend-for-Frontend (BFF) / MCP Server                   PingOne                    User Email
       │                              │                             │
       │  POST /bc-authorize          │                             │
       │  {                           │                             │
       │   login_hint: user@email.com │                             │
       │   scope: openid banking:*    │                             │
       │   binding_message: "Banking  │                             │
       │   App - Account Access"      │                             │
       │   client_id: ...             │                             │
       │   client_secret: ...         │                             │
       │  }                           │                             │
       │ ─────────────────────────►  │                             │
       │                              │  Look up user by email      │
       │                              │  Trigger DaVinci flow       │
       │                              │  Send approval email        │
       │                              │ ──────────────────────────► │
       │  {                           │                             │
       │   auth_req_id: "abc-123"     │                             │
       │   expires_in: 300            │                             │
       │   interval: 5                │                             │
       │  }                           │                             │
       │ ◄─────────────────────────  │                             │
       │                              │                             │
       │  Poll every 5 seconds:       │                             │
       │  POST /token                 │                             │
       │  {                           │                             │
       │   grant_type: ciba           │                             │
       │   auth_req_id: "abc-123"     │                             │
       │  }                           │                             │
       │ ─────────────────────────►  │                             │
       │  { error: authorization_     │                             │
       │    pending }                 │                             │
       │ ◄─────────────────────────  │  (still waiting)            │
       │                              │                             │
       │    (user clicks Approve in email)                          │
       │                              │ ◄──────────────────────────│
       │                              │  DaVinci flow completes     │
       │                              │  Marks request approved     │
       │                              │                             │
       │  Poll:                       │                             │
       │  POST /token                 │                             │
       │  { auth_req_id: "abc-123" }  │                             │
       │ ─────────────────────────►  │                             │
       │  {                           │                             │
       │   access_token: T_user       │                             │
       │   refresh_token: R_user      │                             │
       │   id_token: ID_user          │                             │
       │   scope: banking:*           │                             │
       │  }                           │                             │
       │ ◄─────────────────────────  │                             │
       │                              │                             │
       │  Store in session            │                             │
       │  Continue tool call          │                             │
```

---

## 8. Implementation Priority

```
Phase 1 — Token correctness (no user-facing change)
  ├── Implement token refresh in Backend-for-Frontend (BFF)
  ├── Enforce aud + iss in tokenValidationService
  └── Add token revocation on logout (POST PingOne /token/revoke)

Phase 2 — Proper delegation (main gap)
  ├── Configure PingOne to issue may_act on user tokens
  │     (naming the Backend-for-Frontend (BFF) client_id and AI agent client_id)
  ├── Implement RFC 8693 token exchange in Backend-for-Frontend (BFF) MCP proxy
  │     POST /token { grant_type: token-exchange, subject_token,
  │                   audience: mcp-server-uri, scope: narrow }
  ├── Implement token exchange in LangChain agent
  │     (after CIBA obtains user token, exchange for MCP-scoped token)
  └── MCP server: log act claim in audit trail

Phase 3 — Better AI UX
  ├── Wire CIBA into LangChain agent (already designed in ciba.md)
  └── Complete CIBA ping-mode callback (needs shared state store)
```
