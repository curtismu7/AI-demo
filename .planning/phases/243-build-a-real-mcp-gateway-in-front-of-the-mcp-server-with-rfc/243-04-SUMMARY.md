# 243-04 SUMMARY — Upstream Hardening, Gateway Startup, Token Flow Docs

**Phase:** 243-build-a-real-mcp-gateway  
**Plan:** 04  
**Commit:** ebf603b1  
**Status:** COMPLETE

---

## What Was Built

### Task 1: Upstream MCP Server Hardening (D-05)

**`banking_mcp_server/src/server/HttpMCPTransport.ts`**

Three new exported/private members:

| Method | Type | Purpose |
|--------|------|---------|
| `static enforceUpstreamContract(claims, options)` | exported static | D-05 enforcement: reject gateway-aud tokens, validate upstream aud |
| `static buildGatewayModeMetadataHints(upstreamUrl, gatewayUri)` | exported static | RFC 9728 gateway-mode metadata fields |
| `private decodeTokenPayload(token)` | private | base64url JWT payload decode (after signature already verified) |

**`handlePost` changes (when `MCP_GATEWAY_MODE=true`):**
- After `authManager.validateAgentToken()`, calls `enforceUpstreamContract()` with `MCP_UPSTREAM_RESOURCE_URI` and `MCP_GW_RESOURCE_URI`
- Returns 401 if gateway-aud token attempts direct upstream access (D-05 anti-bypass)

**`handleMetadata` changes (when `MCP_GATEWAY_MODE=true`):**
- Merges `buildGatewayModeMetadataHints()` into RFC 9728 response
- Adds `x_gateway_protected_by` + `x_direct_access` so API clients see this is a protected upstream

**`banking_mcp_server/src/middleware/validateTokenAtGateway.js`**

Added `enforceUpstreamContract` export (same logic, for the WebSocket/Express path).

**`banking_mcp_server/tests/gateway-upstream.test.ts`** (new)

7 tests — all passing:
- Test 1: gateway-aud token rejected at upstream (D-05)
- Test 2: upstream-aud token accepted (correct next-hop contract)
- Test 3: metadata hints present in gateway mode
- Plus edge cases: unconfigured mode, array aud with only gateway, array aud with both, missing aud

Test delta vs baseline: +7 passing (616 vs 609 pre-existing)

### Task 2: Local Startup Wiring

**`run-bank.sh`** — 7 patches applied:

1. `PID_GW=/tmp/bank-mcp-gateway.pid` + `LOG_GW=/tmp/bank-mcp-gateway.log` added
2. Status table: `MCP Gateway :3005 http://localhost:3005` row added
3. Stop loop: `PID_GW` added to `for pid_file in ...` iteration
4. Port sweep log: includes `:3005`
5. Startup block: builds + starts `banking_mcp_gateway` on `:3005` if directory exists (after MCP Server, before LangChain)
6. Help log files: `${LOG_GW}` listed
7. Help port layout: `MCP Gateway :3005` listed

### Task 3: Token Flow Documentation

**`docs/TOKEN_FLOW.md`** — New "Gateway-First Token Flow (Phase 243)" section:
- Full chain diagram: BFF → gateway → upstream → tool → result (no tokens to LLM)
- Gateway pipeline steps: CORS/Accept validation → aud/exp validation → PingOne Authorize → RFC 8693 exchange → upstream forward
- Security property table: D-01 through D-06 with enforcement location
- Three env var tables: gateway service, BFF cutover, upstream hardening

---

## Verification

- `npm run build` (banking_mcp_server) → clean (0 errors)
- `npm test -- --testPathPattern=gateway-upstream` → 7/7 PASS
- Full suite: 616 passing (baseline 609), 63 pre-existing failures (unchanged)
- `bash -n run-bank.sh` → syntax OK

---

## Env Vars Needed for Full Gateway Mode

```
# On banking-mcp-gateway:
MCP_GW_RESOURCE_URI=<gateway-audience>
UPSTREAM_MCP_URL=http://localhost:8080
PINGAUTHORIZE_ENDPOINT=<PingOne Authorize URL>
PINGAUTHORIZE_WORKER_ID=<policy worker ID>

# On banking_api_server (BFF):
MCP_GATEWAY_HTTP_URL=http://localhost:3005

# On banking_mcp_server (upstream):
MCP_GATEWAY_MODE=true
MCP_UPSTREAM_RESOURCE_URI=<upstream MCP aud>
MCP_GW_RESOURCE_URI=<gateway-audience>
```
