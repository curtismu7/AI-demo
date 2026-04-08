# Scope Naming Fix — Comprehensive Documentation Update

**Commit:** `2351050`  
**Date:** 2026-04-07  
**Status:** ✅ **COMPLETED**

---

## Problem Identified

Documentation across the repository was using **incorrect scope name**: `banking:agent:invoke`  
Actual implementation uses: **`banking:ai:agent:read`**, `banking:ai:agent:write`, `banking:ai:agent:admin`

**Root Cause:** Scope name changed in PingOne but old documentation wasn't updated.

**Impact:** Users following old documentation would request wrong scope, leading to token exchange failures.

---

## Files Fixed (5 files, 111 insertions, 84 deletions)

### 1. `.planning/quick/2026-04-07-api-calls-and-token-exchange-scopes.md` (124 lines)
**Purpose:** Comprehensive API reference with scope mappings and real curl examples  
**Changes:**
- Updated all scope references: `banking:agent:invoke` → `banking:ai:agent:read`
- Fixed App Configuration table (3 rows):
  - User App grants: `banking:ai:agent:read` (for 2-exchange delegation)
  - AI Agent App grants: `banking:ai:agent:read` + `banking:ai:agent:write`
  - MCP Exchanger grants: added full scope list including agent scopes
- Updated Scope Validation Flow table (2-exchange row):
  - Clarified: User token MUST have `banking:ai:agent:read` scope + `may_act` claim
  - Agent token MUST have `banking:ai:agent:read` scope from client_credentials
- Fixed all API call examples (7 examples):
  - Authorization request: `banking:ai:agent:read` in scope params
  - Token exchange details: Clarified scope narrowing
  - Added explicit notes on scope requirements for 1-exchange vs 2-exchange
- Updated RFC 8693 token flow diagrams:
  - Exchange #1: User token (with `may_act` + `banking:ai:agent:read`) + Agent token → intermediate token
  - Exchange #2: Intermediate token + Agent token → final MCP token with **NESTED** `act` claim
  - Added full RFC 8693 §4.4 nested act claim documentation
  - Decoded JWT payloads show exact claim structure for each exchange
- Fixed MCP endpoint table: Updated endpoint requirements to show nested `act` claim structure

**Key Addition:** Section "What Scopes User Token Needs for Token Exchange"
```markdown
For 1-Exchange: User must have ANY_OF [banking:general:read, banking:write, banking:accounts:read]
For 2-Exchange: User MUST have banking:ai:agent:read (permission) + PingOne may_act claim (proof)
             Agent MUST have banking:ai:agent:read from client_credentials
```

---

### 2. `SCOPE_AUDIT_REPORT.md` (20 lines)
**Purpose:** Status report on scope naming standardization  
**Changes:**
- Updated PingOne App Grants table:
  - User App: `banking:ai:agent:read` (from incorrect `banking:agent:invoke`)
  - MCP Exchanger: Full list including `banking:ai:agent:read` for delegation
- Updated Scope Verification section:
  - Documented scope is: `profile email banking:ai:agent:read ...`
  - Implementation has: Correct `banking:ai:agent:read` scope
  - Status: ✅ MATCHES
- Updated Resource Server Scopes section:
  - Added `banking:ai:agent:read` / `write` / `admin` as defined scopes
  - Removed incorrect `banking:agent:invoke` references

---

### 3. `docs/PINGONE_MAY_ACT_ONE_TOKEN_EXCHANGE.md` (6 lines)
**Purpose:** Single-exchange delegation setup guide  
**Changes:**
- Step 1 scope: `profile email banking:ai:agent:read` (was `banking:agent:invoke`)
- Postman collection variable note: Updated to show correct scope name
- Token response example: Updated scope in JWT decode to `banking:ai:agent:read`

---

### 4. `docs/PINGONE_MAY_ACT_SETUP.md` (36 lines)
**Purpose:** Complete 3-token delegation setup guide (1-exchange and 2-exchange patterns)  
**Changes:**
- **Scope correctness table:** All Step scopes updated
  - `/authorize` → `profile email banking:ai:agent:read` (was `banking:agent:invoke`)
  - Token exchange scopes clarified with narrowing behavior
