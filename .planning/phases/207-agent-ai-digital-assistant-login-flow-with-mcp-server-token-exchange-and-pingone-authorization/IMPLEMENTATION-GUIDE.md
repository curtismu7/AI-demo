# Phase 207 Implementation Guide: RFC 8693 Token Exchange at MCP Server

## 🎯 Architecture Decision: MCP-Centric Token Exchange

**For a single-agent system, RFC 8693 token exchange happens at the MCP server, NOT the BFF.**

This means:
- **BFF (banking_api_server)** ← receives user token from agent, forwards it to MCP
- **MCP Server (banking_mcp_server)** ← **DOES the token exchange** with PingOne
  - Has agent credentials locally available
  - Calls PingOne token endpoint with: `subject_token` (user) + `actor_token` (agent) → `delegated_token`
  - Returns delegated token with RFC 8693 `act` claim to tool execution layer
  - Central point for token policy enforcement and audit logging

### Why MCP Server?
1. **Single agent means simpler architecture** — MCP owns the token lifecycle
2. **Cleaner separation** — BFF just proxies; MCP executes with authority
3. **Better for Authorize integration** — MCP has the delegated token in-hand before calling Authorize policy
4. **Audit trail** — All token exchanges logged in one place (MCP server)
5. **Credential isolation** — Agent secrets stay in MCP, not in BFF

### RFC 8693 2-Exchange Implementation

**Primary Implementation Location:**
```
banking_mcp_server/src/services/tokenExchangeService.js (TO CREATE - Phase 207)
```

**Main Function:**
```javascript
async function exchangeUserTokenForMcpToken(userToken, toolName, correlationId)
```

This function will:
- Receive user OAuth token from BFF via Authorization header
- Load agent credentials from env (`AGENT_OAUTH_CLIENT_ID`, `AGENT_OAUTH_CLIENT_SECRET`)
- Call PingOne token endpoint with RFC 8693 grant
- Return delegated token with `act` claim
- Log exchange event with toolName + timestamp + user identity

### Existing Supporting Infrastructure (to be reused/adapted)

1. **OAuth Token Operations** — `banking_api_server/services/oauthService.js`
   - Existing functions: `performTokenExchange()`, `performTokenExchangeWithActor()`
   - These will be **extracted and moved to MCP server** (or replicated)
   - Calls PingOne OAuth token endpoint `/as/token` with RFC 8693 grant
   - Request: `grant_type=urn:ietf:params:oauth:grant-type:token-exchange` + subject_token + actor_token

2. **Scope Policy** — To be created at MCP server
   - `parseAllowedScopesFromConfig(toolName)` — Reads tool scope requirements
   - `isUserAuthorizedForTool(userToken, toolName)` — Validates user token has required scopes
   - Runs BEFORE exchange to fail fast if user lacks scopes

3. **Token Validation** — `banking_mcp_server/src/middleware/mcpTokenValidator.js` (EXISTING)
   - Validates delegated token after it's generated
   - Checks: signature, expiration, audience match, act claim presence
   - Returns 401/403 on validation failure

4. **Token Events Tracking** — To be created at MCP server
   - Tracks exchanged tokens for audit + UI Token Chain panel
   - Sanitized claims logged (not raw tokens)
   - Shows jti, aud, act claims, scopes, toolName, timestamp

5. **BFF Proxy Middleware** — `banking_api_server/routes/mcpProxy.js` (EXISTING, adapted)
   - Forwards Authorization header from agent to MCP
   - Receives delegated token back from MCP
   - Returns tool result with decision envelope to agent
   - Does NOT do token exchange (just proxying)

### Configuration & Flags

**MCP Server** (`banking_mcp_server/.env`, Phase 207 to add):

```bash
# Token Exchange Configuration — MCP OWNS THIS NOW
AGENT_OAUTH_CLIENT_ID="<client-id>"           # MCP's identity
AGENT_OAUTH_CLIENT_SECRET="<secret>"          # MCP's credentials (keep secure!)

# OAuth Endpoints
PINGONE_ENVIRONMENT_ID="<env-id>"
ENDPOINT_TOKEN="https://auth.pingone.com/{envId}/as/token"
ENDPOINT_AUTHORIZE="https://auth.pingone.com/{envId}/authorize"  # For policy evaluation

# MCP Token Configuration
MCP_SERVER_URI="https://mcp-olb.baf.com"           # MCP's own audience
MCP_SCOPE_PREFIX="banking"                         # Scope prefix for tools
DEBUG_TOKEN_EXCHANGE=false                         # Enable exchange logging
```

**BFF Server** (`banking_api_server/.env`, existing, simplified):

