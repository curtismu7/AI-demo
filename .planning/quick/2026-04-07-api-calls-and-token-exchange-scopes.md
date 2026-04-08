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
