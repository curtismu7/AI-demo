# Phase 207 Architecture Diagram

## 📐 System Architecture Overview

The provided diagram illustrates the complete Phase 207 orchestration:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                    PHASE 207: Agent AI Login Flow with Authorization                  │
├────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                         │
│  Left Column: Authentication & Identity                                               │
│  ├─ User                                                                               │
│  ├─ OLB Application (Online Banking)                                                  │
│  ├─ Chatbot                                                                            │
│  └─ LLM (Large Language Model)                                                        │
│                                                                                         │
│  Center Column: Token Exchange & Gateway Layer                                        │
│  ├─ SDK / Agent (client_id: agent, token: scoped to user via delegation)             │
│  ├─ Token Exchange (RFC 8693)                                                         │
│  │  ├─ Subject Token: User OAuth token                                               │
│  │  ├─ Actor Token: Agent client credentials                                         │
│  │  └─ Result: Delegated token with 'act' claim                                      │
│  └─ MCP (Model Context Protocol) Server                                              │
│     ├─ Token Exchange coordination                                                    │
│     ├─ Policy evaluation (NEW in Phase 207)                                          │
│     └─ Tool execution gateway                                                         │
│                                                                                         │
│  Right Column: Decision Layer & Backend                                               │
│  ├─ OAuth RS (Resource Server)                                                        │
│  │  ├─ Policy Enforcement (Decision Routing)                                          │
│  │  └─ Auth/Z (Authorization) via home-built authz server                            │
│  ├─ MCP invocations:                                                                  │
│  │  ├─ tools/list: MCP returns available tools                                       │
│  │  └─ tools/call: MCP executes tool with decision routing                           │
│  └─ Backend APIs:                                                                     │
│     ├─ mcp-olb.baf.com/balance (show accounts)                                      │
│     ├─ mcp-invest.baf.com (investment operations)                                    │
│     └─ REST endpoints                                                                 │
│                                                                                         │
│  Tools Available (Example):                                                           │
│  ├─ "Show my accounts" → GET /balance                                                │
│  ├─ "Show transactions" → GET /transactions                                          │
│  ├─ "Create transfer" → POST /transfer (with HITL if >$500)                         │
│  └─ "Request withdrawal" → POST /withdrawal (with MFA if enabled)                    │
│                                                                                         │
│  Phase 207 NEW FLOWS:                                                                 │
│  ├─ tools/list call                                                                   │
│  │  → Token validation (RFC 8693) passes                                             │
│  │  → MCP queries home-built authz server                                                   │
│  │  → Decision: APPROVED → MCP returns full tool list                                │
│  │                                                                                     │
│  ├─ tools/call (sufficient scope)                                                     │
│  │  → Token validation passes                                                         │
│  │  → MCP queries home-built authz server                                                   │
│  │  → Decision: APPROVED → Tool executes                                             │
│  │                                                                                     │
│  ├─ tools/call (insufficient scope)                                                   │
│  │  → Token validation passes                                                         │
│  │  → MCP queries home-built authz server                                                   │
│  │  → Decision: DENIED (insufficient_scope)                                          │
│  │  → HTTP 200 response with { decision: 'DENIED', reason: 'insufficient_scope' }   │
│  │  → Agent UI shows permission error (NOT HTTP 401/403)                             │
│  │                                                                                     │
│  ├─ tools/call (MFA required)                                                         │
│  │  → Token validation passes                                                         │
│  │  → MCP queries home-built authz server                                                   │
│  │  → Decision: MFA_REQUIRED with device list                                        │
│  │  → HTTP 200 response with { decision: 'MFA_REQUIRED', mfaMethods, deviceList }   │
│  │  → Agent UI shows MFA prompt                                                      │
│  │  → User selects FIDO2 or OTP                                                      │
│  │  → Agent calls /api/mfa/challenge                                                 │
│  │  → After MFA success, retry tools/call with MFA token                            │
│  │                                                                                     │
│  └─ tools/call (HITL required)                                                        │
│     → Token validation passes                                                         │
│     → MCP queries Authorize policy                                                   │
│     → Decision: HITL_REQUIRED (e.g., $500+ transfer)                                 │
│     → HTTP 200 response with { decision: 'HITL_REQUIRED', reason: '...' }            │
│     → Agent UI shows approval modal                                                  │
│     → User approves/denies                                                           │
│     → After approval, tool executes                                                  │
│                                                                                         │
│  Tools List Response Example (from MCP):                                              │
│  {                                                                                     │
│    "tools": [                                                                         │
│      { "name": "Show my accounts", "description": "...", "params": {...} },         │
│      { "name": "Show transactions", "description": "...", "params": {...} },        │
│      { "name": "Create a transfer", "description": "...", "params": {...} },        │
│      { "name": "Request a withdrawal", "description": "...", "params": {...} }      │
│    ]                                                                                   │
│  }                                                                                     │
│                                                                                         │
│  Tools Call Request (Agent → MCP):                                                    │
│  {                                                                                     │
│    "jsonrpc": "2.0",                                                                  │
│    "method": "tools/call",                                                            │
│    "params": {                                                                        │
│      "name": "Create a transfer",                                                     │
│      "arguments": { "toAccount": "...", "amount": 750 }                              │
│    },                                                                                  │
│    "Authorization": "Bearer <delegated-token-with-act-claim>"                        │
│  }                                                                                     │
│                                                                                         │
│  Tools Call Response with Phase 207 Decision (MCP → Agent):                          │
│  {                                                                                     │
│    "jsonrpc": "2.0",                                                                  │
│    "result": {                                                                        │
│      "decision": "HITL_REQUIRED",                                                     │
│      "reason": "Transaction amount $750 exceeds policy threshold $500",              │
│      "hitlReason": "High-value transfer requires human approval",                    │
│      "requiresApproval": true                                                        │
│    }                                                                                   │
│  }                                                                                     │
│                                                                                         │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

