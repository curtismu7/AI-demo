---
phase: 172-mcp-server-token-exchange
plan: 01
status: complete
---

# Plan 172-01 Summary: TokenCacheService and Tool-to-Scope Mapping

## What Was Done

### Task 1: TokenCacheService
- Created `banking_mcp_server/src/services/tokenCacheService.ts`
- In-memory TTL-aware cache for exchanged delegation tokens (D-01)
- Key = `userId:sorted-scopes-JSON`, value = `{token, expiresAt}`
- 30s expiry buffer to avoid using nearly-expired tokens
- Methods: `get()`, `set()`, `clear(userId?)`, `size` getter
- Exported singleton `tokenCache`

### Task 2: Tool-to-Scope Mapping
- Created `banking_mcp_server/src/tools/toolScopeMap.ts`
- Maps each MCP tool to its minimum required scopes (D-03: least-privilege)
- Read tools → `['banking:read']`, write tools → `['banking:write']`
- `getScopesForTool(toolName)` with safe fallback to `['banking:read']`

## Artifacts Created
- `banking_mcp_server/src/services/tokenCacheService.ts`
- `banking_mcp_server/src/tools/toolScopeMap.ts`

## Decisions Made
- Used in-memory Map (no persistence needed — MCP server is stateful per connection)
- 30s expiry buffer default (configurable via constructor)
- Fallback to `['banking:read']` for unknown tools (safe default)
