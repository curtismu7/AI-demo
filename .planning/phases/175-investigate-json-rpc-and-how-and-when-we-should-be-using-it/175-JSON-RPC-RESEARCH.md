# JSON-RPC 2.0 Investigation — Research Findings

**Phase:** 175 — Investigate JSON-RPC and how/when we should be using it
**Date:** 2026-04-17

---

## 1. JSON-RPC 2.0 Specification Overview

JSON-RPC 2.0 (https://www.jsonrpc.org/specification) is a stateless, lightweight remote procedure call protocol. It uses JSON as its data format and is transport-agnostic (works over HTTP, WebSocket, TCP, stdio).

### Core Structure

**Request:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": { "name": "get_accounts", "arguments": {} }
}
```

**Success Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": { "content": [{ "type": "text", "text": "..." }] }
}
```

**Error Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "error": { "code": -32601, "message": "Method not found", "data": {} }
}
```

**Notification (no response expected):**
```json
{
  "jsonrpc": "2.0",
  "method": "notifications/initialized"
}
```

**Batch (array of requests):**
```json
[
  { "jsonrpc": "2.0", "id": 1, "method": "tools/list" },
  { "jsonrpc": "2.0", "id": 2, "method": "tools/call", "params": {...} }
]
```

### Reserved Error Codes

| Code | Meaning |
|------|---------|
| -32700 | Parse error — invalid JSON |
| -32600 | Invalid Request — not valid JSON-RPC |
| -32601 | Method not found |
| -32602 | Invalid params |
| -32603 | Internal error |
| -32000 to -32099 | Server error (implementation-defined) |

### Key Properties

1. **Request/Response correlation** — `id` field matches responses to requests
2. **Notifications** — Messages without `id` require no response
3. **Error structure** — Standardized `{code, message, data}` format
4. **Transport-agnostic** — Works over any bidirectional transport
5. **No session/state** — Protocol itself is stateless; state is application-level

### Advantages

- **Standardized error handling** — Well-defined error codes and structure
- **Request correlation** — `id` field enables multiplexed requests on one connection
- **Simplicity** — Thin wrapper, easy to implement, no extra dependencies
- **Interoperability** — Wide tooling support across languages
- **MCP native** — MCP spec is built directly on JSON-RPC 2.0

### Disadvantages

- **Not designed for streaming** — Request/response only; notifications are one-way
- **No metadata headers** — No equivalent to HTTP headers for auth, content-type, etc.
- **Batch complexity** — Partial failures in batch requests are awkward
- **No built-in auth** — Authentication must be handled at transport level

---

## 2. MCP Specification and JSON-RPC

The **Model Context Protocol (MCP) specification** is built **directly on top of JSON-RPC 2.0**. This is not a choice — it's a specification requirement.

### MCP Message Types (all JSON-RPC)

| MCP Method | JSON-RPC Type | Direction |
|------------|--------------|-----------|
| `initialize` | Request/Response | Client → Server |
| `notifications/initialized` | Notification | Client → Server |
| `tools/list` | Request/Response | Client → Server |
| `tools/call` | Request/Response | Client → Server |
| `logging/setLevel` | Request/Response | Client → Server |
| `ping` | Request/Response | Either direction |

### MCP Error Codes (Extending JSON-RPC)

MCP reuses JSON-RPC error codes and adds:
- `-32001` — Auth required (MCP-specific)
- `-32002` — Rate limited (MCP-specific)
- `-32003` — Insufficient scope (MCP-specific)

### Key Insight

**MCP IS JSON-RPC.** The question isn't "should we adopt JSON-RPC for MCP?" — the answer is "we already have." The MCP server's core protocol layer is 100% JSON-RPC 2.0.

---

## 3. Node.js JSON-RPC Libraries

| Library | Stars | Use Case |
|---------|-------|----------|
| `jayson` | 800+ | Full JSON-RPC 2.0 server/client, HTTP + TCP + stdio |
| `json-rpc-2.0` | 200+ | Lightweight, TypeScript-first |
| `@modelcontextprotocol/sdk` | MCP official | MCP-specific JSON-RPC implementation |
| Custom (our current approach) | N/A | Hand-rolled in MCPMessageHandler.ts |

### Our Current Implementation

We implement JSON-RPC manually in `MCPMessageHandler.ts`:
- `handleMessage()` — Routes based on `message.method`
- `createErrorResponse()` — Manually builds `{id, error: {code, message, data}}`
- Type definitions in `types/mcp.ts` — `MCPRequest`, `MCPResponse`, `MCPError`

This is **correct and functional** but hand-rolled rather than using a library.

---

## 4. Comparison: JSON-RPC vs REST

| Aspect | JSON-RPC 2.0 | REST (HTTP) |
|--------|-------------|-------------|
| **Transport** | Any (WS, HTTP, stdio) | HTTP only |
| **Addressing** | Method name string | URL path + verb |
| **Error handling** | Standardized codes | HTTP status codes |
| **Correlation** | `id` field | Request/response implicit |
| **Caching** | Not built-in | HTTP caching headers |
| **Discoverability** | None (or via list method) | HATEOAS, OpenAPI |
| **Auth** | Transport-level | Headers (Authorization) |
| **Streaming** | Not native | SSE, chunked transfer |
| **Batch** | Native array syntax | Multiple requests |

### When to use JSON-RPC

- ✅ Service-to-service RPC (tool invocation, method calls)
- ✅ WebSocket-based protocols (bidirectional, multiplexed)
- ✅ MCP compliance (required by spec)
- ✅ Request correlation on shared connections

### When to use REST

- ✅ Public APIs (discoverability, caching, documentation)
- ✅ CRUD operations (natural resource mapping)
- ✅ Browser-to-server (HTTP semantics, status codes)
- ✅ Token exchange, OAuth flows (standards expect HTTP)

---

## 5. Summary

JSON-RPC 2.0 is **already the foundation** of our MCP server. The banking demo correctly implements JSON-RPC via:

1. **Type definitions** (`types/mcp.ts`) — `MCPRequest`, `MCPResponse`, `MCPError`, `MCPNotification`
2. **Message routing** (`MCPMessageHandler.ts`) — Switch on `message.method`
3. **Error responses** — Standard JSON-RPC error codes (-32600 to -32603, plus MCP extensions)
4. **WebSocket transport** — JSON-RPC messages over WebSocket in `BankingMCPServer.ts`
5. **Request correlation** — `id` field used throughout

The BFF (banking_api_server) correctly uses REST/HTTP for:
- OAuth flows (PKCE, token exchange, callbacks)
- Banking API endpoints (accounts, transfers, etc.)
- Admin configuration endpoints
- Session management

This separation is architecturally correct: **JSON-RPC for MCP protocol, REST for HTTP APIs**.
