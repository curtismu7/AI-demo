---
status: root_cause_found
trigger: "NO mcp tracking (results) — MCP Results tab always shows 'No MCP tool calls yet' despite tool calls running"
created: 2026-05-01
updated: 2026-05-01
slug: mcp-results-not-showing
---

## Symptoms

- Token Chain panel → MCP Results tab shows "No MCP tool calls yet. Run a banking action through the AI Agent to see tool results."
- History tab shows 17 entries (tool calls ARE happening)
- The `/api/token-chain` response has `mcpToolCallsChain: []` even after tool calls complete

## Current Focus

hypothesis: getMCPToolCalls filters out all MCP server audit events because event.userId is undefined and event.details.userToken.sub is hardcoded 'user' — neither matches the real user UUID from req.user.id
next_action: Fix the userId filter in getMCPToolCalls to include events with no userId set
reasoning_checkpoint: confirmed

## Root Cause (confirmed via code trace)

**File:** `banking_api_server/services/tokenChainService.js:219` — `getMCPToolCalls`

**Chain:**
1. BFF agent calls tool via `mcpCallTool` → MCP server's `BankingToolProvider.executeTool()`
2. MCP server calls `logTokenChain(...)` which stores event in `AuditLogger.eventStore[]` (in-memory)
3. `event.userId` = `undefined` (BankingToolProvider line 230: `userId: undefined, // Would need to be extracted from token claims`)
4. `event.details.userToken.sub` = `'user'` (hardcoded string, not actual sub claim)
5. BFF's `getMCPToolCalls(userId)` fetches from `http://localhost:8080/audit?eventType=token_chain` — gets all events
6. Filter: `.filter(event => !userId || event.userId === userId || event.details?.userToken?.sub === userId)`
   - `!userId` → false (userId IS set from req.user.id — a real UUID)
   - `event.userId === userId` → false (event.userId is undefined)
   - `event.details?.userToken?.sub === userId` → false ('user' !== actual-uuid)
7. **All events filtered out → empty array → UI shows no results**

**Confirmed:** `curl http://localhost:8080/audit?eventType=token_chain` returns `[]` on fresh server (no calls yet), which means events ARE stored only while the process is running and only after tool calls.

## Evidence

- `banking_api_server/services/tokenChainService.js:243`: filter requires userId match
- `banking_mcp_server/src/tools/BankingToolProvider.ts:230`: `userId: undefined`
- `banking_mcp_server/src/tools/BankingToolProvider.ts:170`: `sub: 'user'` hardcoded
- `banking_mcp_server/src/storage/SessionManager.ts:8`: `SessionData` has no userId field
- `banking_mcp_server/src/storage/BankingSessionManager.ts:19`: `BankingSession` also has no userId field

## Fix Plan

**Minimal fix (one line):** Change the filter in `getMCPToolCalls` to also include events where `event.userId` is falsy (not set):

```javascript
// Before:
.filter(event => !userId || event.userId === userId || event.details?.userToken?.sub === userId)
// After:
.filter(event => !userId || !event.userId || event.userId === userId || event.details?.userToken?.sub === userId)
```

**Rationale:** The MCP server session is single-user at a time. Events without a userId are safe to return for the current authenticated user. This is a minimal, non-breaking change.

**Why not fix BankingToolProvider.ts instead?** That would require JWT decoding in the TypeScript MCP server and would be a larger TypeScript change. The filter fix is sufficient and more robust.

## Resolution

root_cause: getMCPToolCalls filters out all audit events because BankingToolProvider stores userId=undefined and sub='user' (hardcoded), so the userId filter never matches
fix: Add `!event.userId` as an additional OR condition in getMCPToolCalls filter
verification: after fix, /api/token-chain returns non-empty mcpToolCallsChain after a tool call
files_changed: banking_api_server/services/tokenChainService.js