## Key Architectural Differences (Phase 206 → Phase 207)

### Phase 206 (Before)

```text
Agent → Token Exchange → MCP → tool execution
         (2 tokens)      (no policy check)
```

### Phase 207 (After)

```text
Agent → Token Exchange → MCP → home-built authz → MCP decision → BFF (mcpInstructions) → Agent action
         (2 tokens)      │      server eval        enum routing   (taskId routing)         (show UI)
                         └─ (TOKEN VALID) ──────────────────────────────────────────────────┘

tools/list: filtered client-side from token scopes (no authz call — PingOne Authorize compatible)
tools/call: one authz server call per request with { userId, toolName, scopes, acr, amount }
```

## RFC 8693 Token Exchange Architecture (Single Agent, MCP-Centric)

**Key Decision**: For a single-agent system, token exchange happens **at the MCP server**, not the BFF. This is because:
1. MCP owns the token lifecycle (it uses the token immediately for tool execution)
2. MCP has agent credentials available locally
3. Cleaner separation of concerns: BFF proxies, MCP authenticates

### Token Exchange Sequence:

```
1. Agent → BFF
   POST /api/mcp/tool
   Authorization: Bearer <user-token>
   (Agent has its own OAuth token from user login)

2. BFF (banking_api_server) — MINIMAL PROCESSING
   ├─ Validate: Authorization header present
   ├─ Validate: User session active
   └─ Forward to MCP: Pass Authorization header through
      (BFF does NOT do token exchange)

3. MCP Server (banking_mcp_server) — DOES THE EXCHANGE
   ├─ Receive Authorization header (contains user token)
   ├─ Load agent credentials from environment:
   │  ├─ AGENT_OAUTH_CLIENT_ID
   │  └─ AGENT_OAUTH_CLIENT_SECRET
   │
   ├─ Call PingOne token endpoint with RFC 8693 grant:
   │  POST https://auth.pingone.com/{envId}/as/token
   │  grant_type: urn:ietf:params:oauth:grant-type:token-exchange
   │  subject_token: <user-oauth-token>
   │  subject_token_type: urn:ietf:params:oauth:token-type:access_token
   │  actor_token: <agent-credentials-token>
   │  actor_token_type: urn:ietf:params:oauth:token-type:access_token
   │  resource: https://mcp-server.example.com
   │  scope: banking:accounts:read (narrowed based on tool)
   │
   └─ Receive delegated token from PingOne:
      {
        "access_token": "eyJhbGc...",
        "token_type": "Bearer",
        "expires_in": 3600,
        "scope": "banking:accounts:read",
        "act": { "sub": "<agent-client-id>" }  ← CRITICAL: act claim
      }

4. MCP continues with delegated token:
   ├─ Validate: RFC 8693 structural checks (done automatically on token use)
   ├─ Log: Exchange event for audit trail
   └─ Proceed: Token is ready for tool execution
```

