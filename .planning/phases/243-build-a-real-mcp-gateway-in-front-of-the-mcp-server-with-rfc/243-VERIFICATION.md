---
phase: 243-build-a-real-mcp-gateway-in-front-of-the-mcp-server-with-rfc
verified: 2026-04-27T00:00:00Z
status: human_needed
score: 6/6 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Start the gateway with a real PingOne token and send POST /mcp — verify PingOne Authorize is called and a 403 is returned when policy denies"
    expected: "Gateway calls PingOne Authorize endpoint, receives DENY, returns HTTP 403 with structured JSON error; no upstream MCP call is made"
    why_human: "Requires a live PingOne Authorize tenant and valid OAuth tokens; cannot be verified by static code analysis or mocked tests alone"
  - test: "Configure MCP_GATEWAY_MODE=true on the upstream MCP server and send a request with a gateway-aud token directly (bypassing the gateway) — verify upstream rejects it"
    expected: "upstream MCP server returns 401 with D-05 violation error referencing gateway-audience token bypass"
    why_human: "End-to-end aud enforcement across the gateway/upstream boundary requires a live runtime with two services running"
---

# Phase 243: Real MCP Gateway Verification Report

**Phase Goal:** Add a real standalone MCP Gateway in front of the banking MCP server so the gateway becomes the MCP-facing protected resource, owns RFC 9728 discovery + HTTP ingress, calls PingOne Authorize for policy, exchanges tokens for the upstream MCP-server audience, keeps tokens out of the LLM path, and enforces next-hop `aud` at every hop.
**Verified:** 2026-04-27
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | D-01: A separate banking_mcp_gateway service exists and can be started independently | VERIFIED | `banking_mcp_gateway/package.json` ("name": "banking-mcp-gateway"), `src/index.ts` bootstraps via `GatewayServer`, `run-bank.sh` starts it on :3005 in its own shell |
| 2 | D-02: Gateway owns `/.well-known/oauth-protected-resource` with its own `resource` claim | VERIFIED | `GatewayServer.ts:149-173` — `handleMetadata()` builds response from `config.gatewayResourceUri`; code comment explicitly states "NOT a pass-through to the upstream MCP server metadata" |
| 3 | D-03: Gateway exchanges inbound token for upstream MCP-server audience via RFC 8693 | VERIFIED | `McpTokenExchangeClient.ts` uses `grant_type: urn:ietf:params:oauth:grant-type:token-exchange`; wired via `authorizeMcpRequest.ts:125`; test coverage in `gateway-auth.test.ts` sections 3 and 4 — 35/35 passing |
| 4 | D-04: No tokens exposed to the LLM — forwarded result never carries inbound bearer | VERIFIED | `authorizeMcpRequest.ts:140` calls `forward(exchangeResult.token, body)` — the original bearer is dropped; `mcpGatewayClient.js` returns `response.data?.result ?? response.data` only; `TOKEN_FLOW.md` line 247 documents "NO raw tokens leave the BFF"; LangChain `oauth_manager.py` sends resource indicator only, not the token itself in prompt context |
| 5 | D-05: Per-hop aud enforcement — upstream MCP-server aud tokens rejected at gateway; gateway-aud tokens rejected at upstream | VERIFIED | `GatewayTokenPolicy.ts:51-59` — rejects tokens whose aud includes `mcpOlbResourceUri` or `mcpInvestResourceUri`; `validateTokenAtGateway.js:95-99` — `enforceUpstreamContract` rejects gateway-aud tokens at upstream; `HttpMCPTransport.ts:129-133` enforces this in gateway mode |
| 6 | D-06: PingOne Authorize evaluates permit/deny before upstream forwarding; fails closed on unavailable | VERIFIED | `PingOneAuthorizeClient.ts:78-82` — catch block returns `{ decision: 'DENY', reason: 'Authorization service unavailable' }`; `authorizeMcpRequest.ts:102-120` — deny and INDETERMINATE both return 403, no forward; test at `gateway-auth.test.ts:310-325` explicitly covers fail-closed behavior |

