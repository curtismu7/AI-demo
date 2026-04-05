---
status: awaiting_human_verify
trigger: "When the banking app triggers OTP/email step-up authentication, PingOne returns 'invalid_request: Invalid sign-on policy provided in acr_values parameter'"
created: 2026-04-04T00:00:00Z
updated: 2026-04-04T00:00:00Z
---

## Current Focus

hypothesis: Two compounding bugs: (1) PingOne "Multi_Factor" policy not assigned to user app b2752071 — PingOne rejects acr_values for any policy not linked to the requesting app. (2) Code bug in routes/oauthUser.js: `process.env.STEP_UP_ACR_VALUE || 'Multi_Factor'` treats empty string as unset, so `STEP_UP_ACR_VALUE=` in .env doesn't actually omit acr_values as the .env.example comment implies.
test: Trace code path → confirm user app used → confirm code bug → apply code fix that honors empty STEP_UP_ACR_VALUE → document PingOne admin step
expecting: After code fix + STEP_UP_ACR_VALUE= empty, no acr_values is sent and step-up will use the app's default sign-on policy. For full MFA enforcement, Multi_Factor policy must be assigned to app b2752071 in PingOne console.
next_action: Apply code fix in routes/oauthUser.js line 578

## Symptoms

expected: Triggering step-up (agent transfer ≥$250 or "show sensitive account details") redirects the user to PingOne for OTP/email MFA using acr_values=Multi_Factor and then returns them to the dashboard.
actual: PingOne immediately rejects the authorization request with: "invalid_request: Invalid sign-on policy provided in acr_values parameter (Correlation ID: 26ae23b1-daf4-48bc-8b39-819b9b074992)"
errors: "PingOne returned: invalid_request. Invalid sign-on policy provided in acr_values parameter"
reproduction: Log in on the banking demo (localhost or Vercel). Trigger agent step-up (ask agent to transfer ≥$250 or view sensitive data). The step-up redirect to PingOne fails with this error.
started: Persisting after multiple attempted fixes. STEP_UP_ACR_VALUE=Multi_Factor is set in .env and Vercel. PingOne policy "Multi_Factor" EXISTS but may not be assigned to the user app.

## Eliminated

- hypothesis: STEP_UP_ACR_VALUE env var missing or wrong case on Vercel
  evidence: Vercel and localhost both fail; user confirmed STEP_UP_ACR_VALUE=Multi_Factor is set in both; PingOne policy name confirmed as "Multi_Factor"
  timestamp: 2026-04-04

- hypothesis: Admin app (14cefa5b) used for step-up
  evidence: routes/oauthUser.js uses `oauthService` from `oauthUserService.js` which uses `config/oauthUser.js` → `user_client_id` from configStore → maps to `PINGONE_USER_CLIENT_ID=b2752071` — confirmed USER app is used for step-up
  timestamp: 2026-04-04

## Evidence

- timestamp: 2026-04-04
  checked: banking_api_server/routes/oauthUser.js lines 576-607 (/stepup handler)
  found: imports oauthService from oauthUserService; reads `process.env.STEP_UP_ACR_VALUE || 'Multi_Factor'`; calls `oauthService.generateAuthorizationUrl(..., { acr_values: acrValue, nonce, max_age: 0 }, redirectUri)`
  implication: Step-up uses the USER app (b2752071). acr_values=Multi_Factor is always sent (even if STEP_UP_ACR_VALUE= empty, due to || fallback).

- timestamp: 2026-04-04
  checked: banking_api_server/services/oauthUserService.js generateAuthorizationUrl (lines 87-122)
  found: Uses `this.config.clientId` from config/oauthUser.js → configStore.getEffective('user_client_id') → PINGONE_USER_CLIENT_ID=b2752071. Adds acr_values only when `if (options.acr_values)` is truthy.
  implication: If acrValue is empty string, acr_values will NOT be added to URL. This is the desired omission path — but oauthUser.js's `|| 'Multi_Factor'` prevents empty string from reaching this guard.

- timestamp: 2026-04-04
  checked: banking_api_server/config/oauthUser.js
  found: Confirmed user app: `get clientId() { return configStore.getEffective('user_client_id'); }` → PINGONE_USER_CLIENT_ID=b2752071-2d03-4927-b865-089dc40b9c85
  implication: Step-up authorization goes to PingOne as app b2752071.

- timestamp: 2026-04-04
  checked: banking_api_server/.env
  found: STEP_UP_ACR_VALUE=Multi_Factor; PINGONE_USER_CLIENT_ID=b2752071-2d03-4927-b865-089dc40b9c85
  implication: Current config always sends acr_values=Multi_Factor for user app b2752071.

- timestamp: 2026-04-04
  checked: PingOne error semantics
  found: PingOne error "Invalid sign-on policy provided in acr_values parameter" = the named policy IS NOT ASSIGNED to the requesting application (b2752071). Policy can exist globally but must be linked per-app via Policies tab in PingOne app settings.
  implication: Root cause confirmed. Even though "Multi_Factor" exists in PingOne, it is not assigned to user app b2752071. This is a PingOne console config issue.

- timestamp: 2026-04-04
  checked: banking_api_server/.env.example lines 121-124
  found: Comment says "Leave blank to omit acr_values and rely on the app's default sign-on policy." STEP_UP_ACR_VALUE=Multi_Factor. The comment implies empty should work as a workaround, but code bug prevents it.
  implication: Code bug confirmed: `|| 'Multi_Factor'` swallows empty string. Setting STEP_UP_ACR_VALUE= in .env would still send acr_values=Multi_Factor. The intent from .env.example does NOT match the implementation.

## Resolution

root_cause: Two compounding issues — (1) PRIMARY: PingOne "Multi_Factor" sign-on policy is not assigned to user app b2752071-2d03-4927-b865-089dc40b9c85 in the PingOne admin console. PingOne's acr_values parameter requires the named policy to be explicitly linked to the requesting application — a globally existing policy is insufficient. (2) SECONDARY (code bug): routes/oauthUser.js line 578 uses `process.env.STEP_UP_ACR_VALUE || 'Multi_Factor'` which treats empty string as falsy, defeating the intended ability to set STEP_UP_ACR_VALUE= (empty) to omit acr_values and fall back to the app's default sign-on policy.

fix: Code fix: change line 578 in routes/oauthUser.js from `process.env.STEP_UP_ACR_VALUE || 'Multi_Factor'` to `process.env.STEP_UP_ACR_VALUE !== undefined ? process.env.STEP_UP_ACR_VALUE.trim() : 'Multi_Factor'`. This honors empty STEP_UP_ACR_VALUE to omit acr_values. Config fix: set STEP_UP_ACR_VALUE= (empty) in .env and Vercel as a workaround (step-up uses max_age=0 re-auth with app default policy). Proper fix: assign Multi_Factor policy to app b2752071 in PingOne console → Applications → [User App] → Policies tab.

verification: Code fix applied + STEP_UP_ACR_VALUE= empty in .env. Awaiting user confirmation that step-up no longer errors on localhost.
files_changed:
  - banking_api_server/routes/oauthUser.js
