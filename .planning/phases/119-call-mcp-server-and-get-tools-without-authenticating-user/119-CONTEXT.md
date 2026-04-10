---
phase: 119
title: "Call MCP server and get tools without authenticating user"
gathered: 2026-04-10
status: ready-for-planning
---

# Phase 119: Call MCP Server and Get Tools Without Authenticating User — Context

**Gathered:** 2026-04-10  
**Status:** Ready for planning  
**Source:** User discussion (Phase 119 planning)

---

## Phase Boundary

Enable **unauthenticated access to MCP server tool discovery**. External systems (AI clients, public docs, discovery services) can learn what tools the banking MCP server provides without requiring authentication.

**Outcome:** An unauthenticated caller can discover safe tools (read-only, non-banking operations) via standard MCP discovery endpoints, enabling integration with Cursor, Claude Desktop, and similar AI clients.

---

## Locked Decisions

### D-01: Discovery Scope — Whitelist Approach
**Decision:** Only expose "safe" read-only tools without auth; hide banking operations.

**Tools to expose (whitelist):**
- ✅ `explain_topic` — Education/explanations (no sensitive data)
- ✅ `brave_search` — Web search (no banking data)
- ✅ `get_login_activity` — Optional; audit/security information (evaluate risk)

**Tools to hide (require auth):**
- ❌ `get_my_accounts` — Exposes account structure
- ❌ `create_transfer` — High-risk banking operation
- ❌ `create_deposit` — High-risk banking operation
- ❌ `create_withdrawal` — High-risk banking operation

**Rationale:**  
- Balance between AI client discoverability and security  
- Avoids exposing internal banking tool architecture to unauthenticated callers  
- Enables safe tools to be used by public integrations

**Implementation note:** Tool list should be configurable (environment variable or config) for easy audit/adjustment.

---

### D-02: Rate Limiting — Generous Per-IP Limit
**Decision:** Apply rate limiting to prevent abuse, but generous enough for normal tool discovery.

**Rate limit:** 100 requests per minute per IP address

**Rationale:**
- Prevents DoS attacks on discovery endpoint
- Safe threshold for AI client discovery (clients typically fetch tool list once on startup)
- Doesn't punish legitimate integrations

**Implementation:**
- Use express-rate-limit middleware, keyed by client IP
- Apply to both endpoints (see D-03)
- Return 429 Too Many Requests with retry-after header on limit exceeded

---

### D-03: Technical Interface — Dual Endpoints
**Decision:** Expose tool discovery via TWO endpoints for maximum compatibility.

**Endpoint A:** `.well-known/mcp-server` (RFC-compliant discovery)
```
GET /.well-known/mcp-server
```
- Standard MCP client discovery location
- Returns JSON manifest with tools + server metadata
- Enables Claude Desktop, Cursor, Windsurf to auto-discover this server
- Follows convention of `.well-known/openid-configuration`, `.well-known/jwks.json`

**Endpoint B:** `/api/mcp/tools` (REST convenience)
```
GET /api/mcp/tools
```
- Consistent with existing `/api/mcp/*` pattern in codebase
- Easier REST API for simple integrations
- Same rate limiting as Endpoint A

**Rationale:**
- `.well-known` for standard MCP ecosystem integration
- `/api/mcp/tools` for developer convenience & consistency with internal patterns
- Both return identical data structure

**Response schema (both endpoints):**
```json
{
  "server": {
    "name": "Banking MCP Server",
    "version": "1.0.0",
    "description": "MCP tools for banking operations and education"
  },
  "tools": [
    {
      "name": "explain_topic",
      "description": "Explain an OAuth, identity, or AI agent concept",
      "schema": { /* full Zod schema */ }
    },
    {
      "name": "brave_search",
      "description": "Search the web for current information",
      "schema": { /* full Zod schema */ }
    },
    // conditionally: get_login_activity if audit risk acceptable
  ],
  "requiresAuthentication": false,
  "rateLimit": {
    "requestsPerMinute": 100,
    "keyedBy": "clientIp"
  }
}
```