### Why MCP Owns the Exchange?

| Phase | Action | Who? | Why? |
|-------|--------|------|------|
| **Existing (v206)** | BFF does 2-exchange, sends delegated to MCP | BFF | Multi-agent support |
| **Phase 207 (Actual)** | BFF continues 2-exchange via `agentMcpTokenService.js`; BFF also owns Authorize policy gate (`mcpToolAuthorizationService.js`) | BFF | Policy layer added on top of existing exchange; MCP validates |

> **Note (2026-04-20):** The "Phase 207 moves exchange to MCP" direction in earlier drafts was NOT implemented. BFF-centric exchange is the correct actual architecture and will remain so. The Authorize policy gate was built at BFF level, which is the right place given BFF owns the session context and token lifecycle.

---

## Decision Routing Flow (Phase 207 — As Implemented)

```
Agent sends: POST /api/mcp/tool
             Authorization: Bearer <user-token>
             Body: { toolName: '...', params: {...} }
             ↓
BFF — agentMcpTokenService.resolveMcpAccessTokenWithEvents()
├─ RFC 8693 exchange: user token → delegated token with act claim
├─ Validates may_act, scope count, audience
└─ Returns delegated token
             ↓
BFF — mcpToolAuthorizationService.runMcpFirstToolGate()
├─ Feature-flagged: ff_authorize_mcp_first_tool
├─ Once per session (cached on session)—skip on subsequent calls
├─ Calls pingOneAuthorizeService.evaluateMcpToolDelegation() [live mode]
   OR simulatedAuthorizeService [education mode]
└─ Returns: { ran, decision, stepUpRequired, decisionId, decisionContext }
             ↓
 Gate result routing:
├─ stepUpRequired: true  →  HTTP 200 { error: 'mcp_step_up_required',
│                                        decisionContext: 'McpFirstTool',
│                                        decisionId: '...' }
├─ decision: 'DENY'      →  HTTP 200 { error: 'mcp_authorization_denied',
│                                        decisionContext: 'McpFirstTool',
│                                        decisionId: '...' }
└─ decision: 'PERMIT'    →  forward to MCP WebSocket with delegated token
             ↓
MCP Server — validates delegated token (mcpTokenValidator.js)
├─ Checks: signature, expiration, audience, act claim presence
├─ FAILS → HTTP 401/403
└─ PASSES → tool executes; result returned
             ↓
Agent receives: inline response (no separate polling needed)
├─ error: 'mcp_step_up_required' → [GAP] agent decision handler: show MFA modal
├─ error: 'mcp_authorization_denied' → [GAP] agent decision handler: show error UI
└─ tool result → render to user

HITL (HITL_REQUIRED) → [GAP] not yet implemented
— Authorize can return HITL signals; no polling/webhook mechanism exists yet.
```

### Decision Vocabulary Mapping (planned vs actual)