**Score:** 6/6 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `banking_mcp_gateway/package.json` | Standalone gateway runtime, scripts, dependency boundary | VERIFIED | name="banking-mcp-gateway", version="1.0.0", own scripts |
| `banking_mcp_gateway/src/index.ts` | Gateway bootstrap and env-driven startup | VERIFIED | Calls `loadConfig()`, instantiates `GatewayServer` with `buildAuthorizeMcpRequest`, starts HTTP+WebSocket |
| `banking_mcp_gateway/src/server/GatewayServer.ts` | Express/HTTP gateway owning metadata and MCP ingress | VERIFIED | 476 lines; owns `/.well-known/oauth-protected-resource`, `POST /mcp`, upstream forwarding, auth challenge semantics |
| `banking_mcp_gateway/src/auth/GatewayTokenPolicy.ts` | Current-hop and next-hop audience validation rules | VERIFIED | Enforces sub, act chain, and anti-bypass upstream-aud check (D-05) |
| `banking_mcp_gateway/src/auth/PingOneAuthorizeClient.ts` | Gateway-side PingOne Authorize integration (D-06) | VERIFIED | Calls Authorize endpoint, maps PERMIT/DENY/INDETERMINATE, fails closed on exception |
| `banking_mcp_gateway/src/auth/McpTokenExchangeClient.ts` | RFC 8693 exchange client for upstream MCP-server audience | VERIFIED | Uses `grant_type: token-exchange`, targets correct backend audience via `routeTool()`, caches tokens |
| `banking_mcp_gateway/src/middleware/authorizeMcpRequest.ts` | Gateway pipeline: validate → authorize → exchange | VERIFIED | Composes GatewayTokenPolicy + PingOneAuthorizeClient + McpTokenExchangeClient in correct order |
| `banking_mcp_gateway/tests/gateway-auth.test.ts` | Wrong-audience, deny, and exchange-path verification | VERIFIED | 35/35 tests passing (confirmed by `npm test`) |
| `banking_api_server/services/mcpGatewayClient.js` | BFF helper for gateway-bound MCP calls | VERIFIED | `callToolViaGateway()` POSTs JSON-RPC to `/mcp`, handles 401/403/5xx with typed errors |
| `banking_mcp_server/src/server/HttpMCPTransport.ts` | Gateway-aware upstream contract/discovery behavior | VERIFIED | Contains `gatewayAudience` enforcement via `enforceUpstreamContract`, `MCP_GATEWAY_MODE` env var |
| `banking_mcp_server/src/middleware/validateTokenAtGateway.js` | Upstream enforcement for gateway-issued next-hop tokens | VERIFIED | `enforceUpstreamContract()` rejects gateway-aud tokens, requires correct upstream aud |
| `banking_mcp_server/tests/gateway-upstream.test.ts` | Upstream acceptance and wrong-audience rejection tests | VERIFIED | File exists at expected path |
| `run-bank.sh` | Local startup wiring for the new gateway service | VERIFIED | Lines 527-541: starts `banking_mcp_gateway` on :3005 as part of standard demo startup |
| `docs/TOKEN_FLOW.md` | Gateway-first token-chain documentation with no-token-to-LLM guarantee | VERIFIED | Lines 199-261 document gateway-first chain, D-01 through D-06 decision matrix, explicit "NO raw tokens leave the BFF" |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `authorizeMcpRequest.ts` | `PingOneAuthorizeClient.ts` | permit/deny evaluation before forwarding | WIRED | `authorizeClient.evaluate()` called at line 104 before any forward call |
| `authorizeMcpRequest.ts` | `McpTokenExchangeClient.ts` | exchange on permit | WIRED | `exchangeClient.exchange()` called at line 125, only reachable after PERMIT |
| `banking_api_server/server.js` | `mcpGatewayClient.js` | POST /api/mcp/tool downstream call | WIRED | `require('./services/mcpGatewayClient')` at line 1005; `callToolViaGateway` used at line 1465 when `MCP_GATEWAY_HTTP_URL` is set |
| `GatewayServer.ts` | upstream MCP server | env-configured upstream base URL | WIRED | `this.upstreamMcpUrl` from `UPSTREAM_MCP_URL` env var; `forwardToUpstream()` posts to `${upstreamMcpUrl}/mcp` |
| `run-bank.sh` | `banking_mcp_gateway` service | local orchestration | WIRED | Gateway started on :3005 in its own shell at lines 527-541 |
| gateway exchanged token | `validateTokenAtGateway.js enforceUpstreamContract` | expectedAudience validation | WIRED | `enforceUpstreamContract` referenced in `HttpMCPTransport.ts` at gateway mode enforcement points |

### Data-Flow Trace (Level 4)

