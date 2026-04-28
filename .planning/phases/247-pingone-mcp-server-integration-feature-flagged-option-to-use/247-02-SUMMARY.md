# Phase 247 — Plan 02 Summary

**Plan:** 247-02 — PingOne stdio adapter + server.js routing branch  
**Status:** Complete  
**Commit:** feat(247-02): add mcpPingOneStdioAdapter service and wire into POST /api/mcp/tool routing

## What Was Built

### Task 1: mcpPingOneStdioAdapter.js (new file)
Created `banking_api_server/services/mcpPingOneStdioAdapter.js`:
- Spawns `pingidentity/pingone-mcp-server` via `PINGONE_MCP_SERVER_CMD` (default: `npx --yes @pingidentity/mcp-server`)
- Reuses the process across calls; re-spawns on exit
- Speaks MCP JSON-RPC 2.0 over stdin/stdout with line-delimited messages
- Performs `initialize` handshake on first call (`protocolVersion: 2025-11-25`)
- Forwards tool calls via `tools/call` with access token in `_meta.authorization` (never logged)
- 30-second request timeout with clean pending-request rejection on process exit
- Export: `callToolViaStdio(tool, params, accessToken, userSub, correlationId)`

### Task 2: server.js — usePingOneStdio routing
Three targeted edits to `banking_api_server/server.js`:
1. Added `require('./services/mcpPingOneStdioAdapter')` after `mcpGatewayClient` require (line 1009)
2. Added `const usePingOneStdio = configStore.get('mcp_use_pingone_server') === 'true'` before `gatewayHttpUrl` declaration (line 1456)
3. Added `if (usePingOneStdio)` as the FIRST branch in the transport routing if-chain (line 1469)

All existing branches (`useGateway`, `useHttp2`, WebSocket fallback) remain byte-for-byte identical.

## Files Modified
- `banking_api_server/services/mcpPingOneStdioAdapter.js` — new file, 172 lines
- `banking_api_server/server.js` — 3 targeted edits (+5 lines effective)

## Verification
- `typeof callToolViaStdio` = `function` ✅
- `usePingOneStdio` appears at lines 1456 (declaration) and 1469 (if-branch) ✅
- `mcpPingOneStdioAdapter` at lines 1009 (require) and 1470 (usage) ✅
- Access token not logged ✅
- Existing gateway/http2/websocket branches unchanged ✅