- **Demo pattern (1-exchange):**
  - Subject Token now shows: `scope: "banking:ai:agent:read"` (permission)
  - Subject Token shows: `may_act: { "sub": "..." }` (authorization)
  - Added comment: "USER MUST have this scope to delegate"
- **Production pattern (2-exchange):**
  - Agent Subject Token: `scope: "banking:ai:agent:read banking:ai:agent:write"`
  - Agent Exchange Token: Includes first `act` claim
  - **MCP Token shows NESTED act structure** per RFC 8693 §4.4:
    ```json
    "act": {
      "sub": "<mcp-client-id>",
      "act": { "sub": "<PINGONE_AI_AGENT_CLIENT_ID>" }
    }
    ```
- **Critical Addition:** New section explaining dual requirements:
  > **Two Key Requirements for 2-Exchange Delegation:**
  > 1. **Scope Permission:** User token MUST have `banking:ai:agent:read` scope
  > 2. **Claim Authorization:** User MUST have PingOne `may_act` user attribute
  > Both are required. Scope alone is insufficient. Claim alone is insufficient.
- **Token flow table:** Updated with scope column showing exact scopes at each step
- **Delegation audit trail:** MCP Token shows full nested chain with comments

---

### 5. `docs/pingone-management-api-setup.md` (9 lines)
**Purpose:** PingOne resource server configuration reference  
**Changes:**
- **MCP Server Configuration section:**
  - Scopes changed to: `banking:ai:agent:read` / `write` / `admin` + banking read/write
- **Two-Exchange Delegation section:**
  - Resource server scopes: `banking:ai:agent:read` / `write` / `admin` (was `banking:agent:invoke` + `agent:invoke`)
  - Clarified these are primary agent delegation scopes

---

## What the Fix Covers

### ✅ Scope Naming
- [x] `banking:agent:invoke` → `banking:ai:agent:read` (primary user delegation scope)
- [x] Added `banking:ai:agent:write` and `banking:ai:agent:admin` variants
- [x] Updated all tables, examples, and flow diagrams

### ✅ 2-Exchange Token Flow
- [x] Clarified **Scope Permission:** User token MUST have `banking:ai:agent:read`
- [x] Clarified **Claim Authorization:** User MUST have PingOne `may_act` user attribute
- [x] Documented RFC 8693 §4.4 **nested `act` claim** structure:
  ```json
  act: {
    sub: "mcp-client-id",
    act: { sub: "agent-client-id" }
  }
  ```
- [x] Exchange #1 vs Exchange #2 output structures documented with payloads
- [x] Scope narrowing during exchange documented (e.g., `banking:ai:agent:read` → `banking:accounts:read`)

### ✅ Resource Server Configuration
- [x] Updated which resource servers have which scopes
- [x] Clarified scope definitions on Main Banking vs MCP vs Agent resource servers
- [x] Documented that `banking:ai:agent:read` must be on Resource Server used for delegation

### ✅ API Call Examples
- [x] All 7 curl examples updated with correct scope names
- [x] Request/response payloads show correct scopes
- [x] Authorization request examples show correct scope params
- [x] Token response examples (decoded JWT) show correct claims

### ✅ Audit Trail
- [x] `SCOPE_AUDIT_REPORT.md` updated to show correct status
- [x] Real vs intended scopes now match
- [x] Documentation source verified against actual code

---

## Code Verification

**Source of Truth:** [`banking_api_server/config/scopes.js`](banking_api_server/config/scopes.js)

```javascript
const BANKING_SCOPES = {
  AI_AGENT: 'banking:ai:agent:read',        // ✅ Confirmed
  AI_AGENT_WRITE: 'banking:ai:agent:write', // ✅ Confirmed
  AI_AGENT_ADMIN: 'banking:ai:agent:admin'  // ✅ Confirmed
};
```

