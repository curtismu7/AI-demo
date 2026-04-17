# Phase 183: MCP Tools Metadata Compliance and Token Chain Logging - Context

**Gathered:** 2026-04-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Make the MCP server's tool definitions fully compliant with MCP 2025-11-25 spec (annotations, title, icons on every tool) and add structured token chain logging through the MCP server so each tool call has a complete audit trail of how the token was obtained, including cross-call lineage tracking. Surface these logs in the UI on both the admin audit page and the user-facing token chain panel.

</domain>

<decisions>
## Implementation Decisions

### Tool Annotations Mapping
- **D-01:** Add MCP 2025-11-25 `annotations` block to all 9 tools in `BankingToolRegistry.ts`, emitted via `getMCPToolDefinitions()`
- **D-02:** Annotation mapping for each tool:
  - `get_my_accounts`: readOnlyHint=true, destructiveHint=false, idempotentHint=true, openWorldHint=false
  - `get_account_balance`: readOnlyHint=true, destructiveHint=false, idempotentHint=true, openWorldHint=false
  - `get_sensitive_account_details`: readOnlyHint=true, destructiveHint=false, idempotentHint=true, openWorldHint=false
  - `get_my_transactions`: readOnlyHint=true, destructiveHint=false, idempotentHint=true, openWorldHint=false
  - `create_deposit`: readOnlyHint=false, destructiveHint=false, idempotentHint=false, openWorldHint=false
  - `create_withdrawal`: readOnlyHint=false, destructiveHint=true, idempotentHint=false, openWorldHint=false
  - `create_transfer`: readOnlyHint=false, destructiveHint=true, idempotentHint=false, openWorldHint=false
  - `query_user_by_email`: readOnlyHint=true, destructiveHint=false, idempotentHint=true, openWorldHint=false
  - `sequential_think`: readOnlyHint=true, destructiveHint=false, idempotentHint=true, openWorldHint=true

### Token Chain Audit Scope
- **D-03:** Full per-tool-call chain + token lineage — log the complete lifecycle per tool call: incoming user token → token exchange → exchanged token claims (sub, act, aud, scope, exp) → tool execution → result status
- **D-04:** Track token lineage across tool calls in a session (e.g., "3rd tool call using exchanged token X, derived from user token Y granted at timestamp Z")
- **D-05:** Upgrade `TokenExchangeService` from console.log to proper `AuditLogger` calls (Redis-backed)
- **D-06:** Log to existing `AuditLogger` infrastructure — no separate logging system

### Education / Visibility
- **D-07:** Add "Token Chain" filter/tab to existing `/audit` admin page showing per-tool-call chain records and token lineage (admin-only)
- **D-08:** Enhance the frontend token chain panel to show MCP-server-side chain events fetched from audit API — lightweight "MCP delegation trail" view (any authenticated user)
- **D-09:** Both admin audit page and user token chain panel get new data — admin sees full structured logs, users see delegation trail

### Spec Compliance Depth
- **D-10:** Add `title` (human-readable display name) to all 9 tools — e.g., `get_my_accounts` → "My Bank Accounts"
- **D-11:** Add `icons` to tools by category (read, write, sensitive, think) — SVG or PNG per tool category
- **D-12:** Full MCP 2025-11-25 compliance: annotations + title + icons emitted in `getMCPToolDefinitions()`

### Agent's Discretion
- Exact `title` strings for each tool (should be clear, human-friendly)
- Icon design/source (simple SVG icons per category is fine)
- Exact structure of the token chain audit record schema
- How to present lineage in the token chain panel (timeline, table, or tree)
- Whether to add a new AuditLogger method (`logTokenChain`) or extend existing `logBankingOperation`

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### MCP Server
- `.github/skills/mcp-server/SKILL.md` — MCP server architecture, tool registry, BankingToolProvider, session management
- `banking_mcp_server/src/tools/BankingToolRegistry.ts` — All 9 tool definitions, `getMCPToolDefinitions()` output format
- `banking_mcp_server/src/interfaces/mcp.ts` — `ToolDefinition` interface (already has `annotations?`, `title?`, `icons?` fields)
- `banking_mcp_server/src/tools/BankingToolProvider.ts` — Tool execution, where token chain events originate
- `banking_mcp_server/src/auth/TokenExchangeService.ts` — Current token exchange audit (console.log-based `TokenExchangeAudit`)
- `banking_mcp_server/src/auth/TokenIntrospector.ts` — RFC 8693 §4.1 act claim logging
- `banking_mcp_server/src/utils/AuditLogger.ts` — Redis-backed audit logging (logBankingOperation, logAuthentication, logAuthorization, queryAuditLogs)

### BFF / Frontend
- `banking_api_server/routes/tokenChain.js` — `/api/token-chain` route (BFF-side token chain)
- `banking_api_server/services/tokenChainService.js` — Token chain data service
- `banking_mcp_server/src/server/HttpMCPTransport.ts` — `/audit` GET endpoint (proxied by BFF)

### Auth
- `.github/skills/oauth-pingone/SKILL.md` — PingOne OAuth, RFC 8693 token exchange, act/may_act claims

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `AuditLogger` (Redis-backed singleton): Has `logBankingOperation`, `logAuthentication`, `logAuthorization`, `queryAuditLogs` — extend for token chain
- `ToolDefinition` interface: Already has `annotations?`, `title?`, `icons?` optional fields — no interface changes needed
- `BankingToolDefinition`: Has `readOnly: boolean` — can derive `readOnlyHint` from this existing field
- `/audit` admin page: Already exists with filterable event table — add token chain filter/tab
- Token chain panel: Frontend already has localStorage-backed token chain display (Phase 33)

### Established Patterns
- `getMCPToolDefinitions()` strips internal fields (`handler`, `readOnly`) — must add annotations/title/icons to the OUTPUT, not just internal definition
- `TokenExchangeService` has `TokenExchangeAudit` interface — extend or replace with AuditLogger calls
- AuditLogger uses Redis with TTL-based retention

### Integration Points
- `BankingToolProvider` → AuditLogger: Add per-tool-call chain logging after each tool execution
- `getMCPToolDefinitions()` → MCP clients: Emit annotations, title, icons in tools/list response
- `/audit` API → frontend audit page: Add token chain event type filter
- BFF `/api/token-chain` → frontend token chain panel: Add MCP-side delegation trail data

</code_context>

<specifics>
## Specific Ideas

- `create_withdrawal` and `create_transfer` are `destructiveHint: true` because they move money out irreversibly
- `create_deposit` is NOT destructive (adds money) but is NOT idempotent (repeating creates duplicate deposits)
- `sequential_think` is `openWorldHint: true` — it reasons across an open domain
- `get_sensitive_account_details` keeps `readOnlyHint: true` even though current `readOnly: false` — the spec hint is about state mutation, not PII access

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 183-mcp-tools-metadata-compliance-and-token-chain-logging*
*Context gathered: 2026-04-17*
