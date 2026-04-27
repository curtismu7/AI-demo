# Phase 245 — Plan 01 Summary

**Plan:** 245-01-PLAN.md — Scope upgrade: intercept 403 in callMcpTool()
**Commit:** a5dfbd68
**Status:** COMPLETE

## What Was Built

Modified `banking_api_server/utils/mcpToolRegistry.js`:

- Added `const oauthService = require('../services/oauthService');` require
- Extended `callMcpTool(toolName, params, agentToken, userId, tokenEvents = [], _scopeUpgradeAttempted = false)` with a 6th parameter guard
- When BFF returns `HTTP 403` with `data.error === 'mcp_scope_denied'` and the guard is false:
  1. Extracts `missingScopes` and `availableScopes` from error response
  2. Pushes `{ type: 'scope_upgrade', missingScopes, requestedScopes, audience }` to `tokenEvents`
  3. Calls `oauthService.performTokenExchange(agentToken, MCP_SERVER_RESOURCE_URI, [...availableScopes, ...missingScopes])`
  4. On exchange failure: pushes `tool_error` event and throws with clear message
  5. On exchange success: calls `callMcpTool(...)` with upgraded token and `_scopeUpgradeAttempted = true` (single retry)
- Non-scope 403 errors (401, policy denials) propagate immediately — not retried
- Added accurate success/failure tracking to `tokenEvents` for all paths

## Files Modified

- `banking_api_server/utils/mcpToolRegistry.js` (+61/-29 lines)

## Verification

```
grep -c "mcp_scope_denied" banking_api_server/utils/mcpToolRegistry.js  → 1
grep -c "_scopeUpgradeAttempted" banking_api_server/utils/mcpToolRegistry.js  → 3
grep -c "performTokenExchange" banking_api_server/utils/mcpToolRegistry.js  → 1
node -e "const m = require('./utils/mcpToolRegistry'); console.log(typeof m.callMcpTool)"  → function
```

## Self-Check: PASSED

- Module loads without errors
- All 6 verification checks passed
- Exports unchanged: `{ callMcpTool, createMcpToolRegistry }`

## Security Notes

- `_scopeUpgradeAttempted` guard prevents retry loops — maximum 1 upgrade per tool call
- Token exchange uses `MCP_SERVER_RESOURCE_URI` env var as audience (not user-supplied)
- Upgraded token replaces agent token only for the retry; original token unchanged
