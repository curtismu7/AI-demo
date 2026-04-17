# Phase 173: Research — WebMCP / Browser-Based MCP Client

**Date:** 2026-04-17
**Discovery Level:** 2 (Standard Research)

---

## Critical Finding: "WebMCP from Google" Does Not Exist

**There is no Google project, specification, or SDK called "WebMCP."** Extensive search across npm, GitHub, Google's developer documentation, and the MCP specification reveals no such product. The term may be a conflation of:

1. **MCP's Streamable HTTP transport** (the official browser-compatible MCP transport from Anthropic's spec)
2. **Web-based MCP clients** (several community projects that run MCP in browsers)
3. **Google's Gemini CLI** which supports MCP but is a CLI tool, not a web/browser framework

### What Actually Exists for Browser MCP

| Option | Source | Transport | Browser-Ready | Status |
|--------|--------|-----------|---------------|--------|
| `@modelcontextprotocol/sdk` v1.29.0 | Anthropic (official) | Streamable HTTP, SSE | Yes (with bundler) | Stable, 32M+ weekly downloads |
| MCP Streamable HTTP spec (2025-03-26) | MCP specification | HTTP POST + SSE | Native | Released spec |
| Various web MCP clients | Community | SSE / Streamable HTTP | Yes | Varied maturity |

---

## MCP Streamable HTTP Transport (The Recommended Approach)

The MCP spec (2025-03-26) introduced **Streamable HTTP** as the recommended web transport, replacing the older HTTP+SSE approach:

### How It Works
- **Client → Server:** HTTP POST with JSON-RPC body to a single MCP endpoint
- **Server → Client:** Responses via SSE stream OR single JSON response
- **Server → Client (unsolicited):** HTTP GET opens SSE stream for server-initiated messages
- **Session management:** `Mcp-Session-Id` header for stateful sessions
- **Resumability:** SSE event IDs + `Last-Event-ID` header for reconnection

### Key Properties
- Single HTTP endpoint (e.g., `https://example.com/mcp`)
- POST for client messages, GET for server-initiated streams
- Compatible with standard web infrastructure (proxies, load balancers, CORS)
- No WebSocket required — pure HTTP + SSE
- Backwards compatible with older HTTP+SSE transport

### Security Requirements from Spec
- Servers MUST validate `Origin` header (DNS rebinding protection)
- Local servers SHOULD bind to localhost only
- Servers SHOULD implement authentication

---

## Impact on Phase 173 Decisions

### D-02 Conflict: "WebSocket transport"
The CONTEXT.md locked D-02 specifies WebSocket transport. However:
- **MCP spec does NOT define WebSocket as a standard transport** — it defines stdio and Streamable HTTP only
- The existing `banking_mcp_server` uses WebSocket as a **custom transport** (via `ws` library)
- The `@modelcontextprotocol/sdk` Client class supports Streamable HTTP natively
- Using Streamable HTTP for the browser client would be **spec-compliant** and simpler

**Recommendation:** The browser client should use **Streamable HTTP** (the spec-standard web transport) rather than WebSocket. This requires adding a Streamable HTTP endpoint to the MCP server alongside the existing WebSocket endpoint.

### D-04: Extend existing agent context provider
This remains valid — the browser MCP client state can be integrated into the existing agent context.

### D-01: Feature flag gating
This remains valid — standard React pattern.

---

## Architecture Options

### Option A: Streamable HTTP (Recommended)
```
Browser (React SPA)
  │  HTTP POST + SSE (Streamable HTTP)
  ▼
banking_api_server (BFF proxy)
  │  HTTP POST + SSE
  ▼  
banking_mcp_server (new /mcp endpoint)
```

**Pros:** Spec-compliant, works through BFF proxy, no WebSocket complexity, native SDK support
**Cons:** Requires adding Streamable HTTP endpoint to MCP server

### Option B: Direct WebSocket (Current Pattern)
```
Browser (React SPA)
  │  WebSocket (wss://)
  ▼
banking_mcp_server (existing WS endpoint)
```

**Pros:** Matches existing server transport, bidirectional
**Cons:** Non-standard MCP transport, bypasses BFF (security concern per CLAUDE.md), CORS/proxy complications

### Option C: BFF-Proxied WebSocket
```
Browser (React SPA)
  │  WebSocket via BFF
  ▼
banking_api_server (WS proxy)
  │  WebSocket
  ▼
banking_mcp_server
```

**Pros:** Keeps tokens server-side per security model
**Cons:** Complex WS proxy, non-standard MCP transport, more code

