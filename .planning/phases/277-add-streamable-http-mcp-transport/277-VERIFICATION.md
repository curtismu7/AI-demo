---
phase: 277-add-streamable-http-mcp-transport
verified: 2026-05-25T14:00:00Z
status: passed
score: 5/5 must-haves verified
overrides_applied: 0
---

# Phase 277: Add Streamable HTTP MCP Transport — Verification Report

**Phase Goal:** Add streamable_http as a selectable MCP transport alongside the existing WebSocket transport.
**Verified:** 2026-05-25T14:00:00Z
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| #  | Truth | Status | Evidence |
|----|-------|--------|----------|
| 1  | Setting MCP_TRANSPORT=streamable_http causes the agent to route to StreamableHttpMCPConnection instead of WebSocket | VERIFIED | `MCPConnectionPool.get_connection()` lines 687-705: checks `os.environ.get("MCP_TRANSPORT") == "streamable_http"` and endpoint starts with `http://` or `https://`, then creates/returns `StreamableHttpMCPConnection`. `test_ws_pool_routing_unchanged` confirms WebSocket path untouched. |
| 2  | The Mcp-Session-Id header from the server's initialize response is captured and sent on every subsequent POST /mcp request | VERIFIED | `connect()` line 844: `session_id = response.headers.get("mcp-session-id")` stored to `self._mcp_session_id`. `_post_rpc()` lines 968-969: `if self._mcp_session_id: headers["mcp-session-id"] = self._mcp_session_id`. `test_streamable_http_initialize` and `test_streamable_http_call_tool` pass. |
| 3  | Setting MCP_TRANSPORT=websocket (or leaving it unset) preserves exactly the existing WebSocket code path — no regressions | VERIFIED | All 5 `test_mcp_connection_demux.py` tests pass. `test_ws_pool_routing_unchanged` explicitly confirms MCPConnectionPool returns MCPConnection (WebSocket) when MCP_TRANSPORT=websocket. |
| 4  | MCP_TRANSPORT defaults to websocket so local dev requires no env change | VERIFIED | `MCPConfig.mcp_transport: str = "websocket"` (settings.py line 55). `ConfigManager._build_config()` line 368: `mcp_transport=get_env_value("MCP_TRANSPORT", "websocket")`. Live check confirmed: default value is "websocket" when env var is unset. |
| 5  | A doc comment in settings.py and a module-level docstring in connection.py explain when to use each transport | VERIFIED | settings.py lines 50-55: 4-line inline comment on the field. connection.py lines 18-25: module-level block comment explaining both transports. `StreamableHttpMCPConnection` class docstring on lines 773-783. |

**Score:** 5/5 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `langchain_agent/src/config/settings.py` | MCPConfig.mcp_transport field + MCP_TRANSPORT env wiring + ValueError on invalid | VERIFIED | Lines 50-55: field with doc comment. Line 368: env wiring via get_env_value(). Lines 370-374: validation block. Live test confirmed ValueError raised for invalid value "grpc". |
| `langchain_agent/src/mcp/connection.py` | StreamableHttpMCPConnection class + pool routing | VERIFIED | Class at line 773 with `_mcp_session_id`, `connect()`, `call_tool()`, `list_tools()`, `get_tool_schema()`, `_refresh_tools()`, `_post_rpc()`. Pool routing at lines 685-705. |
| `langchain_agent/tests/test_mcp_streamable_http.py` | 8 unit tests; all pass | VERIFIED | 8 tests found and confirmed: 3 config tests (`TestMCPTransportConfig`) + 5 connection tests. All 8 pass: `pytest tests/test_mcp_streamable_http.py` = 8 passed. |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `MCPConnectionPool.get_connection()` | `StreamableHttpMCPConnection` | `os.environ.get("MCP_TRANSPORT") == "streamable_http"` | WIRED | Lines 687-705 in connection.py confirm routing condition and instantiation |
| `StreamableHttpMCPConnection._post_rpc()` | `POST /mcp` | `httpx.AsyncClient.post` | WIRED | Lines 962-975: `async with httpx.AsyncClient(...) as client: return await client.post(self._mcp_url, ...)` |
| `StreamableHttpMCPConnection.connect()` | `self._mcp_session_id` | captured from `response.headers["mcp-session-id"]` | WIRED | Lines 843-846: `session_id = response.headers.get("mcp-session-id"); if session_id: self._mcp_session_id = session_id` |
| `ConfigManager._build_config()` | `MCPConfig.mcp_transport` | `get_env_value("MCP_TRANSPORT", "websocket")` | WIRED | Line 368: `mcp_transport=get_env_value("MCP_TRANSPORT", "websocket")` |

