---
phase: 235
plan: 01
status: complete
completed_at: 2026-04-26
commit: 6115d884
---

# Summary — 235-01: Surface Introspection Results in Activity Log + Token Chain

## What was done

### Task 1 — introspection EVENT_CATEGORY + UI label
- Added `INTROSPECTION: 'introspection'` to `EVENT_CATEGORIES` in `appEventService.js`
- Added `introspection: '\u{1F52C}'` (🔬) to `CATEGORY_ICONS` in `ActivityLogs.js`
- Added `introspection: 'Introspection'` to `CATEGORY_LABELS` in `ActivityLogs.js`

### Task 2 — logEvent calls in tokenIntrospectionService.js
- Added `const { logEvent: logAppEvent } = require('./appEventService');` import
- On successful network call: fires `introspection/active` (info) or `introspection/inactive` (warning) with `{ active, sub, client_id, scopeCount, scopes, exp }`
- On network error: fires `introspection/error` (error) with `{ error }`
- Cache hits are not logged (would be too noisy)

### Task 3 — logEvent calls in tokenIntrospection.js middleware
- Added `const { logEvent: logAppEvent } = require('../services/appEventService');` import
- On successful middleware validation: fires `introspection/middleware-validated` (info) with `{ active, sub, path, scope }`
- On inactive token rejection: fires `introspection/middleware-inactive` (warning) with `{ sub, path }`
- On middleware error: fires `introspection/middleware-error` (error) with `{ error, path }`

### Task 4 — validationMode in /api/token-chain response
- Added `const validationModeConfig = require('../config/validationModeConfig');` to `tokenChain.js`
- Added `validationMode: validationModeConfig.getValidationMode()` to the GET `/` JSON response

### Task 5 — introspection badge in TokenChainDisplay.js
- Added `validationMode` state to `TokenChainContext.js`; populated from `data.validationMode` in `fetchMCPToolCalls`; exposed in context value
- Added `validationMode` prop to `EventRow` in `TokenChainDisplay.js`
- Added `introspectionHint` computed from `validationMode === 'introspection'` on user-token/auth events → shows `🔬 PingOne verified` in green
- Included `introspectionHint` in hints row condition and render
- Pass `ctx?.validationMode` to `EventRow` at the call site

## Files changed
- `banking_api_server/services/appEventService.js`
- `banking_api_server/services/tokenIntrospectionService.js`
- `banking_api_server/middleware/tokenIntrospection.js`
- `banking_api_server/routes/tokenChain.js`
- `banking_api_ui/src/components/ActivityLogs.js`
- `banking_api_ui/src/context/TokenChainContext.js`
- `banking_api_ui/src/components/TokenChainDisplay.js`

## Verification
- `npm run build` passed (0 exit)
- Unit tests pass (SideNav, buttonRouting snapshots green)
- No raw token strings logged — only decoded claims fields (sub, scopes, client_id)
