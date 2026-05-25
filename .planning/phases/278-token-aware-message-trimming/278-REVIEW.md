---
phase: 278-token-aware-message-trimming
reviewed: 2026-05-25T00:00:00Z
depth: standard
files_reviewed: 4
files_reviewed_list:
  - langchain_agent/src/config/settings.py
  - langchain_agent/src/agent/conversation_memory.py
  - langchain_agent/tests/test_conversation_memory.py
  - langchain_agent/.env.example
findings:
  critical: 2
  warning: 3
  info: 1
  total: 6
status: issues_found
---

# Phase 278: Code Review Report

**Reviewed:** 2026-05-25T00:00:00Z
**Depth:** standard
**Files Reviewed:** 4
**Status:** issues_found

## Summary

Phase 278 added "token-aware" message trimming to `ConversationMemory` using `langchain_core.messages.trim_messages()` with a two-stage pipeline: Stage 1 trims by `max_context_tokens`, Stage 2 caps by `max_messages_per_session`. The feature is internally documented as message-count-based (using `token_counter=len`), but the external name, default value, `.env.example` documentation, and user-facing comment in `ChatConfig` all describe it as a genuine token-budget mechanism for protecting an LLM context window.

There are two BLOCKER-level correctness bugs in the slice logic of `_trim_session_messages()` that cause trimming to silently do nothing in edge cases. Additionally, the feature is dead code under the default configuration: with `max_context_tokens=4096` and `max_messages_per_session=100` (both defaults), Stage 1 can never fire because Stage 2 holds the count at ≤ 100, which is always below 4096. The tests exercise Stage 1 only because they deliberately set `max_context_tokens` well below `max_messages_per_session`, hiding the production no-op.

---

## Critical Issues

### CR-01: Negative-zero slice silently disables trimming when `n_trimmed == 0`

**File:** `langchain_agent/src/agent/conversation_memory.py:367`

**Issue:** When `trim_messages()` returns an empty list (e.g., `max_context_tokens=0` or `max_context_tokens=-1` via a misconfigured env var), `n_trimmed` is `0`. The `else` branch then executes `kept = messages[-n_trimmed:]`, which is `messages[-0:]` = `messages[0:]` = the full original list. No messages are discarded. The subsequent `self._messages[session_id] = kept` silently leaves the session unmodified, and Stage 1's log line still prints `"Token-trimmed … N -> N messages"` (same count), making the failure invisible.

Python confirms: `x = [1,2,3]; x[-0:]` → `[1, 2, 3]` (all elements).

This path is reachable any time `LANGCHAIN_MAX_CONTEXT_TOKENS=0` or a negative integer is written to `.env`. Neither `settings.py` nor `ConversationMemory.__init__` validates the value is positive.

**Fix:**
```python
# In _trim_session_messages, replace the else branch:
else:
    if n_trimmed == 0:
        kept = []
    else:
        kept = messages[-n_trimmed:]
```

Or more concisely, guard before the branch:

```python
if len(trimmed_base) < len(messages):
    n_trimmed = len(trimmed_base)
    if n_trimmed == 0:
        self._messages[session_id] = []
        logger.info(...)
        messages = self._messages[session_id]
    elif trimmed_base and isinstance(trimmed_base[0], SystemMessage) and \
            messages and messages[0].role == "system":
        non_system = [m for m in messages[1:]]
        kept = [messages[0]] + (non_system[-(n_trimmed - 1):] if n_trimmed > 1 else [])
        self._messages[session_id] = kept
        ...
    else:
        kept = messages[-n_trimmed:]
        self._messages[session_id] = kept
        ...
```

---

### CR-02: Same negative-zero slice bug in the system-message branch when `n_trimmed == 1`

**File:** `langchain_agent/src/agent/conversation_memory.py:364-365`

**Issue:** When `trim_messages()` returns exactly one message and that message is a `SystemMessage` (e.g., `max_context_tokens=1` with a conversation starting with a system message), the system-message branch executes:

```python
non_system = [m for m in messages[1:]]
kept = [messages[0]] + non_system[-(n_trimmed - 1):]
#                       ^^^^^^^^^^^^^^^^^^^^^^^^^^
#                       n_trimmed - 1 = 0 → non_system[-0:] → ALL non-system messages
```

`non_system[-0:]` = `non_system[0:]` = the entire non-system list. The result is `kept = [system_msg] + all_non_system_msgs` — effectively the original full list. No messages are removed. The trimmer silently keeps every message when the model's "budget" only has room for the system message alone.

Reproduced experimentally: with `[SystemMessage("system"), HumanMessage("h1"), HumanMessage("h2")]` and `max_tokens=1`, `trim_messages()` returns `[SystemMessage("system")]` and the code assigns `kept = [SystemMessage, HumanMessage("h1"), HumanMessage("h2")]` — all three messages.

**Fix:** Guard `n_trimmed - 1` before using it as a negative slice index:

```python
if trimmed_base and isinstance(trimmed_base[0], SystemMessage) and \
        messages and messages[0].role == "system":
    non_system = [m for m in messages[1:]]
    tail_count = n_trimmed - 1
    kept = [messages[0]] + (non_system[-tail_count:] if tail_count > 0 else [])
```

---

## Warnings

### WR-01: Feature is dead code under the default configuration

**File:** `langchain_agent/src/agent/conversation_memory.py:341`

**Issue:** Stage 1 fires only when `len(messages) > self.max_context_tokens`. With the shipped defaults (`max_context_tokens=4096` in `ChatConfig`, `max_messages_per_session=100` in `ConversationMemory`), Stage 2 trims the session to ≤ 100 messages on every `add_message` call. The session count can never reach 4097, so the Stage 1 guard is never true. Stage 1 is dead code with the defaults; every deployed instance without explicit `LANGCHAIN_MAX_CONTEXT_TOKENS` override gets zero protection from the new trimming layer.

The tests avoid this problem by setting `max_context_tokens=2` or `max_context_tokens=3` (below `max_messages_per_session=50`), which makes Stage 1 fire in tests but never in production defaults.

**Fix:** Either lower the default to something below `max_messages_per_session` (e.g., `max_context_tokens: int = 50`), or add a validation at construction that warns/errors when `max_context_tokens >= max_messages_per_session`:

```python
# In ConversationMemory.__init__:
if max_context_tokens >= max_messages_per_session:
    logger.warning(
        f"max_context_tokens ({max_context_tokens}) >= max_messages_per_session "
        f"({max_messages_per_session}): Stage-1 token trim will never fire. "
        "Set max_context_tokens below max_messages_per_session to activate it."
    )
```

---

### WR-02: `max_context_tokens` counts messages, not tokens — naming and documentation are misleading

**File:** `langchain_agent/.env.example:22-24`; `langchain_agent/src/config/settings.py:111-115`; `langchain_agent/src/agent/conversation_memory.py:40-43`

**Issue:** The public name `max_context_tokens`, the env var `LANGCHAIN_MAX_CONTEXT_TOKENS`, and the `.env.example` user-facing comment all describe this as a token-budget mechanism:

> *"Set to your model's context length. Default 4096 suits most Ollama 7B models. Increase to 8192 or 16384 for models with larger context windows."*

In reality, `token_counter=len` makes `trim_messages()` count messages, not tokens. Setting `LANGCHAIN_MAX_CONTEXT_TOKENS=4096` retains up to 4096 messages. At a conservative average of 200 tokens/message, this sends ~800,000 tokens to a model that may have a 4096-token context window — providing no actual protection against context overflow.

The internal code comments in `ChatConfig` and `ConversationMemory.__init__` correctly document this as a message-count cap, but those are invisible to operators configuring the service via `.env`. The `.env.example` guidance is factually wrong and will lead operators to believe their model context window is protected when it is not.

**Fix (two options):**

Option A — Rename to reflect reality:
```python
# settings.py ChatConfig field:
max_messages_before_trim: int = 50  # or keep max_context_tokens but fix the docstring
```

