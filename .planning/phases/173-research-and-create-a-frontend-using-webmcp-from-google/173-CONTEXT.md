# Phase 173: Research and Create a Frontend Using WebMCP from Google - Context

**Gathered:** 2026-04-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Research Google's Web Model Context Protocol (WebMCP) and build a working frontend prototype that integrates browser-based MCP client capabilities into the existing banking demo React SPA. Depends on Phase 172 (token exchange at MCP server with act claims).

</domain>

<decisions>
## Implementation Decisions

### Feature Visibility & Use Cases
- **D-01:** Feature flag gating — hidden by default, toggle to enable. All WebMCP use cases treated equally (no prioritization). Self-documenting implementation with links from education panels.

### Transport & Client Architecture
- **D-02:** WebSocket transport (not HTTP/SSE). Extend existing `mcpFlowSseClient.js` for consistency with current service layer patterns. Streaming is required (not request/response only).

### Audience, Error Handling & Tool Scope
- **D-03:** Target both developer and end-user audiences, gated per feature flag. Hybrid error handling: graceful for end users with expandable technical details for developers. Configuration-driven tool scope (not hardcoded).

### State Management & Agent Integration
- **D-04:** Extend existing agent context provider (not a new context provider). Shared state model — WebMCP tools visible in agent panel, agent results visible in WebMCP surface. Seamless integration, not siloed.

### Learning Scope & Fallback Strategy
- **D-05:** Working prototype only (no education panels or docs in this phase). Just-enough research depth to build. Pivot to alternative approach if WebMCP doesn't fit the architecture.

### Claude's Discretion
- Component structure and file organization within `banking_api_ui/src/`
- Specific WebMCP SDK/library selection based on research findings
- UI layout and interaction patterns for the prototype surface

</decisions>

<specifics>
## Specific Ideas

- WebMCP is from Google — research the actual spec/SDK before committing to implementation details
- Must work with Phase 172's token exchange pattern (act claims, narrowed scopes, hard fail on exchange error)
- Streaming over WebSocket aligns with existing `mcpFlowSseClient.js` patterns
- Feature flag should be consistent with existing feature flag patterns in the codebase (if any)

</specifics>

<canonical_refs>
## Canonical References

### Phase 172 (Token Exchange Foundation)
- `.planning/phases/172-token-exchange-narrowed-scopes/172-CONTEXT.md` — Locked decisions on lazy cache, backend act validation, narrowed scopes per tool, hard fail on exchange error (D-01 through D-04)

### MCP Server
- `banking_mcp_server/` — Existing MCP server implementation, `@modelcontextprotocol/sdk` v0.5.0
- `.github/skills/mcp-server/SKILL.md` — MCP tool registration, session management, auth patterns

### Frontend Service Layer
- `banking_api_ui/src/services/mcpFlowSseClient.js` — Existing MCP client service (extend for WebSocket per D-02)
- `banking_api_ui/src/services/bankingAgentService.js` — Agent service layer
- `banking_api_ui/src/services/bffAxios.js` — BFF communication layer

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `mcpFlowSseClient.js`: Current MCP client — extend for WebSocket transport (D-02)
- Agent context provider: Extend for shared WebMCP state (D-04)
- `bankingAgentService.js`: Agent tool orchestration patterns

### Established Patterns
- Service layer pattern via `bffAxios.js` for BFF communication
- Context providers for state management (ThemeContext, session resolver)
- Component hierarchy: components/agent/, components/dashboard/, etc.

### Integration Points
- Agent context provider — shared state between WebMCP and existing agent (D-04)
- Feature flag system — gating WebMCP visibility (D-01)
- MCP server WebSocket endpoint — transport target (D-02)

</code_context>

<deferred>
## Deferred Ideas

- Education panels explaining WebMCP concepts (potential future phase)
- Documentation/writeup of WebMCP research findings
- Deep comparative research of WebMCP vs alternatives

</deferred>

---

*Phase: 173-research-and-create-a-frontend-using-webmcp-from-google*