| Earlier docs used | Actual implementation | Notes |
|---|---|---|
| `APPROVED` | `PERMIT` (PingOne Authorize) | Proceed to tool execution |
| `DENIED` | `DENY` → error `mcp_authorization_denied` | Inline in tool call response |
| `MFA_REQUIRED` | `stepUpRequired: true` → error `mcp_step_up_required` | Inline in tool call response |
| `HITL_REQUIRED` | ❌ Not yet implemented | Design gap — Wave 3 |

## Token Flows in Phase 207

### 1. Initial Tool List (read-only)
```
┌────────┐
│ Agent  │
└───┬────┘
    │ Authorization: Bearer <delegated-token-with-act>
    │ GET /tools/list
    ↓
┌────────────────────┐
│ MCP Server         │
├────────────────────┤
│ 1. Validate token  │
│ 2. Query Authorize │
│ 3. Return tools    │ → HTTP 200 + { tools: [...] }
└────────────────────┘
```

### 2. High-Value Transfer (with HITL)
```
┌────────┐
│ Agent  │
└───┬────┘
    │ Authorization: Bearer <delegated-token-with-act>
    │ POST /tools/call (transfer amount $750)
    ↓
┌────────────────────────────────┐
│ MCP Server                      │
├────────────────────────────────┤
│ 1. Validate token (user: bob)   │
│ 2. Query Authorize policy:      │
│    { userId: bob,               │
│      toolName: "transfer",      │
│      amount: 750 }              │
└──────────┬──────────────────────┘
           │ Authorize checks
           ├─ Scopes: banking:write ✓
           ├─ Limit: $750 > $500 ✗
           └─ HITL required: YES
           ↓
┌────────────────────────────────┐
│ Response to Agent               │
├────────────────────────────────┤
│ HTTP 200 {                      │
│   error: 'mcp_authorization_denied', │
│   decisionContext: 'McpFirstTool', │
│   decisionId: '...',            │
│   reason: 'amount_exceeds_limit' │
│ }                               │
└────────────────────────────────┘
           ↓
┌────────┐
│ Agent  │ [GAP] agentDecisionHandler shows error or HITL approval UI
└───┬────┘ User approves → retry (HITL flow not yet implemented)
    │
    ↓ (future: after HITL approval)
┌────────────────────────────────┐
│ MCP receives second call        │
├────────────────────────────────┤
│ 1. Validate token (w/ HITL ✓)   │
│ 2. Query Authorize policy       │
│ 3. Decision: PERMIT             │
│ 4. Execute transfer             │
└────────────────────────────────┘
```

### 3. Insufficient Scope (NEW in Phase 207)
```
┌────────┐
│ Agent  │ (token only has: banking:read)
└───┬────┘
    │ Authorization: Bearer <delegated-read-only-token>
    │ POST /tools/call (transfer)
    ↓
┌────────────────────────────────┐
│ MCP Server                      │
├────────────────────────────────┤
│ 1. Validate token ✓             │
│ 2. Query Authorize policy:      │
│    { userId: bob,               │
│      toolName: "transfer",      │
│      scopes_in_token: [         │
│        "banking:read"           │
│      ] }                        │
└──────────┬──────────────────────┘
           │ Authorize checks
           ├─ Scopes: banking:write ✗ (has only banking:read)
           └─ Scope violation!
           ↓
┌────────────────────────────────┐
│ Response to Agent               │
├────────────────────────────────┤
│ HTTP 200 {                      │ ← Note: HTTP 200, NOT 403
│   decision: "DENIED",           │    (policy layer, not token layer)
│   reason: "insufficient_scope", │
│   required_scope: [             │
│     "banking:write"             │
│   ]                             │
│ }                               │
└────────────────────────────────┘
           ↓
┌────────┐
│ Agent  │ Shows: "You need write permission for this action"
└────────┘ (User stays logged in, same session)
```

## Error Handling Matrix (Phase 207)

