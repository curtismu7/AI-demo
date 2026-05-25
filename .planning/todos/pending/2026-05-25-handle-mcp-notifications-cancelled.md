---
title: Handle MCP notifications/cancelled to prevent _pending dict leak
date: 2026-05-25
priority: low
phase: 281
---

## Problem

The MCP spec (`2025-03-26`) defines `notifications/cancelled` — the client should handle this for long-running tools. If a user navigates away mid-tool-call, the current `_pending` dict in `langchain_agent/src/mcp/connection.py` will leak the JSON-RPC request indefinitely (no cleanup on disconnect or cancellation).

## Fix

1. Handle `notifications/cancelled` incoming messages: resolve/reject the pending future with a `CancelledError`
2. On WebSocket close/disconnect: cancel and clean up all entries in `_pending`
3. On LangGraph graph cancellation (Phase 275): propagate `asyncio.CancelledError` correctly through tool invocation

## Files affected

- `langchain_agent/src/mcp/connection.py` — `_pending` dict cleanup on disconnect + `notifications/cancelled` handler
- `langchain_agent/src/agent/mcp_tool_provider.py` — handle `CancelledError` gracefully in `_arun`

## Notes

If Phase 274 (langchain-mcp-adapters) ships first, the library handles session lifecycle and this cleanup may be automatic. Check library behaviour before implementing.

## Phase

Planned as Phase 281.
