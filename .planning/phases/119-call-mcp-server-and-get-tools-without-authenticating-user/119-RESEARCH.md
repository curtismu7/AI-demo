---
phase: 119
title: "Call MCP server and get tools without authenticating user"
researched: 2026-04-10
status: complete
---

# Phase 119 — Research: Unauthenticated MCP Tool Discovery

**Researched:** 2026-04-10  
**Status:** Ready for Planning

---

## Executive Summary

Phase 119 requires implementing **unauthenticated tool discovery** for the MCP server. Key findings:

1. **MCP Ecosystem Expectation:** AI clients (Claude Desktop, Cursor, Windsurf) expect `.well-known/mcp-server` endpoint for server discovery — follows RFC convention
2. **Whitelist Implementation:** Feasible via function that filters tools by name before serializing to JSON
3. **Rate Limiting:** express-rate-limit already in project; IP-based limiting is standard approach (100 req/min is generous)
4. **Existing Patterns:** Project has `.well-known` endpoints (oauth-client, oauth-protected-resource) with proven patterns
5. **Tool Safety Assessment:** 3 tools identified as safe (explain_topic, brave_search, get_login_activity); 4 banking tools require auth

---

## Research Findings

### 1. MCP Client Discovery Patterns

**Claude Desktop, Cursor, Windsurf Discovery Flow:**

AI clients discover MCP servers via:
1. **Static config (yaml):** Manually specified in client config file (e.g., `claude_desktop_config.json`)
2. **Runtime discovery (preferred):** Clients fetch `GET /.well-known/mcp-server` to learn available tools

**Endpoint Expectations:**
- **Location:** `https://server-host/.well-known/mcp-server` (RFC 8414 convention)
- **HTTP Method:** GET
- **Auth:** None required (public, unauthenticated)
- **Response:** JSON with server metadata + tool list

**Standard Response Structure:**
```json
{
  "name": "server-name",
  "version": "1.0.0",  
  "protocolVersion": "2024-11-05",
  "tools": [
    { "name": "tool1", "description": "...", "schema": { ... } },
    { "name": "tool2", "description": "...", "schema": { ... } }
  ]
}
```

**Advantage:** Once clients have `.well-known` endpoint, they can auto-sync available tools on startup or periodically — no manual config needed.

---

### 2. Whitelist Filtering — Technical Approach

**Tool Safety Classification (Phase 119 CONTEXT decision: Whitelist approach)**

**Safe Tools (expose without auth):**
1. **explain_topic**
   - Purpose: Education content (OIDC, token exchange, MCP, etc.)
   - Risk: None — returns static educational text
   - Audience: Public, anyone learning about the demo
   - ✅ WHITELIST

2. **brave_search**
   - Purpose: Web search (external data)
   - Risk: None — API call to external service; no banking data
   - Audience: Public, external knowledge queries
   - ✅ WHITELIST

