---
phase: 278
plan: 01
status: complete
completed_at: "2026-05-25"
commits:
  - 2ff767c9 feat(278-01): add max_context_tokens to ChatConfig and token-aware _trim_session_messages
  - c35c197b test(278): add token-aware trimming tests to test_conversation_memory.py
---

# Phase 278 Plan 01 — Summary

## What was done

Added token-aware message trimming to `ConversationMemory` using `langchain_core.messages.trim_messages()`.

### Task 1 — Settings + ConversationMemory implementation
- `settings.py` `ChatConfig`: added `max_context_tokens: int = 4096`; wired from `LANGCHAIN_MAX_CONTEXT_TOKENS` env var in `_build_config()`
- `conversation_memory.py`:
  - Added `from langchain_core.messages import trim_messages` import
  - Added `max_context_tokens: int = 4096` constructor parameter, stored as `self.max_context_tokens`
  - `_trim_session_messages()` now runs two-stage trim:
    1. **Token-aware trim** (Stage 1): converts `ChatMessage` list → `BaseMessage` list, calls `trim_messages(strategy="last", include_system=True, token_counter=len, max_tokens=self.max_context_tokens)`, slices original `ChatMessage` list to match
    2. **Count cap** (Stage 2): existing `messages[-max_messages_per_session:]` guard runs after token trim
- `.env.example`: added `LANGCHAIN_MAX_CONTEXT_TOKENS=4096` with explanatory comment after `LANGCHAIN_STREAM_LLM_TOKENS`

### Task 2 — Tests
Added `TestTokenAwareTrimming` class with 4 new tests:
- `test_initialization_includes_max_context_tokens` — constructor stores the value
- `test_trim_messages_by_token_count` — 5 msgs + limit=3 → at most 3 kept
- `test_token_trim_keeps_newest_messages` — "Delta" is last after trimming 4 msgs to 2
- `test_token_trim_does_not_exceed_limit` — 10 msgs + limit=2 → at most 2 kept

## Verification

```
✅ ChatConfig.max_context_tokens default = 4096
✅ LANGCHAIN_MAX_CONTEXT_TOKENS env var wired in _build_config
✅ ConversationMemory stores max_context_tokens from constructor
✅ _trim_session_messages calls trim_messages() before count cap
✅ .env.example documents LANGCHAIN_MAX_CONTEXT_TOKENS
✅ pytest tests/test_conversation_memory.py — 33 passed (29 existing + 4 new)
```
