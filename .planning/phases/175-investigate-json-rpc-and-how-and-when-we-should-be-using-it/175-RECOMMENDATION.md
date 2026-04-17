# JSON-RPC Adoption Recommendation

**Phase:** 175 — Investigate JSON-RPC and how/when we should be using it
**Date:** 2026-04-17
**Decision:** ✅ **Already adopted where appropriate. No migration needed.**

---

## Executive Summary

The banking demo **already uses JSON-RPC 2.0** correctly in the MCP server — because the MCP specification requires it. The BFF and UI correctly use REST/HTTP for browser-facing APIs, OAuth flows, and CRUD operations. There is no architectural gap to fill.

---

## Decision Matrix

### ✅ Already Using JSON-RPC (Correct)

| Component | JSON-RPC Usage | Status |
|-----------|----------------|--------|
| MCP Server → Client protocol | All tools/call, tools/list, initialize | ✅ Correct |
| MCP error responses | JSON-RPC error codes (-32600 to -32603) | ✅ Correct |
| MCP notifications | Notification format (no id, no response) | ✅ Correct |
| Phase 156 MCP error formatter | Educational content in error.data | ✅ Correct |

### ❌ Should NOT Use JSON-RPC (Correct as REST)

| Component | Why REST is Right |
|-----------|------------------|
| BFF → Browser (React UI) | HTTP status codes, cookies, redirects, caching |
| OAuth / PKCE flows | OAuth spec requires HTTP endpoints |
| Token exchange (RFC 8693) | PingOne token endpoint is REST |
| Banking API routes | CRUD semantics, HTTP verbs, resource URLs |
| SSE event streaming | One-directional, event-based (not RPC) |
| Admin configuration | Standard form-based HTTP |

### 🔄 Minor Improvements (Optional)

| Fix | Effort | Impact |
|-----|--------|--------|
| Add `jsonrpc: '2.0'` to `createErrorResponse()` in MCPMessageHandler.ts | 5 min | Spec compliance |
| Extract shared error response utility | 30 min | DRY code |

---

## Migration Cost vs. Benefit

### Quick Wins (< 30 min each)

1. **Add missing `jsonrpc: '2.0'` field** — One-line fix in `createErrorResponse()` methods
2. **Extract shared utility** — Move `createErrorResponse` to a shared module

### Not Worth Doing

1. **Convert BFF routes to JSON-RPC** — Wrong protocol for HTTP APIs. Would break OAuth, sessions, cookies, HTTP caching, and standard REST tooling. Cost: 8+ hours. Benefit: negative.

2. **Add JSON-RPC batch support** — MCP spec doesn't use batch requests. No client sends them. Cost: 4+ hours. Benefit: zero.

3. **Replace custom JSON-RPC handling with library** — Our implementation is ~30 lines of routing code. A library would add dependency for no functional benefit.

---

## Impact on Future Phases

| Phase | JSON-RPC Relevant? | Action |
|-------|-------------------|--------|
| 178 (Agentic Trust education) | No — educational UI content | None |
| 179 (LLM dropdown) | No — BFF config + UI dropdown | None |
| 180 (Gemma 4 provider) | No — LLM provider integration | None |
| Future MCP features | Yes — already using JSON-RPC | Continue current pattern |
| Future service-to-service | Maybe — evaluate per use case | JSON-RPC if bidirectional RPC needed |

---

## Final Recommendation

**No action required.** The architecture is correct:

1. **MCP protocol layer**: JSON-RPC 2.0 ✅ (as spec requires)
2. **BFF/HTTP layer**: REST ✅ (correct for browser, OAuth, CRUD)
3. **Event streaming**: SSE ✅ (correct for one-way server→client events)

**Optional cleanup** (if touching these files for other reasons):
- Add `jsonrpc: '2.0'` to `createErrorResponse()` in `MCPMessageHandler.ts` and `BankingMCPServer.ts`
- Extract shared error utility if DRY matters enough

**This phase confirms the existing architecture is sound.** No migration, no new libraries, no refactoring needed.
