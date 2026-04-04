# Phase 53: Debug, Testing & Bug Fixes for Phase 52 MFA Step-Up — Context

**Gathered:** 2026-04-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Fix five known gaps and edge cases from Phase 52 MFA implementation. No new features beyond what is explicitly listed below. Changes are confined to `banking_api_server` and `banking_api_ui/src/components/UserDashboard.js`. No changes to PingOne environment, DaVinci, Vercel config, or marketing pages.

In scope:
1. `stepUpVerified` TTL — replace boolean with timestamp; add logout clear
2. Stale `daId` / challenge-expired recovery — friendly error + retry in UI
3. Access token expiry mid-MFA — detect 401, silent refresh via refresh_token, retry
4. No MFA devices enrolled — auto-enroll email as default + offer FIDO2/passkey enrollment choice
5. Withdrawals always require step-up — new admin toggle `stepUpWithdrawalsAlways`, default true

Out of scope:
- Replacing the `deviceAuthentications` policy-based approach with direct p1mfa APIs (future phase)
- draw.io flow diagrams (separate todo)
- Education panel updates for Phase 52 MFA
- FIDO2 device registration via PingOne Management API (enrollment offer UI only; actual passkey WebAuthn registration is out unless trivially piggybacked on existing Fido2Challenge code)

</domain>

<decisions>
## Implementation Decisions

### G-01 — stepUpVerified TTL
- **D-01:** Replace `req.session.stepUpVerified = true` in `ciba.js` with `req.session.stepUpVerified = Date.now() + 5 * 60 * 1000` (5-minute window)
- All checks (`mcpLocalTools.js:52`, `mcpInspector.js:125`, any other location) change from strict `=== true` to `stepUpVerified > Date.now()`
- Consume (single-use) in `mcpLocalTools.js` stays — set to 0 after use rather than `false` so timestamp comparison still works
- Logout route clears `stepUpVerified` explicitly (`delete req.session.stepUpVerified` or set `= 0`)
- **No new config needed** — 5 min is hardcoded constant `STEP_UP_TTL_MS = 5 * 60 * 1000`

### G-02 — Stale daId / challenge expired
- **D-02:** `_wrapError` in `mfaService.js` detects `err.response.status === 404 || 410` and attaches `e.code = 'challenge_expired'`
- BFF routes (`PUT /challenge/:daId`, `GET /challenge/:daId/status`) propagate `challenge_expired` in JSON response
- UI (`UserDashboard.js`) checks `data.error === 'challenge_expired'` in catch blocks for OTP submit, TOTP submit, push polling, FIDO2 assertion
- On detection: show inline message "Your MFA session expired" + a **"Try again"** button that calls `handleInitiateOtp()` to restart from scratch
- No auto-restart — user action required (avoids infinite loop on persistent failures)

### G-03 — Access token expiry mid-MFA
- **D-03:** `_wrapError` detects `err.response.status === 401` and attaches `e.code = 'token_expired'`
- BFF `/api/auth/mfa` routes: when service throws `token_expired`, attempt a **silent token refresh** using the session `refresh_token` (same pattern as existing `/api/auth/refresh` logic in `authService`)
- If refresh succeeds: retry the original PingOne MFA API call once with the new token, return normal result
- If refresh fails (refresh token missing/expired): return `{ error: 'session_expired', message: 'Your session has expired. Please log in again.' }` with HTTP 401
- UI catch: on HTTP 401 `session_expired` → redirect to `/` (login page) after a 2s toast "Session expired — please sign in again"
- **One retry only** — no recursive refresh loop

### G-04 — No MFA devices enrolled
- **D-04:** When `initiateDeviceAuth` returns `DEVICE_SELECTION_REQUIRED` with `devices = []`:
  - BFF returns `{ error: 'no_devices_enrolled' }` with HTTP 422
  - UI shows an enrollment-choice panel (not an error modal) with two buttons:
    - **"Use Email OTP"** — calls new BFF endpoint `POST /api/auth/mfa/enroll/email` which calls PingOne MFA Management API to add an email device for the user, then auto-initiates a challenge
    - **"Register a Passkey / FIDO2"** — calls new endpoint `POST /api/auth/mfa/enroll/fido2-init` which calls PingOne to initiate FIDO2 registration; UI passes response to `navigator.credentials.create()`, then POSTs assertion to `POST /api/auth/mfa/enroll/fido2-complete`
  - After enrollment succeeds, immediately re-initiate the MFA challenge (seamless flow — user enrolls and authenticates in one step)
  - Enrollment endpoints use the **worker token** (client_credentials), not user token — since the user token may not have device write scope
  - PingOne API for email enrollment: `POST /environments/{envId}/users/{userId}/mfaDevices` with `{ type: 'EMAIL', email: user.email }`
  - PingOne API for FIDO2 registration initiation: `POST /environments/{envId}/users/{userId}/fido2/registrations` (or MFA devices FIDO2 path per PingOne docs)

### G-05 — Withdrawals always require step-up
- **D-05:** Add new Runtime Settings toggle: `stepUpWithdrawalsAlways` (boolean, default: `true`)
- Stored in `runtimeSettings` alongside existing `stepUpEnabled`, `stepUpAmountThreshold`, etc.
- Logic: if `stepUpWithdrawalsAlways === true` AND transaction type is `withdrawal`, require step-up regardless of amount (skip threshold check)
- `transactions.js` and `mcpLocalTools.js` both apply this check
- Admin UI (`AdminDashboard.js` or wherever security settings are rendered) adds a toggle: **"All withdrawals require step-up"** with on/off switch
- Default `true` means the demo always shows step-up on withdrawal — realistic security posture

</decisions>

<deferred_ideas>
## Explicitly Out of Scope for Phase 53

- Migrating from `deviceAuthentications` policy to direct PingOne MFA APIs (requires research — separate todo)
- Education panel updates explaining MFA flow
- draw.io flow diagrams
- TOTP device enrollment (only OTP email + FIDO2 in G-04 scope)
- Push notification device enrollment
- STEP_UP_ACR_VALUE setup wizard prompt
- MFA documentation page addition

</deferred_ideas>
