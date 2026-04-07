# Scope Audit Report: Missing agent:invoke in User Tokens

**Date:** April 7, 2026  
**Issue:** After fresh PingOne login (non-admin user), tokens lack `agent:invoke` scope, blocking Agent MCP path.  
**Status:** ROOT CAUSE IDENTIFIED + FIX PROVIDED

---

## Executive Summary

The `agent:invoke` (or `banking:agent:invoke`) scope is **not appearing on user access tokens** despite being configured in PingOne and requested in the authorization flow. The root cause is a **resource server scope mismatch**:

- **Main Resource Server** (`https://resource.pingdemo.com`): Has `banking:agent:invoke` scope defined ✅
- **MCP Resource Server** (`https://mcp-server.pingdemo.com`): Missing `banking:agent:invoke` scope ❌
- **When ENDUSER_AUDIENCE is set:** OAuth requests scopes for the MCP resource, which doesn't have `banking:agent:invoke`
- **Result:** PingOne authorizes without the scope; access token lacks it; Agent invocation blocked

---

## Scope Flow Analysis

### 1. Authorization Request Stage

**File:** `banking_api_server/config/oauthUser.js` (lines 35-49)

| Condition | Scopes Requested | Resource |
|-----------|------------------|----------|
| `ENDUSER_AUDIENCE` is NOT set | `['openid', 'profile', 'email', 'offline_access', 'banking:read', 'banking:write', 'banking:accounts:read', 'banking:transactions:read']` | Main Resource Server |
| `ENDUSER_AUDIENCE` IS set | `['profile', 'email', 'offline_access', 'banking:agent:invoke']` | ENDUSER_AUDIENCE (MCP server) |

**Code snippet (oauthUser.js:46-49):**
```javascript
const enduserAudience = process.env.ENDUSER_AUDIENCE;
if (enduserAudience) {
  return ['profile', 'email', 'offline_access', 'banking:agent:invoke'];
}
```

**Comment intent (oauthUser.js:41-45):**
> "When a custom resource audience is configured for token exchange, omit `openid` so PingOne does not reject the authorize request with 'May not request scopes for multiple resources'. Add `banking:agent:invoke` so the Subject Token grants agent invocation..."

✅ **Intent is correct:** Authorization request asks for `banking:agent:invoke` when targeting MCP resource.

---

### 2. PingOne Response Stage

**What SHOULD happen:**  
PingOne includes `banking:agent:invoke` in:
- **ID token** `scope` claim (informational)
- **Access token** `scope` claim (used for authorization)

**What ACTUALLY happens:**  
PingOne **omits** `banking:agent:invoke` because the scope is not defined on the MCP resource server.

**Evidence:**
- User access token received by BFF has scope: `"profile email offline_access"`
- Missing: `banking:agent:invoke`

---

### 3. Resource Server Scope Configuration

#### Main Resource Server (`https://resource.pingdemo.com`)

**File:** `banking_api_server/services/pingoneProvisionService.js` (lines 485-506)

```javascript
const scopes = [
  { name: 'banking:read', description: '...' },
  { name: 'banking:write', description: '...' },
  { name: 'banking:accounts:read', description: '...' },
  { name: 'banking:transactions:read', description: '...' },
  { name: 'banking:accounts', description: '...' },
  { name: 'banking:admin', description: '...' },
  { name: 'banking:agent:invoke', description: 'Agent invocation permission' },  ✅ PRESENT
  { name: 'p1:read:user', description: '...' },
  { name: 'p1:update:user', description: '...' },
  { name: 'ai_agent', description: '...' },
  { name: 'admin:read', description: '...' },
  { name: 'admin:write', description: '...' },
  { name: 'admin:delete', description: '...' },
  { name: 'users:read', description: '...' },
  { name: 'users:manage', description: '...' }
];

const scopeResults = await this.createScopes(resourceResult.resource.id, scopes);
```

**Result:** ✅ `banking:agent:invoke` IS available on main resource server.

#### MCP Resource Server (`https://mcp-server.pingdemo.com`)

**File:** `banking_api_server/services/pingoneProvisionService.js` (lines 483-508)

```javascript
const mcpScopes = [
  { name: 'admin:read', description: '...' },
  { name: 'admin:write', description: '...' },
  { name: 'admin:delete', description: '...' },
  { name: 'users:read', description: '...' },
  { name: 'users:manage', description: '...' },
  { name: 'banking:read', description: '...' },
  { name: 'banking:write', description: '...' }
  // ❌ MISSING: banking:agent:invoke
];

const mcpScopeResults = await this.createScopes(mcpResourceResult.resource.id, mcpScopes);
```

