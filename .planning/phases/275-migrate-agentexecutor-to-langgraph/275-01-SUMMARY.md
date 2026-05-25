---
phase: 275
plan: "01"
status: complete
completed: "2026-05-25"
---

# 275-01 Summary: Install langgraph + Replace AgentExecutor with LangGraph StateGraph

## What Was Built

Replaced the per-request `AgentExecutor` rebuild pattern in `LangChainMCPAgent` with a single
compiled LangGraph `StateGraph` using `MemorySaver` as the checkpointer. The graph is built
once at `initialize_tools()` startup and persists across all sessions, keyed by
`thread_id=session_id` so each user's history is isolated.

## Key Changes

### `langchain_agent/requirements.txt`
- Added `langgraph>=0.2.0,<1.0.0` after `langchain-core` with comment explaining purpose

### `langchain_agent/src/agent/langchain_mcp_agent.py`
- **Removed imports**: `AgentExecutor`, `create_tool_calling_agent`, `ConversationBufferMemory`,
  `ChatPromptTemplate`, `MessagesPlaceholder`
- **Added imports**: `create_react_agent`, `MemorySaver` from `langgraph`; `SystemMessage` from
  `langchain_core.messages`
- **`__init__`**: `self._agent_executor` → `self._graph = None`
- **`initialize_tools()`**: builds `self._graph = create_react_agent(model=llm, tools=tools, checkpointer=MemorySaver())` once at startup; no more `"dynamic"` string sentinel
- **Deleted `_get_agent_executor_for_session()`**: the per-request AgentExecutor rebuild is gone
- **Deleted `_create_agent_prompt()`**: replaced by `_build_system_message(session_id)` which returns a plain string
- **`_build_system_message(session_id)`**: new async method that produces the system prompt string with user-identification context and tool descriptions
- **`_maybe_attach_websocket_streaming()`**: now returns the `WebSocketStreamCallbackHandler` instead of mutating the executor; callers pass it via `config["callbacks"]`
- **`process_message_with_tracing()`**: calls `self._graph.ainvoke({"messages": [...]}, config={"configurable": {"thread_id": session_id}, "callbacks": [...]})`. Response extracted from `result["messages"][-1].content`. SystemMessage injected only on first turn (checked via `graph.get_state()`).
- **`process_message()`**: same `graph.ainvoke()` pattern without callbacks
- **`_create_basic_agent()`**: `BasicChatAgent` updated — `ConversationBufferMemory` removed; `ainvoke` now accepts `{"messages": [...]}` with config kwarg for compatibility with the graph call site
- **`get_agent_status()`**: checks `self._graph is not None`

## Verification

```
grep -c "AgentExecutor" langchain_agent/src/agent/langchain_mcp_agent.py  → 0
grep -c "ConversationBufferMemory" langchain_agent/src/agent/langchain_mcp_agent.py  → 0
grep -c "create_react_agent" langchain_agent/src/agent/langchain_mcp_agent.py  → 2
grep -c "MemorySaver" langchain_agent/src/agent/langchain_mcp_agent.py  → 6
grep -c "thread_id" langchain_agent/src/agent/langchain_mcp_agent.py  → 7
grep -c "_get_agent_executor_for_session" langchain_agent/src/agent/langchain_mcp_agent.py  → 0
python3 -m py_compile langchain_agent/src/agent/langchain_mcp_agent.py  → exit 0
```

## Commits

- `428d42fa` — `chore(275-01): add langgraph>=0.2.0,<1.0.0 to requirements.txt`
- `97faebbd` — `feat(275-01): replace AgentExecutor with LangGraph StateGraph in langchain_mcp_agent.py`

## Self-Check: PASSED

All must-have truths from PLAN.md verified:
- [x] `langgraph>=0.2.0` declared in requirements.txt
- [x] `LangChainMCPAgent` initializes a single compiled graph via `create_react_agent` + `MemorySaver` once at startup
- [x] Per-request `AgentExecutor` rebuild gone — `_get_agent_executor_for_session()` deleted
- [x] `ConversationBufferMemory` import removed from `langchain_mcp_agent.py`
- [x] `graph.ainvoke()` called with `config={'configurable':{'thread_id': session_id}}`
- [x] Response extraction reads `result['messages'][-1].content` not `result['output']`
- [x] Auth popup injection and session challenge check remain functional after ainvoke
- [x] `initialize_session_with_token` / `set_user_identified` remain functional
- [x] WebSocket stream callback attached via `config["callbacks"]` on `graph.ainvoke`
