# Phase 32: MCP Server Advanced Capabilities - Context

**Gathered:** 2026-04-02
**Status:** Ready for research and planning

<domain>
## Phase Boundary

Extend the MCP server (`banking_mcp_server/`) with 5 advanced capabilities:

1. **Sequential thinking tool** — a `sequential_think` MCP tool that lets the agent reason step-by-step through complex tasks
2. **Async long-running tasks (SEP-1686)** — job queue primitive so tools can return a job ID and poll for completion
3. **`.well-known/mcp-server` discovery** — JSON manifest at `/.well-known/mcp-server` describing tools, auth, and capabilities
4. **Audit trail observability** — expose existing `AuditLogger` via a new `/audit` admin route in the UI
5. **MCP registry integration** — local `package.json` `mcpServers` manifest + README registration guide

Also in scope: **Fix POST api/mcp/tool 400 error** (folded in from todo).

Does NOT include: changes to existing banking tools, new banking operations, OAuth flow changes.

</domain>

<decisions>
## Implementation Decisions

### Sequential Thinking Tool
- **D-01:** Show reasoning as collapsible "Reasoning" steps inline in the agent chat (not a separate panel, not hidden)
- **D-02:** The tool is named `sequential_think` and returns structured step-by-step reasoning
- **D-03:** Steps visible during execution in the agent flow diagram (existing infrastructure)

### Async Long-Running Tasks
- **D-04:** Default UX: returns immediately with a job ID message — user sees "Job created: #abc123, checking status..." while the agent polls
- **D-05:** The default async UX mode is configurable via the Demo Config page (`Config.js`) — user can switch between:
  - "Job ID" (b): show job ID, poll visibly (default)
  - "Progress spinner" (a): spinner/progress while polling
  - "Transparent" (c): agent polls internally, shows result when done (no visible async)
- **D-06:** Config setting stored in demo config state, accessible to the agent UI

### `.well-known/mcp-server` Discovery
- **D-07:** Add `GET /.well-known/mcp-server` endpoint to `HttpMCPTransport` (alongside existing `/.well-known/oauth-protected-resource`)
- **D-08:** Response is a JSON manifest: `{ name, description, version, tools: [...], auth: { type, scopes }, contact }`
- **D-09:** Do NOT require authentication for this endpoint — it must be publicly discoverable

### Audit Trail Observability
- **D-10:** New `/audit` admin route in the React SPA (new page component)
- **D-11:** Backend: expose existing `AuditLogger.queryAuditLogs()` and `generateAuditSummary()` via a new BFF route `GET /api/mcp/audit` (requires admin auth)
- **D-12:** UI shows a table of audit events, filterable by type (banking/auth/authz), with summary stats at the top

### MCP Registry Integration
- **D-13:** Add `mcpServers` field to `banking_mcp_server/package.json` following the emerging npm manifest convention
- **D-14:** Add a "MCP Registry / AI Client Setup" section to `banking_mcp_server/README.md` with step-by-step instructions for Claude Desktop, Cursor, and Windsurf
- **D-15:** No external publish to Smithery/mcp.run in this phase — documentation + local manifest only

### Bug Fix — POST api/mcp/tool 400 Error
- **D-16:** Investigate and fix the 400 error on `POST /api/mcp/tool` calls — this is a prerequisite for all tool-related work in this phase; fix it first

### the agent's Discretion
- Exact polling interval for async tasks
- Storage backend for job queue (in-memory Map is fine for demo)
- Audit page layout details (table density, column order)
- Sequential thinking step format (exactly how steps are rendered in the chat bubble)

</decisions>

<specifics>
## Specific Ideas

- Async UX mode: the 3 options (job ID / spinner / transparent) must be selectable from the Demo Config page — same pattern as agent layout mode in `Config.js`
- Sequential thinking inline rendering should be collapsible — click to expand/collapse the reasoning chain, similar to how function calls are shown in Claude.ai
- The audit page should be accessible only to authenticated admin users (same guard as `/admin` route)
- The `mcpServers` package.json field should include connection URL template with env var placeholder so devs can copy-paste it

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### MCP Server Core
- `banking_mcp_server/src/server/BankingMCPServer.ts` — main server, WebSocket routing, connection lifecycle
- `banking_mcp_server/src/server/HttpMCPTransport.ts` — HTTP transport, existing `/.well-known/oauth-protected-resource` implementation (pattern for new `.well-known/mcp-server`)
- `banking_mcp_server/src/tools/BankingToolRegistry.ts` — existing 8 tools, tool definition pattern to follow for `sequential_think`
- `banking_mcp_server/src/tools/BankingToolProvider.ts` — tool execution, where async job handling would plug in
- `banking_mcp_server/src/utils/AuditLogger.ts` — existing audit infrastructure with `queryAuditLogs` and `generateAuditSummary`

### BFF + UI
- `banking_api_server/` — BFF routes pattern (for new `/api/mcp/audit` route)
- `banking_api_ui/src/components/Config.js` — Demo Config page where async UX mode selector will be added
- `banking_api_ui/src/components/BankingAgent.js` — agent chat where sequential thinking steps render inline

### MCP Spec Reference
- `banking_mcp_server/README.md` — current server docs (will be extended with registry section)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `AuditLogger.ts` (`banking_mcp_server/src/utils/`) — already has `logBankingOperation`, `queryAuditLogs`, `generateAuditSummary` — just needs a route to expose it
- `HttpMCPTransport.ts` — `/.well-known/oauth-protected-resource` handler is the exact pattern for `/.well-known/mcp-server`
- `BankingToolRegistry.ts` — static `TOOLS` object; new `sequential_think` tool follows same `BankingToolDefinition` interface
- `Config.js` — existing `<ConfigSection>` component and toggle pattern for adding async UX mode selector

### Established Patterns
- Tool registration: add to `TOOLS` in `BankingToolRegistry`, implement handler in `BankingToolProvider`
- HTTP endpoints: add route handlers in `HttpMCPTransport.handleRequest`
- BFF routes: Express router pattern in `banking_api_server/`

### Integration Points
- `BankingAgent.js` — renders agent messages; sequential thinking steps would be a new message subtype rendered inline
- `/admin` route — audit page would be a new protected route following the same admin guard pattern
- Demo Config page (`Config.js`) — new `<ConfigSection>` for "Agent Async Mode" with 3 radio/select options

</code_context>

<deferred>
## Deferred Ideas

- Publish to Smithery/mcp.run registry (Q5-a deferred — no real registry target identified yet)
- Full job persistence (database-backed) — in-memory Map sufficient for demo
- Webhook notifications on job completion — out of scope for this phase

</deferred>

---

*Phase: 32-mcp-server-advanced-capabilities*
*Context gathered: 2026-04-02*
