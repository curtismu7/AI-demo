# API Calls and Token Exchange Scopes — Super Banking Demo

**Date:** 2026-04-07  
**Task ID:** 260407-nzk  
**Status:** Complete

---

## Executive Summary

Comprehensive mapping of all API endpoints, token exchanges, and their required OAuth scopes across the Super Banking banking demo. Includes authentication requirements, scope validation, and token exchange paths.

---

## Scope & Protocol Layer Clarification

**Important distinction:** This document covers the **OAuth/authentication layer** (RFC 6749, RFC 8693, RFC 8707), NOT the **MCP protocol layer**.

| Layer | What we document | What we don't document |
|-------|------------------|------------------------|
| **OAuth / Token Scopes** | ✅ `banking:read`, `banking:write`, scope validation, authorization | ❌ JWT signature validation, JWKS endpoints |
| **RFC 8693 Token Exchange** | ✅ `may_act` attribute (user token), `act` claim (MCP token), delegation chain | ❌ How exchange requests are serialized |
| **Token Contents** | ✅ What claims appear in tokens (`act`, `may_act`, `scope`, `aud`, `sub`) | ❌ Token encoding/decoding algorithms |
| **MCP Protocol** | ❌ **NOT covered** | ✓ JSON-RPC, `tools/list`, `tools/call`, lifecycle, error codes |
| **Bearer Token Usage** | ✅ Bearer tokens sent to MCP server via WebSocket `initialize` or HTTP `Authorization` header | ❌ How MCP validates bearer tokens internally (introspection) |

**Key point:** `may_act` and `act` are **OAuth RFC 8693 concepts**, not MCP protocol concepts. They appear on the **tokens flowing into** the MCP server, not in the MCP messages themselves. The MCP server validates these tokens via introspection (which returns the `act` claim for audit) but the MCP protocol itself just sees `Bearer <token>`.

When you see references to `act` or `may_act` below, remember:
- They come from **OAuth token exchange** (RFC 8693 §4.4)
- The **MCP server** validates them via **introspection** (RFC 7662)
- But **the MCP protocol spec itself** (2025-11-25) does not define these claims

---

## Authentication Routes

**Path:** `/auth/*`

### Login Flow (OAuth 2.0 + PKCE)

| Endpoint | Method | Auth | Scopes | Purpose |
|----------|--------|------|--------|---------|
| `/auth/login` | GET | None | profile, email, offline_access, (banking scopes) | Initiate OAuth login with PingOne |
| `/auth/callback` | GET | Authorization Code | Same as /login | Handle OAuth callback, exchange code for tokens |
| `/auth/refresh` | POST | Refresh Token | (inherited from refresh token) | Refresh expired access token |
| `/auth/logout` | GET | Session | None | End session, revoke tokens |

### Step-Up Authentication

| Endpoint | Method | Auth | Scopes | Purpose |
|----------|--------|------|--------|---------|
| `/auth/stepup` | GET | Session + Token | (elevated) | Trigger step-up flow (CIBA/OTP) |
| `/auth/consent` | POST | Session | None | User consent for data access |
| `/auth/consent-url` | GET | Session | None | Get URL for PingOne consent flow |

### OTP/MFA

| Endpoint | Method | Auth | Scopes | Purpose |
|----------|--------|------|--------|---------|
| `/auth/initiate-otp` | POST | Session | None | Start OTP verification |
| `/auth/verify-otp` | POST | Session | None | Complete OTP verification |

---

## Token Exchange Routes (RFC 8693)

**Path:** `/tokens/*`

### Token Exchange for MCP Server

| Endpoint | Method | Auth Required | Input Token | Output Token | Audience | Scopes Used |
|----------|--------|---------------|-------------|--------------|----------|-------------|
| `/tokens/chain` | GET | Access Token | User Access Token | Session Preview | N/A | Reads scopes from session |
| `/tokens/session-preview` | GET | Session | User Access Token | (preview only) | N/A | Display only |
| `/tokens/:tokenId` | GET | Access Token | User Token or MCP Token | Decoded JWT | N/A | Display only |
| `/tokens/validate` | POST | Access Token | Arbitrary JWT | Validation result | N/A | Inspect token |

### Token Exchange Service (Backend)

**Service:** `agentMcpTokenService.js`

| Exchange Type | Subject Token | Actor Token | Output Scopes | Process | Requirements |
|---------------|---------------|-------------|----------------|---------|--------------|
| **1-Exchange (Legacy)** | User Access Token | (none) | `banking:read`, `banking:write` | Direct exchange: User Token → MCP Token | User has banking scopes on their token |
| **2-Exchange (Delegation)** | User Access Token (with `may_act`) | Agent Token | `banking:read`, `banking:write` + `act` claim | Chained exchange: User + Agent → MCP Token with `act` claim | User has `banking:agent:invoke` + `may_act` attribute; Agent has `banking:agent:invoke` |

**Scope & Claim Requirements (RFC 8693 §4.4 - Delegation Chains):**
- **User token MUST have:** `banking:read`, `banking:write`, or `banking:agent:invoke` scope + `may_act` claim if 2-exchange
- **may_act claim structure:** `{ client_id: "bff-admin-client-id" }` (identifies which BFF client is authorized to act)
- **Agent token (2-exchange only):** requires `banking:agent:invoke` scope
- **Output token (MCP & all downstream):** receives narrowed scopes + `act` claim showing delegation chain
  - **1-exchange:** `act: { sub: "agent-client-id" }` — caller identified by sub (BFF acting on behalf of user)
  - **2-exchange:** `act: { sub: "mcp-client-id", act: { sub: "agent-client-id" } }` — nested delegation chain per RFC 8693 §4.4 (MCP client acting, delegated by agent, delegated by user)
  - **Key:** `sub` field identifies the actor; nested `act` preserves the delegation chain for audit trail
  - All subsequent API calls use token with `act` claim (not `may_act`) for audit trail

---