```bash
# BFF just proxies — doesn't do token exchange
MCP_GATEWAY_URL="https://mcp-olb.baf.com"         # Where to forward requests
BANKING_API_BFF_CLIENT_ID="<client-id>"          # BFF's own identity (for admin tasks)
BANKING_API_BFF_CLIENT_SECRET="<secret>"

# Feature flag — in Phase 207, this is ALWAYS true
USE_MCP_TOKEN_EXCHANGE=true                        # Route all tool calls to MCP
```

### Call Flow: MCP-Centric RFC 8693 Exchange

```
1. Agent has: User OAuth token (subject_token)
   
2. Agent sends to BFF: POST /api/mcp/tool
   Body: { toolName: "get_my_accounts" }
   Header: Authorization: Bearer <user-token>

3. **BFF (banking_api_server) minimal processing:**
   a. Validate: Authorization header present
   b. Validate: User session active
   c. Forward to MCP: Pass Authorization header through

4. **MCP Server (banking_mcp_server) handles exchange:**
   a. Receive Authorization header (user token)
   b. Extract toolName from request body
   c. Check scope policy: Does user token have scopes for this tool?
   d. If not: Return HTTP 403 + error details (no exchange attempted)
   
   e. If user has scopes, proceed to exchange (CRITICAL STEP):
   
   f. **Get agent credentials from env (MCP server holds these):**
      - AGENT_OAUTH_CLIENT_ID
      - AGENT_OAUTH_CLIENT_SECRET
   
   g. **Call PingOne token endpoint directly from MCP:**
      REQUEST:
      ```
      POST https://auth.pingone.com/{envId}/as/token
      Content-Type: application/x-www-form-urlencoded
      
      grant_type=urn:ietf:params:oauth:grant-type:token-exchange
      &subject_token=<user-oauth-token>
      &subject_token_type=urn:ietf:params:oauth:token-type:access_token
      &actor_token=<agent-client-credentials-token>
      &actor_token_type=urn:ietf:params:oauth:token-type:access_token
      &resource=https://mcp-server.example.com
      &scope=banking:accounts:read
      ```
      
      RESPONSE from PingOne:
      ```json
      {
        "access_token": "eyJhbGc...",
        "token_type": "Bearer",
        "expires_in": 3600,
        "scope": "banking:accounts:read",
        "act": { "sub": "<agent-client-id>" }
      }
      ```
   
   h. MCP logs exchange event:
      - toolName
      - userSubject
      - timestamp
      - delegated token jti
      - Audit trail for compliance

5. **MCP validates delegated token:**
   - mcpTokenValidator.js checks RFC 8693 structure
   - Validates: signature, expiration, aud, act claim presence
   - If invalid → returns HTTP 401/403 to agent

6. **If token valid, BFF proceeds to Authorize policy evaluation** (via `mcpToolAuthorizationService.js`):
   - Feature-flag gated: `ff_authorize_mcp_first_tool`
   - Calls `pingOneAuthorizeService.evaluateMcpToolDelegation()` (live) or `simulatedAuthorizeService` (education mode)
   - Decision vocab from PingOne Authorize: **`PERMIT` / `DENY` / `INDETERMINATE`** + **`stepUpRequired: boolean`**
   - NOT: APPROVED/DENIED/MFA_REQUIRED/HITL_REQUIRED — those were planned names that were not adopted

7. **BFF sends response to agent:**
   - `stepUpRequired: true` → HTTP 200 body `{ error: 'mcp_step_up_required', decisionContext: 'McpFirstTool', decisionId }`
   - `DENY` → HTTP 200 body `{ error: 'mcp_authorization_denied', decisionContext: 'McpFirstTool', decisionId }`
   - `PERMIT` → tool executes; result returned in response body
   - Decisions are inline in the tool call response — no separate polling endpoint needed
```

### What Phase 207 ADDS (vs What's Already There) — UPDATED 2026-04-20

**Already Implemented (confirmed in codebase):**
- ✅ RFC 8693 token exchange — `banking_api_server/services/oauthService.js` (`performTokenExchange`, `performTokenExchangeWithActor`)
- ✅ RFC 8693 orchestration — `banking_api_server/services/agentMcpTokenService.js` (1552 lines; `resolveMcpAccessTokenWithEvents`)
- ✅ MCP token validation — `banking_mcp_server/src/middleware/mcpTokenValidator.js`
- ✅ **MCP authorization policy gate** — `banking_api_server/services/mcpToolAuthorizationService.js` (246 lines)
  - Runs on first MCP tool use per session, feature-flagged via `ff_authorize_mcp_first_tool`
  - Calls PingOne Authorize `evaluateMcpToolDelegation()` with `DecisionContext=McpFirstTool`
  - Returns `PERMIT`/`DENY` + `stepUpRequired: boolean` (NOT the APPROVED/DENIED/MFA_REQUIRED/HITL_REQUIRED vocab in earlier notes)