Not applicable — this phase produces a security middleware layer, not a component rendering dynamic data. All data flow is through HTTP transport and is verified via test assertions.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| 35 gateway auth tests pass | `cd banking_mcp_gateway && npm test -- --forceExit` | 35 passed, 2 suites, 1.141s | PASS |
| gateway package is a standalone module | `grep '"name"' banking_mcp_gateway/package.json` | "banking-mcp-gateway" | PASS |
| BFF requires mcpGatewayClient | `grep -n "mcpGatewayClient" banking_api_server/server.js` | Found at lines 1005, 1452, 1465 | PASS |
| Fail-closed code present | `grep "Authorization service unavailable" banking_mcp_gateway/src/auth/PingOneAuthorizeClient.ts` | Line 81 found | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| D-01 | 243-01, 243-04 | Real standalone gateway exists | SATISFIED | `banking_mcp_gateway/` service with own package.json, build, and startup |
| D-02 | 243-01 | Gateway owns RFC 9728 metadata with its own resource claim | SATISFIED | `GatewayServer.ts:handleMetadata()` — gateway-owned, not pass-through |
| D-03 | 243-02, 243-03 | RFC 8693 token exchange to upstream audience | SATISFIED | `McpTokenExchangeClient.ts` + `authorizeMcpRequest.ts` + `mcpGatewayClient.js` |
| D-04 | 243-03 | No tokens exposed to LLM path | SATISFIED | Result-only return in `mcpGatewayClient.js`; `TOKEN_FLOW.md` documents guarantee; `oauth_manager.py` sends resource indicator only |
| D-05 | 243-02, 243-04 | Per-hop aud enforcement at both gateway and upstream | SATISFIED | `GatewayTokenPolicy.ts` anti-bypass check + `validateTokenAtGateway.js enforceUpstreamContract` |
| D-06 | 243-02 | PingOne Authorize evaluates permit/deny; fails closed | SATISFIED | `PingOneAuthorizeClient.ts` with explicit fail-closed catch; `authorizeMcpRequest.ts` blocks all non-PERMIT outcomes |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `banking_mcp_gateway/src/index.ts` | 46-78 | Duplicate `/.well-known/oauth-protected-resource` handler exists in both `handleHttp()` and `GatewayServer.ts:handleMetadata()` | Warning | Not a blocker — `index.ts` now delegates to `GatewayServer` for HTTP MCP, but the legacy handler in `handleHttp()` is still in scope for the WebSocket-path server. Two handlers for the same route could cause confusion; the `GatewayServer` instance is the authoritative one per Plan 243-01 comments. |
| `banking_api_server/server.js` | 1452-1465 | Gateway routing is conditional on `MCP_GATEWAY_HTTP_URL` being set — if env var is unset, the old direct-MCP path is used | Info | Intentional backward-compat design per SUMMARY-03. Not a D-requirement violation since the gateway is the secured path when configured. |

### Human Verification Required

#### 1. Live PingOne Authorize Round-Trip

**Test:** Configure a real PingOne Authorize environment (`PINGONE_AUTHORIZE_ENDPOINT`, `PINGONE_AUTHORIZE_WORKER_ID`) and start the gateway. Send a POST /mcp with a valid gateway-aud token to call a tool that should be denied by policy.
**Expected:** Gateway calls PingOne Authorize, receives DENY, returns HTTP 403 `{ "error": "forbidden", "decision": "DENY" }` with no upstream call made.
**Why human:** Requires live PingOne tenant with a configured policy and real OAuth tokens. The mocked unit tests (gateway-auth.test.ts) prove the code paths exist and respond correctly to mocked outcomes, but the actual PingOne API contract cannot be exercised without a live environment.

#### 2. End-to-End Per-Hop Audience Enforcement

**Test:** With `MCP_GATEWAY_MODE=true` and `MCP_UPSTREAM_RESOURCE_URI` set on the upstream MCP server, attempt to call it directly with a gateway-aud token (bypassing the gateway).
**Expected:** Upstream MCP server returns 401 with a D-05 violation error ("gateway-audience token cannot be used at upstream").
**Why human:** Requires both services running simultaneously with env vars aligned. The code in `HttpMCPTransport.ts` and `validateTokenAtGateway.js` is present and verified statically, but the runtime enforcement across two processes requires live testing.

### Gaps Summary

No gaps found. All 6 D-requirement must-haves are verified at the code/artifact level:

- The standalone gateway service is real, buildable, and wired into local dev startup
- RFC 9728 metadata is gateway-owned with the correct `resource` claim
- RFC 8693 token exchange is implemented and tested (35/35 passing)
- Token isolation from the LLM path is enforced structurally in the BFF response path
- Per-hop audience enforcement is implemented at both the gateway (`GatewayTokenPolicy`) and upstream (`enforceUpstreamContract`) boundaries
- PingOne Authorize integration fails closed on unavailability and blocks non-PERMIT outcomes

The two human verification items are runtime/integration tests that require a live PingOne environment — they do not indicate missing implementation.

---

_Verified: 2026-04-27_
_Verifier: Claude (gsd-verifier)_
