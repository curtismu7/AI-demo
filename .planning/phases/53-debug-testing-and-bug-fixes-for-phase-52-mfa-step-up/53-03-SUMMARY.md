---
phase: 53-debug-testing-and-bug-fixes-for-phase-52-mfa-step-up
plan: "03"
subsystem: auth
tags: [mfa, enrollment, email-otp, fido2, webauthn, pingone, management-api]

requires:
  - phase: 53-01
    provides: mfaService._wrapError with e.code + worker token pattern

provides:
  - enrollEmailDevice(userId, email) — PingOne Management API POST /mfaDevices
  - initFido2Registration(userId) — PingOne Management API POST /fido2Devices
  - completeFido2Registration(userId, deviceId, attestation) — PingOne PUT /fido2Devices/:id
  - POST /api/auth/mfa/enroll/email BFF route
  - POST /api/auth/mfa/enroll/fido2-init BFF route
  - POST /api/auth/mfa/enroll/fido2-complete BFF route

affects: [53-04-ui-enrollment-panel]

tech-stack:
  added: []
  patterns:
    - "Enrollment uses worker token (management API) not user access token"
    - "Email enrolled via /mfaDevices with type: EMAIL; FIDO2 via /fido2Devices (separate endpoint)"
    - "FIDO2 init → browser navigator.credentials.create() → complete with attestation"

key-files:
  created: []
  modified:
    - banking_api_server/services/mfaService.js
    - banking_api_server/routes/mfa.js

key-decisions:
  - "All enrollment uses worker token (client_credentials) — not user access token"
  - "Email enrollment reads user email from req.session.user.email (already stored at login)"
  - "FIDO2 uses separate /fido2Devices endpoint (not /mfaDevices) per PingOne API"

patterns-established:
  - "Enrollment service functions follow same _wrapError / _getWorkerToken pattern as listMfaDevices"

requirements-completed: [BUG-04]

duration: 15min
completed: 2026-04-04
---

# Phase 53-03: Device Enrollment BFF Endpoints

**Three PingOne Management API enrollment functions and matching BFF routes — enables the UI enrollment panel (53-04) when a user has no MFA devices registered.**

## Performance

- **Duration:** ~15 min
- **Completed:** 2026-04-04T16:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Added `enrollEmailDevice`, `initFido2Registration`, `completeFido2Registration` to mfaService.js using worker token
- Added 3 enrollment routes to mfa.js: POST /enroll/email, POST /enroll/fido2-init, POST /enroll/fido2-complete
- All routes protected by `authenticateToken` middleware
- module.exports updated with all 9 mfaService functions

## Task Commits

1. **Task 1+2: mfaService enrollment functions + mfa.js enrollment routes** - `02bf0d8` (feat(53-03))

## Files Created/Modified

- `banking_api_server/services/mfaService.js` — added enrollEmailDevice, initFido2Registration, completeFido2Registration; updated module.exports
- `banking_api_server/routes/mfa.js` — added POST /enroll/email, POST /enroll/fido2-init, POST /enroll/fido2-complete routes