| Error Scenario | Token Status | HTTP Status | Response Body | Agent Action |
|---|---|---|---|---|
| No Bearer header | N/A | 401 | error: "unauthorized" | "Login required" |
| Token expired | Expired JWT | 401 | error: "token_expired" | "Session ended" |
| Wrong audience | Invalid aud | 401 | error: "audience_mismatch" | "Session ended" |
| Missing act claim | Invalid structure | 403 | error: "delegation_missing" | "Token error" |
| Rate limited | Valid | 429 | error: "rate_limit" | "Try later" |
| Insufficient scope | Valid | 200 | decision: "DENIED" | "Permission denied" |
| MFA needed by policy | Valid | 200 | decision: "MFA_REQUIRED" | "MFA prompt" |
| HITL approval required | Valid | 200 | decision: "HITL_REQUIRED" | "Approval modal" |

## mcpInstructions.js Route Contract

```text
POST /api/mcp/instructions

Purpose: BFF route. Receives policy decision from MCP server, looks up
         the waiting agent connection by taskId, and pushes the decision.

Request body (MCP → BFF):
{
  "taskId": "<uuid>",
  "decision": "DENIED" | "MFA_REQUIRED" | "HITL_REQUIRED" | "APPROVED",
  "reason"?: "insufficient_scope" | "policy_unavailable" | "mfa_timeout" | ...,
  "hitlType"?: "mfa" | "consent",
  "hitlReason"?: "Transaction amount $750 exceeds policy threshold $500",
  "mfaMethods"?: ["fido2", "otp"],
  "deviceList"?: [...],
  "requiresApproval"?: true
}

Response (BFF → MCP): HTTP 200 { "routed": true }

Side effect: BFF pushes decision payload to agent via SSE/WebSocket keyed by taskId.
```

## ⚠️ PingOne Authorize Compatibility

Phase 207 uses the home-built authz server. A future phase migrates to PingOne Authorize.
Build Phase 207 to these constraints so migration requires only a service swap:

| Pattern | Phase 207 (home-built) | PingOne Authorize (future) | Compatible? |
| ------- | ---------------------- | -------------------------- | ----------- |
| Per-request evaluation | One authz call per `tools/call` | Same | ✅ |
| tools/list filtering | Scope-based, client-side in MCP | Same | ✅ |
| Token claim inputs | `sub`, `scope`, `act`, `acr`, `amount` | Same standard claims | ✅ |
| Decision enum output | DENIED/MFA_REQUIRED/HITL_REQUIRED/APPROVED | Maps to permit/deny + attributes | ✅ |
| HITL proof | BFF session claim (`hitlApproved`) | BFF session claim | ✅ |
| MFA completion signal | `acr` claim on new token | Same | ✅ |
| Bulk tool list filtering | NOT USED | Cannot do | ✅ avoided |
| Authz-issued approval token | NOT USED | Cannot do | ✅ avoided |

## External Agent Platform Support (Option D: Agent-Facing Delegation Endpoint)

### Problem

Platforms like **N8N**, **AWS Bedrock**, and **Glean** cannot perform RFC 8693 token exchange themselves. They support:
- Static Bearer (pre-configured API key)
- OAuth2 Client Credentials (agent identity only — no user `sub`)
- Header pass-through

They **cannot** supply a `subject_token` and call a token exchange endpoint to get a delegated token with an `act` claim. This means a direct MCP integration from these platforms loses user identity and the full Authorize policy context.

**Verified 2026-04-20**: N8N MCP Client Tool docs confirm Bearer/OAuth2/Header auth are available but RFC 8693 is absent. The MCP spec itself explicitly forbids token pass-through at the MCP server (must not forward the received token to upstream APIs).

### Solution: Delegation Pre-Flight Endpoint

The BFF exposes a **delegation endpoint** that external agents call once per session (or per tool invocation) to receive a pre-exchanged delegated token with the `act` claim. The agent then supplies that token as a standard Bearer header to MCP — no RFC 8693 required on the agent side.

