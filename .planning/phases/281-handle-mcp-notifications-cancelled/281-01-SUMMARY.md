---
phase: 281
plan: 01
status: complete
completed_at: "2026-05-25"
commits:
  - 574786a9 feat(281): handle notifications/cancelled in _read_loop + CancelledError guard in _arun
---

# Phase 281 Plan 01 — Summary

## What was done

Added handling for `notifications/cancelled` MCP frames and an explicit `asyncio.CancelledError` guard to prevent silent resource leaks and swallowed cancellations.

### Task 1 — connection.py + mcp_tool_provider.py

**`connection.py` `_read_loop`:** The existing `if msg_id is None:` branch (which previously just dropped all id-less frames) now checks `frame.get("method") == "notifications/cancelled"` first. If matched:
- Extracts `rid = frame.get("params", {}).get("requestId")`
- Pops `self._pending[rid]` and calls `fut.set_exception(asyncio.CancelledError())` if found and not done
- Logs at INFO: `"Received notifications/cancelled for requestId={rid} from {server_name} — cancelling pending future"`
- Unknown `requestId` → DEBUG log, ignored (no crash, no corruption)
- All other id-less frames fall through to existing "dropped" DEBUG log

`_fail_all_pending` calls in `disconnect()` and `_read_loop` finally are unchanged (grep count = 3).

**`mcp_tool_provider.py` `MCPTool._arun`:** Added `except asyncio.CancelledError: raise` immediately before the bare `except Exception` block (line 515 vs 519). `CancelledError` now propagates correctly through the asyncio task stack instead of being swallowed.

### Task 2 — Three new tests in test_mcp_connection_demux.py

- `test_cancelled_notification_rejects_matching_pending` — push `notifications/cancelled` with real requestId → future resolves with `CancelledError`, `_pending == {}`
- `test_cancelled_notification_for_unknown_id_is_ignored` — push with wrong requestId → original call unaffected, completes with real result
- `test_cancelled_error_does_not_permanently_break_connection` — after a cancellation, second call succeeds normally

## Verification

```
✅ pytest tests/test_mcp_connection_demux.py — 8 passed (5 existing + 3 new)
✅ grep "notifications/cancelled" src/mcp/connection.py → 1+ matches
✅ grep "CancelledError" src/agent/mcp_tool_provider.py → line 515 (before except Exception line 519)
✅ grep -c "_fail_all_pending" src/mcp/connection.py → 3 (unchanged)
```
