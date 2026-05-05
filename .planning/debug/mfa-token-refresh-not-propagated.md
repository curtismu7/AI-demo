---
status: resolved
trigger: "MFA device selection returns 401 INVALID_TOKEN even with valid user token."
created: 2026-05-04
updated: 2026-05-05
specialist_hint: typescript-banking
---

## Symptoms

- POST /api/mfa/test/integration/select-device → 401
- GET /api/mfa/test/integration/challenge/{id}/status → 401
- POST /api/mfa/test/integration/initiate succeeds (200) with the same user token
- PingOne response: code=ACCESS_FAILED, details.code=INVALID_TOKEN

## Root Cause

**Regression in commit fc3b9882 (May 4 13:33:02):** "fix(MFA): selectDevice should use provided token, not always fetch worker token"

This commit changed mfaService.selectDevice from always using a worker (client_credentials) token to preferring the user access token. The original comment was correct:
> "Use worker token for device selection (matches PingOne MFA v1 API requirements)"

PingOne MFA v1 `/deviceAuthentications/{daId}` endpoint **requires a worker token** — user access tokens are rejected with INVALID_TOKEN. The intermediate hypothesis about RFC 8693 audience exchange was wrong; PingOne does not need an audience-scoped token, it needs a client_credentials token.

The `/deviceAuthentications` POST (initiate) does accept user tokens, which is why initiate succeeds while select-device and status fail.

## Fix Applied

Reverted token selection in mfaService.js to always use worker token for:
- `selectDevice(daId, deviceId, _userAccessToken)` — line 216
- `getDeviceAuthStatus(daId, _userAccessToken)` — line 359

Removed RFC 8693 token exchange from these paths (the prior hypothesis fix). User access token parameter retained for API compatibility (prefixed with `_` to silence unused-param lint).

## Verification

1. Log in to dashboard (fresh session)
2. Navigate to /mfa-test
3. Click "Initiate SMS OTP"
4. Select SMS device when prompted
5. Expected: select-device returns 200, status polling returns 200, OTP arrives

## Files Changed

- banking_api_server/services/mfaService.js
  - selectDevice: use _getWorkerToken() instead of provided user token
  - getDeviceAuthStatus: use _getWorkerToken() instead of provided user token