**Result:** ❌ `banking:agent:invoke` is NOT available on MCP resource server.

---

### 4. User Application Scope Grants

**File:** `banking_api_server/services/pingoneProvisionService.js` (lines 668-675)

```javascript
const userGrantResult = await this.grantScopesToApplication(
  userAppResult.application.id,
  resourceResult.resource.id,  // ← Granted from MAIN resource server
  ['banking:agent:invoke', 'banking:read', 'banking:write']
);
```

**Status:** User app IS granted `banking:agent:invoke` from the **main resource server**.

**Problem:** When ENDUSER_AUDIENCE is set, the OAuth request specifies a different resource (MCP server), and PingOne doesn't have `banking:agent:invoke` defined there.

---

### 5. Token Exchange Validation

**File:** `banking_api_server/services/agentMcpTokenService.js` (lines 525-555)

```javascript
// Parse scopes from the access token's scope claim
const userTokenScopes = new Set(
  (typeof userAccessTokenClaims?.scope === 'string'
    ? userAccessTokenClaims.scope.split(' ')
    : (userAccessTokenClaims?.scope || [])
  ).filter(Boolean)
);

// Check for agent:invoke scope (with or without banking: prefix)
const userHasAgentInvokeScope = 
  userTokenScopes.has('banking:agent:invoke') || 
  userTokenScopes.has('agent:invoke');

// Block if missing
if (scopesMissingFromUserToken && !allowAgentInvokeExchange && !userHasAgentInvokeScope) {
  // Error: "Token exchange blocked: agent:invoke scope not on user token"
  throw new Error(...);
}
```

**Validation Logic:**
✅ Checks for BOTH `banking:agent:invoke` AND `agent:invoke` (handles both naming conventions)  
❌ But neither is present on the token!

---

## Scope Flow Table

| Stage | Scopes Requested | Scopes Returned | Scopes Missing | Status |
|-------|------------------|-----------------|---|--------|
| **Authorization Request** | `banking:agent:invoke` (when ENDUSER_AUDIENCE set) | See row below | *pending* | ⏳ Sent to PingOne |
| **ID Token / Access Token** | `—` | `profile email offline_access` | `banking:agent:invoke` | ❌ MISSING |
| **Token Exchange Input** | `banking:agent:invoke` (scope param in RFC 8693 request) | `—` | `banking:agent:invoke` | ❌ BLOCKED before exchange |
| **Agent Scope Validation** | `—` | `(none)` | `agent:invoke` `banking:agent:invoke` | ❌ FAILS (early exit) |

---

## Root Cause Analysis

### Primary Cause: Resource Server Scope Mismatch

**Chain of events:**

1. **Setup Phase:**
   - Main resource server created with scopes: `[banking:read, banking:write, banking:agent:invoke, ...]`
   - MCP resource server created with scopes: `[admin:read, admin:write, users:manage, banking:read, banking:write]` ← **missing `banking:agent:invoke`**

