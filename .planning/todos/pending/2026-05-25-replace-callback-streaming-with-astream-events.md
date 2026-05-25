---
title: Replace callback streaming with astream_events v2
date: 2026-05-25
priority: high
phase: 276
---

## Problem

`langchain_agent/src/agent/websocket_stream_callback.py` attaches a `WebSocketStreamCallbackHandler` to `AgentExecutor.callbacks`. Issues:

- Callbacks on `AgentExecutor` do not propagate reliably to sub-runnables
- Manual `run_id` correlation required for matching start/end events
- Callback class cannot be used with LangGraph (Phase 275 migration)

## Target pattern

```python
async for event in graph.astream_events(input, config=config, version="v2"):
    if event["event"] == "on_tool_start":
        await ws.send_json({"type": "tool_start", "tool": event["name"], "input": event["data"]["input"]})
    elif event["event"] == "on_tool_end":
        await ws.send_json({"type": "tool_end", "output": event["data"]["output"]})
    elif event["event"] == "on_chat_model_stream":
        await ws.send_json({"type": "token", "content": event["data"]["chunk"].content})
```

No callback class. Typed events. Propagates through all nested sub-graphs. `run_id` correlation is automatic via event structure.

## Files affected

- `langchain_agent/src/agent/websocket_stream_callback.py` — replace or gut entirely
- `langchain_agent/src/agent/langchain_mcp_agent.py` — use `astream_events` instead of `ainvoke`
- `langchain_agent/src/agent/tracing_callback.py` — review for same pattern

## Depends on

Phase 275 (LangGraph migration) — `astream_events` is the LangGraph streaming API

## Phase

Planned as Phase 276.
