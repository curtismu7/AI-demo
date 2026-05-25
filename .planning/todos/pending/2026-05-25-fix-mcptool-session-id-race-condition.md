---
title: Fix MCPTool _current_session_id race condition
date: 2026-05-25
priority: critical
phase: 273
---

## Problem

`MCPTool._current_session_id` is stored as a `PrivateAttr` on the tool instance. Tool instances are reused across sessions. `set_session_context()` is called before invocation, but two concurrent sessions can race:

```
Session A: set_session_context("session-a")
                                            Session B: set_session_context("session-b")
Session A: _arun() reads _current_session_id → gets "session-b"  ← WRONG
```

The per-session message worker (`WR-02`) serializes within a session but does NOT prevent two sessions from concurrently reaching `_arun()` on the same tool instance.

## File

`langchain_agent/src/agent/mcp_tool_provider.py` — `MCPTool` class

## Fix

Pass `session_id` as a runtime parameter through the tool invocation rather than storing it as mutable instance state. Options:

1. Pass `session_id` via tool input schema (add to every tool call)
2. Use Python `contextvars.ContextVar` (already used elsewhere in the codebase for correlation IDs — `src/utils/correlation_context.py`)
3. Migrate to `langchain-mcp-adapters` which uses a stateless model (fresh session per invocation)

Option 2 (ContextVar) is the surgical fix; Option 3 is the architectural fix (see Phase 275).

## Why it matters

Race conditions in session context lead to one user's banking operations executing under another user's session — a security issue in addition to a correctness bug.

## Phase

Planned as Phase 273.