```
POST /api/agent/delegate
Authorization: Bearer <user-session-token-or-oauth-token>
X-Agent-Client-ID: n8n-workflow-abc123          (identifies the calling agent)
Content-Type: application/json

{ "scope": "banking:accounts:read banking:transactions:read" }

---
RESPONSE 200:
{
  "access_token": "eyJhbGc...",      ← delegated token with act claim
  "token_type": "Bearer",
  "expires_in": 3600,
  "scope": "banking:accounts:read banking:transactions:read",
  "act": { "sub": "<agent-client-id>" },
  "sub": "<user-sub>"                  ← preserved user identity
}
```

The agent then uses `access_token` as `Authorization: Bearer <access_token>` on every MCP request. MCP receives a fully valid RFC 8693 delegated token and processes it normally — policy evaluation, `act` claim checking, Authorize call — all unchanged.

### Option D Flow Diagram

```
┌──────────────────────────────────────────────────────────────────────┐
│ External Platform (N8N / Bedrock / Glean)                            │
└────────────────┬─────────────────────────────────────────────────────┘
                 │ Step 1 — request delegation token (once per session)
                 │ POST /api/agent/delegate
                 │ Authorization: Bearer <user-token>
                 ↓
┌────────────────────────────────────────────────────────────────────┐
│ BFF (banking_api_server)                                            │
│ route: banking_api_server/routes/agentDelegation.js (TO CREATE)    │
├────────────────────────────────────────────────────────────────────┤
│ 1. Validate incoming user token (must be valid PingOne token)       │
│ 2. Extract user sub + scopes from token claims                      │
│ 3. Call PingOne RFC 8693 exchange:                                  │
│    subject_token = user token                                       │
│    actor = BFF agent credentials                                    │
│    scope = requested (intersection with user scopes)               │
│ 4. Return delegated token + metadata                                │
└───────────────────────┬────────────────────────────────────────────┘
                        │ Step 2 — delegated token returned
                        │ { access_token, act: { sub: agent }, ... }
                        ↓
┌──────────────────────────────────────────────────────────────────────┐
│ External Platform                                                    │
│ Caches delegated token for session duration                         │
└────────────────┬─────────────────────────────────────────────────────┘
                 │ Step 3 — call MCP with delegated token
                 │ POST /mcp/tools/call
                 │ Authorization: Bearer <delegated-token-with-act>
                 ↓
┌────────────────────────────────────────────────────────────────────┐
│ MCP Server (banking_mcp_server)                                     │
│ — No change required —                                             │
├────────────────────────────────────────────────────────────────────┤
│ 1. Validate delegated token (mcpTokenValidator.js)                 │
│    ✓ act claim present { sub: agent-id }                           │
│    ✓ sub = user identity                                           │
│    ✓ scope matches tool requirements                               │
│ 2. Query Authorize policy with full context:                        │
│    { userId, toolName, scopes, acr, act.sub }                      │
│ 3. Return Phase 207 decision envelope                               │
└────────────────────────────────────────────────────────────────────┘
```

### Token Semantics Preserved

| Claim | N8N Client Credentials only | Option D delegation |
|-------|---------------------------|--------------------|
| `sub` | agent (not user) | user ✅ |
| `act.sub` | absent | agent ✅ |
| `scope` | agent's scopes only | user scopes intersected ✅ |
| `acr` | absent | user's acr (MFA level) ✅ |
| Authorize context | degraded | full ✅ |

### BFF Endpoint Spec: `POST /api/agent/delegate`

**File to create:** `banking_api_server/routes/agentDelegation.js`

**Request:**
```
POST /api/agent/delegate
Authorization: Bearer <user-token>       REQUIRED
X-Agent-Client-ID: <platform-identifier>  OPTIONAL (for audit)
Content-Type: application/json

Body (optional):
{ "scope": "banking:accounts:read" }     subset of user's scopes
```

**Response 200:**
```json
{
  "access_token": "eyJhbGc...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "scope": "banking:accounts:read",
  "act": { "sub": "<agent-client-id>" }
}
```