Verified against:
- [`banking_api_server/middleware/auth.js`](banking_api_server/middleware/auth.js) — Uses correct constants
- [`banking_api_server/routes/*.js`](banking_api_server/routes/) — Route files use proper scopes
- Test files: `standardizationValidation.test.js` validates correct naming

---

## User Token Requirements for 2-Exchange

### Scope Component (Permission)
```
scope claim: "... banking:ai:agent:read ..."
Purpose: Grants user permission to delegate to AI agent
```

### Claim Component (Authorization)
```
may_act user attribute in PingOne:
{
  "client_id": "bff-admin-client-id"  // or "sub" if using older format
}
Purpose: Declares this BFF client is authorized to act on user's behalf
```

### Both Components Required
| Component | Role | If Missing | Status |
|-----------|------|-----------|--------|
| `banking:ai:agent:read` scope | Grants permission | User can't delegate (403 Insufficient Scope) | ✅ Now documented |
| PingOne `may_act` claim | Proves authorization | BFF can't exchange (invalid_grant) | ✅ Now documented |

---

## Testing / Verification

### Manual Verification Steps
1. **Check User Token after OAuth login:**
   ```bash
   # Decode access token (jwt.io or jq)
   # Should see: "scope": "... banking:ai:agent:read ..."
   ```

2. **Check User Attributes in PingOne:**
   - User → More Details → Custom Attributes
   - Should see: `may_act: { client_id: "bff-admin-client-id" }`

3. **Check Token Exchange Success:**
   ```bash
   # Exchange #1 should work and return token with act claim
   # Exchange #2 should return token with NESTED act claim
   ```

4. **Verify in Code:**
   ```bash
   grep -r "banking:ai:agent" banking_api_server/
   # Should find only banking:ai:agent:read/write/admin
   # Should NOT find banking:agent:invoke
   ```

---

## Migration Path (if on old scopes)

If you have old PingOne configuration using `banking:agent:invoke`:

1. **Add new scopes to Main Banking Resource Server:**
   ```
   banking:ai:agent:read
   banking:ai:agent:write
   banking:ai:agent:admin
   ```

2. **Update User App Resource Grants:**
   - Remove: `banking:agent:invoke`
   - Add: `banking:ai:agent:read` (for 2-exchange users)

3. **Update AI Agent App Resource Grants:**
   - Remove: `banking:agent:invoke`
   - Add: `banking:ai:agent:read` + `banking:ai:agent:write`

4. **Verify MCP Exchanger has correct scopes** (see config spec)

5. **Update any custom code checking scopes:**
   ```javascript
   // OLD (don't do this)
   if (token.scope.includes('banking:agent:invoke')) { ... }
   
   // NEW (correct)
   if (token.scope.includes('banking:ai:agent:read')) { ... }
   ```

---

## Summary of Changes

**What was wrong:** Documentation used non-existent scope name `banking:agent:invoke`

**What's fixed:** All documentation now uses actual scope names from code:
- `banking:ai:agent:read` (primary delegation scope)
- `banking:ai:agent:write` (agent write operations)
- `banking:ai:agent:admin` (agent admin operations)

**Plus:** Enhanced documentation for 2-exchange showing:
- Both scope (permission) and claim (authorization) requirements
- RFC 8693 §4.4 nested `act` claim structure
- Exchange #1 vs Exchange #2 output token formats
- Scope narrowing during token exchange

**User Impact:** Anyone following this documentation will now request correct scopes and understand what's needed for 2-exchange delegation to work.

---

## Files NOT Changed (Intentional)

The following debug/reference files were left as-is since they document the **investigation process**:

- `.planning/debug/scope-audit-missing-agent-invoke.md` — Documents why `banking:agent:invoke` was missing (resource server mismatch)
- `.planning/quick/2026-04-07-pingone-scopes-mapping.md` — Reference doc showing both old and new naming
- `.planning/quick/2026-04-07-code-verification-api-scopes.md` — Code verification report
- Tests and other debug documents

These can be reviewed to understand the scope audit history and resource server configuration.
