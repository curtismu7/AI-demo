---
name: langchain-agent
description: >
  Architecture guide and rules for the Python LangChain / LangGraph agent in langchain_agent/.
  USE THIS SKILL whenever: editing langchain_mcp_agent.py, mcp_tool_provider.py, connection.py,
  conversation_memory.py, llm_factory.py, or settings.py; debugging why the Python agent isn't
  streaming, isn't connecting to the MCP server, is leaking sessions, or is trimming too
  aggressively; adding a new LLM provider to the Python stack; configuring MCP transport
  (WebSocket vs Streamable HTTP); or reviewing Phase 273–281 work.
  DO NOT USE FOR: the BFF/Node.js agent in bankingAgentLangGraphService.js (use agent-mode-routing
  skill); OAuth/MCP tool registration on the TypeScript MCP server (use mcp-server skill);
  Helix console setup (use helix-setup skill).
argument-hint: 'Describe the Python agent feature, bug, or configuration question'
---

# LangChain / LangGraph Agent — Python Service

> **Emoji rule:** only `⚠️`, `✅`, `❌` allowed anywhere in this repo.
>
> **This is NOT the BFF Node.js agent.** `bankingAgentLangGraphService.js` (Node.js, port 3001)
> handles the BFF's inline LangGraph reasoning. The Python service described here is a
> *separate* uvicorn process (ports 8888/8889/8890) with its own MCP connections and LLM factory.
> Do not conflate the two.

---

## Ports

| Port | Purpose | Env var |
|---|---|---|
| `8888` | uvicorn HTTP — main REST API | `PORT` (default `8888`) |
| `8889` | WebSocket — real-time chat streaming | `WEBSOCKET_PORT` (default `8889`) |
| `8890` | HTTP health + `/inspector/mcp-host` | `HEALTH_HTTP_PORT` (default `8890`) |

All three are loopback-only (`localhost`). Only the BFF and UI are externally addressable via `api.ping.demo`.

---

## Module Map

```
langchain_agent/
  src/
    main.py                         ← uvicorn entry: starts REST API + chat WS + health HTTP
    agent/
      langchain_mcp_agent.py        ← LangChainMCPAgent: LangGraph graph, astream_events loop
      llm_factory.py                ← get_llm() — canonical provider resolver (Helix default)
      mcp_tool_provider.py          ← MCPToolProvider, MCPTool(BaseTool), ContextVar session isolation
      conversation_memory.py        ← ConversationMemory: token-aware trimming + count cap
      helix_llm.py                  ← ChatHelix (LangChain ChatModel wrapper for Helix)
      helix_key_loader.py           ← loads HELIX_* config from env / JSON key file
      tracing_callback.py           ← DetailedTracingCallbackHandler
      execution_tracer.py           ← AgentExecutionTracer, TracingMixin
      websocket_stream_callback.py  ← TOMBSTONE — raises ImportError; do not import
    mcp/
      connection.py                 ← MCPConnection (WebSocket) + StreamableHttpMCPConnection + MCPConnectionPool
      local_connection.py           ← LocalMCPConnection (in-process, for tests)
      auth_handler.py               ← AuthRequest dataclass + OAuth challenge flow
      tool_registry.py              ← MCPClientManager, ToolInfo
    config/
      settings.py                   ← SSOT for all Python config (dataclasses + env wiring)
    authentication/
    models/
    services/
  tests/                            ← pytest suite (no RUN_REAL_TESTS needed)
  requirements.txt
  .env.example                      ← authoritative list of all env vars with defaults
```

---

## LangGraph Architecture (Phase 275–276)

The agent uses a **compiled LangGraph StateGraph** — not `AgentExecutor`. The old pattern is gone.

```python
# langchain_agent/src/agent/langchain_mcp_agent.py
from langgraph.prebuilt import create_react_agent
from langgraph.checkpoint.memory import MemorySaver

self._graph = create_react_agent(
    model=self.llm,
    tools=self._tools,
    checkpointer=MemorySaver()       # stores history by thread_id=session_id
)
```

