---
title: Migrate to langchain-mcp-adapters (official MCP tool binding library)
date: 2026-05-25
priority: high
phase: 274
---

## Problem

`langchain_agent/src/agent/mcp_tool_provider.py` is a ~400 LOC hand-roll of what `langchain-mcp-adapters` (PyPI: `langchain-mcp-adapters`, v0.2.2) provides out of the box:

- Tool schema generation from MCP JSON Schema definitions
- `BaseTool` wrapping
- Tool name sanitization (`.` → `_`)
- Multi-server routing
- WebSocket / HTTP / SSE / stdio transport support
- Per-invocation auth headers

Every MCP tool schema change currently requires maintaining the custom conversion code. The official library handles this automatically and is maintained by LangChain-AI.

## Files to replace

- `langchain_agent/src/agent/mcp_tool_provider.py` — replace with `MultiServerMCPClient`
- `langchain_agent/src/mcp/connection.py` — replace connection pooling with library's session management
- `langchain_agent/src/mcp/tool_registry.py` — replace `ToolRegistry.create_langchain_tool()` with `client.get_tools()`

## Target API

```python
from langchain_mcp_adapters.client import MultiServerMCPClient

async with MultiServerMCPClient({
    "banking": {
        "url": "ws://localhost:8080",
        "transport": "websocket",
        "headers": {"Authorization": f"Bearer {token}"}
    }
}) as client:
    tools = await client.get_tools()  # List[BaseTool], schemas auto-generated
```

## Migration path

1. Install `langchain-mcp-adapters` in `langchain_agent/requirements.txt`
2. Replace `MCPToolProvider` with `MultiServerMCPClient` in `langchain_mcp_agent.py`
3. Delete `mcp_tool_provider.py` (or keep as thin wrapper during transition)
4. Update tests — `test_mcp_tool_provider.py` tests become redundant
5. Also fixes the `_current_session_id` race (stateless model)

## Phase

Planned as Phase 274.
