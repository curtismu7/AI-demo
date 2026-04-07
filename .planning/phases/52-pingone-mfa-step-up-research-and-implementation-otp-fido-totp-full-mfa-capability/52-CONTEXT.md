# Phase 52: PingOne MFA Step-Up — Context

**Gathered:** 2026-04-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Implement full PingOne MFA step-up capability for the Super Banking demo — covering OTP (email), FIDO2/passkey, TOTP (authenticator app), and push notification. The BFF calls PingOne MFA APIs directly (no DaVinci) to list enrolled authenticators, initiate challenges, and verify responses. React renders native challenge UI for each factor type.

Also in scope:
- Wire all banking write operations (withdraw, transfer, deposit) to always require HITL consent + OTP step-up, configurable via Demo Config (default threshold = $0, always-on)
- Notify user via toast when PingOne SSO silently authenticates them without a credential prompt
- Complete the CIBA step-up → auto-submit transaction path (currently incomplete for write operations)
- Apply UI-SPEC enterprise styling to the standalone OTP step-up modal in UserDashboard.js
- Show full email address in OTP modal (remove server-side masking)

This phase does NOT include DaVinci flows, setup-wizard env var additions, or changes outside the banking_api_ui / banking_api_server boundary.

</domain>

<decisions>
## Implementation Decisions

### A — MFA Method Architecture
- **D-01:** Use **PingOne MFA Management APIs directly** — no DaVinci. BFF calls:
  - `GET /environments/{envId}/users/{userId}/mfaDevices` — list enrolled authenticators
  - `POST /environments/{envId}/users/{userId}/authentication` — initiate MFA challenge for a specific device
  - `PUT /environments/{envId}/users/{userId}/authentication/{authId}` — submit OTP/TOTP code
  - `POST /environments/{envId}/users/{userId}/authentication/{authId}` (passkey) — relay FIDO2 assertion
- The BFF worker token (client_credentials) is used for these calls — same pattern as existing `pingone-api-calls` skill
- React renders native challenge UI per factor:
  - **Email OTP** — existing `otpModalOpen` flow (restyled per UI-SPEC)
  - **TOTP** — 6-digit input + "Enter code from authenticator app" prompt
  - **FIDO2/Passkey** — calls `navigator.credentials.get()` with challenge from PingOne, sends assertion back to BFF
  - **Push notification** — "Waiting for approval on your device" polling panel (similar to CIBA panel)
- A new BFF route `/api/auth/mfa/challenge` handles the full challenge lifecycle; UI dispatches to the right component based on `deviceType` returned

### B — Step-Up Trigger Scope
- **D-02:** Step-up threshold becomes **configurable in Demo Config**, defaulting to **$0** (always-on for all write operations)
- `runtimeSettings.stepUpAmountThreshold` stays (just default changes); existing `stepUpEnabled` toggle keeps working
- All three write types (`transfer`, `withdrawal`, `deposit`) always trigger step-up when threshold is $0 — no amount exception
- The "all withdrawals require HITL + OTP regardless of amount" todo (folded) is satisfied by default=$0 behaviour

