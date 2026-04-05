---
status: fixing
trigger: "step-up-strategy-pkce-redirect-vs-ciba-otp"
created: 2026-04-04T00:00:00Z
updated: 2026-04-04T00:10:00Z
---

## Current Focus
<!-- OVERWRITE on each update - reflects NOW -->

hypothesis: CONFIRMED — step-up uses PKCE redirect because STEP_UP_METHOD defaults to 'email'. CIBA infrastructure is fully implemented but not activated in Vercel env.
test: Verified by tracing code path: configStore default='email', runtimeSettings fallback='email', transactions.js fallback='ciba' never reached.
expecting: Setting STEP_UP_METHOD=ciba + CIBA_ENABLED=true in Vercel will switch the full in-page CIBA flow.
next_action: Document full fix — env vars to set + PingOne CIBA grant type requirement

## Symptoms
<!-- Written during gathering, then IMMUTABLE -->

expected: When a high-value transfer (≥$250) is triggered by the agent, the user should be challenged with MFA — ideally an OTP sent to their email/phone WITHOUT leaving the current page.
actual: The app redirects the user to PingOne's sign-on page (full page navigation away from the dashboard). No OTP is prompted because Multi_Factor policy isn't assigned to the app. User just has to log in again with password only.
errors: No code error — architectural/UX issue.
reproduction: On Vercel — log in, ask agent to "transfer $300", step-up fires, browser redirects to PingOne login page, no OTP challenge.
started: April 4, 2026. Phase 09 was supposed to implement CIBA step-up with OTP modal. Current Vercel deployment uses email/redirect method (not CIBA).

## Eliminated
<!-- APPEND only - prevents re-investigating -->


## Evidence
<!-- APPEND only - facts discovered -->

- timestamp: 2026-04-04T00:02:00Z
  checked: banking_api_server/config/runtimeSettings.js line 18
  found: stepUpMethod defaults to process.env.STEP_UP_METHOD || 'email'
  implication: Without STEP_UP_METHOD=ciba in env, all step-up 428 responses include step_up_method='email'

- timestamp: 2026-04-04T00:02:00Z
  checked: banking_api_server/services/configStore.js line 143
  found: step_up_method has default:'email' and maps to env var STEP_UP_METHOD (line 424)
  implication: configStore.getEffective('step_up_method') returns 'email' unless STEP_UP_METHOD env is set

- timestamp: 2026-04-04T00:03:00Z
  checked: banking_api_server/routes/transactions.js line 323
  found: const stepUpMethod = configStore.getEffective('step_up_method') || runtimeSettings.get('stepUpMethod') || 'ciba'
  implication: The final fallback is 'ciba' — but it is NEVER reached because configStore always returns 'email' (its default). So step_up_method='email' is always sent in the 428.

- timestamp: 2026-04-04T00:04:00Z
  checked: banking_api_ui/src/components/UserDashboard.js lines 440-465
  found: onAgentStepUp handler: if method==='ciba' calls handleCibaStepUp(); else does window.location.href redirect to /api/auth/oauth/user/stepup
  implication: The UI has BOTH paths fully implemented. 'email' method triggers a full page redirect. 'ciba' method stays in-page.

- timestamp: 2026-04-04T00:04:00Z
  checked: banking_api_server/routes/ciba.js + services/cibaService.js
  found: Complete CIBA implementation — POST /api/auth/ciba/initiate calls PingOne /bc-authorize using admin client credentials; GET /api/auth/ciba/poll/:authReqId polls for token; tokens stored server-side in session.
  implication: CIBA flow is fully implemented for user step-up. It uses admin app credentials (oauthConfig.clientId = admin_client_id) to call PingOne bc-authorize with user's email as login_hint.

- timestamp: 2026-04-04T00:05:00Z
  checked: banking_api_ui/src/components/BankingAgent.js lines 1057-1069
  found: Listens for 'cibaStepUpApproved' window event; retries pending action (actionId, form) with method label 'CIBA' or 'Email OTP'
  implication: Agent auto-retry after CIBA approval is implemented. User stays on dashboard throughout.

- timestamp: 2026-04-04T00:06:00Z
  checked: banking_api_server/routes/oauthUser.js lines 576-614 (/stepup route)
  found: GET /stepup always does a PKCE redirect to PingOne with acr_values=STEP_UP_ACR_VALUE. No CIBA branch. The /stepup route is ONLY for the email/redirect path.
  implication: CIBA is NOT wired into /stepup — it's a completely separate path. CIBA step-up flows through /api/auth/ciba/initiate (not /stepup). The two methods are parallel, not shared.

- timestamp: 2026-04-04T00:07:00Z
  checked: banking_api_server/routes/oauthUser.js stepup acr_values handling
  found: acrValue = process.env.STEP_UP_ACR_VALUE (defaults to 'Multi_Factor'). PingOne shows no OTP because the user-facing app (Super Banking user app) does NOT have the Multi_Factor sign-on policy assigned — PingOne falls back to Single_Factor (password only).
  implication: This confirms why PKCE redirect shows no OTP. Single_Factor policy = password prompt only, no MFA step. CIBA avoids this issue entirely (backchannel, no SSO policy dependency).

- timestamp: 2026-04-04T00:08:00Z
  checked: banking_api_server/config/oauth.js lines 24-25,29
  found: cibaService uses admin_client_id + admin_client_secret for bc-authorize. CIBA endpoint = PingOne /bc-authorize.
  implication: CIBA grant type must be enabled on the ADMIN PingOne app (not the user app). This is a separate PingOne config step.

## Resolution
<!-- OVERWRITE as understanding evolves -->

root_cause: |
  Two-part root cause:
  1. STEP_UP_METHOD env var is not set (or set to 'email') → BFF 428 response always includes step_up_method='email'
     → UI triggers full PKCE redirect instead of in-page CIBA flow.
     The configStore default for step_up_method is 'email'; the || 'ciba' fallback in transactions.js is
     unreachable because configStore always returns the non-falsy default 'email'.
  2. Even when PKCE redirect fires, PingOne shows no OTP because the user-facing Super Banking app does not
     have the Multi_Factor sign-on policy assigned → PingOne uses Single_Factor (password only).

fix: |
  To enable in-page CIBA step-up (user never leaves the dashboard):
  1. Set STEP_UP_METHOD=ciba in Vercel environment variables
  2. Set CIBA_ENABLED=true in Vercel environment variables
  3. In PingOne: enable the CIBA grant type on the ADMIN app (the one using PINGONE_CLIENT_ID / admin_client_id)
  4. In PingOne: configure the CIBA delivery (email OTP via DaVinci or built-in CIBA email)
  No code changes required — the entire CIBA step-up path (BFF + UI) is already implemented.
  
  Separately, to fix PKCE redirect (Option B, fallback): assign Multi_Factor sign-on policy to the user app in PingOne.

verification: Pending human verification
files_changed: []