3. **get_login_activity**
   - Purpose: Audit log lookup (security/compliance)
   - Risk: Medium — returns login timestamps and IPs for a username
   - Audience: Admin/audit use case
   - ⚠️ ASSESS: Could reveal whether an email address has logged in
   - **RECOMMENDATION:** Require auth for this tool (not in whitelist for Phase 119)
   - **FUTURE:** Could move to whitelist if access pattern changes (e.g., only current user's own activity)

**Unsafe Tools (require auth):**
- `get_my_accounts` — Requires user identity + token
- `create_transfer` — High-value operation, requires auth + consent
- `create_deposit` — High-value operation, requires auth + consent
- `create_withdrawal` — High-value operation, requires auth + consent

**Implementation Pattern:**
```javascript
// Whitelist of tools to expose without auth
const PUBLIC_TOOLS = ['explain_topic', 'brave_search'];

function getPublicToolList() {
  const allTools = createMcpToolRegistry();
  return allTools.filter(tool => PUBLIC_TOOLS.includes(tool.metadata.name));
}

// On discovery endpoint, return only public tools
app.get('/.well-known/mcp-server', (req, res) => {
  const publicTools = getPublicToolList();
  res.json({
    server: { ... },
    tools: publicTools
  });
});
```

---

### 3. Rate Limiting Strategy

**Codebase Pattern Review:**

The project already uses `express-rate-limit` (imported at line 18 of server.js):
```javascript
const rateLimit = require('express-rate-limit');

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 min window
  max: 100,                   // 100 requests per window
  keyGenerator: (req) => req.ip,
  handler: _rateLimitHandler // Custom response
});
```

**Recommended Approach for Phase 119:**

Create a **separate limiter for discovery endpoints** (less restrictive than global):
```javascript
const discoveryLimiter = rateLimit({
  windowMs: 60 * 1000,        // 1 min window (per user decision)
  max: 100,                   // 100 req/min per IP
  keyGenerator: (req) => req.ip,
  skip: () => rateLimitDisabled,  // Skip if DISABLE_RATE_LIMIT env var set
  handler: (req, res) => {
    res.status(429).json({
      error: 'too_many_requests',
      message: 'Discovery endpoint rate limit exceeded',
      retryAfter: req.rateLimit.resetTime
    });
  }
});
```

**Why separate from global limiter?**
- Discovery calls are lightweight (just list tools, no computation)
- 100 req/min per IP is generous (clients typically call once per startup)
- Reduces chance of natural traffic (e.g., load balancer probes) triggering false limits

---

### 4. Dual Endpoint Implementation

**Endpoint A: `.well-known/mcp-server` (RFC standard)**

**Pattern from existing code:**
```javascript
// From server.js line 957-962
app.get('/.well-known/oauth-client/:clientId', wellKnownHandler); 
app.use('/.well-known/oauth-protected-resource', protectedResourceMetadataRoutes);
```

This project already has `.well-known` routes. Implementation will follow same pattern:
```javascript
app.get('/.well-known/mcp-server', discoveryLimiter, (req, res) => {
  const publicTools = getPublicToolList();
  res.json({
    server: { name: "Banking MCP", version: "1.0.0", ... },
    tools: publicTools.map(tool => ({
      name: tool.metadata.name,
      description: tool.metadata.description,
      schema: tool.metadata.schema
    }))
  });
});
```

**Endpoint B: `/api/mcp/tools` (convenience)**

**Pattern from existing code:**
```javascript
// From server.js: other /api routes registered with no auth
app.get('/api/demo-scenario', unprotectedHandler);
```

Implementation:
```javascript
app.get('/api/mcp/tools', discoveryLimiter, (req, res) => {
  // Same logic as /.well-known/mcp-server
  // Allows internal/convenience access
});
```

**Both endpoints return identical data.**

---

### 5. HTTP Headers & Security Considerations

**CORS Headers:**
- `.well-known` endpoints typically allow safe CORS (browsers need access for discovery)
- Project uses helmet + cors middleware — discovery endpoints should NOT be blocked

**Security Headers to Review:**
- `Content-Type: application/json` — explicitly set
- `X-Content-Type-Options: nosniff` — already via helmet
- `Cache-Control: public, max-age=3600` — Consider caching tool list (expires 1h)

**Rate Limiting Response:**
- `429 Too Many Requests` with `Retry-After` header (per RFC 6585)
- Log rate limit hits for monitoring

---

## Tool Registry Structure

**From codebase audit (mcpToolRegistry.js):**

Each tool exposed by createMcpToolRegistry() has:
```javascript
{
  name: 'explain_topic',
  description: 'Explain an OAuth, identity, or AI agent concept',
  schema: z.object({ topic: z.string() })
}
```

**For discovery response, serialize as:**
```json
{
  "name": "explain_topic",
  "description": "Explain an OAuth, identity, or AI agent concept",
  "schema": {
    "type": "object",
    "properties": {
      "topic": { "type": "string" }
    },
    "required": ["topic"]
  }
}
```

Tool schema comes from Zod validation object — needs to be JSON-serializable.

---

## Validation Architecture

**Dimension 8: External Integration (Nyquist Validation)**

Phase 119 integrates with external MCP clients (Claude Desktop, Cursor). Validation criteria:

1. **Client Discovery Test:**
   - Configure Claude Desktop to use `http://localhost:3001/.well-known/mcp-server`
   - Verify clients can fetch tool list without authentication
   - Verify rate limiting works (send >100 requests, confirm 429 response)

2. **Response Contract:**
   - Tool list matches whitelist (only `explain_topic`, `brave_search`)
   - No banking tools exposed
   - Schema is valid JSON
   - Response includes `retryAfter` on rate limit

3. **Security:**
   - Rate limit prevents DoS on discovery endpoint
   - No authentication bypass (unauthenticated access limited to whitelist only)
   - get_login_activity NOT exposed (kept to auth-only)

---

## Validation Architecture

### Must-Have Truths

1. **Unauthenticated clients can discover safe tools** — No authorization required for `.well-known/mcp-server`
2. **Banking operations hidden** — get_my_accounts, transfers, deposits, withdrawals NOT in discovery response
3. **Rate limiting active** — >100 requests/min from single IP returns 429
4. **Dual endpoints work** — Both `/.well-known/mcp-server` and `/api/mcp/tools` return identical response
5. **Standard format** — Response matches MCP client expectations (name, description, schema fields)

### Critical Artifacts

- `.well-known/mcp-server` endpoint handler (route + response serialization)
- `/api/mcp/tools` endpoint handler (same as above, or reference first)
- Rate limiting middleware for discovery (express-rate-limit instance)
- Tool whitelist constant (list of safe tool names)
- Tool schema serializer (Zod → JSON schema conversion)

### Key Links

- `createMcpToolRegistry()` → Tools array
- Discovery endpoint → Client initialization
- Whitelist → Security boundary (what's public vs auth)
- Rate limiter → DoS prevention

---

## Next Steps: Planning

**Planner will:**

1. **Task 1: Discovery endpoint handler** — GET /.well-known/mcp-server with tool serialization
2. **Task 2: Convenience endpoint** — GET /api/mcp/tools (may be a reference to Task 1)
3. **Task 3: Rate limiting middleware** — Create discoveryLimiter instance specific to these endpoints
4. **Task 4: Tests** — Verify whitelist enforcement, rate limiting, response schema
5. **Task 5: Documentation** — README "AI Client Setup" section with endpoint URL + curl example

---

## Research Complete ✅

All investigation complete. Ready for structured planning.

**Key Insights for Planner:**
- Whitelist approach is feasible and safe (2 tools to expose initially)
- Rate limiting pattern exists in codebase — reuse express-rate-limit
- `.well-known` precedent exists (oauth-client, oauth-protected-resource endpoints)
- Dual endpoints serve different purposes (standard + convenience)
- Tool schema serialization is the main technical work (Zod → JSON)

*Phase 119 — Research Complete*
