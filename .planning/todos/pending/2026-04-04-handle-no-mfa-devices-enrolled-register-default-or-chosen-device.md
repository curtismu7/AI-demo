---
created: 2026-04-04T14:24:16.176Z
title: Handle no MFA devices enrolled — guide user through device registration flow
area: auth
files:
  - banking_api_server/services/mfaService.js
  - banking_api_server/routes/mfa.js
  - banking_api_ui/src/components/UserDashboard.js
---

## Problem

When `POST /api/auth/mfa/challenge` is called and the user has no MFA devices enrolled in PingOne, `mfaService.initiateDeviceAuth()` returns an empty `devices[]` array (or PingOne may return an error). The current code in `handleInitiateOtp` (UserDashboard.js) shows a hard error:

```
"No email MFA device enrolled. Please enroll an email device in PingOne."
```

This is a dead end for demo users who haven't gone through PingOne MFA enrollment. The demo should handle this gracefully by:
1. Detecting the empty-devices case
2. Offering to register a device inline (or selecting a default device type to enroll)
3. Walking the user through enrollment so they can then complete step-up

## Solution

### Option A: Auto-enroll a default device (email)
When `devices[]` is empty:
1. BFF: call PingOne Management API to enroll the user's email as an MFA device
   - `POST /environments/{envId}/users/{userId}/devices` with `{ type: 'EMAIL', value: user.email }`
   - Worker token (client_credentials), not user token
2. Re-initiate `deviceAuthentications` with the newly enrolled device
3. UI: show a toast "We've set up email verification for your account" → proceed into OTP modal

### Option B: Show a registration UI / picker
When `devices[]` is empty:
1. UI shows a "No MFA device registered" panel with options:
   - Register email (auto-uses account email)
   - Register TOTP (show QR code flow via PingOne MFA enrollment API)
   - Register passkey (FIDO2 registration WebAuthn flow)
2. After registration, re-initiate the challenge

### Recommended approach
Start with Option A (auto-enroll email) as the default since it's the lowest friction for demos. Option B is a stretch goal.

### Implementation notes
- `mfaService.listMfaDevices(userId)` already calls `GET /users/{userId}/devices` — use the same worker token pattern for PUT enrollment
- PingOne device enrollment endpoint: `POST /v1/environments/{envId}/users/{userId}/devices` — body: `{ type: 'EMAIL', value: '<email>' }` for email, or `{ type: 'TOTP' }` for TOTP (returns QR code seed)
- Add `enrollMfaDevice(userId, type, value)` to `mfaService.js`
- In `mfa.js` POST /challenge: if `mfaService.initiateDeviceAuth` throws or returns no devices, check `listMfaDevices` — if truly empty, call `enrollMfaDevice(userId, 'EMAIL', user.email)` then retry
- Return `{ enrolled: true, daId, devices[] }` so UI can show "Device registered and challenge sent"
