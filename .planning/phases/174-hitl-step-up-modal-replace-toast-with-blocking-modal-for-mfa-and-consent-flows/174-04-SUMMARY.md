---
phase: 174-hitl-step-up-modal
plan: 04
completed: true
status: success
work_log:
  - "OtpStepUpModal P1MFA mode implemented in combined commit with 174-03"
  - "mode='p1mfa' enables multi-step flow: device picker -> OTP/push/FIDO -> complete"
  - "Device picker shows enrolled devices with type icons"
  - "OTP step: 6-digit input with PingOne PUT validation"
  - "Push step: polls /status every 3s, 60s timeout, handles PUSH_CONFIRMATION_TIMED_OUT"
  - "FIDO step: fetches publicKeyCredentialRequestOptions, calls navigator.credentials.get()"
  - "Error handling: 410 (expired), network errors, generic fallback"
  - "BankingAgent P1MFA initiation: POST /api/auth/mfa/challenge on step_up_method=p1mfa"
  - "Falls back to stub mode on P1MFA initiation failure"
  - "handleP1MfaComplete retries original action after COMPLETED status"
  - "All P1MFA state (daId, devices, mode) cleaned up on cancel/complete"
  - "Build passes with zero new warnings"
git_commits:
  - "76ed2b5: feat(174-03): FIDO2 passkey modal + method toggle in OtpStepUpModal (includes 174-04 implementation)"
---

# Plan 174-04: PingOne MFA Wiring

**Status:** ✅ COMPLETE

## What Was Built

Wired PingOne MFA (`/api/auth/mfa/challenge`) into the step-up modal so OTP verification goes through PingOne's deviceAuthentications API instead of the client-only stub.

### Key Implementation

**1. OtpStepUpModal P1MFA Mode** (`mode="p1mfa"`)
- Internal state machine: `pick-device` → `otp` | `push` | `fido` → complete/error
- **Device Picker**: Lists enrolled devices from PingOne with icons (📧 email, 🔢 TOTP, 🔑 FIDO2, 📱 push)
- **OTP Flow**: PUT `/api/auth/mfa/challenge/:daId` with `{deviceId, otp}` → completed
- **Push Flow**: Poll GET `/api/auth/mfa/challenge/:daId/status` every 3s (60s max) → completed/timeout
- **FIDO Flow**: Fetch `publicKeyCredentialRequestOptions`, call `navigator.credentials.get()`, PUT assertion
- **Error Handling**: 410 → "MFA session expired", network failures, graceful fallback to device picker

**2. BankingAgent P1MFA Wiring**
- On `step_up_method=p1mfa`: POST `/api/auth/mfa/challenge` to initiate
- Store `daId`, `devices` from response
- Pass to OtpStepUpModal as `mode="p1mfa"` with P1MFA props
- On initiation failure: fallback to stub mode with console warning
- `handleP1MfaComplete`: retries original action after PingOne COMPLETED

**3. Preservation of Stub Behavior**
- `step_up_method=email` (default): unchanged stub OTP modal
- `mode="stub"` is default — no P1MFA code paths activated unless explicitly signaled

### API Integration Points

| Endpoint | Method | Usage |
|----------|--------|-------|
| `/api/auth/mfa/challenge` | POST | Initiate deviceAuthentication |
| `/api/auth/mfa/challenge/:daId` | PUT | Select device / submit OTP / submit assertion |
| `/api/auth/mfa/challenge/:daId/status` | GET | Poll push status / get FIDO options |

## Acceptance Criteria

✅ P1MFA flow works: initiate → device picker → OTP/FIDO/push → COMPLETED → action retries
✅ Stub behavior unchanged when step_up_method ≠ p1mfa
✅ Graceful fallback on P1MFA initiation failure
✅ Push polling capped at 60s with 3s interval
✅ 410 (challenge expired) handled with user-friendly message
✅ All P1MFA state cleaned up on cancel/complete
✅ Build passes with no new warnings

## Files Modified

| File | Changes |
|------|---------|
| `banking_api_ui/src/components/OtpStepUpModal.js` | P1MFA mode (device picker, OTP, push, FIDO, error steps) |
| `banking_api_ui/src/components/BankingAgent.js` | P1MFA initiation, completion handler, state management |
| `banking_api_ui/src/App.css` | Device picker CSS classes |
