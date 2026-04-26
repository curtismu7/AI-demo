---
phase: 228-admin-agent-chip-routing-fix-heuristic-so-chips-like-show-al
plan: 01
status: complete
completed: 2026-04-24
---

# Plan 228-01 Summary

## What was built
- `banking_api_server/services/nlIntentParser.js` — two new branches inserted BEFORE the generic `accounts` branch in `parseBanking()`:
  - `admin_accounts`: matches "show all customer accounts", "list all user accounts", etc.
  - `admin_errors`: matches "show last N errors", "show recent errors", etc. (limit clamped 1–50)
- `banking_api_server/services/bankingAgentLangGraphService.js` — two new execution handlers in `executeHeuristicBanking()` before the `balance` handler:
  - `admin_accounts`: admin role guard (explicit error for non-admin); calls `dataStore.getAllAccounts()` + `dataStore.getAllUsers()` (both synchronous); returns formatted account list + normalizedAccounts array
  - `admin_errors`: calls `appEventService.getEvents({ level: 'error', limit })`; returns formatted error log entries

## Verification
- `node -e "require('./services/bankingAgentLangGraphService')"` exits cleanly
- `npm run build` exits 0
