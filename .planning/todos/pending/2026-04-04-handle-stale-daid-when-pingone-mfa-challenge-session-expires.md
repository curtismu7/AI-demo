---
created: 2026-04-04T14:27:57.622Z
title: Handle stale daId when PingOne MFA challenge session expires
area: auth
files:
  - banking_api_server/routes/mfa.js
  - banking_api_server/services/mfaService.js
  - banking_api_ui/src/components/UserDashboard.js
---

## Problem

PingOne `deviceAuthentications` sessions (`daId`) have a TTL — typically around 10 minutes per the PingOne docs. The `daId` is created on `POST /challenge` and stored in React state (`otpDaId`, `totpDaId`, `pushDaId`, `fido2DaId`).

If the user:
- Opens the OTP modal and doesn't complete in time
- Leaves the browser tab open with the push panel showing
- Has a slow FIDO2 hardware key interaction

...then when `PUT /challenge/:daId` or `GET /challenge/:daId/status` is called, PingOne returns a 404 or 410 (challenge not found / expired). Currently this surfaces as a generic error message.

Additionally, the "Resend code" button in the OTP modal calls `handleInitiateOtp()` which starts a **new** challenge (new `daId`) but the old `otpDaId` may still be in state briefly, causing a brief race condition.

## Solution

### Detect challenge expiry
In `_wrapError()` in `mfaService.js`, detect `status === 404` or `status === 410` and set `err.code = 'challenge_expired'`.

In `mfa.js` routes, surface as `{ error: 'challenge_expired', message: 'Verification session expired. Please start again.' }`.

### UI: auto-restart on challenge_expired
In `UserDashboard.js` across all MFA challenge completions (OTP, TOTP, push polling, FIDO2):
- If response contains `error === 'challenge_expired'` (or 404 status):
  - Close current modal
  - Call `handleInitiateOtp()` to start a fresh challenge
  - Show `notifyInfo('Verification session expired — sending a new code...')`
  - This auto-recovers without the user having to diagnose the problem

### Resend OTP race condition fix
`handleInitiateOtp()` should reset `otpDaId` / `otpDeviceId` to `null` before the async POST, so any in-flight PUT with the old `daId` gets ignored if it resolves after the new challenge starts. (Low priority — the BFF will simply return an error for the stale daId.)

## Files to change
- `banking_api_server/services/mfaService.js` — `_wrapError()`: `status 404/410 → err.code = 'challenge_expired'`
- `banking_api_server/routes/mfa.js` — error handlers: surface `challenge_expired` code
- `banking_api_ui/src/components/UserDashboard.js` — all MFA catch blocks: detect `challenge_expired`, close modal, auto-restart via `handleInitiateOtp()`