**Response 401:** User token invalid or expired
**Response 403:** Requested scopes not held by user
**Response 429:** Rate limit (prevent token farming)

**Security notes:**
- Endpoint is rate-limited per user sub
- Incoming user token must pass PingOne introspection (or JWT validation)
- Delegated token TTL = min(user token TTL, 3600s)
- Audit log: `sub`, `act.sub`, requested scopes, timestamp, `X-Agent-Client-ID`
- Does NOT require BFF session cookie — accepts raw Bearer token

### When to Use Which Path

| Agent Type | Integration Path | Why |
|-----------|-----------------|-----|
| Native BX Finance agent | MCP-centric exchange (existing) | MCP owns token lifecycle |
| N8N workflow | Option D delegation endpoint → MCP | N8N can't do RFC 8693 |
| AWS Bedrock agent | Option D delegation endpoint → MCP | No RFC 8693 in Bedrock |
| Glean connector | Option D delegation endpoint → MCP | API key only otherwise |
| Custom agent (any) | Either path | Delegation endpoint is simplest |

---

## PingGateway (Identity Gateway) Compatibility

> Added 2026-04-20. Answers: "Is our plan safe if we plug in PingGateway?"

### What PingGateway Does

PingGateway (formerly ForgeRock IG) is an API gateway that sits **in front of services**.
Its primary jobs in this context:

- Validate/introspect Bearer tokens before they reach any backend
- Enforce scope requirements at the HTTP layer
- Proxy WebSocket and HTTP traffic
- Route to the correct upstream service
- Optionally perform OAuth flows (PKCE, client credentials, token exchange)
- Rate limiting, header manipulation, audit logging at the edge

### Is The Current Architecture Safe to Insert PingGateway Into?

**Yes — with no design changes required.** The architecture is already component-separated
in exactly the pattern PingGateway is designed for.

### Component Map: Where PingGateway Inserts

```
┌──────────────────────────────────────────────────────────────────┐
│  Browser / External Agent                                         │
└────────────────────────────┬─────────────────────────────────────┘
                             │ HTTPS / WSS
                             ↓
┌──────────────────────────────────────────────────────────────────┐
│  PingGateway  (NEW — sits at the edge)                           │
│  ├─ Token validation (introspect or JWT verify)                  │
│  ├─ Scope enforcement (coarse gate — banking:read / banking:write)│
│  ├─ Rate limiting → 429                                          │
│  ├─ WebSocket proxy (MCP WebSocket passes through unchanged)     │
│  ├─ Route: /api/*  → BFF                                         │
│  └─ Route: /mcp/*  → MCP Server                                  │
└────────────┬───────────────────────────────┬─────────────────────┘
             │                               │
             ↓                               ↓
┌────────────────────┐          ┌────────────────────────┐
│  BFF               │          │  MCP Server             │
│  banking_api_server│          │  banking_mcp_server     │
│  ├─ Session mgmt   │          │  ├─ Token decode/filter  │
│  ├─ RFC 8693 exch  │          │  ├─ tools/list (scoped) │
│  ├─ Authz gate     │          │  ├─ tools/call + policy │
│  └─ mcpInstructions│          │  └─ Tool execution       │
└────────────────────┘          └────────────────────────┘
             │                               │
             └───────────────┬───────────────┘
                             ↓
             ┌─────────────────────────────────┐
             │  PingOne AS / Home-built Authz  │
             │  ├─ Token issuance (AS)          │
             │  ├─ RFC 8693 exchange (AS)       │
             │  └─ Policy evaluation (authz)    │
             └─────────────────────────────────┘
```

### Compatibility Analysis — Per Design Decision

