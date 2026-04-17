# Banking Demo — Messaging Pattern Comparison

**Phase:** 175 — Investigate JSON-RPC and how/when we should be using it
**Date:** 2026-04-17

---

## 1. Current Messaging Patterns

### A. MCP Server (banking_mcp_server/) — JSON-RPC 2.0 ✅

The MCP server **already uses JSON-RPC 2.0** as its native protocol.

**Transport:** WebSocket (`BankingMCPServer.ts` → `ws` library)

**Message Flow:**
```
Client (BFF/Agent)                    MCP Server (WebSocket)
        |                                     |
        |--- { jsonrpc:"2.0", id:1,          |
        |      method:"initialize",           |
        |      params:{protocolVersion:"..."}} |
        |------------------------------------>|
        |                                     |
        |    { jsonrpc:"2.0", id:1,           |
        |<--- result:{capabilities:{...}} }   |
        |                                     |
        |--- { jsonrpc:"2.0",                 |
        |      method:"notifications/         |
        |      initialized" }                 |
        |------------------------------------>|
        |                                     |
        |--- { jsonrpc:"2.0", id:2,          |
        |      method:"tools/list" }          |
        |------------------------------------>|
        |                                     |
        |    { jsonrpc:"2.0", id:2,           |
        |<--- result:{tools:[...]} }          |
        |                                     |
        |--- { jsonrpc:"2.0", id:3,          |
        |      method:"tools/call",           |
        |      params:{name:"get_accounts",   |
        |        arguments:{}} }              |
        |------------------------------------>|
        |                                     |
        |    { jsonrpc:"2.0", id:3,           |
        |<--- result:{content:[{type:"text",  |
        |      text:"..."}]} }                |
```

**Type Definitions (types/mcp.ts):**
```typescript
interface MCPRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
}

interface MCPResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: unknown;
  error?: MCPError;
}

interface MCPError {
  code: number;     // JSON-RPC error codes
  message: string;
  data?: unknown;
}
```

**Error Handling (MCPMessageHandler.ts):**
- Uses standard JSON-RPC error codes: -32600, -32601, -32602, -32603
- Custom method: `createErrorResponse(id, code, message, data)`
- Auth challenges use custom error data structure per MCP spec

**Observation:** This is **correct JSON-RPC 2.0 implementation**. No changes needed.

---

### B. BFF Server (banking_api_server/) — REST/HTTP ✅

The BFF uses standard Express.js REST patterns.

**Transport:** HTTP (Express routes)

**Message Flow (Token Exchange Example):**
```
React UI                              BFF (Express)                    PingOne
    |                                     |                               |
    |--- GET /api/pingone-test/           |                               |
    |    exchange-user-to-mcp             |                               |
    |------------------------------------>|                               |
    |                                     |--- POST /oauth/token          |
    |                                     |    grant_type=                 |
    |                                     |    urn:ietf:params:oauth:     |
    |                                     |    grant-type:token-exchange  |
    |                                     |---------------------------->  |
    |                                     |                               |
    |                                     |<--- { access_token, ...}      |
    |                                     |                               |
    |    { success: true,                 |                               |
    |<--- exchangedToken: {...},          |                               |
    |      decodedClaims: {...} }         |                               |
```

**Error Handling (BFF routes):**
```javascript
// Standard HTTP error pattern
res.status(403).json({
  error: 'SCOPE_VIOLATION',
  message: 'Insufficient scopes',
  details: { required: [...], actual: [...] }
});

// Phase 156 educational errors
res.status(403).json({
  error: 'SCOPE_VIOLATION',
  message: 'Scope violation',
  details: {
    what_failed: '...',
    why: '...',
    teaching: '...',
    fix: '...'
  },
  documentation_link: '...',
  timestamp: '...'
});
```

**Observation:** REST/HTTP is the **correct choice** for BFF-to-browser communication. HTTP status codes, cookies, sessions, and OAuth redirects all require HTTP semantics.

---

### C. Agent-to-MCP Communication — JSON-RPC over WebSocket ✅

