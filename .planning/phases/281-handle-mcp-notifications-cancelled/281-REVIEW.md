---
phase: 281-handle-mcp-notifications-cancelled
reviewed: 2026-05-25T00:00:00Z
depth: standard
files_reviewed: 3
files_reviewed_list:
  - langchain_agent/src/mcp/connection.py
  - langchain_agent/src/agent/mcp_tool_provider.py
  - langchain_agent/tests/test_mcp_connection_demux.py
findings:
  critical: 0
  warning: 2
  info: 4
  total: 6
status: issues_found
---

# Phase 281: Code Review Report

**Reviewed:** 2026-05-25T00:00:00Z
**Depth:** standard
**Files Reviewed:** 3
**Status:** issues_found

## Summary

Phase 281 adds `notifications/cancelled` handling to the `_read_loop` demultiplexer in `MCPConnection` and adds a `CancelledError` re-raise guard in `MCPTool._arun`. The core demux logic is correct and well-tested. The new tests cover the happy path, unknown-ID, and post-cancel recovery cases.

Two warnings were found. The first is that `asyncio.CancelledError` — a `BaseException`, not an `Exception` — is used as the future exception value and propagates all the way to LangChain's tool executor, where it is indistinguishable from an externally-cancelled task. The second is the use of the deprecated `asyncio.get_event_loop()` inside a coroutine. Four minor info items are also noted.

---

## Warnings

### WR-01: `notifications/cancelled` propagates `asyncio.CancelledError` to the LangChain agent — ambiguous cancellation signal

**File:** `langchain_agent/src/mcp/connection.py:299`

**Issue:** When `_read_loop` processes a `notifications/cancelled` frame it calls `fut.set_exception(asyncio.CancelledError())`. Because `asyncio.CancelledError` is a `BaseException` (not `Exception`) in Python 3.8+, it bypasses the `except Exception` guard in `MCPConnection.call_tool` (line 500) and propagates directly to `MCPTool._arun`, which re-raises it (line 517). From LangChain's and LangGraph's perspective this is indistinguishable from the agent task being externally cancelled (e.g. by a timeout or user abort). Depending on how the executor wraps tool invocations, this can silently abort the entire agent turn rather than delivering a recoverable error message to the LLM.

The MCP `notifications/cancelled` event means "the server chose not to fulfil this specific request." That is a domain-level rejection, not a scheduler-level cancellation, and should be exposed as an `Exception` subclass so callers can catch, log, and return a degraded result instead of unwinding the whole task.

**Fix:** Define a typed exception that extends `Exception` and use it instead of `asyncio.CancelledError`:

```python
# In connection.py, alongside MCPConnectionClosedError / MCPRequestTimeoutError
class MCPServerCancelledError(Exception):
    """Raised when the MCP server sends notifications/cancelled for an in-flight request."""
```

In `_read_loop` (line 299):
```python
# Replace:
fut.set_exception(asyncio.CancelledError())
# With:
fut.set_exception(MCPServerCancelledError(
    f"MCP server cancelled requestId={rid}: {frame.get('params', {}).get('reason', '')}"
))
```

In `MCPTool._arun`, remove the bare `asyncio.CancelledError` re-raise (it is no longer the right handler for server-side cancellation) and let the `except Exception` block at line 519 catch it, logging the server cancellation and returning a meaningful error string to the LLM instead of aborting the turn.

Update the tests: `test_cancelled_notification_rejects_matching_pending` and `test_cancelled_error_does_not_permanently_break_connection` should assert `isinstance(result, MCPServerCancelledError)` instead of `asyncio.CancelledError`.

---

### WR-02: `asyncio.get_event_loop()` inside a coroutine — use `get_running_loop()`

**File:** `langchain_agent/src/mcp/connection.py:354`

**Issue:** `_send_request` calls `asyncio.get_event_loop()` to create the future:

```python
loop = asyncio.get_event_loop()
fut: asyncio.Future = loop.create_future()
```

`asyncio.get_event_loop()` is deprecated for use inside a running coroutine since Python 3.10 (PEP 647 / bpo-39529). In Python 3.12 the deprecation warning becomes a runtime exception when called from a thread that has no current event loop. The requirements file pins `websockets>=11.0.0` but does not constrain Python version, and production environments may use Python 3.12+. Inside an `async def` there is always a running loop; the correct call is `asyncio.get_running_loop()`, which has been available since Python 3.7 and raises `RuntimeError` immediately if called outside an async context (a safety net rather than a silent footgun).

