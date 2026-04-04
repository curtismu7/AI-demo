---
created: 2026-04-04T12:35:35.037Z
title: Add Multi_Factor sign-on policy to Super Banking user app in PingOne setup instructions
area: docs
files:
  - banking_api_server/README.md
  - banking_api_server/PINGONE_AI_CORE_SETUP.md
  - banking_api_server/setup-env.sh
  - banking_api_server/.env.example:121-123
---

## Problem

The Super Banking User App in PingOne (`PINGONE_USER_CLIENT_ID=b2752071-2d03-4927-b865-089dc40b9c85`)
does not have the **Multi_Factor** sign-on policy assigned to it in the PingOne console.

This was the root cause of the `invalid_request: Invalid sign-on policy provided in acr_values
parameter` error during Phase 09 UAT step-up testing. PingOne's `acr_values` parameter only
works if the named Sign-On Policy is explicitly **assigned to the specific application** via
the app's Policies tab — a globally-defined policy alone is not sufficient.

Workaround applied: cleared `STEP_UP_ACR_VALUE` so `acr_values` is omitted and PingOne uses
the app's default Single_Factor policy. MFA step-up therefore does NOT enforce MFA right now.

## Solution

1. **PingOne console (manual step required):**
   - Admin Console → Applications → *Super Banking User App* (`b2752071…`) → **Policies** tab
   - Add "**Multi_Factor**" policy (Login + Multi-factor Authentication)
   - Save

2. **Re-enable `STEP_UP_ACR_VALUE`** after the policy is assigned:
   - `banking_api_server/.env`: `STEP_UP_ACR_VALUE=Multi_Factor`
   - Vercel: `vercel env rm STEP_UP_ACR_VALUE production --yes && echo "Multi_Factor" | vercel env add STEP_UP_ACR_VALUE production`

3. **Add setup instructions** to:
   - `banking_api_server/README.md` — PingOne app config checklist section: add step "Assign
     Multi_Factor Sign-On Policy to the User App (required for step-up MFA)"
   - `banking_api_server/PINGONE_AI_CORE_SETUP.md` — same note in the PingOne app config steps
   - `banking_api_server/setup-env.sh` — add a reminder echo message: "⚠️  Remember to assign
     the Multi_Factor sign-on policy to your PingOne User App in the console (Policies tab)"

4. **Consider automating via worker token** (Phase 50 scope): use the Management API to
   assign the policy programmatically:
   `PATCH /environments/{envId}/applications/{appId}/signOnPolicies`
   so the setup wizard (Phase 49) or init script can do this without a console visit.

Environment context:
- PingOne env ID: `d02d2305-f445-406d-82ee-7cdbf6eeabfd`
- User app ID: `b2752071-2d03-4927-b865-089dc40b9c85`
- Policy name: `Multi_Factor`
