# Phase 210 Plan 03 — SUMMARY

## Outcome
The MCP server's -32005 scope error propagates end-to-end: WebSocket client preserves the error code, BFF returns HTTP 403, and the UI shows a scope error modal (chip path) or inline message (NL path).

## What Was Built

### Task 1: mcpWebSocketClient.js
- Preserve -32005 error code on rejection: `err.code = 'mcp_insufficient_scope'`, `err.mcpErrorData = msg.error.data || {}`

### Task 2: server.js BFF 403 catch
- Added `if (err.code === 'mcp_insufficient_scope')` BEFORE `isConnErr` check
- Returns `res.status(403).json({ error: 'mcp_scope_denied', tool, requiredScopes, missingScopes, availableScopes })`
- Does NOT fall back to local tool handler

### Task 3: BankingAgent.js + bankingAgentService.js (also modified)
- `bankingAgentService.js`: structured throw for `err.error === 'mcp_scope_denied'` — preserves `tool`, `requiredScopes`, `missingScopes`, `availableScopes` on the Error object
- `BankingAgent.js` `runAction` catch: `mcp_scope_denied` case → `setScopeErrorModal({ missingScopes, userScopes, requiredScopes })` + token-event message with RFC citations
- `BankingAgent.js` NL path: `response.error === 'mcp_scope_denied'` case → inline chat message with scope details

## Key Files Modified
- `banking_api_server/services/mcpWebSocketClient.js`
- `banking_api_server/server.js`
- `banking_api_ui/src/services/bankingAgentService.js`
- `banking_api_ui/src/components/BankingAgent.js`

## Commit
`feat(210-03): wire -32005 scope error through BFF to client UI`

## Self-Check: PASSED
- `mcp_insufficient_scope` code in mcpWebSocketClient.js
- `mcp_scope_denied` 403 in server.js catch block
- `mcp_scope_denied` structured throw in bankingAgentService.js
- `mcp_scope_denied` case in BankingAgent.js catch (setScopeErrorModal) and NL path
- `npm run build` in banking_api_ui → exit 0
- `npx tsc --noEmit` in banking_mcp_server → exit 0
