---
status: testing
phase: 09-ciba-step-up-authentication-implement-otp-modal-wire-backchannel-auth-for-write-actions-and-validate-enterprise-grade-ux
source:
  - 09-01-SUMMARY.md
  - 09-02-SUMMARY.md
  - 09-03-SUMMARY.md
  - 09-04-SUMMARY.md
  - 09-05-SUMMARY.md
started: 2026-04-03T00:00:00Z
updated: 2026-04-03T01:00:00Z
---

## Current Test

number: 2
name: Agent triggers countdown toast (email method)
expected: |
  With the banking agent open and step-up method set to email (now the default): ask the agent to transfer $300 or more. The dashboard warning toast should appear showing "Redirecting in 3s…" with a Cancel button — NOT the old static "Verify now" link.
awaiting: user response

## Tests

### 1. Cold Start Smoke Test
expected: Kill any running banking_api_server process. Start it fresh. Server boots without errors.
result: pass

### 2. Agent triggers countdown toast (email method)
expected: |
  With the banking agent open and step-up method set to email (now the default): ask the agent to transfer $300 or more. The agent calls the BFF, gets a 428 step_up_required back, and fires agentStepUpRequested. The dashboard warning toast should appear showing "Redirecting in 3s…" with a Cancel button — NOT the old static "Verify now" link.
result: [pending]

### 3. Cancel stops countdown
expected: |
  While the "Redirecting in Ns…" or "Starting in Ns…" countdown is visible, click the Cancel button. The countdown disappears and the toast reverts to the standard "Verify now" link (email) or "Verify via CIBA" button (CIBA). No redirect or CIBA initiation fires.
result: [pending]

### 4. Auto-redirect fires after 3 seconds (email)
expected: |
  Trigger agent step-up (email method, transfer ≥$250). Let the countdown run to 0 without clicking Cancel. After 3 seconds the browser automatically navigates to the PingOne step-up/re-auth URL — no button click required.
result: [pending]

### 5. Agent thread shows email-specific message
expected: |
  When the 428 step-up triggers via the agent (email method), the agent chat thread displays: "🔐 Additional verification required. Email OTP sent to your registered email — waiting for verification…" — NOT the old generic "CIBA push approval or MFA redirect" text.
result: [pending]

### 6. Agent thread shows CIBA-specific message
expected: |
  Switch step-up method to CIBA (via Admin Config or runtimeSettings). Trigger agent step-up. The agent thread displays: "🔐 Additional verification required. CIBA push sent to your device — waiting for approval…"
result: [pending]

### 7. Admin Config shows Step-up threshold field
expected: |
  Go to Admin Config → Step-Up Authentication section. Alongside the existing "Step-up method" dropdown, there is a new "Step-up threshold ($)" number input with placeholder "250". Changing the value and saving takes effect — transactions below the new threshold no longer trigger step-up.
result: [pending]

### 8. Default step-up method is email
expected: |
  In Admin Config → Step-Up Authentication, the "Step-up method" dropdown defaults to "Email / OTP — OIDC re-authentication redirect" (not CIBA) on a fresh config load / reset.
result: [pending]

### 9. Agent requesting sensitive details triggers step-up (not consent banner)
expected: |
  Ask the agent: "Show me my full account number." Without elevated ACR, the agent thread should show a step-up message (same as transfer flow) rather than the old "🔒 Access approval needed to view sensitive account details." consent banner. No SensitiveConsentBanner UI should appear anywhere.
result: [pending]

## Summary

total: 9
passed: 1
issues: 0
skipped: 0
blocked: 0
pending: 8

## Gaps

[none yet]