**Key invariants:**

1. `MemorySaver` keyed by `thread_id=session_id` stores conversation history across turns — no `ConversationBufferMemory`.
2. `_get_agent_executor_for_session()` is deleted — the graph is built once in `initialize_tools()`, not per-request.
3. `AgentExecutor` is fully removed. `websocket_stream_callback.py` is a tombstone that raises `ImportError` on import — do not reference or import it.

---

## Streaming — astream_events v2 (Phase 276)

Streaming uses `self._graph.astream_events(input, config=config, version="v2")`.
**Never** use callbacks (`BaseCallbackHandler`) for streaming — the old `WebSocketStreamCallbackHandler` is dead.

```python
async for event in self._graph.astream_events(agent_input, config=config, version="v2"):
    kind = event.get("event")

    if kind == "on_tool_start":
        # send tool start notification to websocket
        await ws_handler.send_message_to_session(session_id, {
            "type": "stream_event", "event": "tool_start",
            "tool": event["name"], "input": event.get("data", {}).get("input")
        })
    elif kind == "on_tool_end":
        # send tool completion
        ...
    elif kind == "on_chat_model_stream":
        # send LLM token delta
        chunk = event["data"].get("chunk")
        if chunk and chunk.content:
            await ws_handler.send_message_to_session(session_id, {
                "type": "stream_event", "event": "llm_token",
                "token": chunk.content
            })
```

**The `DetailedTracingCallbackHandler` is still active** — it's wired via `RunnableConfig(callbacks=[tracer_callback])` and passed to the `astream_events` call. Do not remove it.

---

## LLM Factory — Provider Resolution (Phase 274, llm_factory.py)

`get_llm()` in [langchain_agent/src/agent/llm_factory.py](../../../langchain_agent/src/agent/llm_factory.py) is the **single provider SSOT** for the Python stack. No other module may inline a provider default.

| `provider` value | LangChain class | Required config |
|---|---|---|
| `"helix"` (default) | `ChatHelix` | `HELIX_BASE_URL`, `HELIX_API_KEY`, `HELIX_ENVIRONMENT_ID`, `HELIX_AGENT_ID`, `HELIX_PROMPT_FIELD_ID` |
| `"ollama"` | `ChatOllama` | `OLLAMA_BASE_URL` (or `ollama_base_url`); explicit-only, never the catch-all default |
| `"lmstudio"` | `ChatOpenAI` → LM Studio OpenAI endpoint | `LMSTUDIO_BASE_URL` (default `http://localhost:1234/v1`) |
| `"anthropic-lmstudio"` | `ChatAnthropic` → LM Studio Anthropic endpoint | LM Studio Anthropic-compat mode; dummy API key accepted |
| unknown / absent | `ChatHelix` | same as `"helix"` — Helix is the catch-all |

Config is read from `langchain_agent/src/config/settings.py` (see next section) — **not** from `configStore.js` or any BFF module.

---

## Configuration — settings.py (Python SSOT)

[langchain_agent/src/config/settings.py](../../../langchain_agent/src/config/settings.py) contains all dataclasses. Read via `get_config()`. **Never** call `process.env` / `os.environ` directly in business logic — read from the config object.

Key config blocks:

### MCPConfig

```python
@dataclass
class MCPConfig:
    mcp_transport: str = "websocket"   # "websocket" | "streamable_http"
    connection_timeout_seconds: int = 30
    max_connections_per_server: int = 5
    retry_attempts: int = 3
    heartbeat_interval_seconds: int = 30
```

Set via `MCP_TRANSPORT` env var. Invalid values raise `ValueError` at startup.

### LangChainConfig (key fields)

