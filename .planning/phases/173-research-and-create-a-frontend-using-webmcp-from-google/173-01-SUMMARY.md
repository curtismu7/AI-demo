# 173-01 Summary: Feature Flag + WebMCP Client Service

## What Was Done

### Task 1: ff_webmcp_enabled feature flag
- Added `ff_webmcp_enabled: { public: true, default: 'false' }` to `configStore.js`
- Added FLAG_REGISTRY entry under new "WebMCP" category in `featureFlags.js`

### Task 2: webMcpClient.js browser service
- Created `banking_api_ui/src/services/webMcpClient.js` (~95 lines)
- Exports: `listMcpTools()`, `callMcpTool()`, `openMcpToolStream()`
- Follows `mcpFlowSseClient.js` patterns (fetch + EventSource, credentials: include)
- Reuses existing BFF endpoints — no new server routes

## Key Files

| File | Action |
|------|--------|
| `banking_api_server/services/configStore.js` | Modified — added ff_webmcp_enabled key |
| `banking_api_server/routes/featureFlags.js` | Modified — added FLAG_REGISTRY entry |
| `banking_api_ui/src/services/webMcpClient.js` | Created — browser MCP client service |

## Decisions
- Used ESM exports matching CRA convention
- SSE stream wrapper mirrors mcpFlowSseClient.js exactly (same EventSource pattern)
- No new BFF routes — all three functions call pre-existing endpoints

## Verification
- `npm run build` exits 0
- configStore.get('ff_webmcp_enabled') returns expected value
- featureFlags.js loads without errors

## Commit
`2bdf4d7` — feat(173-01): add ff_webmcp_enabled flag and webMcpClient service

## Self-Check: PASSED
