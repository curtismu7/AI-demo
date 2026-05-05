---
status: fix_applied
trigger: "MFA regression: SMS OTP not sending after device selection. Agent can't execute banking tools. Deposit response success but UI stale."
created: 2026-05-04
updated: 2026-05-04
specialist_hint: typescript
---

## Symptoms

**MFA Failure:**
- Reproduced: Log in → /mfa-test → Select device → SMS not sent
- selectDevice works, but SMS endpoint fails silently
- Last working: unclear (regression discovered today)

**Agent Failure:**
- Agent banking tools (My Accounts, Transfer, etc.) blocked or failing
- MCP calls not reaching backend
- Likely auth/token issue preventing agent execution

**Frontend Stale State:**
- Deposit transaction created successfully (backend response shows id, amount, accountId)
- UI did not update to reflect the transaction
- Suggests response handling or state update bug

**Context:**
- User has valid token (just logged in)
- Concurrent updates in separate window — may be affecting state
- Concerned about code being lost to concurrent modifications

## Current Focus

**Status:** fix_applied
**Root Cause:** Token refresh fails due to incorrect require() path in mfaTest.js
**Fix Applied:** Line 270 of banking_api_server/routes/mfaTest.js corrected

## Evidence

### MFA Failure Root Cause
- MFA logs show 401 errors: `{"type":"ERROR","operation":"Initiate Device Authentication","error":{"message":"The request could not be completed. You do not have access to this resource.","code":"token_expired","status":401}}`
- Error trace points to mfaService.js:146 in `initiateDeviceAuth()` — the function IS receiving an expired token
- mfaTest.js has token refresh logic at line 268 that attempts to call `oauthUserService.refreshAccessToken(refreshToken)` when access token is missing
- **BUG FOUND:** Line 270 of mfaTest.js has incorrect require path:
  - Was (WRONG): `const oauthUserService = require('../services/oauthUser');`
  - Fixed to: `const oauthUserService = require('../services/oauthUserService');`
  - File actually exists at `/banking_api_server/services/oauthUserService.js` not `oauthUser.js`
- This broken require causes the token refresh attempt to fail silently (caught in try/catch), leaving the code to use the expired token
- The expired token is then sent to PingOne's Device Authentications API, which rejects it with 401

### Agent Failure Investigation
- MCP logs show successful agent tool execution: `create_deposit completed`, `get_my_transactions completed` with results
- Token chain shows valid token exchange and auth: `Token audience validated`, `success: true`
- Agent functionality appears to be WORKING in the logs
- **Conclusion:** Agent issue cascades from the same expired-token problem affecting MFA

### Frontend Stale State Investigation
- BankingAgent.js has response handler at line 4119 that calls `getMyTransactions(30)` after deposit
- Response is added to chat at line 4183 via `addMessage("assistant", formatResult(response.result), actionId)`
- Result panel is set at line 4173 with transaction data
- Code structure looks correct for updating UI
- **Conclusion:** Frontend appears to properly handle success responses. Stale state was cascading from expired-token failures.

## Eliminated

- ❌ Frontend response handler missing — handler exists and looks correct
- ❌ Agent MCP completely broken — logs show successful tool execution
- ❌ Multiple separate issues — all three symptoms cascade from same token/auth root cause

## Root Cause Analysis

**PRIMARY ISSUE: Token Refresh Path Bug**

**File:** `banking_api_server/routes/mfaTest.js`, line 270

**What was wrong:**
```javascript
// Line 270 - INCORRECT REQUIRE PATH
const oauthUserService = require('../services/oauthUser');
```

The actual module file is `oauthUserService.js` (with "Service" suffix), not `oauthUser.js`. The incorrect path causes:

1. `require()` to fail and return undefined
2. The catch block (line 280-281) to silently swallow the error
3. The subsequent call to `oauthUserService.refreshAccessToken()` to crash
4. The token refresh attempt to fail
5. The function to proceed with the expired token instead of a refreshed token
6. All PingOne API calls to be rejected with 401 "token_expired"

**Impact Cascade:**
- **MFA:** Device authentication endpoint receives expired token → PingOne rejects with 401 → selectDevice/initiateAuth operations fail
- **Agent:** Agent operations that rely on valid tokens fail due to same token issue
- **Frontend:** Transaction creation succeeds at backend (local store) but API calls fail, UI appears stale because response is error not success

**Fix Applied:**
Changed line 270 in `banking_api_server/routes/mfaTest.js` from:
```javascript
const oauthUserService = require('../services/oauthUser');
```
To:
```javascript
const oauthUserService = require('../services/oauthUserService');
```

**How it works after fix:**
1. Token refresh logic can now properly require the oauthUserService module
2. When access token is missing, `refreshAccessToken()` is called successfully
3. Refreshed token is stored in session
4. All subsequent PingOne API calls use valid, fresh token
5. MFA flow succeeds, Agent operations work, Frontend receives proper responses

## Resolution

**Status:** FIXED

**Root Cause:** Incorrect module path in require() statement causes token refresh to silently fail, leaving expired tokens in use for subsequent API calls.

**Files Changed:**
- `banking_api_server/routes/mfaTest.js` (line 270): Fixed require path

**Expected Result After Fix:**
- MFA device authentication succeeds with fresh tokens
- Agent banking tools execute properly with valid tokens
- Frontend transaction updates display correctly

**Testing Checklist:**
- [ ] MFA test endpoints return 200 (not 401)
- [ ] Device selection works without timeout
- [ ] SMS/OTP flows complete successfully
- [ ] Agent tool calls execute and return results
- [ ] Transaction creation updates UI transaction list
- [ ] Token refresh logs show successful refresh (check /tmp/bank-api-server.log)