```python
provider: str = "helix"                  # LANGCHAIN_LLM_PROVIDER
max_tokens: int = 1000                   # LANGCHAIN_MAX_TOKENS
max_context_tokens: int = 4096           # LANGCHAIN_MAX_CONTEXT_TOKENS
websocket_port: int = 8889               # WEBSOCKET_PORT
helix_base_url: str = "..."              # HELIX_BASE_URL
helix_api_key: str = ""                  # HELIX_API_KEY
helix_environment_id: str = "..."        # HELIX_ENVIRONMENT_ID
helix_agent_id: str = "LLM2"            # HELIX_AGENT_ID
helix_prompt_field_id: str = "..."       # HELIX_PROMPT_FIELD_ID
```

See `langchain_agent/.env.example` for the full list with defaults.

---

## MCP Transport Selection (Phase 277)

The Python agent supports two transports for communicating with `demo_mcp_server`:

| Transport | Class | When to use |
|---|---|---|
| `websocket` (default) | `MCPConnection` | Local dev — persistent WS; no `.env` change needed |
| `streamable_http` | `StreamableHttpMCPConnection` | Staging/prod aligned with MCP spec 2025-03-26 |

**Routing** is in `MCPConnectionPool.get_connection()` in [langchain_agent/src/mcp/connection.py](../../../langchain_agent/src/mcp/connection.py):

```python
if os.environ.get("MCP_TRANSPORT") == "streamable_http" and endpoint.startswith(("http://", "https://")):
    # return StreamableHttpMCPConnection(endpoint)
```

**`Mcp-Session-Id` header:** `StreamableHttpMCPConnection.connect()` captures the session ID from the server's `initialize` response and attaches it to every subsequent `POST /mcp` request. This is spec-required and must not be removed.

**Switching transports locally:**
```bash
# In langchain_agent/.env:
MCP_TRANSPORT=streamable_http
MCP_SERVER_URL=http://localhost:8080   # HTTP endpoint, not ws://
```

WebSocket default requires no change — leave `MCP_TRANSPORT` unset or set to `websocket`.

---

## Session Isolation — ContextVar Pattern (Phase 273, RACE-01)

`MCPTool._current_session_id` is a **module-level `ContextVar`**, not a Pydantic `PrivateAttr`. This is load-bearing.

```python
# langchain_agent/src/agent/mcp_tool_provider.py
_current_session_id_var: contextvars.ContextVar[Optional[str]] = contextvars.ContextVar(
    "mcp_current_session_id", default=None
)
_current_agent_token_var: contextvars.ContextVar[Optional[Any]] = contextvars.ContextVar(
    "mcp_current_agent_token", default=None
)
```

**Why:** `asyncio.create_task` copies the context at creation time, so each concurrent session's task sees its OWN session ID and token. A `PrivateAttr` on the tool instance is shared across all sessions — concurrent sessions would overwrite each other's context mid-invocation.

**Rule:** Never add session-specific state to tool instances as instance attributes. Use `contextvars.ContextVar`. The same pattern applies to `_current_tracer`.

`MCPTool.set_session_context(session_id, agent_token)` is called before every tool invocation:
```python
tool.set_session_context(session_id, agent_token)  # sets ContextVar — must precede arun()
```

---

## Token-Aware Message Trimming (Phase 278)

`ConversationMemory._trim_session_messages()` runs two stages in order:

**Stage 1 — Token trim** (fires when `len(messages) > max_context_tokens`):
```python
from langchain_core.messages import trim_messages

messages = trim_messages(
    messages,
    strategy="last",         # keep the most recent messages
    include_system=True,     # always retain the SystemMessage at index 0
    token_counter=len,       # each message = 1 "token" (cheap but correct)
    max_tokens=self.max_context_tokens,
)
```

**Stage 2 — Count cap** (always runs after Stage 1):
Trims to `max_messages_per_session` (default 100) from the tail.

**Config:**
- `LANGCHAIN_MAX_CONTEXT_TOKENS` env var → `ChatConfig.max_context_tokens` (default `4096`)
- Stage 1 only fires when `max_context_tokens < max_messages_per_session` — if they're equal or tokens ≥ count, Stage 1 is a no-op (startup warning logged)
- `include_system=True` guarantees the system prompt is never trimmed

