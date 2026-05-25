---
phase: 273
plan: 01
status: complete
completed_at: "2026-05-25"
commits:
  - 84d45353 fix(273): replace MCPTool PrivateAttr session state with ContextVars — race condition fix
---

# Phase 273 Plan 01 — Summary

## What was done

Fixed a cross-session data leakage race condition in `MCPTool` by replacing `PrivateAttr` instance state with module-level `contextvars.ContextVar`.

### Task 1 — mcp_tool_provider.py

**Root cause:** `MCPTool._current_session_id` and `_current_agent_token` were Pydantic `PrivateAttr` instance attributes. `MCPTool` instances are shared across concurrent async tasks (they live on the LangGraph agent for the connection lifetime). Under concurrency, one task's `self._current_session_id = session_id` could overwrite another task's in-flight value between the assignment and the next `await` — causing cross-session tool calls to use the wrong session/token.

**Fix:**
- Added two module-level `ContextVar` declarations at the top of `mcp_tool_provider.py`:
  ```python
  _current_session_id_var: contextvars.ContextVar[Optional[str]] = contextvars.ContextVar("_current_session_id_var", default=None)
  _current_agent_token_var: contextvars.ContextVar[Optional[str]] = contextvars.ContextVar("_current_agent_token_var", default=None)
  ```
- Removed the two `PrivateAttr` declarations for `_current_session_id` and `_current_agent_token` from the `MCPTool` class
- All `self._current_session_id = ...` assignments → `_current_session_id_var.set(...)`
- All `self._current_session_id` reads → `_current_session_id_var.get()`
- Same pattern for `_current_agent_token_var`
- Final PrivateAttr count: 1 (only `_conversation_memory` remains — the `import PrivateAttr` and single usage are intentional)

Each asyncio Task inherits an isolated copy of the context from its spawning task; setting a ContextVar in one task is invisible to all other concurrent tasks. This is the canonical Python fix for shared-mutable-state races in async code.

### Task 2 — test_mcp_tool_provider.py

Added `TestSessionContextIsolation` class with 3 tests verifying the ContextVar isolation guarantee:
- `test_session_context_vars_are_isolated_across_tasks` — two concurrent tasks set different session IDs; each reads its own value
- `test_agent_token_context_vars_are_isolated_across_tasks` — same isolation guarantee for `_current_agent_token_var`
- `test_context_var_default_is_none` — unset ContextVar returns `None` (safe default)

### Task 3 — REGRESSION_PLAN.md §4

Added [273] entry at top of Bug Fix Log documenting the race condition, fix, and regression check command.

## Verification

```
✅ pytest tests/test_mcp_tool_provider.py — 26 passed
✅ grep -c "_current_session_id_var" src/agent/mcp_tool_provider.py → 20 (all reads/writes use ContextVar)
✅ grep -c "PrivateAttr" src/agent/mcp_tool_provider.py → 2 (import + _conversation_memory only)
✅ TestSessionContextIsolation exists in test_mcp_tool_provider.py
✅ REGRESSION_PLAN.md §4 [273] entry added
```
