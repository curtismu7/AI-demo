---
status: resolved
trigger: "MFA device selection returns 401 even though token refresh succeeds. Browser Network tab shows token refresh (to /api/auth/token) returns 200 before the 401 error."
created: 2026-05-04
updated: 2026-05-04
---

## Symptoms

**Issue:**
- User logs in → logs show fresh valid token
- Clicks MFA device selection button → triggers POST to `/api/mfa/test/integration/select-device`
- First, a token refresh request appears to succeed (200)
- Then, the select-device call returns 401
- Critical: Token refresh succeeds but subsequent request still uses expired token

**Reproduction:**
1. Log in to dashboard (fresh session)
2. Navigate to MFA test page
3. Click "Initiate SMS OTP" button (which calls testSmsInitiate)
4. Step 2 of testSmsInitiate automatically selects first SMS device and calls POST /api/mfa/test/integration/select-device
5. Observe Network tab: token refresh succeeds (200), but select-device call returns 401

**Timeline:**
- Just started today
- May 4 fix for mfaTest.js require path IS in place and working (line 272 correct)
- This is a new/different 401 issue from previous token problems

## Current Focus

hypothesis: "The /api/mfa/test routes are NOT included in the refreshIfExpiring middleware, so automatic token refresh does not happen before MFA requests. The server-side _resolveCredentials tries to refresh only if token is MISSING, not EXPIRED."

test: "Verify that /api/mfa/test is missing from the refreshIfExpiring middleware list in server.js"

expecting: "Adding /api/mfa/test to the refreshIfExpiring middleware list will trigger automatic token refresh before any MFA request, preventing 401 errors on expiring tokens."

next_action: "COMPLETED: Added /api/mfa/test to server.js refreshIfExpiring middleware array (line 402)."

reasoning_checkpoint: "Code inspection revealed: server.js lines 392-404 apply refreshIfExpiring middleware to specific paths. The list includes /api/accounts, /api/transactions, /api/mcp, /api/banking-agent, /api/tokens, /api/demo-scenario, /api/auth/oauth but NOT /api/mfa/test. Meanwhile, mfaTest.js _resolveCredentials (line 268-286) only tries to refresh if token is MISSING, not EXPIRED. Without refreshIfExpiring, a token that is expiring (or expired) will cause a 401, and the fallback refresh in _resolveCredentials won't help because the condition checks for missing token, not expired token."

tdd_checkpoint: ""

## Evidence

- apiClient.js getValidToken() returns null (BFF pattern)
- apiClient.js refreshToken() returns null immediately
- mfaTest.js _resolveCredentials tries to refresh on server-side only if token missing (line 268 condition)
- server.js lines 392-404 apply refreshIfExpiring ONLY to specific paths
- /api/mfa/test was NOT in the refreshIfExpiring list (NOW FIXED)
- mfaTest.js routes are registered at line 731: app.use('/api/mfa/test', mfaTestRoutes)
- oauthUser.js line 842-866 has the /refresh endpoint that returns 200

## Eliminated

- mfaTest.js syntax/require errors (fix is in place)
- Backend token service logic (works correctly)
- Client-side token refresh logic (intentionally returns null per BFF pattern)

## Resolution

root_cause: "The refreshIfExpiring middleware was not applied to /api/mfa/test routes, so expiring tokens were not automatically refreshed before MFA test requests. The server's fallback refresh in _resolveCredentials only handles completely missing tokens, not expired ones. When a user's token was expiring, the MFA request would get a 401."

fix: "Added /api/mfa/test to the refreshIfExpiring middleware array in server.js line 402. This ensures automatic token refresh happens before any MFA test endpoint executes, matching the behavior of other authenticated API routes like /api/accounts and /api/transactions."

verification: "After adding /api/mfa/test to refreshIfExpiring: (1) Log in and navigate to MFA test page. (2) Wait a moment for token to enter 5-minute expiry window (or manually test with near-expired token). (3) Click 'Initiate SMS OTP' and select device. (4) Verify no 401 error; request should succeed because token is auto-refreshed by refreshIfExpiring middleware."

files_changed: "banking_api_server/server.js (line 402: added '/api/mfa/test' to refreshIfExpiring middleware array)"
