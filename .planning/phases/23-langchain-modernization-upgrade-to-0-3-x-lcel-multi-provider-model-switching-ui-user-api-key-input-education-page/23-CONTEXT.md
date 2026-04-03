# Phase 23: LangChain Modernization — Upgrade, Multi-Provider, Model UI, Education Page - Context

**Gathered:** 2026-04-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Modernize the `langchain_agent/` Python service from LangChain 0.0.353 (2023-era) to the current 0.3.x LCEL stack, add runtime multi-provider model switching with user-supplied API keys stored server-side, surface a model selector UI in both the LangChain chat widget and the banking UI Config page, and add a two-tier education surface (sidebar panel + `/langchain` deep-dive page) explaining what LangChain does in the stack.

**Scope boundary:** `langchain_agent/` Python service + `langchain_agent/frontend/` chat widget + `banking_api_ui/` Config page section + education panel/page. No changes to `banking_api_server/` NL pipeline (Groq intent routing in `groqNlIntent.js`) — that is a separate concern in Phase 22.

</domain>

<decisions>
## Implementation Decisions

### A — Multi-Provider Model Support

- **D-01:** Support **5 providers**: OpenAI, Groq, Anthropic (Claude), Google Gemini, and Ollama (local/air-gapped).
- **D-02:** The demo narrative is "model-agnostic security" — the PingOne auth/MCP pattern works identically regardless of which LLM is running. Ollama makes this concrete for regulated-industry audiences: "this works fully on-premise, no data leaves your network."
- **D-03:** LangChain 0.3.x packages to install:
  - `langchain-openai` — OpenAI + GPT-4o, GPT-3.5-turbo
  - `langchain-groq` — Groq + llama-3.1-8b-instant, llama-3.3-70b
  - `langchain-anthropic` — Claude 3.5 Sonnet, Claude 3 Haiku
  - `langchain-google-genai` — Gemini 1.5 Flash, Gemini 1.5 Pro
  - `langchain-ollama` — any local model (user supplies Ollama base URL)
- **D-04:** All providers implement the same `BaseChatModel` interface — the LCEL chain `prompt | llm.bind_tools(tools) | parser` works identically across all five. Provider swap = swap the `llm` object only.
- **D-05:** Default provider is Groq (already has `GROQ_API_KEY` in BFF env) so the demo works out of the box before any user key input.

### B — Model Selector UI Location

- **D-06:** **Two surfaces, synced via BFF session:**
  1. **Widget gear icon** — settings panel inside the LangChain chat widget for live switching during a demo. Provider dropdown + model dropdown (dynamically populated per provider) + API key field (masked). Instant switch — next message uses the new model.
  2. **"LangChain Agent" section on banking UI Config page** — pre-configuration before a demo. Same fields: default provider, default model, API keys per provider, Ollama base URL. Saved to BFF session on submit.
- **D-07:** Both surfaces read from and write to the same BFF session key (`langchain_config`). Widget reflects changes made on Config page and vice versa — no stale state.
- **D-08:** Widget header shows current provider+model as a badge: e.g. `⚡ Groq · llama-3.1-8b` — visible at a glance during a live demo without opening the settings panel.

### C — API Key Handling

- **D-09:** Keys are sent to the BFF via a dedicated POST route (`POST /api/langchain/config`), stored in the **server-side session only** (same Upstash Redis session that holds OAuth tokens). Keys are never returned to the browser after submission — the BFF only returns `{ provider: "groq", model: "llama-3.1-8b-instant", key_set: true }`.
- **D-10:** The UI shows a "🔒 Groq key set (session only)" indicator per provider whenever a key is stored. Each indicator has a "Clear" button that sends `DELETE /api/langchain/config/key/{provider}` to remove it from session.
- **D-11:** This is an explicit teaching moment — the pattern mirrors how OAuth tokens are handled in the BFF (credential custodian, never exposed to browser). The Config page and widget both display a brief note: "API keys are stored server-side only — consistent with BFF token security."
- **D-12:** Ollama requires no API key — only a base URL (default: `http://localhost:11434`). The URL is stored in session the same way, not hardcoded.

