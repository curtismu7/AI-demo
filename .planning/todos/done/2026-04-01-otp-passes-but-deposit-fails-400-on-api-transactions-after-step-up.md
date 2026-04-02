---
created: 2026-04-01T00:00:00.000Z
title: OTP passes but deposit fails 400 on api/transactions after step-up
area: auth
files:
  - banking_api_server/server.js
  - banking_api_server/routes/oauthUser.js
  - banking_api_server/services/agentMcpTokenService.js
  - banking_api_ui/src/components/OtpModal.js
---

## Problem

OTP step-up modal is shown and the code is entered successfully, but the deposit still fails with HTTP 400 on `POST api/transactions`.

Console output:
```
api/transactions:1  Failed to load resource: the server responded with a status of 400 ()
Deposit error: AxiosError: Request failed with status code 400
```

Screenshot shows:
- "Email delivery unavailable. Check server logs for the OTP code." warning (OTP delivered via logs, not email)
- Transaction summary rendered correctly (Deposit $1000.00 to Investment Account)
- Code entered and Confirm clicked
- 400 returned from `/api/transactions` — transaction did not complete

## Root Cause Hypotheses

1. After OTP confirmation the tool is re-dispatched but the transaction payload is missing a required field (e.g. `fromAccountId`) — the BFF rejects with 400.
2. The step-up token (elevated scope) is not forwarded correctly to the banking transactions endpoint.
3. The CIBA/OTP callback re-issues the tool call but stale/missing params cause BFF validation to reject.

## Solution

1. Reproduce: trigger deposit > $500, use OTP from server logs, confirm — capture full BFF request body.
2. Check BFF `POST /api/transactions` handler — log the incoming payload and validate required fields.
3. Trace the OTP approval callback in `oauthUser.js` — confirm it re-calls the tool with the full original params.
4. Confirm elevated scope token is attached to the re-issued transactions request.
5. Fix the missing param or token forwarding bug, retest end-to-end.