---

## `notifications/cancelled` Handler (Phase 281)

`MCPConnection._read_loop` in [langchain_agent/src/mcp/connection.py](../../../langchain_agent/src/mcp/connection.py) handles the `notifications/cancelled` MCP message:

```python
if method == "notifications/cancelled":
    rid = ...  # requestId from notification params
    if rid in self._pending:
        fut = self._pending.pop(rid)
        fut.set_exception(MCPServerCancelledError(...))
```

**Why:** Without this, a cancelled long-running tool call's `Future` is never resolved — it leaks in `_pending` until disconnect. `MCPServerCancelledError` propagates out of `MCPTool._arun` as `asyncio.CancelledError` after the bare `except Exception` guard is bypassed by the explicit re-raise.

`_fail_all_pending()` (on disconnect cleanup) is already implemented — it clears all `_pending` on close. Phase 281 only fills the gap for the live `notifications/cancelled` message path.

---

## Testing

```bash
cd langchain_agent
pytest tests/                              # full suite — no services needed
pytest tests/test_mcp_tool_provider.py     # ContextVar session isolation
pytest tests/test_mcp_streamable_http.py   # HTTP transport (8 tests)
pytest tests/test_conversation_memory.py   # token-aware trimming (33 tests)
pytest tests/test_langchain_mcp_agent.py   # LangGraph + streaming (72 tests)
pytest tests/test_mcp_connection_demux.py  # notifications/cancelled (5 tests)
```

All tests mock external dependencies — no running BFF or MCP server required.

**After any edit:** `pytest tests/` must pass with 0 failures before marking work complete.

---

## Common Mistakes

| Mistake | Fix |
|---|---|
| Importing `websocket_stream_callback.WebSocketStreamCallbackHandler` | That file is a tombstone — raises `ImportError`. Use `astream_events` loop instead |
| Adding a new LLM provider by inlining a default in `langchain_mcp_agent.py` | Add it to `get_llm()` in `llm_factory.py` only |
| Setting `session_id` as a `PrivateAttr` on `MCPTool` | Use `contextvars.ContextVar` at module level — see Session Isolation section |
| Using `ConversationBufferMemory` or per-request `AgentExecutor` | Both are removed. Use `MemorySaver` + compiled LangGraph graph built once |
| Forgetting to call `set_session_context()` before a tool invocation | The ContextVar won't be set; tool will see `session_id=None` and may raise |
| Reading Helix config from `configStore.getEffective()` | That's a JS BFF function. Python reads from `settings.py` / `os.environ` via `get_config()` |
| Calling `process.env` / `os.environ` directly in business logic | Read from the `config` object (result of `get_config()`) instead |

---

## Files to Read Before Editing

| File | Role |
|---|---|
| [langchain_agent/src/agent/langchain_mcp_agent.py](../../../langchain_agent/src/agent/langchain_mcp_agent.py) | LangGraph graph, astream_events loop, system prompt builder |
| [langchain_agent/src/agent/llm_factory.py](../../../langchain_agent/src/agent/llm_factory.py) | Provider SSOT — Helix default |
| [langchain_agent/src/agent/mcp_tool_provider.py](../../../langchain_agent/src/agent/mcp_tool_provider.py) | MCPTool, ContextVar isolation, auth challenge handling |
| [langchain_agent/src/mcp/connection.py](../../../langchain_agent/src/mcp/connection.py) | WS + Streamable HTTP transports, pool routing, cancelled handler |
| [langchain_agent/src/agent/conversation_memory.py](../../../langchain_agent/src/agent/conversation_memory.py) | Token-aware trimming, Stage 1/2 logic |
| [langchain_agent/src/config/settings.py](../../../langchain_agent/src/config/settings.py) | Python config SSOT — all env var wiring lives here |
| [langchain_agent/.env.example](../../../langchain_agent/.env.example) | Authoritative env var list with defaults |
