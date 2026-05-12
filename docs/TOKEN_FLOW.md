# Token Flow — Super Banking demo

Complete reference for OAuth token lifecycle: how tokens are obtained, what resource and scopes they carry, how they are exchanged (2-exchange delegation), and how decoded claims reach the UI.

> **Architecture decision:** This demo uses the **2-exchange delegation path exclusively** — User AT → AI Agent intermediary → Final MCP Token. This produces the full nested `act` claim chain required for auditable agentic delegation.

---

## Token Inventory

| Token | Grant | Resource (audience) | Scopes |
|-------|-------|---------------------|--------|
| **User Access Token** (customer) | Auth Code + PKCE | `https://ai-agent.pingdemo.com` | `openid profile email offline_access banking:read banking:write banking:ai:agent` |
| **Admin Access Token** | Auth Code | `https://ai-agent.pingdemo.com` | `openid profile email offline_access banking:read banking:write banking:admin banking:sensitive banking:ai:agent` |
| **AI Agent Actor CC Token** *(Exchange #1 actor)* | Client Credentials | `https://agent-gateway.pingdemo.com` | Agent client's registered scopes |
| **Agent Exchanged Token** *(intermediate)* | RFC 8693 Exchange #1 | `https://ai-agent.pingdemo.com` | Narrowed banking scopes + delegation chain started |
| **MCP Exchanger CC Token** *(Exchange #2 actor)* | Client Credentials | `https://mcp-gateway.pingdemo.com` | Client's registered scopes |
| **Final MCP Token** *(delegation result)* | RFC 8693 Exchange #2 | `https://resource-server.pingdemo.com` | Narrowed to tool-specific scope (see Tool → Scope table) |
| **Worker Token** | Client Credentials | PingOne Management API | No scope in body (PingOne worker convention) |
| **Refresh Token** | Returned with Auth Code (`offline_access`) | — | — |
| **ID Token** | Returned with Auth Code (`openid`) | — | Identity claims |

---

## Scope Definitions

| Scope | Meaning |
|-------|---------|
| `openid` | OIDC — enables ID token and userinfo endpoint |
| `profile` | OIDC — name, given_name, family_name |
| `email` | OIDC — email address |
| `offline_access` | Enables refresh token issuance |
| `banking:read` | Read accounts and transactions |
| `banking:write` | Write — deposits, withdrawals, transfers |
| `banking:admin` | Full admin access across all users |
| `banking:sensitive` | Sensitive data (full account number, routing) |
| `banking:ai:agent` | AI agent identification / delegation delegation scope |
| `ai_agent` | AI agent identity (OIDC-side agent identity) |
| `admin:read` | Admin-only read (audit logs, system status) |
| `admin:write` | Admin-only write |
| `users:read` | Read user list |
| `users:manage` | Manage user accounts |

---

## MCP Tool → Required Scope

| Tool(s) | Required Scope(s) on User AT | Scope Passed to Exchange |
|---------|------------------------------|--------------------------|
| `get_my_accounts`, `get_account_balance`, `get_my_transactions` | `banking:read` | `banking:read` |
| `create_transfer`, `create_deposit`, `create_withdrawal` | `banking:write` | `banking:write` |
| `query_user_by_email` | `ai_agent` | `ai_agent` |
| `admin_list_all_users`, `admin_get_user_details` | `admin:read`, `users:read` | `admin:read users:read` |
| `admin_delete_user`, `admin_manage_accounts` | `admin:write`, `users:manage` | `admin:write users:manage` |
| `admin_view_audit_logs`, `admin_system_status` | `admin:read` | `admin:read` |

**Scope resolution logic** (`agentMcpTokenService.js`):

- **Path A** — User AT directly carries tool scope → passes that scope to PingOne
- **Path B** — User AT carries only `banking:ai:agent` → passes tool scopes to PingOne Authorize policy to decide
- **Fail** — User AT has neither → `403 missing_exchange_scopes`
- **Guard** — User AT must carry ≥ 5 distinct scopes before any exchange is attempted (`MIN_USER_SCOPES_FOR_MCP = 5`)

---

## 2-Exchange Delegation Flow

```
1. User login (Auth Code + PKCE)
   PingOne → User Access Token
   aud:    https://ai-agent.pingdemo.com
   scope:  openid profile email offline_access
           banking:read banking:write banking:ai:agent
   may_act.sub: PINGONE_AI_AGENT_CLIENT_ID  ← must be set in PingOne policy
   stored: req.session.oauthTokens.accessToken  (server-side httpOnly, never in browser)

2. Agent called: POST /api/banking-agent/message
   BFF checks:
   ├─ mcp_resource_uri is configured
   ├─ scopeCount(userAT) ≥ 5  (MIN_USER_SCOPES_FOR_MCP)
   └─ may_act.sub === PINGONE_AI_AGENT_CLIENT_ID

Exchange #1 — User → AI Agent delegation
   BFF gets AI Agent Actor CC Token
   (Client Credentials → aud: https://agent-gateway.pingdemo.com)

   RFC 8693 POST {PingOne}/as/token:
   grant_type         = urn:ietf:params:oauth:grant-type:token-exchange
   subject_token      = User AT
   subject_token_type = urn:ietf:params:oauth:token-type:access_token
   actor_token        = AI Agent Actor CC Token
   actor_token_type   = urn:ietf:params:oauth:token-type:access_token
   audience           = https://ai-agent.pingdemo.com
   client_id          = PINGONE_AI_AGENT_CLIENT_ID
   ─────────────────────────────────────────────────────────────
   → Intermediate Agent Token
      sub:   <user's sub>  (preserved — RFC 8693 §3)
      aud:   https://ai-agent.pingdemo.com
      act:   { "sub": "ai-agent-client-id" }
      scope: banking:read banking:write  (narrowed)

Exchange #2 — Agent token → MCP delegation
   BFF gets MCP Exchanger CC Token
   (Client Credentials → aud: https://mcp-gateway.pingdemo.com)

   RFC 8693 POST {PingOne}/as/token:
   grant_type         = urn:ietf:params:oauth:grant-type:token-exchange
   subject_token      = Intermediate Agent Token
   subject_token_type = urn:ietf:params:oauth:token-type:access_token
   actor_token        = MCP Exchanger CC Token
   actor_token_type   = urn:ietf:params:oauth:token-type:access_token
   audience           = https://resource-server.pingdemo.com
   scope              = banking:read  (tool-specific)
   client_id          = PINGONE_MCP_TOKEN_EXCHANGER_CLIENT_ID
   ─────────────────────────────────────────────────────────────
   → Final MCP Token
      sub:   <user's sub>  (preserved end-to-end)
      aud:   https://resource-server.pingdemo.com
      act:   {
               "sub": "mcp-exchanger-client-id",
               "act": { "sub": "ai-agent-client-id" }
             }   ← nested delegation chain
      scope: banking:read  (narrowed to this tool)

3. Final MCP Token used as Bearer to MCP Server
   MCP Server validates: aud ✓  scope ✓  act chain ✓
   Tool executes → result returned to BFF

4. UI receives decoded claims only (never raw tokens)
   GET /api/tokens/session-preview → tokenEvents[]
   POST agent message response    → live tokenEvents[] per tool call
```

---

## `may_act` / `act` Claims (RFC 8693)

### `may_act` — prospective permission (on User AT, before exchange)

PingOne must be configured to add `may_act.sub = PINGONE_AI_AGENT_CLIENT_ID` to the user's access token at login. This authorizes Exchange #1. Without it the exchange is rejected.

Feature flag `ff_inject_may_act`: BFF writes it into the in-memory claim snapshot for testing (JWT itself is unchanged).

### `act` — current actor chain (on Final MCP Token)

The 2-exchange path produces a nested `act` claim encoding the full delegation chain:

```json
{
  "sub": "user-subject-id",
  "act": {
    "sub": "mcp-exchanger-client-id",
    "act": {
      "sub": "ai-agent-client-id"
    }
  }
}
```

Reading the chain: **MCP Exchanger** acted on behalf of **AI Agent**, which acted on behalf of **the user**. Subject preservation is verified after each exchange — if `exchangedToken.sub !== userSub` a `subject-preservation-mismatch` warning event is emitted (RFC 8693 §3).

---

## How Decoded Claims Reach the UI

All raw tokens stay **server-side only**. The browser only ever receives decoded JWT payload objects:

| Endpoint | What it returns |
|----------|-----------------|
| `GET /api/tokens/session-preview` | `tokenEvents[]` with decoded User AT claims; "waiting" placeholders for pending MCP exchange |
| `GET /api/tokens/chain` | Full token chain: `banking-app-token`, `agent-token`, `exchanged-token-mcp` — decoded payload only |
| `GET /api/token-chain` | Full ordered event chain from `tokenChainService` Map |
| `POST /api/banking-agent/message` (response) | Live `tokenEvents[]` per tool call with exchange details |
| `GET /api/tokens/userinfo` | BFF proxies PingOne `/userinfo`; enriched profile claims |

Each `tokenEvent` shape:
```json
{
  "id": "user-token",
  "label": "User Access Token",
  "status": "active",
  "jwtFullDecode": { "header": {}, "claims": {} },
  "explanation": "User authenticated via Authorization Code + PKCE...",
  "rfc": "RFC 6749, RFC 7636",
  "exchangeDetails": {
    "actPresent": true,
    "audMatches": true,
    "scopeNarrowed": true
  }
}
```


---

## Gateway-First Token Flow (Phase 243 — MCP Gateway)

> **Architecture change (Phase 243):** When `MCP_GATEWAY_HTTP_URL` is configured on the BFF,
> all MCP tool calls are routed through the **banking-mcp-gateway** service rather than
> directly to the MCP server. The gateway owns RFC 9728 protected resource metadata,
> runs PingOne Authorize policy evaluation per call, and performs a final RFC 8693
> token exchange before forwarding to the upstream MCP server.

### Token Chain with Gateway (Phase 243)

```
Final MCP Token                      Gateway-Issued Upstream Token
(aud = MCP_GW_RESOURCE_URI)      →   (aud = MCP_UPSTREAM_RESOURCE_URI)
           |                                       |
           v                                       v
   banking-mcp-gateway                  banking_mcp_server
   (port 3005)                          (port 8080)
```

**Full end-to-end chain:**
```
1–2. Same as 2-Exchange path above → Final MCP Token (aud = MCP_GW_RESOURCE_URI)

3. BFF: POST /mcp → banking-mcp-gateway
   Bearer: Final MCP Token (aud = MCP_GW_RESOURCE_URI)
   
   Gateway pipeline (PingGateway filter chain equivalent):
   ├─ McpValidationFilter equivalent: Origin check, Accept header, JSON-RPC 2.0 format
   ├─ McpProtectionFilter equivalent: Decode + validate JWT (aud, exp, sub)
   │   GatewayTokenPolicy: reject if aud ∈ upstream URIs (D-05 anti-bypass)
   ├─ PingOne Authorize: POST /governance/pap/alpha/policy/{workerId}/decision
   │   Decision context: method, toolName, clientId, scopes, audience
   │   PERMIT → continue    DENY / INDETERMINATE → 403
   └─ RFC 8693 Token Exchange: gateway exchanges Final MCP Token for upstream token
       subject_token = Final MCP Token
       target token  aud = MCP_UPSTREAM_RESOURCE_URI (OLB or invest, per tool route)
       actor_token   = gateway CC token
       ────────────────────────────────────────────────────────
       → Upstream Token (gateway-issued, aud = MCP_UPSTREAM_RESOURCE_URI)

4. Gateway → upstream MCP server (port 8080)
   Bearer: Upstream Token (aud = MCP_UPSTREAM_RESOURCE_URI)
   
   Upstream enforcement (D-05):
   ├─ MCP_GATEWAY_MODE=true: HttpMCPTransport.enforceUpstreamContract()
   │   Reject if aud includes MCP_GW_RESOURCE_URI (anti-bypass)
   │   Accept only if aud = MCP_UPSTREAM_RESOURCE_URI
   └─ authManager.validateAgentToken() — signature + claims

5. Tool executes → result returned gateway → BFF

6. UI receives decoded claims only — NO raw tokens leave the BFF (D-04)
   The LLM (LangChain) calls the gateway directly:
   aud = MCP_GW_RESOURCE_URI (set via MCP_GW_RESOURCE_URI on MCP_SERVER_BANKING_ENDPOINT)
   Result returned without token exposure to the model context window.
```

### Security Properties (Phase 243)

| Decision | Enforcement |
|----------|-------------|
| D-01: Real gateway (not a stub) | `banking-mcp-gateway/` service, port 3005 |
| D-02: Gateway owns RFC 9728 | `GET /.well-known/oauth-protected-resource` on gateway (not upstream) |
| D-03: Gateway handles token passing/exchange | `McpTokenExchangeClient` in gateway |
| D-04: NO TOKENS TO LLM | `callToolViaGateway` result-only return; LangChain gets tool result, not token |
| D-05: aud = next hop only | `GatewayTokenPolicy` + `HttpMCPTransport.enforceUpstreamContract` |
| D-06: PingOne Authorize does policy | `PingOneAuthorizeClient.evaluate()` per call |

### Gateway Env Vars (banking-mcp-gateway)

| Variable | Purpose |
|----------|---------|
| `MCP_GW_RESOURCE_URI` | Inbound audience — what tokens must be issued for (gateway) |
| `UPSTREAM_MCP_URL` | Upstream MCP server base URL (default `http://localhost:8080`) |
| `PINGAUTHORIZE_ENDPOINT` | PingOne Authorize base URL |
| `PINGAUTHORIZE_WORKER_ID` | Policy worker ID for per-call decisions |
| `MCP_OLB_RESOURCE_URI` | Upstream audience for OLB banking tools |
| `MCP_INVEST_RESOURCE_URI` | Upstream audience for invest tools |
| `MCP_ACCEPTED_ORIGINS` | Regex for CORS origin validation |

### BFF Env Vars (banking-mcp-gateway cutover)

| Variable | Purpose |
|----------|---------|
| `MCP_GATEWAY_HTTP_URL` | When set, BFF routes tools through gateway (default: bypass) |
| `MCP_GATEWAY_TIMEOUT_MS` | Per-call timeout (default 30000 ms) |

### Upstream MCP Server Env Vars (hardening)

| Variable | Purpose |
|----------|---------|
| `MCP_GATEWAY_MODE` | When `true`, upstream enforces next-hop contract (D-05) |
| `MCP_UPSTREAM_RESOURCE_URI` | Expected upstream audience in gateway-issued tokens |
| `MCP_GW_RESOURCE_URI` | Gateway audience — rejected at upstream (anti-bypass) |


---

## Environment Variables Reference

| Variable | Value | Purpose |
|----------|-------|---------|
| `ENDUSER_AUDIENCE` | `https://ai-agent.pingdemo.com` | User AT audience |
| `AI_AGENT_INTERMEDIATE_AUDIENCE` | `https://ai-agent.pingdemo.com` | Exchange #1 intermediate token audience |
| `AGENT_GATEWAY_AUDIENCE` | `https://agent-gateway.pingdemo.com` | AI Agent actor CC token audience |
| `BANKING_API_RESOURCE_URI` | `https://resource-server.pingdemo.com` | Banking API resource server |
| `PINGONE_RESOURCE_MCP_GATEWAY_URI` | `https://mcp-gateway.pingdemo.com` | MCP Exchanger CC token audience |
| `PINGONE_RESOURCE_TWO_EXCHANGE_URI` | `https://resource-server.pingdemo.com` | Exchange #2 final MCP token audience |

---

## Key Source Files

| File | Role |
|------|------|
| `banking_api_server/config/oauthUser.js` | User PKCE flow scopes, dynamic scope logic |
| `banking_api_server/config/scopes.js` | `BANKING_SCOPES` constants + tool scope map |
| `banking_api_server/services/agentMcpTokenService.js` | 1-exchange + 2-exchange paths, scope resolution |
| `banking_api_server/services/oauthService.js` | `performTokenExchangeAs()`, CC token helpers |
| `banking_api_server/services/mcpWebSocketClient.js` | `MCP_TOOL_SCOPES` mapping |
| `banking_api_server/routes/tokens.js` | `GET /api/tokens/session-preview`, `/chain`, `/userinfo` |
| `banking_api_server/routes/ciba.js` | CIBA step-up flow |
| `banking_api_ui/src/context/TokenChainContext.js` | Live token event state in UI |
| `banking_api_ui/src/context/useFlowMilestones.js` | `addMilestone()` hook for flow timeline |
