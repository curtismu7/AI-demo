---
created: 2026-04-01T16:30:15.112Z
title: Read PDF - OAuth 2.0 Token Exchange info for PingOne implementation help
area: auth
files:
  - /Users/cmuir/Documents/OAuth 2.0 Token Exchange - info for selected customers.pdf
  - banking_api_server/routes/tokens.js
  - banking_api_server/services/agentMcpTokenService.js
---

## Problem

There is a customer-facing PDF document at `/Users/cmuir/Documents/OAuth 2.0 Token Exchange - info for selected customers.pdf` that contains PingOne-specific OAuth 2.0 Token Exchange guidance. This information may contain important details about:

- PingOne-specific token exchange request parameters
- Required claims (`may_act`, `act`) configuration in PingOne
- Scope narrowing behavior and restrictions
- Worker app / client credentials setup for RFC 8693 exchanges
- Audience (`aud`) and `resource` (RFC 8707) handling in PingOne

The token exchange implementation in `agentMcpTokenService.js` and `tokens.js` was fixed in b822856 (scope derivation from user token), but there may be additional PingOne-specific nuances documented in this PDF that should inform further improvements.

## Solution

1. Read the PDF and extract relevant PingOne token exchange configuration details
2. Cross-reference against current `agentMcpTokenService.js` implementation
3. Identify any gaps (e.g. missing `actor_token_type`, wrong grant type URN, PingOne-specific request params)
4. Update implementation or document PingOne-specific gotchas in code comments
