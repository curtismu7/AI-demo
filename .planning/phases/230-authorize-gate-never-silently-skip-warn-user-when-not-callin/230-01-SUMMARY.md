---
phase: 230
plan: 01
status: complete
completed_at: 2026-04-26
commit: 66bf117f
---

# Summary — 230-01: Authorize gate skip reason

## What was done

### Task 1 — transactionAuthorizationService.js: per-condition reason
Replaced single `!SHOULD_RUN → { ran: false }` guard with four ordered checks, each returning a `reason` string:
- `authorize_disabled` — authorize_enabled config is false
- `admin_role_exempt` — user has admin role
- `type_not_in_scope` — transaction type not in AUTHORIZE_TYPES (e.g. deposit when ff_authorize_deposits is off)
- `not_configured` — neither simulated mode nor PingOne credentials configured

### Task 2 — mcpToolAuthorizationService.js: reason on each early exit
Added `reason` to all 4 existing `{ ran: false }` returns:
- `feature_flag_disabled` — ff_authorize_mcp_first_tool not enabled
- `no_agent_token` — agentToken missing/invalid
- `already_evaluated` — mcpFirstToolAuthorizeDone already set in session
- `admin_role_exempt` — user has admin role

### Task 3 — server.js: MCP gate skip reason surfaced
- Added `reason: mcpAuthz.reason` to `authorize_gate_skipped` emit
- Added `_appEvents.logEvent('authorize', 'info', ...)` with tag `authorize/gate-skipped` when `!mcpAuthz.ran`

### Task 4 — transactions.js: else branch logs skip
- Added `const { logEvent: logAppEvent } = require('../services/appEventService')` import
- Added `else` branch after `if (authz.ran)` block firing `logAppEvent('authorize', 'info', ...)` with tag `authorize/gate-skipped` and `{ reason, type, userId }`

## Files changed
- `banking_api_server/services/transactionAuthorizationService.js`
- `banking_api_server/services/mcpToolAuthorizationService.js`
- `banking_api_server/server.js`
- `banking_api_server/routes/transactions.js`

## Verification
- `npm run build` passed (exit 0)
- No behavioral change to existing authorize gate paths — only new `reason` fields added