### D — Education Page

- **D-13:** Two-tier education surface:
  1. **Sidebar panel** (`EDU.LANGCHAIN` — new ID in `educationIds.js`): 30-second overview — what LangChain is, why LCEL, how it connects to MCP tools, why model-agnostic. Ends with a "Deep dive →" link to `/langchain`.
  2. **`/langchain` route** in `banking_api_ui/`: full-depth page with architecture diagram (draw.io XML in `docs/`), LCEL chain code walkthrough, provider comparison table (speed/cost/capability), live "which model answered this" attribution log.
- **D-14:** The sidebar panel is triggered by a new education chip in the agent (e.g., `"How does LangChain work here?"`) and also accessible from the widget settings panel ("Learn more about LangChain").
- **D-15:** The `/langchain` page has a "Current model" live indicator showing the active provider/model — dynamic, reads from BFF session. Demonstrates the config is live, not just documentation.
- **D-16:** Education content covers: LangChain's role (orchestration layer), LCEL (why composable chains beat AgentExecutor), tool calling (how MCP tools become LangChain tools), model-agnostic pattern (same chain, swap LLM), and why keys stay server-side.

### Python Upgrade (the agent handles this — no discussion needed, documenting for planner)

- **D-17:** Upgrade from `langchain==0.0.353` + `openai<1.0.0` + `pydantic<2.0.0` to:
  - `langchain>=0.3.0`
  - `langchain-core>=0.3.0`
  - `langchain-community>=0.3.0`
  - `openai>=1.0.0`
  - `pydantic>=2.0.0`
  - Provider packages per D-03
- **D-18:** Migrate deprecated imports:
  - `from langchain.llms import OpenAI` → `from langchain_openai import ChatOpenAI`
  - `from langchain.chat_models import ChatOpenAI` → `from langchain_openai import ChatOpenAI`
  - `from langchain.memory import ConversationBufferMemory` → `from langchain.memory import ConversationBufferMemory` (still valid in 0.3.x, but migrate to `RunnableWithMessageHistory` for LCEL)
- **D-19:** Migrate from `AgentExecutor + create_openai_functions_agent` → LCEL pattern:
  ```python
  # New pattern
  from langchain_core.runnables import RunnablePassthrough
  chain = prompt | llm.bind_tools(tools) | output_parser
  agent = RunnableWithMessageHistory(chain, get_session_history, ...)
  ```
- **D-20:** `ConversationBufferMemory` is kept but wrapped in `RunnableWithMessageHistory` for LCEL compatibility. Conversation state per WebSocket session.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Current Implementation (read before touching)
- `langchain_agent/src/agent/langchain_mcp_agent.py` — main agent class, `_initialize_llm()` method, AgentExecutor pattern to migrate
- `langchain_agent/src/config/settings.py` — `LangChainConfig` dataclass (lines 54–60), `LANGCHAIN_MODEL_NAME` env var wiring (line 335), OPENAI_API_KEY required env (line 338)
- `langchain_agent/requirements.txt` — current pinned versions; ALL must be updated
- `langchain_agent/src/agent/mcp_tool_provider.py` — how MCP tools become LangChain `BaseTool` objects; must stay compatible after LCEL migration

### BFF Session Pattern (to replicate for key storage)
- `banking_api_server/.env.example` lines 14–34 — canonical env var names; `GROQ_API_KEY` already present
- `banking_api_server/routes/` — existing route patterns for BFF endpoints; new `/api/langchain/config` routes follow same pattern