2. **User App Grant Phase:**
   - User app granted `banking:agent:invoke` from **main** resource server
   - No grant from MCP resource server (would fail anyway since scope doesn't exist)

3. **Login Phase (ENDUSER_AUDIENCE set):**
   - Authorization request asks: `scope=banking:agent:invoke&resource=https://mcp-server.pingdemo.com`
   - PingOne checks: "Is `banking:agent:invoke` defined on MCP resource server?"
   - Answer: NO
   - Result: Scope omitted from access token

4. **Agent Invocation Phase:**
   - BFF checks: Does user access token have `agent:invoke` or `banking:agent:invoke`?
   - Answer: NO
   - Result: Scope validation fails; modal shown: "Missing Required Scopes: agent:invoke"

---

## Secondary Issues

### Issue #2: Scope Name Inconsistency

**Scope registered with TWO names:**

**File:** `banking_api_server/services/pingoneManagementService.js` (lines 398-430)

```javascript
// For resourceServerTwoExchange (2-exchange mode):
scopes: [
  { name: 'banking:agent:invoke', ... },
  { name: 'agent:invoke', ... }  // ← If both are registered, which is returned?
]
```

**Implication:** Code checks for BOTH names (good defensive programming), but initialization might register both, creating confusion. The provisioning service only uses `banking:agent:invoke` (with prefix).

---

## Configuration Analysis

### Environment Variables

| Variable | Expected Value | Actual Setup | Impact |
|----------|---|---|---|
| `ENDUSER_AUDIENCE` | `https://mcp-server.pingdemo.com` | Set ✅ | Triggers `banking:agent:invoke` request |
| `PINGONE_ENVIRONMENT_ID` | PingOne environment ID | Set ✅ | OAuth requests routed to correct PingOne |
| `PINGONE_REGION` | com / eu / ca | Set ✅ | Correct auth endpoint |

---

## Fix Summary

### Primary Fix (Required)

**Add `banking:agent:invoke` to MCP resource server scopes**

**File:** `banking_api_server/services/pingoneProvisionService.js` (line 487)

**Current:**
```javascript
const mcpScopes = [
  { name: 'admin:read', description: '...' },
  { name: 'admin:write', description: '...' },
  { name: 'admin:delete', description: '...' },
  { name: 'users:read', description: '...' },
  { name: 'users:manage', description: '...' },
  { name: 'banking:read', description: '...' },
  { name: 'banking:write', description: '...' }
];
```

**Fix:**
```javascript
const mcpScopes = [
  { name: 'admin:read', description: '...' },
  { name: 'admin:write', description: '...' },
  { name: 'admin:delete', description: '...' },
  { name: 'users:read', description: '...' },
  { name: 'users:manage', description: '...' },
  { name: 'banking:read', description: '...' },
  { name: 'banking:write', description: '...' },
  { name: 'banking:agent:invoke', description: 'Agent invocation permission' }  // ← ADD THIS
];
```

**Impact:**
- MCP resource server will have `banking:agent:invoke` defined
- When ENDUSER_AUDIENCE is set, PingOne will include the scope in the access token
- Token validation will pass
- Agent invocation will succeed

### Secondary Considerations

1. **Existing PingOne Environments:**  
   If PingOne was already provisioned with the old scope list, the MCP resource server will need to be updated manually via Admin UI:
   - Navigate to **Resource Servers** → **Super Banking MCP Server** → **Scopes**
   - Add scope: `banking:agent:invoke`

2. **Token Exchange Scopes:**  
   The token exchange policy on the MCP resource server (if configured) should also verify that `banking:agent:invoke` → `banking:read` / `banking:write` mapping is in place.

3. **Scope Validation:**  
   The code already handles both `banking:agent:invoke` and `agent:invoke` in validation (line 525), so either name will work once the scope is available on the MCP resource.

---

## Verification Steps

After applying the fix:

1. **Admin Setup Check:**
   - Go to PingOne Admin → Resource Servers → **Super Banking MCP Server** → **Scopes**
   - Verify **banking:agent:invoke** is listed ✅

2. **User App Grant Check:**
   - Go to **Super Banking User App** → **Scopes**
   - Verify user app can request `banking:agent:invoke` from MCP resource server

3. **Fresh Login Test:**
   - Clear browser cookies / localStorage
   - Login as non-admin user (e.g., `bankuser`)
   - Capture access token JWT (browser DevTools → Network → /api/auth/callback → response)
   - Decode token: `scope` claim should include `banking:agent:invoke`
   - Open Agent → should NOT show "Missing Required Scopes" modal

4. **Debug Logging:**
   - Check BFF logs during Agent invocation
   - Line 495–505 of `agentMcpTokenService.js` prints debug log:
     ```
     [TokenExchange:DEBUG] userScopes=[...] including banking:agent:invoke or agent:invoke
     ```
   - Should show scope in the list

---

## Related Code References

| File | Line | Purpose |
|------|------|---------|
| `banking_api_server/config/oauthUser.js` | 35–49 | Authorization request scope config |
| `banking_api_server/services/pingoneProvisionService.js` | 483–508 | MCP resource server & scope creation |
| `banking_api_server/services/agentMcpTokenService.js` | 525–555 | Agent scope validation |
| `banking_api_server/config/scopes.js` | — | Scope definitions by user type |
| `banking_api_server/services/mcpWebSocketClient.js` | — | Token usage for MCP calls |

---

## Impact Assessment

**Affected Users:** Non-admin users (customer role)  
**Unaffected:** Admin users (if they use admin OAuth flow)  
**Behavior After Fix:**
- ✅ Non-admin users can invoke Agent tools
- ✅ Token exchange proceeds without scope validation error
- ✅ MCP server receives properly delegated token with `agent:invoke` claim

---

## appendix: Scope Naming Convention

PingOne scopes often use multiple naming conventions:

| Convention | Example | Used Where |
|-----------|---------|-----------|
| Resource-qualified | `banking:agent:invoke` | Main resource server, current provisioning |
| Generic/flat | `agent:invoke` | 2-exchange mode, legacy configs |
| OIDC standard | `openid`, `profile`, `email` | ID token claims, not resource-specific |

The code defensively checks for both `banking:agent:invoke` **and** `agent:invoke` (line 525), so either name will work once the scope is available on the authorizing resource server.

---

**Audit completed:** 2026-04-07  
**Next action:** Apply primary fix + verify in PingOne Admin UI