- ✅ **PingOne Authorize integration** — `banking_api_server/services/pingOneAuthorizeService.js` (654 lines)
  - Separate MCP decision endpoint via `authorize_mcp_decision_endpoint_id` config key
  - Handles `PERMIT`/`DENY`/`INDETERMINATE` + `stepUpRequired`
- ✅ **Simulated Authorize mode** — `banking_api_server/services/simulatedAuthorizeService.js` (272 lines) — education mode, deny >$50k, step-up for high-risk ops
- ✅ **Transaction authorization** — `banking_api_server/services/transactionAuthorizationService.js` (226 lines)
- ✅ **Scope policy engine** — `banking_api_server/services/agentMcpScopePolicy.js` (81 lines)
- ✅ 401/403/step-up error responses already returned inline in tool call responses
- ✅ `FF_TWO_EXCHANGE_DELEGATION=true` — BFF-level 2-exchange already active

**Architecture reality (vs earlier doc):**
- ❌ Token exchange was NOT moved to MCP server — it remains at BFF in `agentMcpTokenService.js`
- ✅ BFF-centric exchange is the correct architecture: BFF owns exchange + policy; MCP validates
- ✅ `mcpInstructions.js` is NOT needed — decisions return inline in `/api/mcp/tool` response body

**Phase 207 TRUE REMAINING GAPS:**
- 🆕 **Option D delegation endpoint** — `POST /api/agent/delegate` (BFF route) — for N8N/Bedrock/Glean external platforms that cannot do RFC 8693
- 🆕 **Agent decision handler UI** — `banking_api_ui/services/agentDecisionHandler.js` — routes `mcp_step_up_required` to MFA modal, `mcp_authorization_denied` to error UI
- 🆕 **HITL async decision flow** — policy can signal HITL consent requirement; no polling/webhook mechanism exists yet
- 🆕 **Session correlation (taskId)** — concurrent tool calls need stable correlation ID across Lambda invocations

### Option D: Agent-Facing Delegation Endpoint

**Why**: External agent platforms (N8N, AWS Bedrock, Glean) cannot perform RFC 8693 token exchange. They can only send static Bearer tokens. Option D lets these platforms call a single BFF endpoint to receive a pre-exchanged delegated token with `act` claim, which they then use as a standard Bearer header to MCP.

**File to create:** `banking_api_server/routes/agentDelegation.js`

```javascript
// POST /api/agent/delegate
// Authorization: Bearer <incoming-user-token>
// Body: { scope?: string }   optional scope restriction
//
// 1. Validate incoming user token (JWT verify or PingOne introspect)
// 2. Intersect requested scope with user's token scopes
// 3. Call performTokenExchangeWithActor(userToken, agentCreds, scope)
//    — reuses existing oauthService.js function
// 4. Return { access_token, token_type, expires_in, scope, act }

router.post('/api/agent/delegate', rateLimitMiddleware, async (req, res) => {
  const userToken = req.headers.authorization?.replace('Bearer ', '');
  if (!userToken) return res.status(401).json({ error: 'missing_token' });

  const claims = await validateUserToken(userToken); // throws on invalid
  const requestedScope = req.body?.scope || claims.scope;
  const allowedScope = intersectScopes(requestedScope, claims.scope);

  const delegated = await performTokenExchangeWithActor(
    userToken,
    { clientId: AGENT_CLIENT_ID, clientSecret: AGENT_CLIENT_SECRET },
    allowedScope
  );

  await auditLog({ sub: claims.sub, act: AGENT_CLIENT_ID,
    scope: allowedScope, agentClientId: req.headers['x-agent-client-id'] });

  res.json({
    access_token: delegated.access_token,
    token_type: 'Bearer',
    expires_in: delegated.expires_in,
    scope: allowedScope,
    act: delegated.act,
  });
});
```

**Route to register in:** `banking_api_server/server.js` (or existing route loader)

**Rate limiting:** Use the existing `expressRateLimit` pattern already in the BFF — 10 requests per user per minute.

**Reuses:** `banking_api_server/services/oauthService.js` → `performTokenExchangeWithActor()` — no new exchange logic needed.

---

### Implementation Checklist for Phase 207 — UPDATED 2026-04-20