Option B — Implement actual token counting using the model's tokenizer:
```python
# In _trim_session_messages, replace token_counter=len with a real tokenizer:
from langchain_core.messages import get_buffer_string
token_counter = lambda msgs: len(get_buffer_string(msgs).split())  # rough word count
# Or use tiktoken / model-specific tokenizer for accuracy
```

At minimum, update `.env.example` to correct the user-facing claim:

```bash
# Context window TRIMMING via message count (NOT token count).
# Each message counts as 1 "token" (token_counter=len).
# Default 4096 means: keep at most 4096 messages before trimming.
# This does NOT enforce a token budget — use a smaller value like 20-50 for real control.
LANGCHAIN_MAX_CONTEXT_TOKENS=4096
```

---

### WR-03: No input validation for `max_context_tokens` — zero or negative values accepted silently

**File:** `langchain_agent/src/config/settings.py:423`; `langchain_agent/src/agent/conversation_memory.py:29-48`

**Issue:** `int(get_env_value("LANGCHAIN_MAX_CONTEXT_TOKENS", "4096"))` accepts any integer, including `0` and negative values. A value of `0` makes `len(messages) > 0` always true, calls `trim_messages(..., max_tokens=0)` which returns `[]`, then hits CR-01 (no-op trim). A value of `-1` calls `trim_messages(..., max_tokens=-1)` which also returns `[]`, same result. Neither `ConfigManager._build_config()` nor `ConversationMemory.__init__` rejects these values.

**Fix:** Add validation in `_build_config()`:

```python
max_context_tokens = int(get_env_value("LANGCHAIN_MAX_CONTEXT_TOKENS", "4096"))
if max_context_tokens <= 0:
    raise ValueError(
        f"LANGCHAIN_MAX_CONTEXT_TOKENS must be a positive integer, got {max_context_tokens}"
    )
```

---

## Info

### IN-01: Tests in `TestTokenAwareTrimming` validate message-count behavior, not token-aware behavior

**File:** `langchain_agent/tests/test_conversation_memory.py:494-543`

**Issue:** All four new tests use `token_counter=len` semantics (message count) and verify `len(msgs) <= N`. No test exercises the system-message preservation path (CR-02's bug scenario). No test covers `max_context_tokens=0` or `max_context_tokens=1` with a system-message-led conversation. No test confirms that messages beyond the token budget are actually dropped (as opposed to count-capped by Stage 2). The test class is named `TestTokenAwareTrimming` but tests only confirm count boundaries.

**Suggested additions:**

```python
@pytest.mark.asyncio
async def test_system_message_preserved_after_token_trim(self):
    """System message at index 0 is retained; tail_count=0 keeps only the system msg."""
    session_id = "sys-trim"
    memory = ConversationMemory(max_messages_per_session=50, max_context_tokens=1)
    sys_msg = ChatMessage(id="0", session_id=session_id, content="You are helpful.",
                          role="system", timestamp=datetime.now(timezone.utc), metadata={})
    await memory.add_message(session_id, sys_msg)
    for i in range(3):
        await memory.add_message(session_id, ChatMessage(
            id=str(i+1), session_id=session_id, content=f"msg {i}",
            role="user", timestamp=datetime.now(timezone.utc), metadata={}))
    msgs = memory._messages.get(session_id, [])
    # max_context_tokens=1 → trim_messages returns [SystemMessage]; tail_count=0 → kept=[sys]
    assert len(msgs) == 1
    assert msgs[0].role == "system"

@pytest.mark.asyncio
async def test_zero_max_context_tokens_raises_or_no_ops_gracefully(self):
    """max_context_tokens=0 must not silently retain all messages via [-0:] slice."""
    session_id = "zero-tok"
    memory = ConversationMemory(max_messages_per_session=50, max_context_tokens=0)
    for i in range(5):
        await memory.add_message(session_id, self._make_msg(session_id, i, f"msg {i}"))
    # Should be 0 messages, not 5
    assert len(memory._messages.get(session_id, [])) == 0
```

---

_Reviewed: 2026-05-25T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