## Banking API Routes

**Path:** `/api/banking/*`

### Accounts

| Endpoint | Method | Auth | Scopes | Description |
|----------|--------|------|--------|-------------|
| `/api/banking/accounts` | GET | MCP Token | `banking:read`, `banking:accounts:read` | Fetch all accounts |
| `/api/banking/accounts/:id` | GET | MCP Token | `banking:read`, `banking:accounts:read` | Fetch account details |
| `/api/banking/accounts/:id/details` | GET | MCP Token | `banking:read`, `banking:accounts:read` | Extended account details |

### Balances

| Endpoint | Method | Auth | Scopes | Description |
|----------|--------|------|--------|-------------|
| `/api/banking/balances/:accountId` | GET | MCP Token | `banking:read` | Get account balance |

### Transactions

| Endpoint | Method | Auth | Scopes | Description |
|----------|--------|------|--------|-------------|
| `/api/banking/transactions/:accountId` | GET | MCP Token | `banking:read`, `banking:transactions:read` | List transactions for account |
| `/api/banking/transactions/:id` | GET | MCP Token | `banking:read`, `banking:transactions:read` | Get transaction details |

### Write Operations (Deposit/Withdrawal/Transfer)

| Endpoint | Method | Auth | Scopes | Special Requirements | Description |
|----------|--------|------|--------|----------------------|-------------|
| `/api/banking/deposit` | POST | MCP Token + Step-Up | `banking:write` | HITL for amounts > $500 | Deposit to account |
| `/api/banking/withdraw` | POST | MCP Token + Step-Up | `banking:write` | HITL for amounts > $500 | Withdraw from account |
| `/api/banking/transfer` | POST | MCP Token + Step-Up | `banking:write` | HITL for amounts > $500 | Transfer between accounts |

**HITL (Human-in-the-Loop) Flow:**
- Endpoint returns `step_up_required` if amount > $500
- Frontend initiates OTP or CIBA challenge
- User approves or denies via SMS/push notification
- Backend re-executes operation with step-up token

### Sensitive Data Access

| Endpoint | Method | Auth | Scopes | Special Requirements | Description |
|----------|--------|------|--------|----------------------|-------------|
| `/api/banking/sensitive/:accountId/ssn` | GET | MCP Token | `banking:read:sensitive` | May trigger step-up | Get SSN (sensitive) |
| `/api/banking/sensitive/:accountId/routing` | GET | MCP Token | `banking:read` | May trigger step-up | Get routing number (sensitive) |

**Scope: `banking:read:sensitive`**
- Only granted to admin users
- Required for accessing PII (SSN, full account numbers, etc.)

---

## Admin Routes

**Path:** `/api/admin/*`

### Configuration Management

| Endpoint | Method | Auth | Scopes/Access Level | Description |
|----------|--------|------|---|-------------|
| `/api/admin/config` | GET | Admin | `p1:read:user`, `admin:read` | Read current app config |
| `/api/admin/config` | POST | Admin | `admin:write` | Update config (env vars, PingOne settings) |
| `/api/admin/config/test` | POST | Admin | `admin:write` | Test config validity |
| `/api/admin/config/reset` | POST | Admin | `admin:delete` | Reset to defaults |
| `/api/admin/config/worker-test` | GET | Admin | `p1:read:user` | Test management API worker token |
| `/api/admin/config/generate-keypair` | POST | Admin | `admin:write` | Generate JWT signing keypair |

### User Management

| Endpoint | Method | Auth | Scopes/Access Level | Description |
|----------|--------|------|---|------|
| `/api/admin/users` | GET | Admin | `p1:read:user` | List all PingOne users |
| `/api/admin/users/:id` | GET | Admin | `p1:read:user` | Get user details |
| `/api/admin/users/:id` | PUT | Admin | `p1:update:user` | Update user attributes |
| `/api/admin/users/:id` | DELETE | Admin | `p1:delete:user` | Delete user |
| `/api/admin/users/:id/mfa-devices` | GET | Admin | `p1:read:user` | List MFA devices |
| `/api/admin/users/:id/mfa-devices` | POST | Admin | `p1:update:user` | Add MFA device |

### Demo Data Management

| Endpoint | Method | Auth | Scopes | Description |
|----------|--------|------|--------|-------------|
| `/api/admin/demo-data` | GET | Admin | None | Get seed accounts |
| `/api/admin/demo-data` | POST | Admin | None | Reset to seed accounts |

---

## OAuth/OIDC Routes

**Path:** `/oauth/*`

### Authorization Endpoint

| Endpoint | Method | Auth | Params | Scopes | Purpose |
|----------|--------|------|--------|--------|---------|
| `/oauth/authorize` | GET/POST | None (PingOne) | client_id, redirect_uri, scope, state, code_challenge, nonce | Requested in params | OAuth authorization request |

### Token Endpoint

| Endpoint | Method | Auth | Grant Type | Input | Output | Scopes |
|----------|--------|------|------------|-------|--------|--------|
| `/oauth/token` | POST | Client Auth (Basic/POST/JWT) | authorization_code | Code + verifier | Access, ID, Refresh tokens | Granted by PingOne |
| `/oauth/token` | POST | Client Auth | refresh_token | Refresh token | New Access + ID + Refresh | Inherited from original grant |
| `/oauth/token` | POST | Client Auth | urn:ietf:params:oauth:grant-type:token-exchange (RFC 8693) | Subject + Actor tokens | MCP Access token | Banking scopes (narrowed) |

### CIBA Backchannel Authentication (OAuth CIBA)

| Endpoint | Method | Auth | Purpose | Scopes |
|----------|--------|------|---------|--------|
| `/ciba/initiate` | POST | Access Token + Session | Request step-up via push notification (mobile app) | `banking:*` |
| `/ciba/poll/:authReqId` | GET | Access Token + Session | Check if user approved on mobile | `banking:*` |
| `/ciba/cancel/:authReqId` | POST | Access Token + Session | User cancels step-up | `banking:*` |
| `/ciba/notify` | POST | Webhook (PingOne) | PingOne notifies when approval received | (internal webhook) |