**Wave 0 — Already built (verify, do not rebuild):**
- ✅ `banking_api_server/services/mcpToolAuthorizationService.js` — MCP first-tool Authorize gate (live)
- ✅ `banking_api_server/services/pingOneAuthorizeService.js` — PingOne Authorize API client with MCP endpoint support
- ✅ `banking_api_server/services/simulatedAuthorizeService.js` — education/simulated mode
- ✅ `banking_api_server/services/agentMcpTokenService.js` — RFC 8693 exchange + event tracking (do NOT modify)
- ✅ `banking_api_server/routes/authorize.js` — admin endpoints for decision endpoints + recent decisions
- ✅ Token exchange hooked into `POST /api/mcp/tool` flow (server.js L1212)
- ✅ `stepUpRequired` and `DENY` decisions already returned as structured inline responses
- ✅ `ff_authorize_mcp_first_tool` wired in `server.js` L1212 via `mcpToolAuthorizationService.evaluateMcpFirstToolGate()`
- ✅ **Scope-based tools/list filtering** — implemented in MCP server TypeScript (see SCOPE-FILTERING-IMPLEMENTATION.md)
  - `toolScopeMap.ts` → `filterToolsByScope()` — JWT scope claim → tool whitelist
  - `BankingToolRegistry.ts` → `requiredScopes` flattened to `banking:read`/`banking:write` (matches PingOne token format)
  - `BankingToolProvider.ts` → `getAvailableToolsForToken(tokenScopes)` — entry point for filtered list
  - `MCPMessageHandler.ts` → `handleListTools()` now decodes token scopes and returns filtered tools
  - Built and compiled to `dist/` — confirmed operational

**Wave 1 — Still to build:**
- [ ] Create `banking_api_server/routes/agentDelegation.js` **(Option D)**
  - `POST /api/agent/delegate`
  - Requires `Authorization: Bearer <user-token>` (no session cookie required)
  - Validates user token via JWT decode and/or PingOne introspection
  - Calls `performTokenExchangeWithActor()` from `oauthService.js`
  - Returns `{ access_token, token_type, expires_in, scope, act }` with delegated token
  - Rate-limited (10 req/user/min using existing `expressRateLimit` pattern)
  - Audit logged: `sub`, `act.sub`, requested scopes, `X-Agent-Client-ID` header
  - Register at: `banking_api_server/server.js` under `/api/agent`

- [ ] Verify `ff_authorize_mcp_first_tool` feature flag is wired to `mcpToolAuthorizationService` in the actual `/api/mcp/tool` route handler — **CONFIRMED: wired at server.js L1212** ✅

**Wave 2 — Agent-side enforcement:**
- [ ] Create `banking_api_ui/services/agentDecisionHandler.js`
  - Handles tool call responses from `/api/mcp/tool`
  - Routes `error: 'mcp_step_up_required'` → MFA modal (use existing MFA components)
  - Routes `error: 'mcp_authorization_denied'` → error UI with `decisionId` shown
  - Manages OTP retries and timeout
  - Does NOT route `HITL_REQUIRED` (no async HITL flow exists yet — see Wave 3)

**Wave 3 — HITL + correlation:**
- [ ] Design HITL async decision flow — policy signals HITL; need polling or webhook mechanism
  - Options: `GET /api/mcp/decision/:taskId` polling endpoint, or server-sent events
  - Blocked on: defining HITL trigger shape from PingOne Authorize response
- [ ] Cross-Lambda session correlation via `taskId` for concurrent tool calls
- [ ] Update `REGRESSION_PLAN.md` §1 with: `routes/agentDelegation.js`, `services/agentDecisionHandler.js`

### Testing the Existing 2-Exchange (Before Phase 207)

**Test files that verify current implementation:**
- `/Users/cmuir/P1Import-apps/Banking/test-admin-token-exchange.js`
- `/Users/cmuir/P1Import-apps/Banking/test-admin-token-exchange-simple.js`
- `/Users/cmuir/P1Import-apps/Banking/banking_api_server/scripts/verify-token-exchange.js`
- `/Users/cmuir/P1Import-apps/Banking/banking_api_server/scripts/verify-act-claims.js`

**Test by running:**
```bash
cd /Users/cmuir/P1Import-apps/Banking
node test-admin-token-exchange-simple.js
```

---

## Key Insight for Phase 207 Planning

The 2-exchange infrastructure is **already solid and battle-tested**. Phase 207's job is NOT to fix token exchange — it's to:

1. **Add a policy evaluation layer** on top of the existing token handling
2. **Route policy decisions** back to the agent for enforcement (not just allow/deny at HTTP level)
3. **Implement MFA + HITL as policy decisions**, not as separate code paths

This means Phase 207 implementation is **minimally invasive** — it wraps the existing exchange code with a new authorization layer.

---

**Last Updated**: 2026-04-20  
**Accuracy**: ✅ Verified against actual file locations and code  
**Status**: Ready for Phase 207 Wave 1 planning