---

## the agent's Discretion

**Areas not locked down by user — implementation details for researcher/planner:**

1. **Error responses:** What happens if rate limit exceeded, when schema changes, invalid query params?
2. **Cache strategy:** Should tool list be cached? How often re-fetch from registry?
3. **Versioning:** Should response include server version? How to handle backwards compatibility?
4. **Monitoring:** How to log/monitor unauthenticated discovery calls?
5. **get_login_activity safety assessment:** Should this be included in whitelist or require auth? (Audit log access = sensitive)
6. **HTTP headers:** What security headers (CORS, CSP) should accompany discovery endpoints?

---

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### MCP & Discovery Standards
- `@modelcontextprotocol/sdk` — Official MCP SDK (already in package.json @^0.5.0)
- Reference: [MCP Protocol Spec](https://modelcontextprotocol.io/) (external, for research)
- RFC 8414 — OAuth 2.0 Authorization Server Metadata (analogous `.well-known` pattern)
- RFC 6750 — OAuth 2.0 Bearer Token Usage

### Bank

ing Demo Project Standards
- [CLAUDE.md](../../../CLAUDE.md) — Agent guide, core decisions, regression plan
- [REGRESSION_PLAN.md](../../../REGRESSION_PLAN.md) — Do-not-break list, must-have stability checklist
- `.planning/REQUIREMENTS.md` — MCP-ADV-05 (MCP registry integration), ecosystem considerations

### Related Phases
- [Phase 116 (LangChain Native Agent)](../116-full-langchain-native-agent-rebuild-replace-retrofit-with-real-framework-agent-across-all-surfaces/116-01-SUMMARY.md) — Context: agent now uses MCP tools
- [Phase 118 (HuggingFace Research)](../118-*/118-01-SUMMARY.md) — Phase 119 depends on this; may inform tool selection

### Existing Code Patterns
- `banking_api_server/utils/mcpToolRegistry.js` — 7-tool registry (existing)
- `banking_api_server/routes/bankingAgentRoutes.js` — Agent message endpoint (existing)
- `banking_api_server/server.js` — Express app setup, middleware pattern (existing)
- Rate limiting pattern: See `rateLimit` config in server.js around session middleware

---

## Specifics

### Feature Parity with Phase 116

Phase 116 implemented agent-driven tool discovery (internal, authenticated). Phase 119 mirrors the same 7 tools but with a public whitelist:

- Same tool names, schemas, descriptions from mcpToolRegistry.js
- Same response format as agent tool list
- **Difference:** Unauthenticated access + whitelist filter + rate limiting

### MCP-ADV-05 Alignment

From REQUIREMENTS.md:
> **MCP-ADV-05**: MCP registry integration — `mcpServers` field in package.json + README "AI Client Setup" section with Claude Desktop, Cursor, Windsurf config snippets

Phase 119 enables this by providing the `.well-known` endpoint that AI clients expect. The README snippets will point to `https://<host>/.well-known/mcp-server` for discovery.

---

## Deferred Ideas

- **Search / filtering on tool list:** "Find tools by keyword" — could be a future enhancement, out of scope for now
- **Tool popularity metrics:** Unauthenticated access to tool usage stats — deferred (requires analytics)
- **Dynamic whitelist from environment:** Would be nice, but initial implementation can hardcode the whitelist (easy to refactor later)

---

## Next Steps

**Ready for:** Research → Planning → Execution

**Researcher will:** Investigate unauthenticated discovery patterns in MCP ecosystem, rate limiting best practices, `.well-known` conventions

**Planner will:** Break into tasks (endpoint A, endpoint B, rate limiting middleware, whitelist logic, tests)

---

*Phase: 119-call-mcp-server-and-get-tools-without-authenticating-user*  
*Context gathered: 2026-04-10*