---

### Data-Flow Trace (Level 4)

Not applicable — this phase adds infrastructure (config + connection class), not a component that renders dynamic UI data. The key data flows (session ID capture + header transmission) are verified via the unit test suite.

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Default MCP_TRANSPORT is "websocket" | `python -c "... cfg.mcp.mcp_transport == 'websocket'"` | "default OK" | PASS |
| Invalid MCP_TRANSPORT raises ValueError | `MCP_TRANSPORT=grpc python -c "..."` | "ValueError raised correctly: MCP_TRANSPORT must be one of {'websocket', 'streamable_http'}, got 'grpc'" | PASS |
| StreamableHttpMCPConnection importable | `python -c "from mcp.connection import StreamableHttpMCPConnection, MCPConnectionPool; print('Import OK')"` | "Import OK" | PASS |
| All 8 streamable_http tests pass | `pytest tests/test_mcp_streamable_http.py -v` | 8 passed in 0.04s | PASS |
| 5 existing demux tests still pass | `pytest tests/test_mcp_connection_demux.py -v` | 5 passed in 0.29s | PASS |
| TS server emits Mcp-Session-Id | `grep "mcp-session-id\|MCP_SESSION_HEADER" HttpMCPTransport.ts` | Line 38 defines `MCP_SESSION_HEADER = 'mcp-session-id'`; lines 528, 579 emit it | PASS |

---

### Probe Execution

No probes declared in PLAN. No `scripts/*/tests/probe-*.sh` files exist for this phase. Step 7c: SKIPPED (no probes declared or conventional probe files present).

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| TRANSPORT-01 | 277-01-PLAN.md | MCPConfig.mcp_transport field + env wiring | SATISFIED | settings.py lines 50-55, 368-374 |
| TRANSPORT-02 | 277-01-PLAN.md | StreamableHttpMCPConnection class with HTTP POST + session tracking | SATISFIED | connection.py lines 773-975 |
| TRANSPORT-03 | 277-01-PLAN.md | MCPConnectionPool routing + no regressions | SATISFIED | connection.py lines 685-705; demux tests pass |

---

### Anti-Patterns Found

No TBD, FIXME, or XXX markers found in any of the three modified files.
No TODO or HACK markers found.
No stub patterns (empty returns, placeholder renders) found.

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | None found | — | — |

---

### Human Verification Required

None. All success criteria are programmatically verifiable and confirmed by live test runs.

---

### Gaps Summary

No gaps. All 5 must-have truths are VERIFIED with direct codebase evidence. All 3 required artifacts exist and are substantive and wired. All 4 key links confirmed present. All 8 new tests pass. All 5 pre-existing demux tests pass. The 8 failures in `test_mcp_tool_registry.py` are pre-existing per the SUMMARY (unrelated to this phase — confirmed the failures are in `TestMCPToolExecutor` and predate Phase 277).

---

## Success Criteria Checklist

- [x] MCPConfig.mcp_transport field exists with default "websocket" and doc comment
- [x] MCP_TRANSPORT env var wires to mcp_transport; invalid value raises ValueError
- [x] StreamableHttpMCPConnection class in connection.py: connect() captures Mcp-Session-Id, call_tool() sends POST /mcp with session header, 404 raises MCPConnectionClosedError
- [x] MCPConnectionPool.get_connection() routes to StreamableHttpMCPConnection when MCP_TRANSPORT=streamable_http and endpoint is http(s)://
- [x] 8 unit tests in test_mcp_streamable_http.py all pass (3 config + 5 connection)
- [x] Existing test_mcp_connection_demux.py tests still pass (5/5)
- [x] No new packages added (httpx>=0.24.0 was already in requirements.txt line 15)
- [x] TS server Mcp-Session-Id emission confirmed via grep (HttpMCPTransport.ts line 38 + lines 528, 579)

---

_Verified: 2026-05-25T14:00:00Z_
_Verifier: Claude (gsd-verifier)_