**Recommendation: Option A** — Add Streamable HTTP endpoint to MCP server, proxy through BFF. Aligns with MCP spec, keeps tokens server-side, simplest browser integration via `@modelcontextprotocol/sdk`.

---

## @modelcontextprotocol/sdk Client Usage

The official TypeScript SDK (v1.29.0) provides:

```typescript
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const transport = new StreamableHTTPClientTransport(
  new URL('https://example.com/mcp')
);
const client = new Client({ name: 'banking-web', version: '1.0.0' });
await client.connect(transport);

// List tools
const { tools } = await client.listTools();

// Call a tool
const result = await client.callTool({ name: 'get_my_accounts', arguments: {} });
```

**Browser compatibility:** The SDK uses `fetch` and `EventSource` internally — both are browser-native APIs. However the SDK is published as ESM and may need bundler configuration for CRA (Create React App).

### CRA Bundling Concern
The existing React SPA uses CRA. The MCP SDK is ESM-first and uses Node.js imports. Options:
1. Use the SDK via the BFF (server-side) and expose a simpler REST+SSE API to the browser
2. Bundle the SDK client-side with CRA webpack config adjustments
3. Use raw `fetch` + `EventSource` to implement Streamable HTTP protocol directly (no SDK dependency)

**Recommendation:** Option 1 (BFF proxy) is safest — tokens stay server-side, no bundler complications, and the browser just needs `fetch` + `EventSource` calls to the BFF.

---

## Existing Codebase Patterns

### Current MCP Client Flow (via BFF)
- `mcpFlowSseClient.js`: Opens `EventSource` to `/api/mcp/tool/events?trace=...` for SSE streaming
- `bankingAgentService.js`: Orchestrates agent tool calls
- `bffAxios.js`: Handles BFF communication
- BFF (`banking_api_server`) proxies MCP tool calls to `banking_mcp_server` via WebSocket

### What Needs to Change for Phase 173
1. **MCP Server:** Add Streamable HTTP endpoint (`/mcp`) alongside existing WebSocket
2. **BFF:** Add proxy route that forwards browser HTTP requests to MCP server's Streamable HTTP endpoint
3. **Frontend:** New MCP client service using `fetch` + `EventSource` to BFF's proxy endpoint
4. **Frontend:** WebMCP panel component behind feature flag
5. **Frontend:** Extend agent context provider with WebMCP state (D-04)

---

## Don't Hand-Roll
- MCP JSON-RPC message format — use SDK types or follow spec exactly
- Session management — use `Mcp-Session-Id` per spec
- SSE parsing — use browser-native `EventSource`

## Common Pitfalls
- CRA + ESM SDK: May hit transpilation issues; BFF proxy approach avoids this
- CORS: BFF proxy eliminates CORS concerns since everything is same-origin
- Token exposure: Direct browser-to-MCP-server connections would expose tokens; BFF proxy keeps tokens server-side per CLAUDE.md security model
- WebSocket vs Streamable HTTP: Don't confuse the existing WS transport with spec-standard web transport

---

## Validation Architecture

### Testable Behaviors
1. MCP server accepts Streamable HTTP connections at `/mcp` endpoint
2. BFF proxies Streamable HTTP to MCP server
3. Browser client can `initialize` → `listTools` → `callTool` via BFF proxy
4. Feature flag hides/shows WebMCP UI
5. WebMCP tool results appear in shared agent state (D-04)
6. Streaming SSE events flow from MCP server → BFF → browser

### Key Risk
The biggest unknown is whether the `banking_mcp_server` TypeScript codebase can cleanly support both WebSocket AND Streamable HTTP simultaneously. The `@modelcontextprotocol/sdk` server-side has an Express adapter for Streamable HTTP that could be added alongside the existing `ws` server — this is the cleanest path.

---

## RESEARCH COMPLETE

**Summary:** "WebMCP from Google" does not exist. The correct approach is to use MCP's official **Streamable HTTP transport** with the `@modelcontextprotocol/sdk`. The implementation should add a Streamable HTTP endpoint to the MCP server, proxy it through the BFF, and build a browser client using `fetch` + `EventSource`. This is spec-compliant, keeps tokens server-side, and integrates cleanly with existing patterns.

**D-02 needs user clarification:** The locked decision specifies "WebSocket transport" but the research shows Streamable HTTP is the spec-standard web transport. The user should decide whether to:
1. Use Streamable HTTP (recommended, spec-compliant)
2. Keep WebSocket (non-standard but matches existing server)
