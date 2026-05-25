---
name: dual-agent
description: >
  Use when adding, changing, or fixing ANY capability in either the LangChain agent
  (langchain_agent/) or the PydanticAI agent (pydantic_agent/). Covers feature parity
  rules, wire protocol contracts, shared architecture decisions, run.sh registration,
  and the "both agents" checklist. Trigger symptoms: you're about to touch only one
  agent; pydantic_agent/ doesn't exist on disk yet; someone asks for a new agent feature;
  you're writing a plan or spec for agent work.
argument-hint: 'Describe the feature, fix, or change you are making to either agent'
---

# Dual-Agent Rule: LangChain + PydanticAI Parity

## The Rule

**Every user-visible capability that exists in one agent MUST exist in the other.**

Both agents are equal alternatives — not primary + secondary. A feature in one that is absent from the other is a bug.

---

## The Two Agents

| | LangChain Agent | PydanticAI Agent |
|---|---|---|
| **Directory** | `langchain_agent/` | `pydantic_agent/` |
| **WS port** | 8889 | 8893 |
| **Health port** | 8890 | 8894 |
| **Framework** | LangChain + LangGraph | PydanticAI |
| **MCP transport** | WebSocket (default) | Streamable HTTP (`POST /mcp`) |
| **LLM providers** | Helix, Ollama, LM Studio, Anthropic | Helix, Ollama, LM Studio, Anthropic |
| **Spec** | `langchain-agent` skill | `docs/superpowers/specs/2026-05-25-pydantic-agent-design.md` |
| **Plan** | (completed phases in ROADMAP.md) | `docs/superpowers/plans/2026-05-25-pydantic-agent.md` |

---

## Feature Parity Checklist

Before marking any agent work done, run this checklist:

```
[ ] Feature/fix exists in langchain_agent/
[ ] Same feature/fix exists in pydantic_agent/
[ ] Both agents handle the same error cases
[ ] Wire protocol message types are documented (see below)
[ ] run.sh updated for both agents if ports/start commands changed
[ ] Both agents' tests cover the new capability
[ ] UI works with both agents (test both WebSocket endpoints)
```

---

## Wire Protocol Contract

Each agent has its own `src/models/messages.py` with Pydantic message types. **They must agree on the public message shapes that both expose.**

When adding a new WebSocket message type to either agent:

1. Define the message in the agent's `src/models/messages.py`
2. Add the same message type to the *other* agent's `src/models/messages.py` with identical field names and types
3. Both agents must handle the inbound type in their `websocket_handler.py`
4. Both agents must emit the outbound type when triggered

**Shared message types (both agents must implement):**

| Inbound | Fields |
|---|---|
| `chat_message` | `session_id, content, user_token?` |
| `auth_response` | `session_id, code, state` |
| `ping` | — |

| Outbound | Fields |
|---|---|
| `connected` | `session_id, agent_version` |
| `error` | `code, message` |
| `pong` | — |
| `turn_start` | `session_id, turn_id` |
| `turn_complete` | `session_id, turn_id, final_text` |
| `token_delta` | `turn_id, delta` |
| `tool_start` | `turn_id, tool_name, args` |
| `tool_result` | `turn_id, tool_name, result, duration_ms` |
| `tool_error` | `turn_id, tool_name, error` |
| `auth_challenge` | `turn_id, authorization_url, scope, expires_at, state` |
| `reasoning_step` | `turn_id, step_index, thought` |

**`agent_version` values:** LangChain sends `"langchain"`, PydanticAI sends `"pydantic"`. This is the only intentional difference.

---

## Shared Architecture Patterns

Both agents implement these patterns identically. When one is updated, update the other.

| Pattern | Code | Files |
|---|---|---|
| Per-session worker pool | WR-02 | `src/api/message_processor.py` |
| Connection-bound session ID (never trust message body) | BL-04/WR-01 | `src/api/websocket_handler.py` |
| Auth challenge CSRF state | WR-11 | `src/mcp/auth_challenge.py` |
| Session idle reap | CR-01 | `src/api/message_processor.py`, `src/agent/agent_runner.py` |
| Health check server | — | `src/api/health.py` |
| LLM provider factory | — | `src/agent/llm_factory.py` |
| OAuth client credentials | — | `src/authentication/oauth_manager.py` |

