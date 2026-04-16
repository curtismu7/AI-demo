# Plan 168-01 Summary — HTTP/2 Bridge + BFF Route Update

**Status:** Complete
**Committed:** 103be26

## What Was Built

### 1. `banking_api_server/services/http2McpBridge.js` — HTTP/2 Adapter Service
- **Connection pooling:** Persistent HTTP/2 sessions keyed by `{url}:{tokenPrefix}`, max 5 concurrent
- **MCP spec handshake:** `initialize` → `notifications/initialized` → `tools/call` over HTTP/2 POST /mcp
- **Multiplexing:** Multiple tool calls share a single HTTP/2 socket via h2 streams
- **Exports:** `createHttp2Session`, `forwardToolCall`, `handleMcpResponse`, `closeSession`, `closeAllSessions`
- **Cleanup:** 60s idle timeout, graceful SIGTERM/SIGINT shutdown, 30s per-stream timeout
- **Error handling:** Connection errors, HTTP status propagation, stream timeout cancellation

### 2. `banking_api_server/server.js` — Transport-Aware MCP Proxy
- Added `http2McpBridge` import
- Added transport detection: `useHttp2` flag based on MCP_SERVER_URL protocol (`http://`/`https://` → HTTP/2, `ws://`/`wss://` → WebSocket)
- `POST /api/mcp/tool` now routes to HTTP/2 bridge or WebSocket client based on URL scheme
- **Backward compatible:** WebSocket transport fully preserved for `ws://` URLs
- All existing error handling, local fallback, auth challenge detection unchanged

## Key Design Decisions

- Transport selection by URL scheme (not a feature flag) — simple, deterministic
- HTTP/2 bridge does full MCP handshake per tool call (initialize + tools/call) since the MCP server requires session establishment
- Pool key uses first 16 chars of token to avoid storing full bearer in memory map keys

## Verification

- `node -c server.js` — syntax clean
- `node -c services/http2McpBridge.js` — syntax clean
- `npm run build` (UI) — exit 0
