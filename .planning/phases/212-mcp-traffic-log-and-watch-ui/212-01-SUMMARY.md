# Phase 212-01 Summary — MCP Traffic Logger + API Route + Run Script Commands

## What was built

### `banking_api_server/services/mcpTrafficLogger.js` (new)
- In-memory ring buffer (500 entries) + NDJSON append to `.logs/mcp-traffic.log`
- `writeMcpTrafficEntry(entry)` — non-blocking write, called from patched services
- `getMcpTrafficLog(limit)` — returns most recent N entries for the REST endpoint
- Entry shape: `{ ts, dir, type, method, tool, statusCode, durationMs, ok, summary, correlationId }`
- `dir` values: `'BFF→MCP' | 'MCP→BFF' | 'BFF→PingOne' | 'PingOne→BFF'`

### `banking_api_server/routes/mcpTraffic.js` (new)
- `GET /api/mcp/traffic?limit=N` → `{ entries, logFile, count }`
- Registered in `server.js` behind `requireSession`

### `banking_api_server/services/mcpWebSocketClient.js` (patched)
- Line 10: added `writeMcpTrafficEntry` require
- Inside `mcpRpc()`: request log before WebSocket send (`BFF→MCP`), response log on resolve (`MCP→BFF`), error log on reject

### `banking_api_server/services/agentMcpTokenService.js` (patched)
- Added `writeMcpTrafficEntry` require
- Inside `exchangeTokenRfc8693`: `_exchangeT0` timer + request log before try, response log before `return exchangedToken`, error log inside catch before `return null`

### `banking_api_server/server.js` (patched)
- Added `mcpTrafficRoutes` require
- Registered `app.use('/api/mcp/traffic', requireSession, mcpTrafficRoutes)`

### `run.sh` + `run-bank.sh` (patched)
- Added `LOG_MCP_TRAFFIC` var (`/logs/mcp-traffic.log` and `/tmp/bank-mcp-traffic.log`)
- Extended `cmd_logs` / `tail_bank_logs` arrays with 5th entry (MCP Traffic), updated prompt to 1-6
- Added `mcp-traffic|mcp-watch` dispatch case: tails `LOG_MCP_TRAFFIC` directly

## Verification
- `node --check mcpWebSocketClient.js` → OK
- `node --check agentMcpTokenService.js` → OK
- `node --check server.js` → OK
- `bash -n run.sh` → OK
- `bash -n run-bank.sh` → OK
