---
created: 2026-04-04T00:00:00.000Z
title: Add MFA setup guide to docs — PINGONE_MFA_POLICY_ID and device enrollment
area: docs
files:
  - docs/SETUP.md
  - banking_api_server/.env.example
---

## Problem

Phase 52 requires `PINGONE_MFA_POLICY_ID` env var and enrolled MFA devices, but there is no setup documentation explaining:
- How to find the MFA Policy ID in PingOne Admin Console
- How to enroll EMAIL, TOTP, or FIDO2 devices for demo users
- How to configure the `stepUpMethod` runtime setting (email vs ciba vs pingone-mfa)
- What each MFA method requires to function in the demo

Without this, operators deploying the demo will be blocked trying to configure PingOne for MFA step-up.

## Solution

Update `docs/SETUP.md` (or equivalent setup guide) to add a "MFA Step-Up" section covering:
- `PINGONE_MFA_POLICY_ID` — where to find it (PingOne Admin → Security → MFA → Device Policies)
- Enrolling a demo user with EMAIL device (minimum requirement)
- Optional: TOTP enrollment, FIDO2 registration
- Runtime setting: `stepUpMethod = pingone-mfa` in Admin → Security Settings
- Link to canonical API docs: https://developer.pingone.com/pingone-api/mfa/
