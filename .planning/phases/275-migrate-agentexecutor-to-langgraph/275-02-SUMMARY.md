---
phase: 275
plan: "02"
status: complete
completed: "2026-05-25"
---

# 275-02 Summary: Remove ConversationBufferMemory from ConversationMemory

## What Was Built

Removed the dead `_langchain_memories` dict from `ConversationMemory` and eliminated all
`get_conversation_history()` call sites from `langchain_mcp_agent.py`. Chat history is now
entirely owned by the LangGraph MemorySaver checkpointer (Plan 275-01).
`get_conversation_history()` is kept as a stub that returns `[]` with a deprecation warning
so external callers don't crash if any exist outside the agent.

## Key Changes

### `langchain_agent/src/agent/conversation_memory.py`
- **Removed imports**: `HumanMessage`, `AIMessage` from `langchain_core.messages`; `ConversationBufferMemory` from `langchain.memory`
- **`__init__`**: removed `self._langchain_memories: Dict[str, ConversationBufferMemory] = {}`
- **`get_or_create_session()`**: removed `ConversationBufferMemory` initialization block
- **`add_message()`**: removed entire "Add to LangChain memory" block
- **`get_conversation_history()`**: body replaced with deprecation `logger.warning` + `return []`
- **`_trim_session_messages()`**: removed `_langchain_memories` rebuild block; only `_messages` trimming remains
- **`clear_session()`**: removed `_langchain_memories[session_id]` deletion
- **`cleanup()`**: removed `self._langchain_memories.clear()`

### `langchain_agent/src/agent/langchain_mcp_agent.py`
- Already clean from Plan 275-01 — zero `get_conversation_history` calls, zero `ConversationBufferMemory` references

### `langchain_agent/tests/test_conversation_memory.py`
- RED commit (b5568b89): added `TestConversationMemoryPostMigration` asserting `_langchain_memories` absent, `get_conversation_history` returns `[]`
- GREEN: implementation passes all 29 tests
- Fixed pre-existing bug: `sample_chat_session` fixture used timezone-naive `datetime.now()` — changed to `datetime.now(timezone.utc)` to match production code

## Verification

```
python3 -m py_compile langchain_agent/src/agent/conversation_memory.py  → exit 0
python3 -m py_compile langchain_agent/src/agent/langchain_mcp_agent.py  → exit 0
grep -c "ConversationBufferMemory" conversation_memory.py  → 0
grep -c "_langchain_memories" conversation_memory.py  → 0
grep -c "get_conversation_history" langchain_mcp_agent.py  → 0
pytest langchain_agent/tests/test_conversation_memory.py  → 29 passed
```

## Commits

- `b5568b89` — `test(275-02): add failing tests for removal of _langchain_memories from ConversationMemory`
- `31cafef5` — `feat(275-02): remove _langchain_memories from ConversationMemory`
- `ef95c9f0` — `fix(275-02): fix timezone-naive comparison in sample_chat_session fixture`

## Self-Check: PASSED

All must-have truths from PLAN.md verified:
- [x] `ConversationMemory._langchain_memories` dict deleted — no more `ConversationBufferMemory` objects stored
- [x] `get_conversation_history` returns `[]` and is marked deprecated
- [x] `langchain_mcp_agent.py` has zero calls to `get_conversation_history()`
- [x] All other `ConversationMemory` public methods pass existing tests
- [x] The cleanup loop and session timeout logic preserved
- [x] `pytest langchain_agent/tests/test_conversation_memory.py` — 29 passed, 0 failed
