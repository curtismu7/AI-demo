---
phase: 281-handle-mcp-notifications-cancelled
fixed_at: 2026-05-25T20:30:00Z
review_path: .planning/phases/281-handle-mcp-notifications-cancelled/281-REVIEW.md
iteration: 1
findings_in_scope: 2
fixed: 2
skipped: 0
status: all_fixed
---

# Phase 281: Code Review Fix Report

**Fixed at:** 2026-05-25T20:30:00Z
**Source review:** .planning/phases/281-handle-mcp-notifications-cancelled/281-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 2
- Fixed: 2
- Skipped: 0

## Fixed Issues

### WR-01: `notifications/cancelled` propagates `asyncio.CancelledError` to the LangChain agent — ambiguous cancellation signal

**Files modified:** `langchain_agent/src/mcp/connection.py`, `langchain_agent/src/agent/mcp_tool_provider.py`, `langchain_agent/tests/test_mcp_connection_demux.py`
**Commit:** 23659918
**Applied fix:**
- Defined `MCPServerCancelledError(Exception)` in `connection.py` alongside the existing typed errors (`MCPConnectionClosedError`, `MCPRequestTimeoutError`).
- Updated `_read_loop` to call `fut.set_exception(MCPServerCancelledError(...))` instead of `asyncio.CancelledError()` when processing `notifications/cancelled` frames, with the `requestId` and optional `reason` included in the message.
- Removed the bare `asyncio.CancelledError` re-raise guard in `MCPTool._arun` (`mcp_tool_provider.py`) — now that server-side cancellations raise `MCPServerCancelledError` (an `Exception`), the existing `except Exception` block handles them correctly and returns a degraded error string to the LLM instead of aborting the agent turn.
- Updated test assertions in `test_mcp_connection_demux.py` to assert `MCPServerCancelledError` instead of `asyncio.CancelledError` for the two cancellation notification tests.
- The `get_event_loop()` → `get_running_loop()` change (WR-02) was included atomically in this same commit since both changes touched `connection.py`.

### WR-02: `asyncio.get_event_loop()` inside a coroutine — use `get_running_loop()`

**Files modified:** `langchain_agent/src/mcp/connection.py`
**Commit:** 23659918
**Applied fix:**
- Replaced `asyncio.get_event_loop()` with `asyncio.get_running_loop()` at line 361 of `_send_request`. This was committed atomically with WR-01 since both changes were in the same file (`connection.py`). The fix eliminates the Python 3.10+ deprecation warning and the Python 3.12+ runtime exception risk.

**Test verification:** All 8 tests in `langchain_agent/tests/test_mcp_connection_demux.py` pass after both fixes:
```
8 passed in 0.37s
```

## Notes on Fast-Forward

The automatic fast-forward of `main` to `gsd-reviewfix/281-63536` was blocked because the main working tree has uncommitted changes to `langchain_agent/src/mcp/mcp_tool_provider.py` (from a separate in-progress phase). The fix commit is preserved on branch `gsd-reviewfix/281-63536` (commit `23659918`) and can be merged or cherry-picked once the in-progress changes are committed or stashed.

---

_Fixed: 2026-05-25T20:30:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
