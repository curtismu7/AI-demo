---
status: awaiting_human_verify
trigger: "Transferring $300 on Vercel triggers a full PingOne redirect (PKCE step-up flow) instead of an in-page OTP modal"
created: 2026-04-04T00:00:00Z
updated: 2026-04-04T00:00:00Z
---

## Current Focus
<!-- OVERWRITE on each update - reflects NOW -->

hypothesis: CONFIRMED — email OTP path does not exist; UserDashboard.js onAgentStepUp else-branch does window.location.href to PingOne PKCE redirect for all non-CIBA methods
test: n/a — root cause confirmed by reading all code paths
expecting: n/a
next_action: Implement fix — BFF OTP routes + mcpLocalTools session check + UI OTP modal

## Symptoms
<!-- Written during gathering, then IMMUTABLE -->

expected: When user initiates a $300 transfer, the agent shows an OTP modal inline in the page. User receives an email with a 6-digit code, enters it into the modal, and the transaction proceeds.
actual: The agent triggers a full PingOne redirect (OAuth login page appears). The user had to log in again on PingOne — no OTP was shown, no email was sent. After redirecting back, no MFA was enforced.
errors: No explicit error — just wrong flow (redirect instead of modal)
reproduction: Go to Vercel https://banking-demo-puce.vercel.app, log in as demo user, open agent, type "transfer $300", follow the flow
started: Has never worked correctly. Code paths for CIBA exist but STEP_UP_METHOD defaults to 'email' which apparently routes to a PKCE re-auth flow rather than a direct OTP challenge.

## Eliminated
<!-- APPEND only - prevents re-investigating -->

## Evidence

- timestamp: 2026-04-04
  checked: banking_api_server/routes/oauthUser.js  /stepup route
  found: GET /stepup ALWAYS does PKCE re-auth redirect to PingOne — there is no code branch for email OTP
  implication: The route cannot serve the email OTP purpose regardless of STEP_UP_METHOD

- timestamp: 2026-04-04
  checked: banking_api_server/services/mcpLocalTools.js checkLocalStepUp()
  found: Returns {step_up_required:true, step_up_method:'email'} but does NOT check session.stepUpVerified — no path to clear step-up gate after OTP verification
  implication: Even if OTP is verified, the next tool-call attempt would still trigger step-up again

- timestamp: 2026-04-04
  checked: banking_api_ui/src/components/UserDashboard.js onAgentStepUp (line 441)
  found: When method !== 'ciba', does `window.location.href = stepUpVerifyHrefRef.current || '/api/auth/oauth/user/stepup'` causing full page navigation to PingOne
  implication: This is the direct cause of the PingOne redirect — no inline OTP flow exists

- timestamp: 2026-04-04
  checked: banking_api_server/services/emailService.js
  found: sendOtpEmail(userId, opts) function already exists — sends OTP via PingOne Notifications API
  implication: Can reuse this for step-up OTP emails without any new email infrastructure

- timestamp: 2026-04-04
  checked: whole codebase for POST /initiate-otp or /verify-otp or session.pendingStepUpOtp
  found: None — no step-up OTP endpoints or session state exist anywhere
  implication: Both BFF endpoints and UI OTP modal must be created from scratch

## Resolution

root_cause: |
  No email OTP path exists for step-up authentication. When STEP_UP_METHOD=email:
  1. checkLocalStepUp() returns {step_up_required:true, step_up_method:'email'}
  2. BankingAgent.js dispatches 'agentStepUpRequested' with {step_up_method:'email'}
  3. UserDashboard.js onAgentStepUp handler (else-branch, non-CIBA) does window.location.href to /api/auth/oauth/user/stepup
  4. That GET /stepup route always initiates a PKCE re-auth redirect to PingOne — regardless of method
  The 'email' method was never implemented; it silently fell through to the PKCE redirect path.
fix: |
  1. Add POST /api/auth/oauth/user/initiate-otp to oauthUser.js — generate OTP, store in session.pendingStepUpOtp, send via emailService.sendOtpEmail
  2. Add POST /api/auth/oauth/user/verify-otp to oauthUser.js — verify OTP, set session.stepUpVerified=true
  3. Update checkLocalStepUp() in mcpLocalTools.js — if session.stepUpVerified===true, consume and allow through
  4. Update UserDashboard.js onAgentStepUp — for email method, call handleInitiateOtp() instead of window.location.href redirect
  5. Add OTP modal state and inline JSX to UserDashboard.js
verification:
files_changed:
  - banking_api_server/routes/oauthUser.js
  - banking_api_server/services/mcpLocalTools.js
  - banking_api_ui/src/components/UserDashboard.js
