---
created: 2026-04-04T10:52:45.040Z
title: Add STEP_UP_ACR_VALUE prompt to setup wizard environment configuration
area: auth
files:
  - banking_api_server/routes/oauthUser.js:576
  - banking_api_server/.env.example:121-123
  - banking_api_server/services/oauthUserService.js:107-108
---

## Problem

When `STEP_UP_ACR_VALUE` is not set in Vercel (or any deployment environment), the code falls back to the hardcoded default `'Multi_factor'`. If the deployer's PingOne tenant uses a different Sign-On Policy name — or the value is simply never added to the env — PingOne returns:

> `invalid_request: Invalid sign-on policy provided in acr_values parameter`

This blocks the step-up authentication flow entirely. The issue surfaced during Phase 09 UAT on the Vercel deployment where `STEP_UP_ACR_VALUE` was not set as a Vercel env var.

The PingOne Sign-On Policy list shows `Multi_Factor` and `Single_Factor` are the two standard policy names, so `Multi_factor` IS valid — the problem is purely that the value was never pushed to Vercel env vars.

## Solution

Phase 49 (setup-wizard) should include a step that:

1. Prompts the user for `STEP_UP_ACR_VALUE` — explain it must match the exact name of a PingOne Sign-On Policy (e.g. `Multi_factor`)
2. Shows the user where to find the list: PingOne Admin Console → Authentication → Authentication Policies
3. Writes the value to `.env` and pushes to Vercel via Management API / Vercel API (same pattern as other wizard steps)
4. Validates: after setting, optionally test by hitting `/api/auth/oauth/user/stepup` dry-run (or just confirm it's non-empty)

Default suggestion to the user: `Multi_factor` (matches PingOne default policy name).

Also consider: the wizard could read back the PingOne Sign-On Policies list via Management API and present a dropdown, rather than a free-text field.
