---
title: Migrate AgentExecutor + ConversationBufferMemory → LangGraph StateGraph
date: 2026-05-25
priority: high
phase: 275
---

## Problem

`langchain_agent/src/agent/langchain_mcp_agent.py` uses `AgentExecutor` (deprecated LangChain 0.2, maintenance-only until Dec 2026). The pattern:

1. Rebuilds `AgentExecutor` fresh on every request
2. Pre-populates `ConversationBufferMemory` from the custom `ConversationMemory` store
3. Discards the executor after the call

This is exactly the hand-rolled state management anti-pattern that LangGraph checkpointers eliminate. `ConversationBufferMemory` was also deprecated in LangChain 0.3.1.

## Files affected

- `langchain_agent/src/agent/langchain_mcp_agent.py` — main migration target
- `langchain_agent/src/agent/conversation_memory.py` — replaced by LangGraph checkpointer
- `langchain_agent/src/api/session_manager.py` — thread_id maps to session_id, no other change

## Target architecture

```python
from langgraph.prebuilt import create_react_agent
from langgraph.checkpoint.memory import MemorySaver

graph = create_react_agent(
    model=llm,
    tools=tools,  # from langchain-mcp-adapters (Phase 274)
    checkpointer=MemorySaver()  # swap for AsyncPostgresSaver in production
)

# Per-session state via thread_id — no manual memory rebuild
result = await graph.ainvoke(
    {"messages": [HumanMessage(content=user_msg)]},
    config={"configurable": {"thread_id": session_id}}
)
```

## What this unlocks

- ✅ Parallel tool calls (LangGraph `ToolNode` runs concurrent tool invocations)
- ✅ LangGraph interrupt primitive for HITL consent (replaces custom auth popup state machine)
- ✅ Persistent memory without manual rebuild
- ✅ Token-aware message trimming (add `trim_messages()` in the graph)
- ✅ Proper `astream_events` streaming (see Phase 276)

## Depends on

Phase 274 (langchain-mcp-adapters) recommended first — tools come from `client.get_tools()`

## Phase

Planned as Phase 275.
