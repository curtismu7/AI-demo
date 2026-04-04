# Phase 52-04 Summary — TOTP + Push + Device Picker

**Committed:** 0548d73  
**Status:** COMPLETE

## Changes Made

### `banking_api_ui/src/components/UserDashboard.js`
**State added:**
- TOTP: `totpModalOpen`, `totpDaId`, `totpDeviceId`, `totpCode`, `totpError`, `totpSubmitting`
- Push: `pushModalOpen`, `pushDaId`, `pushPolling`
- Device picker: `devicePickerOpen`, `devicePickerDevices`, `devicePickerDaId`

**`handleInitiateOtp` rewired** to route by device type:
- 1 device: EMAIL/SMS → OTP modal; TOTP → `handleTotpChallenge`; MOBILE → `handlePushChallenge`; FIDO2 → stub (52-05); multiple → device picker
- Removed hardcoded auto-select EMAIL; now handles all PingOne device types

**New functions:**
- `handleDevicePick(device)` — routes from device picker to correct handler
- `handleTotpChallenge(daId, device)` — selects TOTP device, opens TOTP modal
- `handleTotpSubmit()` — PUT `/api/auth/mfa/challenge/${totpDaId}` with OTP; success path fires `cibaStepUpApproved`
- `handlePushChallenge(daId, device)` — selects push device, starts polling
- Push polling `useEffect` — polls GET `/api/auth/mfa/challenge/${pushDaId}/status` every 3s; handles COMPLETED / TIMED_OUT
- Ref sync effects for `handleTotpChallengeRef` and `handlePushChallengeRef`

**JSX added:**
- TOTP modal with authenticator app instruction + 6-digit input
- Device picker overlay with per-device type buttons + emoji
- Push waiting panel with spinner + "Tap Approve" instruction + Cancel

### `banking_api_ui/src/App.css`
- `.push-waiting-spinner` + `@keyframes push-spin`
- `.otp-step-up-modal--totp` modifier (neutral strong color)
- `.otp-step-up-modal--push` modifier (centered actions)

## Verification
```
grep -c "totpModalOpen|pushModalOpen|devicePickerOpen..." → 16 refs ✅
grep "push-waiting-spinner" App.css → present ✅
npm run build → Compiled successfully ✅
```