### C — CIBA Auto-Submit
- **D-03:** CIBA step-up completion uses **client-side polling** (architecture constraint — Vercel serverless can't hold persistent inbound WebSocket connections)
- React polls `/api/auth/ciba/poll/:auth_req_id` every 2–3s (existing `cibaStatus` polling already partially wired)
- On `status: 'approved'` response, client automatically re-fires the blocked tool call (withdraw/transfer) without user interaction
- The BFF `/api/auth/ciba/poll/:id` route must exchange the approved CIBA token and set `req.session.stepUpVerified = true` before returning `approved` — so the re-fired tool call passes `checkLocalStepUp` on the first attempt

### D — Silent SSO Notification
- **D-04:** Show a **toast notification** when PingOne silently re-authenticates the user (no credential prompt shown)
- Detection: compare `auth_time` claim in the new ID token against `Date.now()` — if `auth_time` is more than ~5 seconds older than the OAuth callback handling time, it was a silent return
- Toast message: `"Signed in automatically — PingOne recognized your existing session"`
- Toast type: info (not warning) — this is expected SSO behaviour, not an error
- Dismiss automatically after 5s (standard `notifyInfo` call)
- The check happens in `/callback` route after token decode

### UI Styling (from UI-SPEC, 2026-04-04)
- **D-05:** Standalone OTP step-up modal (`{otpModalOpen}` in `UserDashboard.js`) gets new dedicated CSS class set: `.otp-step-up-overlay`, `.otp-step-up-modal`, etc. — do NOT reuse `.token-modal` (wrong sizing) or `dashboard-toast-error__btn` (toast action, not form button)
- **D-06:** Full email shown in OTP modal — server returns `email:` (not `maskedEmail:`); client state renamed `otpEmail`
- All other MFA challenge UIs (TOTP, FIDO2, push) follow the same card pattern: `max-width: 420px`, white card, `#1e3a8a` primary button, `border: 1px solid #e2e8f0` border

### Agent's Discretion
- Which PingOne MFA API version/endpoint to use for passkey assertion relay (subject to research)
- Whether to create a dedicated `mfaService.js` in `banking_api_server/services/` or extend existing routes
- Exact polling interval for push notification waiting panel
- Education panel updates for MFA flows (content wording, sequence diagram updates)
- Error handling for "no MFA devices enrolled" state (toast + link to enroll, or inline message)
- Whether TOTP and FIDO2 challenges use the same `/api/auth/mfa/challenge` route or separate routes

### Folded Todos
- **[score 0.9] All withdrawals require HITL consent and OTP step-up regardless of amount** — satisfied by D-02 (default threshold $0, all write types covered)
- **[score 0.9] Notify user when PingOne SSO silently signs them in without credential prompt** — satisfied by D-04 (toast on `auth_time` delta detection in callback)
- **[score 0.7] Wire CIBA step-up OTP modal for banking write actions** — satisfied by D-03 (CIBA polling auto-submit path completed)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### PingOne API Patterns (this codebase)
- `.github/skills/pingone-api-calls/SKILL.md` — worker token pattern, Management API call pattern, CIBA service usage
- `.github/skills/oauth-pingone/SKILL.md` — ACR values, step-up, token claims, callback handling

### Existing Step-Up Implementation
- `banking_api_server/routes/oauthUser.js` §568–620 — existing ACR step-up redirect + §802–892 — `initiate-otp` and `verify-otp` routes
- `banking_api_server/services/mcpLocalTools.js` §42–65 — `checkLocalStepUp()` — the gate that blocks tool calls and triggers step-up
- `banking_api_server/config/runtimeSettings.js` — `stepUpAmountThreshold`, `stepUpMethod`, `stepUpEnabled`, `stepUpAcrValue`
- `banking_api_server/routes/ciba.js` — CIBA initiate + poll routes
- `banking_api_server/services/cibaService.js` — CIBA service (initiateBackchannelAuth, pollForTokens)

### UI Step-Up Implementation
- `banking_api_ui/src/components/UserDashboard.js` §81–603 — all step-up state, CIBA polling, OTP modal, step-up toast banner
- `banking_api_ui/src/components/TransactionConsentModal.js` — reference implementation for HITL + OTP combined flow
- `banking_api_ui/src/components/TransactionConsentPage.css` — `.tx-otp-panel`, `.transaction-consent-btn` — reference styling to match

### UI Design Contract
- `.planning/phases/52-pingone-mfa-step-up-research-and-implementation-otp-fido-totp-full-mfa-capability/52-UI-SPEC.md` — approved enterprise styling spec for MFA modals

### Project Constraints
- `REGRESSION_PLAN.md` §1 — protected areas; read before touching auth, session, or CIBA routes
- `banking_api_server/.env.example` — env var naming conventions

### PingOne MFA API (external — researcher must fetch current docs)
- PingOne MFA APIs: `https://developer.pingone.com/pingone-api/mfa/` — device list, authentication initiate/verify endpoints (new canonical URL; old: apidocs.pingidentity.com)
- FIDO2 Web Authentication spec: `navigator.credentials.get()` → assertion relay pattern

</canonical_refs>

<specifics>
## Specific Ideas

- The BFF already has a `getManagementToken()` worker-token pattern in `pingone-api-calls` SKILL.md — MFA API calls reuse this exact pattern
- For FIDO2: BFF receives the PingOne challenge, sends `publicKeyCredentialRequestOptions` to the client; client calls `navigator.credentials.get()`; BFF relays the signed assertion back to PingOne `/authentication/{authId}` endpoint
- Push notification waiting state should reuse the visual pattern from `CIBAPanel.js` "waiting for approval" — spinning indicator, binding message shown, cancel button
- Silent SSO detection fires in the `/callback` route handler (same place ACR is decoded); `auth_time` is in both ID token and access token claims — use whichever is available
- Default `stepUpAmountThreshold` change is a one-line edit in `runtimeSettings.js` (line ~14: `parseFloat(process.env.STEP_UP_AMOUNT_THRESHOLD) || 250` → `|| 0`)

</specifics>

<deferred>
## Deferred Ideas

- DaVinci flow for MFA — explicitly out of scope per user decision; use PingOne MFA APIs directly
- STEP_UP_ACR_VALUE in setup wizard (Phase 49 scope)
- BFF WebSocket push for CIBA approval (architecture constraint: Vercel serverless)
- SMS OTP via PingOne — not mentioned and adds phone number dependency; separate phase if needed
- MFA device enrollment UI (registering new FIDO2/TOTP keys) — reading devices only, not enrolling new ones in this phase

</deferred>

---

*Phase: 52-pingone-mfa-step-up-research-and-implementation-otp-fido-totp-full-mfa-capability*
*Context gathered: 2026-04-04 via /gsd-discuss-phase*
