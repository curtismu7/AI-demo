---
created: 2026-04-04T14:24:16.176Z
title: Revisit MFA approach — direct PingOne MFA APIs vs deviceAuthentications policy-based flow
area: auth
files:
  - banking_api_server/services/mfaService.js
  - banking_api_server/routes/mfa.js
  - banking_api_server/.env.example
---

## Problem

The current Phase 52 implementation uses `POST /deviceAuthentications` on the PingOne **auth server** (`https://auth.pingone.{region}/{envId}/deviceAuthentications`). This endpoint:

1. **Requires a PingOne MFA Sign-On Policy** (`PINGONE_MFA_POLICY_ID`) — the policy must be created in PingOne Admin Console under Authentication Policies → MFA. This is an additional setup step that demo users can forget or misconfigure.
2. **Is policy-driven** — the policy controls which device types are allowed, the OTP delivery settings, lockout rules, etc. This is powerful but adds indirection: the code can't control which device types are available without editing the policy in the admin console.
3. **Uses the auth server endpoint** (not the Management API) — the user's access token is required as the bearer token, which means the user must be logged in and the token must have the right scopes.

The question raised: **should we be using the direct PingOne MFA Management APIs instead?**

## PingOne MFA API approaches compared

### Current: deviceAuthentications (auth server, policy-based)
- Endpoint: `POST https://auth.pingone.{region}/{envId}/deviceAuthentications`
- Auth: user access token (bearer)
- Policy ID required: yes (`policy.id` in request body)
- What it does: initiates an MFA challenge session per the policy definition
- Advantage: PingOne manages the full challenge lifecycle, supports all device types, FIDO2, push, etc.
- Disadvantage: requires admin to pre-create a policy; policy ID must be configured in `.env`

### Alternative A: Direct PingOne MFA API via Management API
- Endpoint: `POST https://api.pingone.{region}/v1/environments/{envId}/users/{userId}/mfaAuthenticators` (or `/mfaChallenge`)
- Auth: worker token (client_credentials)
- Policy ID required: no
- What it does: directly drives MFA for a user without a Sign-On Policy
- Advantage: no policy setup required; more explicit control in code
- Disadvantage: may not support all device types; need to manage state machine manually

### Alternative B: PingOne MFA Node.js SDK
- Package: `@pingidentity/pingone-mfa` or similar
- Wraps the Management API with typed helpers
- Advantage: SDK handles retries, error mapping, device type abstraction
- Disadvantage: may not exist as a stable public package; adds a dependency

## Solution / Decision needed

1. **Research**: Confirm whether a `POST /mfaChallenge` or equivalent direct Management API endpoint exists that doesn't require a policy ID. Check PingOne developer docs at `https://developer.pingidentity.com/pingone-api/mfa/`.
2. **Evaluate**: If a no-policy-ID path exists, consider migrating `mfaService.js` away from `deviceAuthentications` to remove the `PINGONE_MFA_POLICY_ID` hard requirement.
3. **SDK check**: Search npm for official PingOne MFA SDK. If stable, evaluate as an alternative to raw `axios` calls in `mfaService.js`.
4. **Decision**: Document the chosen approach in `52-RESEARCH.md` / `REGRESSION_PLAN.md` so future agents don't accidentally re-introduce the policy dependency if we move away from it.

## Current impact
- `PINGONE_MFA_POLICY_ID` is gated in `mfaService.initiateDeviceAuth()` — if not set, throws immediately.
- `runtimeSettings.js` has `pingonesMfaPolicyId` field; `SecuritySettings.js` exposes it via the admin UI.
- If we move to direct APIs, we can remove the policy ID requirement and simplify setup.

## Files to change if migrating
- `banking_api_server/services/mfaService.js` — replace `deviceAuthentications` call with direct API
- `banking_api_server/config/runtimeSettings.js` — remove `pingonesMfaPolicyId` if not needed
- `banking_api_ui/src/components/SecuritySettings.js` — remove `pingonesMfaPolicyId` field
- `banking_api_server/.env.example` — remove `PINGONE_MFA_POLICY_ID` entry