```
LangChain Agent                       BFF Proxy                      MCP Server
    |                                     |                               |
    |--- POST /api/mcp/tool              |                               |
    |    { toolName, arguments }          |                               |
    |------------------------------------>|                               |
    |                                     |--- WS: { jsonrpc:"2.0",      |
    |                                     |    method:"tools/call",       |
    |                                     |    params:{name, arguments} } |
    |                                     |-----------------------------> |
    |                                     |                               |
    |                                     |<--- { jsonrpc:"2.0",         |
    |                                     |      result:{content:[...]} } |
    |                                     |                               |
    |    { success: true,                 |                               |
    |<--- result: {...} }                 |                               |
```

**Observation:** The BFF acts as a **protocol bridge**:
- Receives REST requests from agent/UI
- Converts to JSON-RPC and sends over WebSocket to MCP server
- Converts JSON-RPC response back to REST response

This is the standard architecture for MCP integration.

---

### D. SSE / Streaming — Event-based ✅

```
React UI                              BFF (Express)
    |                                     |
    |--- GET /api/app-events/stream       |
    |    Accept: text/event-stream        |
    |------------------------------------>|
    |                                     |
    |<--- data: {"type":"agent_action",   |
    |      "message":"Getting accounts"}  |
    |<--- data: {"type":"tool_result",    |
    |      "message":"Found 3 accounts"}  |
    |<--- data: {"type":"complete"}       |
```

**Observation:** SSE streaming is **not JSON-RPC** and should not be. Streaming is one-directional (server → client) and event-based, which doesn't fit the JSON-RPC request/response model.

---

## 2. Pattern Summary

| Communication Path | Protocol | Transport | JSON-RPC? | Correct? |
|-------------------|----------|-----------|-----------|----------|
| UI → BFF | REST/HTTP | HTTP | ❌ No | ✅ Yes |
| BFF → MCP Server | JSON-RPC 2.0 | WebSocket | ✅ Yes | ✅ Yes |
| BFF → PingOne | REST/HTTP | HTTP | ❌ No | ✅ Yes |
| UI ← BFF Events | SSE | HTTP | ❌ No | ✅ Yes |
| MCP ← MCP Notifications | JSON-RPC Notification | WebSocket | ✅ Yes | ✅ Yes |
| Phase 156 Error Middleware | REST + Educational | HTTP | ❌ No | ✅ Yes |
| Phase 156 MCP Errors | JSON-RPC Error | WebSocket | ✅ Yes | ✅ Yes |

---

## 3. Misalignments or Improvement Areas

### A. Minor: `createErrorResponse` duplication

Both `MCPMessageHandler.ts` and `BankingMCPServer.ts` have their own `createErrorResponse()` methods with identical signatures. Could be extracted to a shared utility, but this is cosmetic.

### B. Minor: `jsonrpc: '2.0'` field missing from some responses

The `createErrorResponse()` in `MCPMessageHandler.ts` returns:
```typescript
return { id, error: { code, message, data } };
```
This is missing the `jsonrpc: '2.0'` field that the spec requires. The `MCPResponse` type in `mcp.ts` includes it, but the implementation doesn't always set it.

**Impact:** Low — most clients don't strictly validate the `jsonrpc` field, but it's technically non-compliant.

### C. No Issues: Phase 156 MCP error formatter

The `mcpErrorFormatter.js` (Phase 156) correctly formats JSON-RPC error responses with educational content in the `data` field. This is proper JSON-RPC error extension.

---

## 4. Low-Hanging Fruit

| Area | Effort | Benefit | Recommendation |
|------|--------|---------|----------------|
| Add `jsonrpc: '2.0'` to createErrorResponse | 5 min | Spec compliance | ✅ Do it |
| Extract shared createErrorResponse utility | 30 min | DRY, consistency | 🔄 Nice-to-have |
| Add JSON-RPC batch support to MCP server | 4+ hrs | Spec compliance, rarely used | ❌ Not worth it |
| Convert BFF routes to JSON-RPC | 8+ hrs | None — wrong protocol for HTTP APIs | ❌ Don't do this |
| Add JSON-RPC validation middleware | 2 hrs | Request validation | 🔄 Nice-to-have |

---

## 5. Key Conclusion

The banking demo's messaging architecture is **already correctly split**:

- **JSON-RPC 2.0** → MCP server communication (as required by MCP spec)
- **REST/HTTP** → BFF routes, OAuth, banking APIs, browser communication
- **SSE** → Event streaming from BFF to UI

There is no architectural gap. The only minor improvements are cosmetic (DRY refactoring, spec field completeness).
