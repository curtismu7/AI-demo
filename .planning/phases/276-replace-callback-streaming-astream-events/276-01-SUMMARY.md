---
phase: 276
plan: 01
status: complete
completed_at: "2026-05-25"
commits:
  - 0f51611f feat(276): replace callback streaming with astream_events v2
  - e63e9f37 fix(276): pass stream_context to _make_stream_config (missing arg)
---

# Phase 276 Plan 01 — Summary

## What was done

Replaced the `WebSocketStreamCallbackHandler` callback class with a native LangGraph
`astream_events(version="v2")` streaming loop inside `process_message_with_tracing`.

### Task 1 — Requirements + graph construction
- `requirements.txt` already had `langgraph>=0.2.0,<1.0.0` (Phase 275); no pin change needed.
- `langchain_mcp_agent.py`: removed `AgentExecutor` / `WebSocketStreamCallbackHandler` imports;
  added `RunnableConfig` import.
- Replaced `_get_agent_executor_for_session` with `_get_graph_for_session` (returns
  `create_react_agent` compiled graph).
- Replaced `_maybe_attach_websocket_streaming` with `_make_stream_config(session_id,
  stream_context, tracer_callback) -> RunnableConfig`.

### Task 2 — astream_events loop
- `process_message_with_tracing` now drives streaming via:
  ```python
  async for event in self._graph.astream_events(agent_input, config=config, version="v2"):
  ```
- Routes `on_tool_start` → `{"type": "stream_event", "event": "tool_start", "tool": name}`
- Routes `on_tool_end` → `{"type": "stream_event", "event": "tool_end", "output_preview": ...}`
- Routes `on_chat_model_stream` → `{"type": "stream_event", "event": "llm_token", "token": ...}`
- Extracts final response from `on_chain_end` output messages.
- `websocket_stream_callback.py` replaced with tombstone that raises `ImportError` on import.
- Bug fix (separate commit): `_make_stream_config` call site was missing `stream_context` arg.

### Task 3 — Tests
- Updated `test_langchain_mcp_agent.py` to mock `graph.astream_events` instead of
  `agent_executor.ainvoke`.
- 72 tests pass (`test_langchain_mcp_agent.py` + `test_helix_llm.py`).
- Pre-existing failures in `test_agent_message_processing.py` and `test_auth_models.py`
  confirmed present before Phase 276 and not introduced by these changes.

## Verification

```
✅ astream_events present in langchain_mcp_agent.py (line 949)
✅ No AgentExecutor import
✅ websocket_stream_callback.py raises ImportError on import
✅ DetailedTracingCallbackHandler wired via RunnableConfig(callbacks=[...])
✅ tracing_callback.py intact
✅ pytest tests/test_langchain_mcp_agent.py — 49 passed
✅ pytest tests/test_helix_llm.py — 23 passed
```
