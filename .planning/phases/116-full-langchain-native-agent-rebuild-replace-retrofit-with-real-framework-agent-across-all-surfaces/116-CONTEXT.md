# Phase 116: Full LangChain Native Agent Rebuild - Context

**Gathered:** 2026-04-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Replace the retrofit NL-intent-map + directcallMcpTool architecture with a proper LangChain agent across all JS BFF surfaces. After this phase:

- `BankingAgent.js` sends **all user messages** to `/api/banking-agent/message` — no client-side intent routing
- `bankingAgentLangChainService.js` uses modern `createToolCallingAgent` + LCEL pattern — no more deprecated `createStructuredChatAgent`
- All banking + education + search intents are expressed as **LangChain tools** — not hardcoded UI dispatch maps
- HITL consent gates (built in phase 115 but never wired to UI) are **fully wired** — consent modal triggers from tool responses
- **Python agent (`langchain_agent/`) is out of scope** — already uses modern API, no rebuild needed

**Not in scope:**
- Python `langchain_agent/` changes
- Streaming responses (future phase)
- New banking tool capabilities beyond what exists today
- Vercel deployment changes

</domain>

<decisions>
## Implementation Decisions

### D-01: Frontend Message Routing
Route **all** user messages (free-text, chips, quick actions) through `/api/banking-agent/message`. No hybrid path. `BankingAgent.js` sends `{ message, consentId? }` and receives `{ reply, tokenEvents, hitl? }`. Remove all `callMcpTool()` dispatch from the main NL handling path in `BankingAgent.js`. Keep `callMcpTool` only for the explicit "View Sensitive Account Details" button (requires its own consent flow that bypasses the agent).

### D-02: NL Service Deprecation
`bankingAgentNlService.parseNaturalLanguage()` and the `/api/banking-agent/nl` route are **no longer used for intent routing**. LangChain agent handles intent understanding. The `/api/banking-agent/nl/status` endpoint can be kept for display purposes (shows configured providers). `bankingAgentNlService.js` import removed from `BankingAgent.js`.

### D-03: Executor Lifecycle — Re-init per request + session-persisted history
Re-initialize a fresh `AgentExecutor` on every POST `/api/banking-agent/message`. Load chat history from `req.session.chatHistory` (array of `{ role, content }`) into the executor's prompt context before invoking. Append the new exchange to `req.session.chatHistory` after. This is stateless at the executor level but preserves multi-turn context across requests. Max history: last 20 messages (truncate oldest first).

### D-04: Modern LangChain API — LCEL pattern
Replace `createStructuredChatAgent` (deprecated in LangChain 0.3.x) with `createToolCallingAgent` + LCEL:
```js
const chain = prompt | llm.bind_tools(tools);
const executor = new AgentExecutor({ agent: chain, tools });
```
Use `@langchain/core/runnables` patterns. Remove `ConversationBufferMemory` (replaced by explicit session history). Keep `@langchain/anthropic` as the LLM provider.

### D-05: Tool Coverage — All intents become LangChain tools
Every action currently handled by the UI intent dispatch map becomes a named tool in the MCP tool registry. Full set:
- `get_my_accounts` — list accounts (already exists)
- `create_transfer` — transfer between accounts (already exists)
- `create_deposit` — deposit funds (already exists)
- `create_withdrawal` — withdraw funds (already exists)
- `get_login_activity` — look up last login for a username (new tool)
- `brave_search` — web search via Brave API (new tool, BFF-side key)
- `explain_topic` — education topic explanation; accepts `topic` param (e.g., "langchain", "login-flow", "token-exchange"); returns structured content that UI renders (new tool)

"View Sensitive Account Details" (`get_sensitive_account_details`) keeps its existing direct `callMcpTool` path — it has its own consent modal.

### D-06: Education topics as a LangChain tool
Education topic chips and free-text education queries route through the agent. Agent calls `explain_topic(topic)` tool. BFF returns the existing education text content from `educationTopics` map. UI renders the tool response as an agent message (not a special React card). The hardcoded `eduInlineMessages` map in `BankingAgent.js` is used by the tool implementation server-side.

### D-07: HITL wiring (Plan 115-03 completion)
The HITL routes in `bankingAgentRoutes.js` were built in phase 115 but never connected to the UI. Wire:
- Agent response with `hitl` field → UI shows `HitlInlineCard` or consent modal (already in BankingAgent.js, just needs the trigger condition updated)
- User approves/rejects → POST `/api/banking-agent/consent` with `{ consentId, decision }`
- On approval, re-send original message with `consentId` included so backend resumes

