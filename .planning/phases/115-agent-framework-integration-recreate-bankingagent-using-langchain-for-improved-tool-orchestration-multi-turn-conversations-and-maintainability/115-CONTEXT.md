# Phase 115: Agent Framework Integration — LangChain Adoption

**Gathered:** 2026-04-09
**Status:** Ready for planning

## Phase Boundary

Migrate the Banking Agent from custom React + service-based architecture to LangChain framework while:
- Preserving all MCP tool integration (WebSocket to banking_mcp_server)
- Maintaining PingOne OAuth authentication and session management
- Keeping RFC 8693 token exchange for agent credentials
- Preserving human-in-the-loop (HITL) consent gates for high-value operations
- Maintaining natural language intent parsing and routing
- Supporting all existing banking operations (accounts, transfers, transactions)

**Out of Scope (v1):**
- Streaming responses (implement in Phase 116+)
- Vision/image understanding (implement in Phase 117+)
- Complex multi-step workflows with planning (implement in Phase 118+)
- Replacing MCP server implementation

## Current Architecture

### Frontend (BankingAgent.js)
- React component with FAB (floating action button) and embedded chat UI
- Handles UI state: messages, loading, consent modals, HITL modals
- Calls `bankingAgentService.callMcpTool()` to execute actions
- Tracks token events via TokenChainContext
- Supports admin/user dashboards with different placement modes (float, left-rail, bottom-dock)

### Backend (bankingAgentService.js)
- Single `callMcpTool(toolName, params)` function
- Calls `POST /api/mcp/tool` on BFF
- Returns `{ result, tokenEvents }` for UI rendering and token tracking
- Handles session refresh (RFC 6749) on 401

### Natural Language (bankingAgentNlService.js)
- Heuristic NL parser (if NL parsing code exists) or fallback
- Optional Gemini integration for more sophisticated intent routing
- Routes user messages to tools (not LLM currently)

### MCP Server (banking_mcp_server)
- WebSocket-based tool registry
- Implements RFC 8693 token exchange for delegated agent credentials
- Tools: get_my_accounts, create_transfer, create_deposit, etc.
- Not deployed on Vercel (runs on Railway/Render/Fly)

### Token Flow
1. User authenticates → PingOne JWT
2. Agent requires action → BFF exchanges user token for agent token (RFC 8693 with `act` claim)
3. Agent calls MCP tool → MCP server validates agent JWT
4. High-value ops → HITL gate checks consent, optionally sends CIBA challenge

## LangChain Integration Architecture

### Proposed Design

```
React UI (BankingAgent.js)
    ↓
LangChain Agent (bankingAgentLangChain.js) — NEW
  ├─ Agent executor (agentic loop)
  ├─ Tool registry (Maps LangChain Tool → banking_mcp_server tool)
  ├─ Memory (ConversationBufferMemory or similar)
  └─ Chat history (for context)
    ↓
MCP Tool Wrapper (Tools callable by LangChain)
  ├─ get_my_accounts
  ├─ create_transfer
  ├─ create_deposit
  └─ ... (existing MCP tools)
    ↓
BFF `/api/mcp/tool` (existing proxy)
    ↓
banking_mcp_server (existing WebSocket server)
```

### Key Components to Create

1. **LangChain Agent Executor** — Orchestrates multi-turn conversations
   - Maintains conversation history
   - Routes intent to appropriate MCP tools
   - Handles errors and tool failures
   - Preserves token events for UI tracking

2. **MCP Tool Registry in LangChain** — Maps tools
   - Wraps each MCP tool as a LangChain `Tool`
   - Marshals args from LangChain to MCP format
   - Returns results in LangChain format

3. **Session & Auth Middleware** — Preserves OAuth flow
   - Caches user token + session
   - Handles 401 refresh automatically
   - Passes token context to MCP calls

4. **HITL Gate Preservation** — Consent checkpoint
   - Before high-value operations, check HITL consent
   - May require user approval modal
   - Can trigger CIBA challenge if needed

5. **Token Tracking** — Maintain observability
   - Capture token events from MCP responses
   - Push to TokenChainContext for UI display
   - Log exchange audits

## Key Design Decisions

### LangChain Version
- Use latest stable (e.g., 0.1.x or 0.2.x — verify at planning time)
- TypeScript optional but recommended for type safety

### Model Selection
- For agent: Claude 3 Opus (via Anthropic SDK) for reasoning + tool calling
- Alternative: Local model if offline required (LangChain supports multiple LLMs)

### Memory Strategy
- `ConversationBufferMemory` — simple, suitable for demo
- Add token limit in Phase 116+ if context grows

### Tool Parameter Schema
- Use Zod or OpenAI JSON schema for validation
- Map MCP tool params to LangChain Tool.invoke()

### Error Handling
- Tool failures should not crash the agent loop
- Gracefully degrade and ask user to retry
- Log failures for debugging

### Backwards Compatibility
- Existing UI (BankingAgent.js) should not know about LangChain
- Service layer (bankingAgentService.js) can remain, calling LangChain internally
- Or create new service (bankingAgentLangChainService.js) and proxy through existing service

## Dependencies & Integrations

### External Dependencies
- `langchain` (npm package)
- `@langchain/anthropic` (for Claude integration)
- Possibly `zod` (for schema validation)

### Internal Dependencies
- BFF `/api/mcp/tool` endpoint
- banking_mcp_server (unchanged)
- PingOne OAuth session
- TokenChainContext (for observability)

### Testing
- Unit tests for agent executor logic
- Integration tests with mock MCP server
- E2E tests with real MCP server (staging)

## Success Criteria

### Functional
- [ ] User can send a message in chat UI
- [ ] LangChain agent parses intent (multi-turn capability)
- [ ] Agent calls appropriate MCP tool(s)
- [ ] Results displayed in chat
- [ ] Conversation history maintained across turns
- [ ] HITL consent gates work (no unintended high-value ops)
- [ ] Token exchange and RFC 8693 flow preserved

### Non-Functional
- [ ] No performance regression (chat responsiveness)
- [ ] Session management preserved (401 refresh still works)
- [ ] Token events tracked (for TokenChainContext)
- [ ] Error handling improved (graceful failures)
- [ ] Code maintainability improved (clearer than custom agent loop)

### Integration
- [ ] Existing BankingAgent.js UI unchanged (or minimal changes)
- [ ] MCP server unchanged
- [ ] PingOne OAuth unchanged
- [ ] HITL consent gates unchanged
- [ ] Vercel deployment viable (LangChain runs on BFF, not Vercel)

## Risk Mitigation

### Technical Risks
- **LangChain + MCP mismatch** — Research compatibility; may need custom tool wrapper
- **Token overhead** — LangChain agent loop may require many tokens; mitigate with concise prompts
- **Latency** — Multi-turn LLM calls may add latency; mitigate with prompt engineering

### Architectural Risks
- **Backwards compatibility** — Ensure UI doesn't break; use service layer as abstraction
- **Auth flow complexity** — Session refresh + token exchange + LangChain together; test thoroughly
- **HITL integration** — Agent loop may bypass consent check; enforce at MCP tool level

## Deferred Ideas

- Streaming responses (Phase 116+)
- Vision capabilities (Phase 117+)
- Complex multi-step planning with reflection (Phase 118+)
- Autonomous scheduled tasks (Phase 119+)

---

**Phase:** 115-agent-framework-integration
**Context gathered:** 2026-04-09
**Next:** `/gsd-plan-phase 115` to create execution plans