### Education System (to extend)
- `banking_api_ui/src/components/education/educationIds.js` — add `LANGCHAIN: 'langchain'` here
- `banking_api_ui/src/components/BankingAgent.js` — education panel inline message map (line ~579); add `langchain` entry
- `banking_api_ui/src/components/EducationBar.js` — education bar panel structure to follow for sidebar panel
- `banking_api_ui/src/context/EducationUIContext.js` — `open(panelId)` API for triggering education panels programmatically

### Security Pattern (API key handling must follow this)
- `CLAUDE.md` §BFF + security — "Tokens stay server-side" principle applies to LLM API keys
- `banking_api_server/routes/` — existing session handling pattern to replicate for `POST /api/langchain/config`

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `LangChainConfig` dataclass in `settings.py` — extend it with `provider: str`, `groq_api_key: str`, `anthropic_api_key: str`, `google_api_key: str`, `ollama_base_url: str`; keep `openai_api_key` existing field
- `MCPToolProvider.get_tools()` — returns `List[BaseTool]`; this is the integration point; LCEL `llm.bind_tools(tools)` replaces the old `create_openai_functions_agent(llm, tools, prompt)`
- `WebSocketStreamCallbackHandler` — streaming callback; LangChain 0.3.x uses `astream_events` instead of callbacks; may need migration
- `langchain_agent/frontend/src/components/ChatWidget.js` — parent component for widget; settings gear will be added here

### Established Patterns
- **Provider factory**: create a `get_llm(provider, model, api_key)` factory function in `src/agent/llm_factory.py` — returns the appropriate `BaseChatModel` subclass. Keeps `langchain_mcp_agent.py` clean.
- **BFF session for credentials**: existing `banking_api_server` routes store to `req.session[key]` (express-session + Upstash). New `/api/langchain/config` route follows this exact pattern.
- **Education panel registration**: add to `EDU` object in `educationIds.js`, add message content to the inline map in `BankingAgent.js` (~line 579), wire chip trigger.

### Integration Points
- `langchain_agent/src/main.py` — `LangChainMCPApplication.initialize()` creates the `LangChainMCPAgent`; `config` object passed here. Provider switching means re-initializing `_agent_executor` when config changes (not full app restart).
- `banking_api_ui/src/components/DemoDataPage.js` or `ConfigPage.js` — "LangChain Agent" section added here as a new config card alongside PingOne settings.

</code_context>

<specifics>
## Specific Ideas

- Widget header badge: `⚡ Groq · llama-3.1-8b` — small pill in the top-right of the chat widget header showing active model at a glance. Clicking it opens the settings panel.
- "This works on-premise" callout on the `/langchain` education page when Ollama is the selected provider — visual callout that emphasizes the regulated-industry value.
- Provider comparison table on `/langchain` page: Speed / Cost / Notes columns with honest ratings (Groq = fastest, Ollama = free but requires local setup, Anthropic = best reasoning, Gemini = best multimodal, OpenAI = most familiar).
- Key submission UX: password field + "Save to session" button — on success, field clears and the "🔒 key set (session only)" indicator appears. No confirmation dialog needed.
- Live model attribution in chat: each LangChain response shows a small footer `via Groq · llama-3.1-8b · 0.4s` — latency visible, provider visible. Reinforces model-agnostic story.

</specifics>

<deferred>
## Deferred Ideas

- **LangSmith tracing integration** — the existing `langchain_agent/` has a full `execution_tracer.py` and `trace_server.py`. LangSmith is LangChain's cloud tracing product. Out of scope for this modernization phase; could be Phase 24 if desired.
- **Streaming token-by-token in the banking UI** — the LangChain widget has its own streaming. Streaming LangChain responses into the banking UI agent (alongside MCP tool results) would require a deeper integration between the two frontends. Not in scope.
- **Model benchmarking UI** — live latency/token comparison across providers for the same query. Compelling demo feature but a phase of its own.

</deferred>

---

*Phase: 23-langchain-modernization-upgrade-to-0-3-x-lcel-multi-provider-model-switching-ui-user-api-key-input-education-page*
*Context gathered: 2026-04-02*
