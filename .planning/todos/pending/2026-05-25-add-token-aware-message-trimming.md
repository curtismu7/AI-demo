---
title: Add token-aware message trimming to replace unbounded 100-message cap
date: 2026-05-25
priority: high
phase: 278
---

## Problem

`langchain_agent/src/agent/conversation_memory.py` caps history at 100 messages but has no token-aware truncation. With a reasoning-heavy Ollama model and banking tool call outputs, 100 messages can easily overflow the context window — silently degrading response quality.

## Target pattern

```python
from langchain_core.messages import trim_messages

trimmed = trim_messages(
    messages,
    max_tokens=4096,      # configurable per model
    strategy="last",      # keep most recent messages
    token_counter=llm,    # uses the model's tokenizer
    include_system=True,  # always keep system prompt
)
```

## Files affected

- `langchain_agent/src/agent/conversation_memory.py` — add `trim_messages()` call
- `langchain_agent/config/settings.py` — add `MAX_CONTEXT_TOKENS` setting
- OR: handled automatically by LangGraph checkpointer with `MessagesState` (if Phase 275 lands first)

## Notes

If Phase 275 (LangGraph migration) ships first, this becomes a one-line addition to the graph's state reducer rather than a standalone change in `conversation_memory.py`. Either order works.

## Depends on

None — can land independently; best after Phase 275 (LangGraph) for cleanest implementation

## Phase

Planned as Phase 278.
