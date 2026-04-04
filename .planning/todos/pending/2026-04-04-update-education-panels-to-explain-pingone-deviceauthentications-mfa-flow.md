---
created: 2026-04-04T00:00:00.000Z
title: Update education panels to explain PingOne deviceAuthentications MFA flow
area: ui
files:
  - banking_api_ui/src/components/education/
  - banking_api_ui/src/components/UserDashboard.js
---

## Problem

Phase 52 adds PingOne MFA deviceAuthentications API support (OTP, TOTP, FIDO2, push) but the existing education panels still describe the old custom BFF OTP flow. Users demoing the app won't understand how the PingOne MFA API works or why it's different from the previous approach.

## Solution

Update education panels where MFA step-up is referenced to explain:
- PingOne `/deviceAuthentications` endpoint (auth server, uses user access token)
- Status state machine: DEVICE_SELECTION_REQUIRED → OTP/TOTP/FIDO2/PUSH → COMPLETED
- FIDO2 relay pattern: BFF initiates → browser WebAuthn → assertion relayed via BFF
- Why deviceAuthentications vs CIBA vs custom OTP (trade-offs)
- Demo sequence diagram showing the full step-up → tool call → approval flow

Look for: StepUpPanel.js or EDU.STEP_UP education ID, any panel that mentions step-up MFA or OTP.
Also update the CIBA panel if it references OTP step-up as the alternative.
