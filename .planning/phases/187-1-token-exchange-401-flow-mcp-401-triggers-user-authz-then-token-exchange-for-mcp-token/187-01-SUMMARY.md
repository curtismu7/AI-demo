# Phase 187 Plan 01 — SUMMARY

## What Changed
Added `need_auth: true` signal to BFF service and route layers so BankingAgent.js can distinguish "user must authenticate" from other errors.

## Files Modified
| File | Change |
|------|--------|
| `banking_api_server/services/agentMcpTokenService.js` | Added `need_auth: true, exchange_mode: '1-token'` to the `!userToken` null-return path |
| `banking_api_server/routes/bankingAgentRoutes.js` | Added `need_auth: true` to both 401 JSON responses (/init and /message) |

## Commits
- `1733f43` — feat(187-01): add need_auth signal to BFF service and route layers