---

## MCP Server Routes

**Path:** `/mcp/*`

### Tool Invocation

| Endpoint | Method | Auth Required | Token Type | Scopes Required | Purpose |
|----------|--------|---|---|---|---------|
| `/mcp/tools/call` | POST | Yes | MCP Access Token | `banking:agent:invoke` + narrowed banking scopes | Agent calls banking tool (list/read/write) |
| `/mcp/tools/list` | GET | Yes | MCP Access Token | `banking:agent:invoke` | List available MCP tools |

**Token Exchange Happens At:**
- Before `/mcp/tools/call` if user token is provided
- Service exchanges user token → MCP token using RFC 8693
- MCP server validates MCP token via introspection

### MCP Error Codes

| Status | Scope Issue | Description |
|--------|---|---|
| 401 | Missing auth header | No access token provided |
| 403 | `banking:agent:invoke` missing | User/MCP token lacks agent invocation scope |
| 403 | Banking scope missing | MCP token lacks `banking:read`/`banking:write` for tool |
| 429 | (rate limit) | Too many requests |

---

## Protected Resource Metadata (RFC 9728)

**Endpoint:** `/.well-known/oauth-protected-resource`

| Method | Auth | Returns | Scopes Advertised |
|--------|------|---------|------------------|
| GET | None | RFC 9728 metadata | All available scopes defined on resource servers |

Includes:
- Available scopes: `profile`, `email`, `banking:read`, `banking:write`, `banking:agent:invoke`, `banking:read:sensitive`, `p1:read:user`, `p1:update:user`, `admin:read`, `admin:write`, `admin:delete`
- Resource server URIs
- Documentation links

---

## Scope Summary Table

