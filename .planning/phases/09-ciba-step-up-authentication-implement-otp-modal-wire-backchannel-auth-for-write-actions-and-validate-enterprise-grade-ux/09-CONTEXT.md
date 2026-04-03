---
phase: 09-ciba-step-up-authentication-implement-otp-modal-wire-backchannel-auth-for-write-actions-and-validate-enterprise-grade-ux
created: 2026-04-03
method: discuss
---

# Phase 9 — CIBA Step-Up Authentication: Discussion Context

## Goal

Wire agent-triggered step-up to auto-initiate (CIBA push or OTP email) without requiring a manual button click. Change the default step-up method to email/OTP. Extend 428 step-up to `get_sensitive_account_details`. Make the step-up threshold configurable in Admin Config. Polish the approval UX — fix stale toast copy and add a method-specific confirmation card in the agent thread.

## Background

CIBA is substantially implemented: `cibaService.js`, `cibaEnhanced.js`, `routes/ciba.js` (244 lines), `CIBAPanel.js` (687 lines), `TransactionConsentModal.js` (524 lines with full OTP state machine).

The critical gap: when the agent dispatches `agentStepUpRequested`, `UserDashboard.js`'s `onAgentStepUp` listener sets `agentTriggeredStepUp=true` and `stepUpRequired=true` but does **not** call `handleCibaStepUp()`. The user must manually click "Verify via CIBA" or "Verify now" before the agent can retry. This is the core fix.

A secondary gap: the post-approval toast says "Identity verified — please retry your transaction." even though the agent retries automatically — stale copy that misleads users.

## Codebase Archaeology

| File | Key Fact |
|------|----------|
| `banking_api_ui/src/components/UserDashboard.js` | `onAgentStepUp` sets state but never calls `handleCibaStepUp()` — the auto-initiate gap |
| `banking_api_ui/src/components/UserDashboard.js` | `handleCibaStepUp()` at ~line 365 — POSTs to `/api/auth/ciba/initiate` |
| `banking_api_ui/src/components/UserDashboard.js` | Poll loop (5s) + `agentTriggeredStepUp` guard routes completion to agent vs manual toast |
| `banking_api_ui/src/components/BankingAgent.js` | `pendingStepUpActionRef` saved on 428; `onStepUpApproved` listener retries via `runAction()` |
| `banking_api_ui/src/components/BankingAgent.js` | Line ~1568: 428/step_up_required handler dispatches `agentStepUpRequested` |
| `banking_api_ui/src/components/TransactionConsentModal.js` | Full OTP state machine (otpStep, otpCode, otpSent, otpFallbackCode, otpError, otpVerifying, otpExpiresAt) |
| `banking_api_ui/src/components/SensitiveConsentBanner.js` | Pre-authorization consent banner to be replaced by proper 428 step-up |
| `banking_api_server/routes/transactions.js` | Lines ~321-328: 428 at ~$250 threshold, reads `step_up_method` from configStore |
| `banking_api_server/routes/ciba.js` | Complete CIBA routes mounted at `/api/auth/ciba` — no changes needed |

## Decisions

### D-01: Auto-initiate on agent step-up
When the agent triggers step-up (via `agentStepUpRequested` event), auto-initiate the configured method with a **3-second countdown + Cancel button**. Implementation: inside `onAgentStepUp` listener in `UserDashboard.js`, store a `setTimeout(() => handleCibaStepUp(), 3000)` via a cancellable ref (`autoInitiateTimerRef`). The countdown is surfaced in the step-up UI so users can cancel before initiation.

### D-02: Replace SensitiveConsentBanner with 428 step-up
`get_sensitive_account_details` (and the corresponding `GET /api/accounts/:id/details` BFF route) should issue a 428 step-up challenge — same flow as high-value transactions. `SensitiveConsentBanner.js` is replaced by this proper challenge. The agent's 428 handler in `BankingAgent.js` already handles this path; the BFF route needs to be wired to emit 428 instead of relying on the consent banner.

### D-03: Threshold configurable in Admin Config
The step-up dollar threshold (currently ~$250 hardcoded in `transactions.js`) must be configurable from the Admin Config page alongside the existing `step_up_method` toggle. Default remains $250. Store as `step_up_threshold` in `configStore`.

### D-04: Symmetric auto-initiate for OTP
OTP/email method gets the same auto-initiate treatment as CIBA — 3-second countdown + Cancel button, same UX pattern. The method determines which API is called; the countdown/cancel behavior is identical.

### D-05: Method-specific agent messages
After step-up is initiated, the agent thread message must be method-specific:
- CIBA: *"CIBA push sent to your device — waiting for approval…"*
- OTP/email: *"Email OTP sent to [email] — waiting for verification…"*

The current generic message ("CIBA push approval or MFA redirect") must be replaced in `BankingAgent.js`.

### D-06: OTP/email is the new default
Change the default `step_up_method` in `configStore` from `'ciba'` to `'email'`. CIBA remains available as an opt-in configuration. This reflects the typical deployment reality where email OTP has wider availability.

### D-07: Both — fix stale toast + add agent confirmation card
Two-part approval UX improvement:
1. **Fix stale toast**: Change the dashboard success toast from "Identity verified — please retry your transaction." to "Identity verified — resuming agent request…" (when `agentTriggeredStepUp` is true; keep original copy for manual user flows)
2. **Agent confirmation card**: After approval and before the retry, BankingAgent.js posts a distinct inline confirmation message: `✅ [Method] approved — continuing your request` with method name and timestamp. This fires between receiving `cibaStepUpApproved` / OTP verified and calling `runAction()`.

## Deferred Ideas

- Device-bound CIBA (non-email push to authenticator app) — non-trivial PingOne config
- Step-up for non-agent user-initiated actions (e.g., changing password) — separate phase
- Biometric step-up / WebAuthn integration — separate phase
- Per-account sensitivity tiers (not just dollar threshold) — separate phase

## Claude's Discretion

- Cancellable timer ref: use `useRef` for `autoInitiateTimerRef`; clear it in the Cancel handler and in component cleanup
- Countdown display: match existing toast/banner visual style; plain text "Starting in 3s… Cancel" is sufficient
- Confirmation card: small inline message component in agent thread; can reuse existing message styling from `BankingAgent.js` — no new component file needed
- OTP method display in confirmation uses the verified email from session/userinfo if available, otherwise "[your email]"
