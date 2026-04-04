# Phase 52-05 Summary — FIDO2 WebAuthn Relay

**Committed:** 1613233  
**Status:** COMPLETE

## Changes Made

### `banking_api_ui/src/components/Fido2Challenge.js` — CREATED
- `formatAssertion(credential)` helper: base64-encodes WebAuthn binary response fields for PingOne relay
- `runFido2()` async flow on mount:
  1. Browser support check (`window.PublicKeyCredential`)
  2. GET `/api/auth/mfa/challenge/${daId}/status` → `publicKeyCredentialRequestOptions`
  3. `navigator.credentials.get({ publicKey: JSON.parse(options) })` — native browser prompt
  4. PUT `/api/auth/mfa/challenge/${daId}` with formatted assertion
  5. Checks `verifyResp.data.completed`; calls `onSuccess()` on COMPLETED
- Error handling: `NotAllowedError` (cancelled/timeout), `SecurityError` (RP mismatch), generic fallback
- Status states: `starting` → `waiting` → `error`; renders spinner during waiting
- Props: `{ daId, deviceId, onSuccess, onCancel, onError }`

### `banking_api_ui/src/components/UserDashboard.js`
- Import: `import Fido2Challenge from './Fido2Challenge'`
- State: `fido2ModalOpen`, `fido2DaId`, `fido2DeviceId`
- `handleFido2Challenge(daId, device)`: selects FIDO2 device via PUT, opens Fido2Challenge overlay
- `handleDevicePick` FIDO2 branch: calls `handleFido2Challenge` (replaces stub from 52-04)
- `handleInitiateOtp` FIDO2 branch: direct routing for single FIDO2 device (replaces show-picker fallback)
- JSX: `{fido2ModalOpen && <Fido2Challenge ... />}` with `onSuccess`/`onCancel`/`onError` callbacks

### `banking_api_ui/src/App.css`
- `.otp-step-up-modal--fido2` modifier (centered actions)

## Verification
```
test -f Fido2Challenge.js → ✅
grep "Fido2Challenge" UserDashboard.js → 7 refs ✅
grep "fido2ModalOpen" UserDashboard.js → 2 refs ✅
npm run build → Compiled successfully ✅
```
