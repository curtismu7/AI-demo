---
title: Wire MCP tool annotations (destructive/idempotent) through to LangChain agent
date: 2026-05-25
priority: low
phase: 280
---

## Problem

`demo_mcp_server/src/tools/BankingToolRegistry.ts` emits `annotations` in tool metadata (e.g., `destructive: true`, `idempotent: false`). The Python `MCPToolProvider` / `langchain-mcp-adapters` does not pass these to LangChain tool definitions.

Result: the LangChain agent cannot make annotation-aware decisions — e.g., it cannot automatically require confirmation before calling a destructive tool.

## Target

1. Read `annotations` from MCP tool metadata in tool loading (via `langchain-mcp-adapters` or custom code)
2. Pass annotations to LangChain tool's `metadata` dict:
   ```python
   tool.metadata = {"destructive": True, "idempotent": False}
   ```
3. Add a system prompt instruction: "Before calling any tool with `destructive: true` in its metadata, state what you are about to do and ask for confirmation."
4. Optionally: wire into LangGraph interrupt pattern (see Phase 275 HITL idea)

## Files affected

- `langchain_agent/src/agent/mcp_tool_provider.py` (or `langchain-mcp-adapters` wrapper)
- `langchain_agent/src/agent/langchain_mcp_agent.py` — system prompt addition

## Depends on

Phase 274 (langchain-mcp-adapters) or Phase 275 (LangGraph)

## Phase

Planned as Phase 280.
