# Phase 210 Plan 01 — SUMMARY

## Outcome
Added `GET /api/mcp/tool-scopes` unauthenticated discovery endpoint and corrected `get_sensitive_account_details` scope declarations.

## What Was Built

### Task 1: Fix scope declarations
- `banking_mcp_server/src/tools/BankingToolRegistry.ts`: changed `get_sensitive_account_details.requiredScopes` from `['banking:read']` to `['banking:read', 'banking:sensitive:read']`
- `banking_api_server/services/mcpLocalTools.js`: added `get_sensitive_account_details` entry to `LOCAL_INSPECTOR_TOOLS` with `requiredScopes: ['banking:accounts:read', 'banking:sensitive:read']`

### Task 2: Discovery endpoint
- Created `banking_api_server/routes/mcpToolScopes.js`: `GET /api/mcp/tool-scopes` — calls `listLocalInspectorTools()`, returns `{ tools: [{ name, title, requiredScopes, readOnly }] }` with no session required
- `banking_api_server/server.js`: require + `app.use('/api/mcp', mcpToolScopesRouter)` before `mcpInspectorRoutes`

## Key Files Created/Modified
- `banking_api_server/routes/mcpToolScopes.js` (new)
- `banking_mcp_server/src/tools/BankingToolRegistry.ts`
- `banking_api_server/services/mcpLocalTools.js`
- `banking_api_server/server.js`

## Commit
`feat(210-01): scope discovery endpoint + fix get_sensitive_account_details scopes`

## Self-Check: PASSED
- `banking:sensitive:read` present in both registry files
- Route module loads without errors
- Route registered in server.js at `/api/mcp`
