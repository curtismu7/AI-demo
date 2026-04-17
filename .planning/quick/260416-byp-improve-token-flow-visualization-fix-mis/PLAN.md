# Quick Task Plan: Fix Token Chain Visualization (5 Issues)

## Task 1 — Enrich callMcpToolInternal events (mcpToolRegistry.js)

**Files:** `banking_api_server/utils/mcpToolRegistry.js`

Replace the two bare `tokenEvents.push({...})` calls (lines ~36 and ~57) with proper
`buildTokenEvent()`-style objects that include `id`, `label`, `status` (using known
StatusBadge statuses), and relevant metadata.

- Event 1 (agent_token_used): Use `id: 'mcp-agent-token-presented'`, `label: 'Agent Token → MCP Server'`, `status: 'active'`
- Event 2 (tool_call): Use `id: 'mcp-tool-result'`, `label: 'MCP Tool Result: {toolName}'`, `status: 'exchanged'`

Also import `buildTokenEvent` from agentMcpTokenService (already importing `decodeJwtClaims`).

**Verify:** `node -e "require('./banking_api_server/utils/mcpToolRegistry')"` → no errors

## Task 2 — Suppress act warning on Exchange #1 (agentMcpTokenService.js)

**File:** `banking_api_server/services/agentMcpTokenService.js`

At line ~1175, Exchange #1 sets `actPresent: !!agentExchangedClaims?.act`. PingOne doesn't
return `act` on Exchange #1 (act only appears after Exchange #2), so this always shows
"⚠️ no act claim" in the UI.

Fix: Add `actExpectedHere: false` to the extra fields for Exchange #1's success event,
and in TokenChainDisplay.js suppress the act warning when `actExpectedHere === false`.

**Files:** `banking_api_server/services/agentMcpTokenService.js`, `banking_api_ui/src/components/TokenChainDisplay.js`

**Verify:** `cd banking_api_ui && npm run build` → exit 0