| Scope | Resource Server | Access Level | Used In | Purpose |
|-------|---|---|---|---|
| `profile` | Main Resource Server | User | Login, ID token | User profile attributes |
| `email` | Main Resource Server | User | Login, ID token | Email address |
| `offline_access` | Main Resource Server | User | Login, Refresh flow | Refresh token issuance |
| `banking:read` | Main Resource Server | User/MCP | Token exchange, /api/banking/* | Read-only banking access |
| `banking:write` | Main Resource Server | User/MCP | Token exchange, write operations | Write banking access (deposit/transfer) |
| `banking:accounts:read` | Main Resource Server | User/MCP | Token exchange, accounts endpoint | Read account details |
| `banking:transactions:read` | Main Resource Server | User/MCP | Token exchange, transactions endpoint | Read transaction history |
| `banking:agent:invoke` | Main Resource Server | User & Agent | Token exchange (2-exchange path) | Permission for user to delegate; required on agent token |
| `banking:read:sensitive` | Main Resource Server | Admin/User | Sensitive data endpoints | Access PII (SSN, account numbers) |
| `agent:invoke` | MCP Resource Server | MCP Token | /mcp/tools/call | (alias for banking:agent:invoke) |
| `p1:read:user` | PingOne Management API | Admin | User management routes | Read PingOne user data |
| `p1:update:user` | PingOne Management API | Admin | User management routes | Update PingOne users |
| `p1:delete:user` | PingOne Management API | Admin | User management routes | Delete PingOne users |
| `admin:read` | Main Resource Server | Admin | Admin routes | Read admin configuration |
| `admin:write` | Main Resource Server | Admin | Admin routes | Write admin configuration |
| `admin:delete` | Main Resource Server | Admin | Admin routes | Delete admin configuration |

**Delegation Claims (RFC 8693 §4.4 - Nested act for Delegation Chains):**
| Claim | Token | Structure | Purpose | Examples |
|-------|-------|-----------|---------|----------|
| `may_act` | User Token (before exchange) | `{ client_id: "..." }` | User authorization: permission for this client to act on user's behalf | `may_act: { client_id: "bff-admin-client-id" }` |
| `act` (1-exchange) | MCP Token (after exchange) | `{ sub: "..." }` | Proof: Actor (identified by sub) is acting on behalf of user. Audit trail. | `act: { sub: "agent-client-id" }` |
| `act` (2-exchange) | MCP Token (after exchange) | Nested: `{ sub: "...", act: { sub: "..." } }` | Proof: Full delegation chain (MCP client acting, who is delegated by agent, who is delegated by user). Per RFC 8693 §4.4. | `act: { sub: "mcp-client-id", act: { sub: "agent-client-id" } }`

---

## Actual Scopes in Code — PingOne App Mapping

**Source:** `banking_api_server/config/scopes.js`

This table maps the actual OAuth scope constants defined in the code to which PingOne applications require them and how they're validated.

### Scope Constants & App Requirements

| Scope Constant | Actual Scope Value | Resource Server | Required In PingOne Apps | User Type(s) | Validation Method | Required For |
|---|---|---|---|---|---|---|
| `ACCOUNTS_READ` | `banking:accounts:read` | Main Banking | Admin App, User App, MCP Exchanger | customer, admin, ai_agent | `requireScopes()` middleware | GET /api/accounts, GET /api/accounts/:id |
| `TRANSACTIONS_READ` | `banking:transactions:read` | Main Banking | Admin App, User App, MCP Exchanger | customer, admin, ai_agent | `requireScopes()` middleware | GET /api/transactions, GET /api/transactions/:id |
| `BANKING_READ` | `banking:general:read` | Main Banking | Admin App, User App, MCP Exchanger | customer, admin, ai_agent | `requireScopes()` middleware | Any banking read operation (fallback) |
| `TRANSACTIONS_WRITE` | `banking:transactions:write` | Main Banking | Admin App, MCP Exchanger | admin, ai_agent | `requireScopes()` middleware | POST /api/transactions, POST /api/transactions/transfer |
| `BANKING_WRITE` | `banking:general:write` | Main Banking | Admin App, MCP Exchanger | admin, ai_agent | `requireScopes()` middleware | Any banking write operation (fallback) |
| `ADMIN` | `banking:admin:full` | Main Banking | Admin App ONLY | admin | `requireScopes()` middleware | GET/POST/PUT /api/admin/* |
| `AI_AGENT` | `banking:ai:agent:read` | Main Banking | AI Agent App (if configured) | ai_agent | `requireScopes()` middleware | Agent tool invocation |
| `AI_AGENT_WRITE` | `banking:ai:agent:write` | Main Banking | AI Agent App (if configured) | ai_agent | `requireScopes()` middleware | Agent write operations |
| `AI_AGENT_ADMIN` | `banking:ai:agent:admin` | Main Banking | AI Agent App (if configured) | ai_agent | `requireScopes()` middleware | Agent admin operations |
| `SENSITIVE_READ` | `banking:sensitive:read` | Main Banking | Admin App + custom routes | admin | `requireScopes()` middleware | PII endpoints (SSN, routing numbers) |
| `SENSITIVE_WRITE` | `banking:sensitive:write` | Main Banking | Admin App + custom routes | admin | `requireScopes()` middleware | PII write operations |
| `ADMIN_READ` | `banking:admin:read` | Main Banking | Admin App | admin | `requireScopes()` middleware | Admin read-only operations |
| `ADMIN_WRITE` | `banking:admin:write` | Main Banking | Admin App | admin | `requireScopes()` middleware | Admin write operations |
| `ADMIN_FULL` | `banking:admin:full` | Main Banking | Admin App ONLY | admin | `requireScopes()` middleware | Full admin access |
| (None) | `p1:read:user` | PingOne API | Admin App, MCP Exchanger | admin | Manual validation | User management endpoints |
| (None) | `p1:update:user` | PingOne API | Admin App, MCP Exchanger | admin | Manual validation | User attribute updates (mayAct) |
| (None) | `p1:delete:user` | PingOne API | Admin App (if enabled) | admin | Manual validation | User deletion |

---

## PingOne App → Scope Mapping

This table shows what each PingOne application requires in configuration to grant the necessary scopes to users and agents.

| PingOne App | App Type | OAuth Grant Type | Scopes to Grant on Authorization | Resource Servers Needed | Token Audience |
|---|---|---|---|---|---|
| **Super Banking Admin** | WEB_APP | authorization_code + PKCE | `openid profile email offline_access banking:admin:full banking:accounts:read banking:transactions:read banking:transactions:write p1:read:user p1:update:user` | Main Banking + PingOne API | User audience (not specified in demo) |
| **Super Banking User (Customer)** | WEB_APP | authorization_code + PKCE | `profile email offline_access banking:general:read banking:accounts:read banking:transactions:read banking:transactions:write banking:agent:invoke` | Main Banking | User audience (if RFC 8707 Resource Indicator used) |
| **Super Banking AI Agent (2-Exchange Only)** | WORKER | client_credentials | `banking:agent:invoke` | Main Banking | Agent audience |
| **Super Banking MCP Token Exchanger** | WORKER | client_credentials (+ token-exchange for 2-exchange) | `banking:accounts:read banking:transactions:read banking:general:read banking:admin:read admin:read users:read p1:read:user p1:update:user` | Main Banking + PingOne API + MCP Resource Server | MCP Resource Server audience |

---

## Scope Validation Flow in Code

**File:** `banking_api_server/middleware/auth.js`

The `requireScopes()` middleware validates token scopes against route requirements:

```javascript
// Example from accounts.js:
router.get('/', authenticateToken, requireScopes(['banking:accounts:read', 'banking:read']), async (req, res) => {
  // Route requires EITHER banking:accounts:read OR banking:read
  // Middleware checks token.scope contains at least one of these
  ...
});
```

**Validation Logic:**
1. Extract scopes from token: `token.scope.split(' ')` (space-separated)
2. Compare against required scopes: `requiredScopes.some(scope => tokenScopes.includes(scope))`
3. If any required scope matches → ✅ Allow
4. If NO required scope matches → ❌ 403 Forbidden

**Current Scope Validation Levels:**
- **Development:** Relaxed validation, debug logging enabled
- **Staging/Production:** Strict validation, caching enabled (300-600s TTL)

---

## User Type → Scope Mapping (Code Definition)

**File:** `banking_api_server/config/scopes.js`

The `USER_TYPE_SCOPES` constant maps user types to their allowed scopes:

| User Type | Assigned Scopes | Typical Access | Determined By |
|---|---|---|---|
| **admin** | `banking:admin:full` + `banking:general:read` + `banking:general:write` + `banking:accounts:read` + `banking:transactions:read` + `banking:transactions:write` | Full access to all banking operations except agent:invoke | Token contains `banking:admin:full` OR user role = 'admin' |
| **customer** | `banking:general:read` + `banking:general:write` + `banking:accounts:read` + `banking:transactions:read` + `banking:transactions:write` | Read/write banking, no admin, no agent invoke (unless delegating) | Default for end-users; token lacks admin scope |
| **readonly** | `banking:general:read` + `banking:accounts:read` + `banking:transactions:read` | Read-only access (audit, reporting) | Token has read scopes but no write scopes |
| **ai_agent** | `banking:ai:agent:read` + `banking:ai:agent:write` + `banking:general:read` + `banking:general:write` + `banking:accounts:read` + `banking:transactions:read` + `banking:transactions:write` | Full banking + agent operations | Token contains `banking:ai:agent:read` OR `ai_agent` scope (user type in token) |

---

## Endpoint Scope Requirements (Full Map)

**File:** `banking_api_server/config/scopes.js` - `ROUTE_SCOPE_MAP`

| HTTP Method | Route Pattern | Valid Alternative Scopes | User Type | Example Authorization |
|---|---|---|---|---|
| **GET** | `/api/accounts*` | [`banking:accounts:read`, `banking:general:read`] | customer, admin | `banking:accounts:read` OR `banking:general:read` |
| **POST** | `/api/accounts` | [`banking:general:write`] | admin | `banking:general:write` |
| **PUT** | `/api/accounts/:id` | [`banking:general:write`] | admin | `banking:general:write` |
| **DELETE** | `/api/accounts/:id` | [`banking:general:write`] | admin | `banking:general:write` |
| **GET** | `/api/transactions*` | [`banking:transactions:read`, `banking:general:read`] | customer, admin, ai_agent | `banking:transactions:read` OR `banking:general:read` |
| **POST** | `/api/transactions*` (all write ops) | [`banking:transactions:write`, `banking:general:write`] | admin, ai_agent | `banking:transactions:write` OR `banking:general:write` |
| **GET** | `/api/admin*` | [`banking:admin:full`] | admin | MUST have `banking:admin:full` |
| **POST/PUT/DELETE** | `/api/admin*` | [`banking:admin:full`] | admin | MUST have `banking:admin:full` |
| **POST** | `/mcp/tools/call` | [`banking:agent:invoke`] + banking read/write | ai_agent, user (via delegation) | `banking:agent:invoke` + `banking:general:read` or `banking:general:write` |

---

## Token Exchange Flow Diagrams

### 1-Exchange Path (User → MCP)

```
User Login
    ↓
[OAuth Code → User Access Token] (scopes: profile, email, banking:read, banking:write)
    ↓
User clicks "Run Agent"
    ↓
[Agent Tool Call] → BFF receives User Access Token from session
    ↓
[RFC 8693 Token Exchange]
  Input:  subject_token = User Access Token (has may_act: { client_id: "bff-admin-client-id" })
          audience = https://mcp-server.pingdemo.com
  Output: MCP Access Token (scopes: banking:read, banking:write)
    ↓
[MCP Token includes:]
  - Scopes: banking:read, banking:write (narrowed)
  - Claims: act = { client_id: "bff-admin-client-id" } (per RFC 8693 §4.1)
    ↓
[MCP Server GET /banking/accounts] ← MCP Token (narrow scopes verified)
    ↓
Response to Agent
```

### 2-Exchange Path (User + Agent → MCP with Act Claim)

```
User Login
    ↓
[OAuth Code → User Access Token]
  Scopes: profile, email, banking:agent:invoke
  Claims: may_act = true (PingOne user attribute: user authorized to delegate to agents)
    ↓
[Agent obtains own token via Client Credentials]
  Scopes: banking:agent:invoke
    ↓
User clicks "Run Agent"
    ↓
[Agent Tool Call] → BFF receives both: User Access Token (with may_act) + Agent Token
    ↓
[RFC 8693 Token Exchange (Delegation)]
  Input:  subject_token = User Access Token (has may_act: { client_id: "bff-admin-client-id" })
          actor_token = Agent Token
          audience = https://mcp-server.pingdemo.com
  Output: MCP Access Token
    ↓
[MCP Token includes:]
  - Scopes: banking:read, banking:write (narrowed)
  - Claims: act = { sub: <agent-sub>, client_id: <agent-client-id> } (per RFC 8693 §4.1)
    ↓
[MCP Server GET /banking/accounts]
  ← MCP Token with act claim (shows agent acting on behalf of user)
  ← Delegation audited: "Agent X acting for User Y"
    ↓
[All downstream calls]
  ← Use token with act claim (not may_act)
  ← MCP → Banking API → Audit logs show delegation chain
    ↓
Response to Agent
```

---

## Step-Up (HITL) Scope Override

When transaction amt > $500:

```
Initial Tool Call
    ↓
[Check amount]
    ↓
IF amount > $500:
  [Initiate OTP/CIBA] → User approves on device
    ↓
  [Obtain Step-Up Token] (enhanced scopes, time-limited)
    ↓
  [Re-execute Tool Call with Step-Up Token]
    ↓
  [Permitted to write] → banking:write scope honored
ELSE:
  [Execute directly]
```

---

## Real Application IDs & API Examples

**Configuration Sources:** `banking_api_server/env.example`, `.env.example`

### Banking Demo Application IDs

| Application | Type | Client ID | Audience/Resource URI | Scopes Granted |
|---|---|---|---|---|
| **Super Banking Admin App** | OAuth Web App | `PINGONE_AI_CORE_CLIENT_ID` | User audience (not specified) | `openid profile email banking:admin:full banking:accounts:read banking:transactions:read banking:transactions:write p1:read:user p1:update:user` |
| **Super Banking User App** | OAuth Web App | `PINGONE_AI_CORE_USER_CLIENT_ID` | `banking_jk_enduser` (RFC 8707 resource) | `profile email banking:general:read banking:accounts:read banking:transactions:read banking:transactions:write banking:agent:invoke` |
| **Super Banking AI Agent** | OAuth Worker (2-exchange) | `PINGONE_AI_AGENT_CLIENT_ID` | `banking_mcp_01_JK` (agent audience) | `banking:agent:invoke` |
| **Super Banking MCP Exchanger** | OAuth Worker (1-exchange) | `PINGONE_CORE_CLIENT_ID` | `https://mcp-server.pingdemo.com` | `banking:accounts:read banking:transactions:read banking:general:read admin:read users:read p1:read:user p1:update:user` |

### Resource Server Audiences

| Resource Server | Audience URI | Scopes Defined | Used For |
|---|---|---|---|
| **Main Banking** | `https://resource.pingdemo.com` | banking:read, banking:write, banking:accounts:read, banking:transactions:read, banking:admin:full, banking:sensitive:read | User & MCP banking operations |
| **MCP Server** | `https://mcp-server.pingdemo.com` | admin:read, admin:write, users:read, users:manage, banking:read, banking:write | MCP tool invocation (1-exchange) |
| **AI Agent Gateway** | `banking_mcp_01_JK` | banking:agent:invoke | AI Agent token (2-exchange) |
| **PingOne Management API** | `https://api.pingone.com` | p1:read:user, p1:update:user, p1:delete:user | PingOne user management |

---

### Actual API Call Examples

#### 1. User Login (Authorization Code + PKCE)

**Request:**
```
GET https://auth.pingone.{region}/auth.pingone.{region}/as/authorize?
  client_id=PINGONE_AI_CORE_USER_CLIENT_ID
  &redirect_uri=http%3A%2F%2Flocalhost%3A3001%2Fapi%2Fauth%2Foauth%2Fuser%2Fcallback
  &response_type=code
  &scope=profile%20email%20offline_access%20banking%3Ageneral%3Aread%20banking%3Aagent%3Ainvoke
  &resource=https%3A%2F%2Fresource.pingdemo.com
  &response_mode=form_post
  &state={random_state_value}
  &nonce={random_nonce_value}
  &code_challenge={base64url(sha256(code_verifier))}
  &code_challenge_method=S256
```

**Response (from PingOne after user authenticates):**
```
POST /api/auth/oauth/user/callback

code=eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9...
state={same_state_value}
```

**Backend Exchange (banking_api_server/routes/oauth.js):**
```bash
# 1. Exchange code for tokens
curl -X POST https://auth.pingone.{region}/{env-id}/as/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -H "Authorization: Basic $(echo -n 'PINGONE_AI_CORE_USER_CLIENT_ID:PINGONE_AI_CORE_USER_CLIENT_SECRET' | base64)" \
  -d "grant_type=authorization_code" \
  -d "code=<code_from_callback>" \
  -d "redirect_uri=http://localhost:3001/api/auth/oauth/user/callback" \
  -d "code_verifier=<original_code_verifier>"

# Response includes:
# {
#   "access_token": "eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9...",  // User token with scopes + may_act
#   "id_token": "eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9...",
#   "refresh_token": "eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9...",
#   "scope": "profile email offline_access banking:general:read banking:accounts:read banking:transactions:read banking:transactions:write banking:agent:invoke",
#   "expires_in": 3600
# }
```

#### 2. Banking API Call (User Token with Scopes)

**Frontend → Backend:**
```javascript
// banking_api_ui sends user token in Authorization header
fetch('http://localhost:3001/api/banking/accounts', {
  method: 'GET',
  headers: {
    'Authorization': 'Bearer eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9...',  // User access token
    'Content-Type': 'application/json'
  }
})
```

**Backend Validation (banking_api_server/routes/accounts.js):**
```javascript
router.get('/', authenticateToken, requireScopes(['banking:accounts:read', 'banking:general:read']), async (req, res) => {
  // Middleware checks:
  // 1. Token signature valid? ✅
  // 2. Token scopes include banking:accounts:read OR banking:general:read? ✅
  // 3. Token not expired? ✅
  // → Proceed with response
  res.json({ accounts: [...] });
});
```

**Backend curl (for testing):**
```bash
curl -X GET http://localhost:3001/api/banking/accounts \
  -H "Authorization: Bearer eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9..." \
  -H "Accept: application/json"

# Scope validation:
# Token must have ONE of: ['banking:accounts:read', 'banking:general:read']
# Extracted from token.scope = "profile email ... banking:general:read ..."
# Found: banking:general:read ✅ → 200 OK
```

#### 3. RFC 8693 Token Exchange (1-Exchange: User → MCP)

**Frontend → Backend (before MCP tool call):**
```javascript
// User clicks "Run Agent" → BFF exchanges user token for MCP token
POST /api/tokens/exchange { userToken: "eyJ0eXA..." }
```

**Backend Calls PingOne (banking_api_server/services/agentMcpTokenService.js):**
```bash
# 1. Admin app gets client credentials token (for permission to exchange)
curl -X POST https://auth.pingone.{region}/{env-id}/as/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -H "Authorization: Basic $(echo -n 'PINGONE_CORE_CLIENT_ID:PINGONE_CORE_CLIENT_SECRET' | base64)" \
  -d "grant_type=client_credentials" \
  -d "scope=banking:accounts:read banking:transactions:read banking:general:read p1:read:user"

# Response: CC token with aud=https://resource.pingdemo.com


# 2. Exchange user token for MCP-scoped token (RFC 8693)
curl -X POST https://auth.pingone.{region}/{env-id}/as/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -H "Authorization: Basic $(echo -n 'PINGONE_CORE_CLIENT_ID:PINGONE_CORE_CLIENT_SECRET' | base64)" \
  -d "grant_type=urn:ietf:params:oauth:grant-type:token-exchange" \
  -d "subject_token=eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9..." \
  -d "subject_token_type=urn:ietf:params:oauth:token-type:access_token" \
  -d "requested_token_type=urn:ietf:params:oauth:token-type:access_token" \
  -d "audience=https://mcp-server.pingdemo.com" \
  -d "scope=banking:general:read banking:accounts:read" \
  -d "client_id=PINGONE_CORE_CLIENT_ID" \
  -d "client_secret=PINGONE_CORE_CLIENT_SECRET"

# Response (MCP Token with narrowed scopes + act claim):
# {
#   "access_token": "eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9...",  // MCP token
#   "token_type": "Bearer",
#   "scope": "banking:general:read banking:accounts:read",       // Narrowed!
#   "expires_in": 1800
# }
# 
# Decoded Payload:
# {
#   "sub": "user-guid-12345",
#   "aud": "https://mcp-server.pingdemo.com",
#   "iss": "https://auth.pingone.com/env-id",
#   "scope": "banking:general:read banking:accounts:read",
#   "act": { "sub": "PINGONE_CORE_CLIENT_ID" },  // BFF is acting on behalf of user (RFC 8693)
#   "exp": 1712595600,
#   "iat": 1712594000
# }
```

#### 4. MCP Tool Call (with Exchanged Token)

**Backend → MCP Server (banking_api_server/services/agentMcpTokenService.js):**
```bash
# Send MCP token to MCP server
# MCP server validates token via introspection: /oauth/introspect

# 1. MCP server calls PingOne introspection to validate token
curl -X POST https://auth.pingone.{region}/{env-id}/as/introspect \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -H "Authorization: Basic $(echo -n 'MCP_CLIENT_ID:MCP_CLIENT_SECRET' | base64)" \
  -d "token=eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9..." \
  -d "token_type_hint=access_token"

# Response (introspection):
# {
#   "active": true,
#   "scope": "banking:general:read banking:accounts:read",
#   "aud": "https://mcp-server.pingdemo.com",
#   "sub": "user-guid-12345",
#   "act": { "sub": "PINGONE_CORE_CLIENT_ID" },  // ← Audit trail: BFF delegated
#   "client_id": "mcp-server-client-id",
#   "exp": 1712595600,
#   "iat": 1712594000
# }


# 2. MCP tool invocation (now with valid + scoped token)
curl -X POST http://localhost:8080/mcp/tools/call \
  -H "Authorization: Bearer eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9..." \
  -H "Content-Type: application/json" \
  -d '{
    "tool": "get_accounts",
    "arguments": {}
  }'

# MCP Server validation:
# 1. Token scope includes "banking:general:read"? ✅
# 2. act claim shows BFF (not user) is calling? ✅ (audit: delegation proven)
# 3. Audience matches mcp-server? ✅
# → Tool execution allowed
```

#### 5. RFC 8693 Token Exchange (2-Exchange: User + Agent → MCP with Delegation Chain)

**Configuration (Feature Flag Enabled):**
```
FF_TWO_EXCHANGE_DELEGATION=true
AI_AGENT_CLIENT_ID=banking-ai-agent-app-id
AI_AGENT_CLIENT_SECRET=...
AGENT_GATEWAY_AUDIENCE=https://agent-gateway.pingdemo.com
MCP_GATEWAY_AUDIENCE=https://mcp-gateway.pingdemo.com
MCP_RESOURCE_URI_TWO_EXCHANGE=https://resource-server.pingdemo.com
```

**Backend Calls PingOne (Exchange #1 + #2):**
```bash
# EXCHANGE #1: User (subject) + Agent (actor) → Intermediate Token

curl -X POST https://auth.pingone.{region}/{env-id}/as/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -H "Authorization: Basic $(echo -n 'PINGONE_CORE_CLIENT_ID:PINGONE_CORE_CLIENT_SECRET' | base64)" \
  -d "grant_type=urn:ietf:params:oauth:grant-type:token-exchange" \
  -d "subject_token=eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9..." \
  -d "subject_token_type=urn:ietf:params:oauth:token-type:access_token" \
  -d "actor_token=eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9..." \
  -d "actor_token_type=urn:ietf:params:oauth:token-type:access_token" \
  -d "requested_token_type=urn:ietf:params:oauth:token-type:access_token" \
  -d "audience=https://agent-gateway.pingdemo.com" \
  -d "scope=banking:agent:invoke" \
  -d "client_id=PINGONE_CORE_CLIENT_ID" \
  -d "client_secret=PINGONE_CORE_CLIENT_SECRET"

# Response (Intermediate Token from Exchange #1):
# {
#   "access_token": "eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9...",
#   "token_type": "Bearer",
#   "scope": "banking:agent:invoke",
#   "expires_in": 1800
# }
#
# Decoded Payload:
# {
#   "sub": "user-guid-12345",
#   "aud": "https://agent-gateway.pingdemo.com",
#   "act": { "sub": "PINGONE_AI_AGENT_CLIENT_ID" },  // Agent is delegated by user
#   "exp": 1712595600,
#   "iat": 1712594000
# }


# EXCHANGE #2: Intermediate Token + Agent Token → Final MCP Token

curl -X POST https://auth.pingone.{region}/{env-id}/as/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -H "Authorization: Basic $(echo -n 'PINGONE_CORE_CLIENT_ID:PINGONE_CORE_CLIENT_SECRET' | base64)" \
  -d "grant_type=urn:ietf:params:oauth:grant-type:token-exchange" \
  -d "subject_token=eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9..." \
  -d "subject_token_type=urn:ietf:params:oauth:token-type:access_token" \
  -d "requested_token_type=urn:ietf:params:oauth:token-type:access_token" \
  -d "audience=https://mcp-gateway.pingdemo.com" \
  -d "scope=banking:general:read banking:accounts:read banking:transactions:read" \
  -d "client_id=PINGONE_CORE_CLIENT_ID" \
  -d "client_secret=PINGONE_CORE_CLIENT_SECRET"

# Response (Final MCP Token from Exchange #2 — with NESTED ACT delegation chain):
# {
#   "access_token": "eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9...",
#   "token_type": "Bearer",
#   "scope": "banking:general:read banking:accounts:read banking:transactions:read",
#   "expires_in": 1800
# }
#
# Decoded Payload (RFC 8693 §4.4 NESTED ACT):
# {
#   "sub": "user-guid-12345",
#   "aud": "https://mcp-gateway.pingdemo.com",
#   "scope": "banking:general:read banking:accounts:read banking:transactions:read",
#   "act": {
#     "sub": "mcp-client-id",
#     "act": {
#       "sub": "PINGONE_AI_AGENT_CLIENT_ID"  // Full delegation chain
#     }
#   },
#   "exp": 1712595600,
#   "iat": 1712594000
# }
# 
# This nested structure shows:
# - Original user: user-guid-12345
# - Agent delegated by user: PINGONE_AI_AGENT_CLIENT_ID
# - MCP (final actor) delegated by agent: mcp-client-id
```

#### 6. Admin App OAuth (with PingOne Management API Scopes)

**Request:**
```
GET https://auth.pingone.{region}/{env-id}/as/authorize?
  client_id=PINGONE_AI_CORE_CLIENT_ID
  &redirect_uri=http%3A%2F%2Flocalhost%3A3001%2Fapi%2Fauth%2Foauth%2Fcallback
  &response_type=code
  &scope=openid%20profile%20email%20banking%3Aadmin%3Afull%20p1%3Aread%3Auser%20p1%3Aupdate%3Auser
  &code_challenge={base64url(sha256(code_verifier))}
  &code_challenge_method=S256
  &state={random}
  &nonce={random}
```

**Backend Exchange:**
```bash
curl -X POST https://auth.pingone.{region}/{env-id}/as/token \
  -H "Authorization: Basic $(echo -n 'PINGONE_AI_CORE_CLIENT_ID:PINGONE_AI_CORE_CLIENT_SECRET' | base64)" \
  -d "grant_type=authorization_code" \
  -d "code=<code>" \
  -d "redirect_uri=http://localhost:3001/api/auth/oauth/callback" \
  -d "code_verifier=<verifier>"

# Response includes admin + PingOne API scopes:
# {
#   "access_token": "eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9...",
#   "scope": "openid profile email banking:admin:full p1:read:user p1:update:user",
#   "expires_in": 3600
# }
```

#### 7. Admin User Management (Using PingOne API Scope)

**Backend Calls PingOne Management API:**
```bash
# Admin app calls PingOne API to set may_act attribute on user

curl -X PATCH https://api.pingone.com/v1/environments/{PINGONE_ENVIRONMENT_ID}/users/{user-id} \
  -H "Authorization: Bearer eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9..." \
  -H "Content-Type: application/json" \
  -d '{
    "customAttributes": {
      "may_act": {
        "client_id": "PINGONE_AI_CORE_CLIENT_ID"
      }
    }
  }'

# Scope required: p1:update:user ✅
# This enables 2-exchange delegation for that user
```

---

## Key Findings

✅ **Comprehensive Scope Coverage:**
- User scopes separate from MCP scopes (security boundary)
- Banking scopes narrowed on token exchange
- Admin scopes isolated to admin routes only

✅ **RFC 8693 Token Exchange Paths:**
- 1-exchange: Simple user (legacy), no delegation auditing
- 2-exchange: User + Agent (modern), auditable delegation framework with `act` claim

✅ **HITL (Human-in-the-Loop):**
- OTP/CIBA triggers for sensitive operations ($500+)
- Step-up token obtained, operation re-executed with elevated authorization

✅ **Scope Validation:**
- Pre-check: User token has sufficient scopes
- Exchange: PingOne policy determines output scopes
- Tool: MCP server verifies token scopes match operation

---

## How to Use This Document

1. **Find an API:** Look up endpoint in relevant section (Auth, Banking, Admin, etc.)
2. **Check Scopes:** See "Scopes" column for required OAuth scopes
3. **Understand Auth:** "Auth Required" shows what token type needed
4. **Token Exchange:** If it's an MCP call, view "Token Exchange Flow Diagrams" for how scopes flow through the system

**Questions?**
- Scopes on user token: Check login flow + PingOne app configuration
- MCP token scopes: Check token exchange path (1-exchange vs 2-exchange)
- Step-up scopes: Check HITL section for transaction thresholds

---

## RFC & Specification Reference

This table clarifies which standards define which concepts used in this document:

| Concept | Standard | Definition | In This Doc? |
|---------|----------|-----------|-----|
| **`scope` (OAuth scope)** | RFC 6749 §3.3 | Permission grant on access token; space-separated list | ✅ Yes (banking:read, banking:write, etc.) |
| **Authorization Code Flow** | RFC 6749 §1.3.1 | OAuth flow: app → user → code → token | ✅ Yes (/auth/login → /auth/callback)  |
| **PKCE (Code Challenge)** | RFC 7636 | Proof Key for Code Exchange; prevents code interception | ✅ Yes (PKCE protocol overview)  |
| **Token Introspection** | RFC 7662 | Query token status + claims without signature verification | ✅ Implicitly (MCP server calls PingOne /introspect) |
| **Token Revocation** | RFC 7009 | Invalidate token on logout | ✅ Yes (/auth/logout section) |
| **Token Exchange (subject_token, actor_token)** | RFC 8693 | Exchange tokens with optional delegation; defines `act` claim | ✅ Yes (1-exchange & 2-exchange paths) |
| **Resource Indicators** | RFC 8707 | Bind access token to specific resource audience via `resource` parameter | ✅ Yes (MCP_RESOURCE_URI audience binding) |
| **Protected Resource Metadata** | RFC 9728 | Server publishes scopes, AS discovery endpoint, bearer methods | ✅ Yes (/.well-known/oauth-protected-resource endpoint) |
| **Bearer Token Usage** | RFC 6750 | `Authorization: Bearer <token>` header format | ✅ Yes (tokens sent to API/MCP) |
| **`may_act` attribute**  | RFC 8693 §2.1 (PingOne extension) | User attribute: permission to delegate; appears on user token | ✅ Yes (2-exchange delegation requirement) |
| **`act` claim** | RFC 8693 §4.2 | Token claim: agent acting on behalf of user; appears on MCP token | ✅ Yes (delegation audit trail) |
| **OpenID Connect (OIDC)** | OpenID Connect Core 1.0 | Authentication layer on top of OAuth; defines `id_token`, `nonce` | ✅ Implicitly (PingOne OAuth is OIDC-compliant) |
| **CIBA (Client-Initiated Backchannel Auth)** | OAuth CIBA | Step-up authentication via push notification; defines auth_req_id, poll | ✅ Yes (/auth/ciba section, HITL flow) |
| **MCP Protocol** | Model Context Protocol 2025-11-25 | JSON-RPC transport, tools/list, tools/call, lifecycle | ❌ No (out of scope; this doc is OAuth layer, not MCP) |

**Takeaway:** `may_act` and `act` are **OAuth RFC 8693 features**, not MCP protocol features. They describe **delegation on the OAuth level**, which MCP validates via bearer token introspection.