### D-08: Python agent — Out of scope
`langchain_agent/` Python service already uses `create_tool_calling_agent` + proper LCEL patterns. No changes needed. Phase 116 is JS BFF + React UI only.

### Claude's Discretion
- Error message formatting when agent fails (prose vs structured)
- Exact truncation strategy for session chat history beyond 20 messages
- Whether to keep `bankingAgentNlService.js` file (empty/deprecated) or remove the import and file entirely
- Session key name for chat history (`chatHistory` vs `agentChatHistory`)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 115 Work (foundation being wired)
- `banking_api_server/services/bankingAgentLangChainService.js` — LangChain service built in 115, needs rewrite to LCEL
- `banking_api_server/utils/mcpToolRegistry.js` — MCP tool wrappers, needs new tools added
- `banking_api_server/middleware/agentSessionMiddleware.js` — OAuth session validation middleware
- `banking_api_server/middleware/hitlGatewayMiddleware.js` — HITL gates (built, not wired)
- `banking_api_server/routes/bankingAgentRoutes.js` — Agent routes (built, not wired to UI)

### UI surfaces being changed
- `banking_api_ui/src/components/BankingAgent.js` — Main agent component (3142 lines), remove NL dispatch
- `banking_api_ui/src/services/bankingAgentNlService.js` — NL service being deprecated
- `banking_api_ui/src/services/bankingAgentService.js` — `callMcpTool` (keep for sensitive details only)

### Phase 115 Plans (what was built)
- `.planning/phases/115-agent-framework-integration-recreate-bankingagent-using-langchain-for-improved-tool-orchestration-multi-turn-conversations-and-maintainability/115-01-SUMMARY.md`
- `.planning/phases/115-agent-framework-integration-recreate-bankingagent-using-langchain-for-improved-tool-orchestration-multi-turn-conversations-and-maintainability/115-02-SUMMARY.md`

### NL + education content (being migrated to tools)
- `banking_api_server/services/geminiNlIntent.js` — Existing Groq/Gemini/heuristic NL parser
- `banking_api_server/routes/bankingAgentNl.js` — NL route (being deprecated for intent routing)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `HitlInlineCard` component in `BankingAgent.js` (line ~718) — already exists, just needs correct trigger condition
- `evaluateToolCall()` in `hitlGatewayMiddleware.js` — already checks threshold and returns `hitl` payload
- `educationTopics` / `eduInlineMessages` map in `BankingAgent.js` (line ~698) — can be moved to BFF for `explain_topic` tool
- `agentSessionMiddleware` — already validates OAuth session, already attached to `/message` route

### Established Patterns
- All agent routes are in `banking_api_server/routes/bankingAgentRoutes.js` with ES module syntax
- `banking_api_server` uses ES modules (`import`/`export`)
- `banking_api_ui` uses CommonJS-style imports for services
- Session data stored in `req.session.*` (express-session with Upstash Redis on Vercel)

### Integration Points
- `BankingAgent.js` → replaces `parseNaturalLanguage()` call at line ~2316 with `POST /api/banking-agent/message`
- `bankingAgentRoutes.js` `/message` endpoint already uses `agentSessionMiddleware` + `hitlGatewayMiddleware` — just needs real tool execution wired
- `mcpToolRegistry.js` → add `get_login_activity`, `brave_search`, `explain_topic` tools alongside existing 4

</code_context>

<specifics>
## Specific Ideas

- The `explain_topic` tool should use the existing `eduInlineMessages` content object already in `BankingAgent.js` — move it to the BFF so the agent can return it without reinventing the content
- The Brave search tool wraps the existing `braveSearchService.js` on the BFF — key never leaves server
- Chat history in session: store as `req.session.agentChatHistory = [{ role: 'human'|'ai', content: string }]`
- LCEL pattern target: `const chain = ChatPromptTemplate.fromMessages([...history, ['human', '{input}']]) | llm.bind_tools(tools)`

</specifics>

<deferred>
## Deferred Ideas

- Streaming responses (SSE/WebSocket) — future phase
- Vision / image input — future phase
- Complex multi-step planning workflows — future phase
- Python `langchain_agent/` changes — already modern, no work needed
- Replacing the MCP server itself — out of scope

</deferred>

---

*Phase: 116-full-langchain-native-agent-rebuild-replace-retrofit-with-real-framework-agent-across-all-surfaces*
*Context gathered: 2026-04-09*
