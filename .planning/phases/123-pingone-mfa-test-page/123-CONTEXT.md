# Phase 123 Context — PingOne MFA Test Page

**Phase:** 123
**Created:** 2026-04-11
**Status:** Executing — bugs identified and being fixed

---

## Phase Goal

Create a comprehensive test page for PingOne MFA functionality that verifies device authentication flows (OTP, FIDO2, email), device enrollment, and device listing — using the real PingOne `deviceAuthentications` API.

---

## Decisions

### 1. MFA API pattern: deviceAuthentications (Auth API) vs Management API
**Decision:** Use both, each for their correct purpose:
- **`deviceAuthentications`** (Auth API via `auth.pingone.com`) — step-up MFA challenge flow (initiate, select device, submit OTP/FIDO2 assertion, poll status). Requires user's own access token.
- **Management API** (`api.pingone.com/v1`) — device enrollment (add device), list devices, delete device. Uses worker token.

### 2. Correct PingOne Management API endpoints for devices
**Decision (researched from PingOne SDK/code):**
- List devices: `GET /users/{userId}/devices?filter=(status eq "ACTIVE")` ✅ (already correct in `listMfaDevices`)
- Enroll email OTP: `POST /users/{userId}/devices` with `{ type: "EMAIL", email: "..." }` — **NOT `/mfaDevices`**
- Initiate FIDO2 registration: `POST /users/{userId}/devices` with `{ type: "FIDO2_PLATFORM" }` — **NOT `/fido2Devices`**
- Complete FIDO2 registration: `PUT /users/{userId}/devices/{deviceId}` — **NOT `/fido2Devices/{deviceId}`**

### 3. Devices listing route bug
**Decision:** `GET /api/mfa/test/integration/devices` must call `mfaService.listMfaDevices(userId)` (Management API — no policy ID required), NOT `initiateDeviceAuth` (which starts a new challenge session and requires PINGONE_MFA_POLICY_ID).

### 4. No PINGONE_MFA_POLICY_ID fallback
**Decision:** MFATestPage shows a clear warning banner when `mfaEnabled: false`. Tests that require a policy (step-up challenge) show as "skipped" with config instructions. Device listing and enrollment tests still run (they use Management API, not policy).

### 5. MFATestPage is already routed
Route: `/mfa-test` (AdminRoute) — confirmed in App.js line 507.

---

## Bugs Identified and Fixed

| # | Bug | File | Fix |
|---|-----|------|-----|
| 1 | `enrollEmailDevice` uses wrong endpoint `/mfaDevices` | `mfaService.js:203` | Change to `/devices` |
| 2 | `initFido2Registration` uses wrong endpoint `/fido2Devices` | `mfaService.js:223` | Change to `/devices` with `type: "FIDO2_PLATFORM"` |
| 3 | `completeFido2Registration` uses wrong endpoint `/fido2Devices/{id}` | `mfaService.js:246` | Change to `/devices/{id}` |
| 4 | `GET /integration/devices` calls `initiateDeviceAuth` instead of `listMfaDevices` | `mfaTest.js:418` | Call `listMfaDevices` |

---

## Canonical refs

- `banking_api_server/services/mfaService.js` — PingOne MFA API calls (all fixes here)
- `banking_api_server/routes/mfaTest.js` — MFA test routes (device list fix)
- `banking_api_ui/src/components/MFATestPage.jsx` — UI (check graceful no-policy handling)

---

*Status: executing — see bug fix log*
