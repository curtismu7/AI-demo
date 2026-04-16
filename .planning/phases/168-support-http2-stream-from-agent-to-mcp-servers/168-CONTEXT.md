# Phase 168: Support HTTP2 Stream from Agent to MCP Servers - Context

**Gathered:** 2026-04-16
**Status:** Ready for planning (auto-generated)
**Source:** Project architecture analysis

---

## Phase Boundary

Enable full HTTP/2 streaming support for Agent ↔ MCP Server communication, replacing polling-based patterns with true streaming responses. Currently:
- Agent calls BFF endpoint `/api/mcp/tool` (HTTP/1.1 POST)
- BFF proxies through WebSocket to MCP server
- Results stream back via SSE (`/api/mcp/tool/events`)
- Each tool call = separate POST + SSE polling loop

Goal: Support direct HTTP/2 streams from Agent to MCP servers for efficient resource usage, real-time updates, and improved latency.

---

## Implementation Decisions

### ✅ Locked Decisions (from architecture)

**D-01 — HTTP/2 Transport Path**
- BFF `POST /api/mcp/tool` endpoint adds HTTP/2 support
- Agent service (`bankingAgentService.callMcpTool`) upgrades from HTTP/1.1 fetch → HTTP/2 compatible fetch
- Streaming responses use chunked transfer encoding or Server-Sent Events (SSE) over HTTP/2

**D-02 — Backward Compatibility**
- WebSocket transport unchanged
- HTTP/1.1 clients continue to work (fallback)
- HTTP/2 is opt-in via headers or connection negotiation

**D-03 — MCP Server HTTP Streamable Transport**
- HttpMCPTransport.ts already implements POST `/mcp` endpoint (spec 2025-11-25)
- MCP Session-Id header-based session management
- BFF uses this as target for HTTP/2 bridge

**D-04 — Flow Diagram & SSE Events**
- Agent flow diagram events continue via SSE (no change to UI)
- Can be delivered over HTTP/2 connection for efficiency

### ⚠️ the agent's Discretion

- HTTP/2 server push utilization (PUSH_PROMISE) — evaluate if beneficial
- Connection pooling strategy for BFF → MCP (keep-alive, pipelining)
- Metrics/observability for HTTP/2 connection health
- Client cert or mTLS for BFF → MCP communication (optional)

---

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### MCP Server Infrastructure
- [banking_mcp_server/src/server/HttpMCPTransport.ts](banking_mcp_server/src/server/HttpMCPTransport.ts) — HTTP Streamable MCP transport (POST /mcp, RFC 9728 metadata)
- [banking_mcp_server/src/server/BankingMCPServer.ts](banking_mcp_server/src/server/BankingMCPServer.ts) — Main server setup, HTTP/WebSocket dual transport

### Agent Communication
- [banking_api_ui/src/services/bankingAgentService.js](banking_api_ui/src/services/bankingAgentService.js) — Agent tool calls (callMcpTool), flow trace setup
- [banking_api_ui/src/services/mcpFlowSseClient.js](banking_api_ui/src/services/mcpFlowSseClient.js) — SSE event stream consumer

### BFF Routing
- [banking_api_server/routes/agent.js](banking_api_server/routes/agent.js) or equivalent — `POST /api/mcp/tool` endpoint
- [banking_api_server/services/mcpFlowSseHub.js](banking_api_server/services/mcpFlowSseHub.js) — SSE event publishing

### Architecture Diagrams
- [docs/MCP_COMPLIANCE_DIAGRAM.drawio](docs/MCP_COMPLIANCE_DIAGRAM.drawio) — Phase D (HTTP Streamable) compliance plan

---

## Specific Ideas

### Phase D Compliance (ref architecture)
- MCP spec 2025-11-25 Phase D introduces HTTP Streamable transport
- BFF should implement as transparent HTTP/2 adapter
- Agent remains unaware of transport switch (transparent upgrade)

### Performance Benefits Expected
- Connection multiplexing: multiple tool calls on one HTTP/2 connection
- Lower latency: no SSE polling delays
- Header compression: HTTP/2 HPACK reduces overhead
- Server push: MCP server can proactively send events

---

## Deferred Ideas

- HTTP/2 server push for unsolicited events (investigate first, then decide)
- gRPC alternative transport (not MCP spec compliant, deferred)
- Connection pooling instrumentation (Phase 164: Performance)

---

*Phase 168: HTTP2 stream support*
*Context auto-generated from codebase architecture*
