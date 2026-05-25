---
phase: "277"
plan: "01"
status: complete
completed: "2026-05-25"
---

# Summary: Phase 277-01 — StreamableHttpMCPConnection + MCP_TRANSPORT config

## What was done

### Task 1: MCPConfig.mcp_transport + env wiring (settings.py)

Added `mcp_transport: str = "websocket"` to `MCPConfig` dataclass with a multi-line doc comment explaining both transport options. Wired `MCP_TRANSPORT` env var in `ConfigManager._build_config()` via the existing `get_env_value()` helper. Added validation that rejects unrecognised values with a clear `ValueError` at config load time. Default is `"websocket"` so local dev requires no env changes.

### Task 2: StreamableHttpMCPConnection + pool routing (connection.py)

Added `import httpx` and `import os` at the top. Added a module-level transport selection comment block. Implemented `StreamableHttpMCPConnection(MCPClient)` at the end of the file:

- `connect()` — POSTs `initialize` JSON-RPC to `{endpoint}/mcp`; captures `mcp-session-id` from response headers; calls `_refresh_tools()` after session established
- `call_tool()` — POSTs `tools/call` with `mcp-session-id` and `Authorization` headers; raises `MCPConnectionClosedError` on 404 (session expired)
- `list_tools()` / `get_tool_schema()` — return from internal caches populated by `_refresh_tools()`
- `_refresh_tools()` — POSTs `tools/list`; populates `_available_tools` and `_tool_schemas`
- `_post_rpc()` — creates `httpx.AsyncClient` per request with Content-Type, mcp-protocol-version, mcp-session-id, and Authorization headers
- `handle_auth_challenge()` — raises `NotImplementedError` (auth is header-based in HTTP transport)

Routing added in `MCPConnectionPool.get_connection()` before the existing WebSocket branch: when `os.environ.get("MCP_TRANSPORT") == "streamable_http"` and endpoint starts with `http://` or `https://`, the pool creates/reuses a `StreamableHttpMCPConnection`.

## Tests

All 8 tests in `langchain_agent/tests/test_mcp_streamable_http.py` pass:
- `test_mcp_transport_default` — default is "websocket"
- `test_mcp_transport_env_override` — MCP_TRANSPORT=streamable_http is wired
- `test_mcp_transport_invalid_raises` — ValueError on invalid value
- `test_streamable_http_initialize` — connect() captures mcp-session-id
- `test_streamable_http_call_tool` — call_tool() sends mcp-session-id header
- `test_streamable_http_session_expired` — 404 raises MCPConnectionClosedError
- `test_streamable_http_list_tools` — list_tools() returns tool names from connect()
- `test_ws_pool_routing_unchanged` — WebSocket path unaffected

All 10 pre-existing tests in `test_mcp_connection_demux.py` still pass. The 8 failures in `test_mcp_tool_registry.py` are pre-existing (unrelated to this phase).

## Files modified

- `langchain_agent/src/config/settings.py` — MCPConfig.mcp_transport field + validation
- `langchain_agent/src/mcp/connection.py` — httpx import, transport comment, StreamableHttpMCPConnection class, pool routing
- `langchain_agent/tests/test_mcp_streamable_http.py` — 8 unit tests (written in RED phase)

## No new dependencies

`httpx>=0.24.0` was already in `requirements.txt`. No new packages added.

## TS server confirmation

`HttpMCPTransport.ts` line 38 defines `MCP_SESSION_HEADER = 'mcp-session-id'`; lines 528 and 579 emit it in all POST /mcp responses. No TS changes required.