**Fix:**
```python
# Replace (line 354):
loop = asyncio.get_event_loop()
# With:
loop = asyncio.get_running_loop()
```

---

## Info

### IN-01: `_auth_challenge_states` dict is never cleared on `disconnect()` or reconnect

**File:** `langchain_agent/src/mcp/connection.py:108`

**Issue:** `MCPConnection._auth_challenge_states` accumulates entries each time `_new_auth_challenge_state()` is called. The only removal path is `validate_auth_challenge_state()` (single-use pop on success). If a challenge is created but the user never completes the authorization flow (browser closed, network error, etc.), that entry is never removed. On a long-lived, pooled connection that handles many abandoned challenges the dict grows without bound.

**Fix:** Clear `_auth_challenge_states` in `disconnect()` alongside the existing `_available_tools` and `_tool_schemas` resets:

```python
# In disconnect(), after self._tool_schemas = {}:
self._auth_challenge_states = {}
```

---

### IN-02: Inline `import traceback` — should be a top-level import

**File:** `langchain_agent/src/mcp/connection.py:503`, `langchain_agent/src/agent/mcp_tool_provider.py:523, 999`

**Issue:** `import traceback` appears inside exception handlers in three places rather than at the top of each module. Similarly, `import json` is repeated inside `_format_json_response` (line 646) and `_format_json_response_for_tool` (line 1029) in `mcp_tool_provider.py` even though `json` is already imported at line 6. Inline imports inside hot paths obscure module dependencies and, in the `json` case, do redundant work on every call.

**Fix:** Remove the three inline `import traceback` statements and add `import traceback` at the top of each affected file. Remove the two inline `import json` statements in `mcp_tool_provider.py` (the top-level import at line 6 is sufficient).

---

### IN-03: Duplicate response-formatting methods between `MCPTool` and `MCPToolProvider`

**File:** `langchain_agent/src/agent/mcp_tool_provider.py:673-840`, `1056-1205`

**Issue:** Six response-formatting methods (`_format_accounts_response`, `_format_balance_response`, `_format_transactions_response`, `_format_transfer_response`, `_format_deposit_response`, `_format_withdrawal_response`) are implemented twice — once as instance methods on `MCPTool` and again as `*_static` variants on `MCPToolProvider`. The two copies are nearly identical (~200 lines duplicated). This is pre-existing, but any bugfix or formatting change must be applied in both places and they can diverge silently (e.g. `_format_transfer_response` on `MCPTool` appends a "reverse this transfer" hint that the `*_static` variant omits).

**Fix:** Extract the formatting logic into module-level functions (or a `ResponseFormatter` helper class) and call them from both `MCPTool` and `MCPToolProvider`. This is not a phase-281 addition, but the duplication degrades maintainability of code that the reviewed files depend on.

---

### IN-04: Test suite lacks coverage for `notifications/cancelled` with missing `params` / `requestId`

**File:** `langchain_agent/tests/test_mcp_connection_demux.py`

**Issue:** The two new `notifications/cancelled` tests cover (a) a matching `requestId` and (b) a wrong `requestId`. There is no test for a malformed cancellation notification that has no `params` key or a `params` dict that omits `requestId`. The production code handles this correctly (`frame.get("params", {}).get("requestId")` returns `None`, then falls to the "ignored" branch), but having an explicit test documents the contract and guards against future regressions.

**Fix:** Add a parametrized test:

```python
@pytest.mark.asyncio
@pytest.mark.parametrize("bad_frame", [
    {"jsonrpc": "2.0", "method": "notifications/cancelled"},           # no params
    {"jsonrpc": "2.0", "method": "notifications/cancelled", "params": {}},  # no requestId
])
async def test_cancelled_notification_missing_request_id_is_ignored(bad_frame):
    conn = MCPConnection(_server_config())
    ws = FakeReorderingWebSocket()
    _connected(conn, ws)

    call = asyncio.create_task(conn.call_tool(_tool_call("safe")))
    for _ in range(200):
        if len(ws.sent) >= 1:
            break
        await asyncio.sleep(0.001)
    real_id = ws.sent[0]["id"]

    ws.push(bad_frame)
    await asyncio.sleep(0.05)
    assert not call.done()

    ws.push({"jsonrpc": "2.0", "id": real_id, "result": {"ok": True}})
    result = await asyncio.wait_for(call, timeout=5)
    assert result == {"ok": True}
    await conn.disconnect()
```

---

_Reviewed: 2026-05-25T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
