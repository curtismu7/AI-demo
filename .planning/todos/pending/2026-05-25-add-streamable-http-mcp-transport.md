---
title: Add streamable HTTP transport option for MCP Python client
date: 2026-05-25
priority: high
phase: 277
---

## Problem

The MCP spec (`2025-03-26`) deprecated WebSocket transport in favour of **Streamable HTTP** (HTTP POST for client→server, SSE stream for server→client responses). The Python LangChain agent still uses WebSocket transport (`langchain_agent/src/mcp/connection.py`), while the TypeScript MCP server already has `HttpMCPTransport.ts`.

Long-lived WebSocket connections create reconnect complexity:
- `_pending` dict in `connection.py` for JSON-RPC request correlation
- Retry logic on disconnect
- Sticky session requirements for load-balanced deployments

## Target

The `langchain-mcp-adapters` library (Phase 274) supports `streamable_http` transport:

```python
async with MultiServerMCPClient({
    "banking": {
        "url": "http://localhost:8080/mcp",
        "transport": "streamable_http",
        "headers": {"Authorization": f"Bearer {token}"}
    }
}) as client:
    tools = await client.get_tools()
```

## Files affected

- `langchain_agent/src/mcp/connection.py` — add `streamable_http` transport path
- `langchain_agent/config/settings.py` — add `MCP_TRANSPORT` setting (`websocket` | `streamable_http`)
- `demo_mcp_server/src/server/HttpMCPTransport.ts` — verify `Mcp-Session-Id` header is emitted
- `langchain_agent/src/mcp/local_connection.py` — update for local dev

## Approach

Keep WebSocket as fallback for local dev compatibility. Default to `streamable_http` in staging/production config.

## Depends on

Phase 274 (langchain-mcp-adapters) — the adapter handles transport switching

## Phase

Planned as Phase 277.