---

## "pydantic_agent/ doesn't exist yet" is NOT an excuse

When `pydantic_agent/` is still being built and `langchain_agent/` is fully implemented:

- **Adding to langchain_agent:** Also add a task to the pydantic_agent plan (`docs/superpowers/plans/2026-05-25-pydantic-agent.md`). Do not close the work until both agents are covered.
- **Adding to pydantic_agent:** Verify langchain_agent already has the equivalent. If it doesn't, add it there too.
- **Uncertainty about pydantic_agent internals:** Check `docs/superpowers/specs/2026-05-25-pydantic-agent-design.md` and the plan for the correct file locations and patterns.

---

## LLM Provider Parity

Both agents support the same four providers. When adding a new provider or changing provider configuration:

| Provider | langchain_agent | pydantic_agent |
|---|---|---|
| Anthropic | `langchain-anthropic` | `pydantic-ai[anthropic]` |
| Ollama | `langchain-ollama` | `pydantic-ai[ollama]` |
| LM Studio (OpenAI-compat) | `langchain-openai` + base URL | `pydantic-ai[openai]` + base URL |
| Helix | `ChatHelix` custom class | `HelixModel` custom class |

Env vars for provider selection:
- `langchain_agent`: `LANGCHAIN_PROVIDER` (default: `helix`)
- `pydantic_agent`: `AGENT_PROVIDER` (default: `helix`)

---

## run.sh Registration

Both agents are registered in `run.sh`. When changing ports, startup commands, or adding health checks:

```
langchain_agent: PID_AGENT, LOG_AGENT, ports 8889+8890
pydantic_agent:  PID_PYDANTIC, LOG_PYDANTIC, ports 8893+8894
```

Port sweep list must include all four ports: `8889 8890 8893 8894`.

Both entries in the `service_status_line` table. Both entries in the stop loop (`$PID_AGENT $PID_PYDANTIC`).

---

## Common Mistakes

| Mistake | Fix |
|---|---|
| Adding a WS message type to one agent only | Add to both `src/models/messages.py` and both `websocket_handler.py` dispatchers |
| Skipping pydantic_agent because it's not on disk | Add a task to its implementation plan; do not close without both covered |
| Different field names for the same message type | Pick one shape, apply to both — field names must match exactly |
| Auth challenge in langchain only | Both agents handle auth challenges via `src/mcp/auth_challenge.py` |
| Provider added to one factory not the other | Both `llm_factory.py` files must be updated |
| run.sh updated for one agent, not both | Always update both blocks in run.sh |
| Tests only in one agent's test suite | Both `tests/` directories must cover the new capability |

---

## Red Flags — Stop and Apply Parity

If you notice any of these, stop and check parity:

- "I'll add this to langchain_agent first, then do pydantic_agent later"
- "pydantic_agent doesn't exist yet so I'll skip it"
- "This is a LangChain-specific change" (wire protocol, OAuth, MCP, session logic, and LLM providers are shared concerns)
- "The pydantic_agent plan doesn't mention this" — add it to the plan
- Closing a task that touches only one agent's files

---

## Rationalization Table

| Rationalization | Reality |
|---|---|
| "pydantic_agent doesn't exist on disk yet" | Add a task to the implementation plan. Not on disk ≠ out of scope. |
| "This is framework-specific" | Wire protocol, OAuth, session management, MCP, LLM providers — none of these are framework-specific. Both agents implement them. |
| "I'll do parity in a follow-up" | Follow-ups get skipped. Do it now or add it to the plan with a clear task. |
| "The two agents are different enough that this doesn't apply" | Both are AI agent services with identical MCP tools, OAuth flows, and chat interfaces. Parity applies unless the feature is explicitly UI-only (e.g. the structured-output card rendering in PydanticAgent.jsx). |
| "The plan doesn't mention parity for this" | The plan is not exhaustive. The rule is: same capability in both agents, always. |