| Design decision | Safe with PingGateway? | Notes |
| --- | --- | --- |
| Separate BFF + MCP components | ✅ Yes | PG routes each independently |
| Bearer token in Authorization header | ✅ Yes | PG reads/validates this natively |
| WebSocket transport for MCP | ✅ Yes | PG has a WebSocket filter; passes frames through |
| Flat scopes `banking:read` / `banking:write` | ✅ Yes | PG scope enforcement matches flat format |
| `decodeScopesFromToken` (unsigned decode) | ✅ Yes | PG validates signature at edge; MCP claim-inspection is safe |
| RFC 8693 `act` claim | ✅ Yes | PG can inspect/forward `act`; doesn't strip it |
| HTTP 429 for rate limiting | ✅ Yes | PG returns 429; our error formatter uses 429; aligned |
| HTTP 401/403 at token layer, 200 at policy layer | ✅ Yes | PG handles 401/403; policy 200 is app-layer, PG doesn't touch it |
| `mcpInstructions` route (BFF-internal) | ✅ Yes | PG can protect this route with a service account scope |
| PingOne Authorize per-request evaluation | ✅ Yes | PG can call PA as a filter OR bypass (authz stays app-layer) |
| Option D delegation endpoint `/api/agent/delegate` | ✅ Yes | PG validates incoming token, passes to BFF |
| `tools/list` scope-based client-side filtering | ✅ Yes | PG can additionally enforce scope at edge (defense in depth) |

### One Thing to Align: Token Validation Location

After PingGateway is inserted, token validation happens at **two layers**:

```
Layer 1 — PingGateway (edge):
  Validates signature, expiry, audience
  Rejects with 401 before request reaches BFF/MCP

Layer 2 — MCP Server (transport boundary):
  decodeScopesFromToken() — reads scope claim (no sig verify, already done)
  mcpTokenValidator.js — checks act claim, audience, expiry again

Both layers are correct. Layer 1 is the authoritative gate.
Layer 2 is defense-in-depth (in case PG is bypassed or misconfigured).
```

**No code changes needed.** The double-validation is intentional and safe.
Document in `REGRESSION_PLAN.md` when PG is added so it's clear PG is layer 1.

### One Risk: WebSocket + PingGateway Configuration

PingGateway's WebSocket filter must be explicitly configured. Default HTTP routes
do not automatically proxy WebSocket upgrades. When PingGateway is added:

- Configure the `/mcp` route with `WebSocketFilter` in the PG route JSON
- Ensure PG forwards the `Authorization` header on the upgrade handshake (not just HTTP requests)
- Test: MCP WebSocket connection through PG before declaring PG integration done

If the MCP server migrates to HTTP SSE transport (the newer MCP spec direction),
this concern goes away — SSE is plain HTTP, no upgrade needed.

### Recommended Insertion Order

When PingGateway integration is planned as a future phase:

1. **Phase A — BFF behind PG:** Route `/api/*` through PG. BFF gets token pre-validated.
   Zero MCP changes. Lowest risk.

2. **Phase B — MCP behind PG:** Route `/mcp/*` WebSocket through PG. Add WebSocket filter.
   MCP transport validation becomes defense-in-depth only.

3. **Phase C — PG calls PingOne Authorize:** Replace BFF's direct PA call with a PG
   AM/PA filter. BFF's authz service becomes an optional fallback.

Each phase is independently deployable. The current architecture supports all three
without requiring a redesign.

### Answer to the Diagram Question

Yes — the diagram's separate-component layout (App → BFF → MCP Server → Authorize Server
as distinct boxes) is **exactly the right architecture** for gateway insertion.
PingGateway inserts between the client and those components as a transparent proxy.
A monolithic or tightly coupled design would require restructuring; this one does not.

---

## Relationship to Other Phases

- **Phase 206** (prerequisite): Last-mile credential architecture & 2-exchange setup
- **Phase 100** (coexists): Explicit HITL consent ← Now orchestrated via Phase 207 policy
- **Phase 94** (referenced): HITL pattern ← Phase 207 formalizes via policy

---

**Architecture Diagram Version**: 5.0
**Status**: ✅ Complete specification with Option D delegation endpoint + PingGateway compatibility analysis
**Next Step**: Create 207-01/02/03-PLAN.md via `/gsd-plan-phase 207`
