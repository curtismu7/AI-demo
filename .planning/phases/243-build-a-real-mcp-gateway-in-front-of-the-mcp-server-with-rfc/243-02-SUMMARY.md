# 243-02-SUMMARY — Gateway Security Pipeline (PingOne Authorize + RFC 8693 Exchange)

## What Was Built

Implemented the MCP Gateway's three-stage security pipeline satisfying D-03, D-05, and D-06.
The gateway now stands as the authoritative enforcement point for per-hop audience validation,
PingOne Authorize policy decisions, and RFC 8693 token exchange before any upstream MCP call.

## Files Changed

| File | Action | Notes |
|---|---|---|
| `banking_mcp_gateway/src/auth/GatewayTokenPolicy.ts` | Created | Claim invariants: sub, act.sub, upstream-aud anti-bypass (D-05) |
| `banking_mcp_gateway/src/auth/PingOneAuthorizeClient.ts` | Created | PERMIT/DENY/INDETERMINATE evaluation; fail-closed on unavailable (D-06) |
| `banking_mcp_gateway/src/auth/McpTokenExchangeClient.ts` | Created | RFC 8693 exchange to OLB or invest audience by tool name (D-03) |
| `banking_mcp_gateway/src/middleware/authorizeMcpRequest.ts` | Created | Composes all three into `McpRequestMiddleware` for GatewayServer injection |
| `banking_mcp_gateway/tests/gateway-auth.test.ts` | Created | 23 tests covering all pipeline stages (no network required — axios mocked) |
| `banking_mcp_gateway/tests/gateway-server.test.ts` | Fixed | Added missing `devBypass: false` to stub after GatewayConfig schema update |

## Security Pipeline (per request)

```
1. GatewayTokenPolicy.validate(decoded, config)
   → rejects if sub empty, act.sub empty, or aud contains upstream MCP audience

2. PingOneAuthorizeClient.evaluate(decoded, method, toolName)
   → PERMIT  → continue
   → DENY    → 403 Forbidden (policy rejected)
   → INDETERMINATE → 403 (HITL required; future: route to HITL service)
   → unreachable → 403 Forbidden (fail closed — D-06)

3. McpTokenExchangeClient.exchange(bearerToken, toolName)
   → obtains next-hop token targeted at OLB or invest MCP-server audience
   → exchanged token aud ≠ gateway aud (D-05 next-hop invariant)
   → failure → 502 Bad Gateway

4. forward(exchangedToken, body)
   → original bearer token stays at gateway boundary (D-04: no token to LLM)
```

## Key Design Decisions

**GatewayTokenPolicy is claim-only** — aud/exp validation is handled by `validateInboundToken()`
in GatewayServer. Policy only enforces identity invariants and the upstream-aud anti-bypass.

**Fail-closed Authorize** — when PingOne Authorize is unreachable, the catch block sets
`{ decision: 'DENY' }`. There is no fallback permit path.

**Tool-based audience routing** — `McpTokenExchangeClient` maps tool names to OLB or invest
audience using a string-prefix check. Unrecognised tools default to OLB audience.

**Dev bypass short-circuit** — when `config.devBypass` is true, the middleware skips all
validation and forwards the original token. This path is guarded by the gateway config
(`MCP_GW_DEV_BYPASS` env var) and tested separately.

**McpRequestMiddleware injection** — the middleware is wired into `GatewayServer` via the
`requestMiddleware` constructor option introduced in plan 243-01. Plan 243-02 does not modify
GatewayServer; it only provides the concrete implementation of the middleware hook.

## Verification Results

```
cd banking_mcp_gateway && npm test -- --runInBand
Test Suites: 2 passed, 2 total
Tests:       35 passed, 35 total  (23 new in gateway-auth.test.ts + 12 from plan 01)
Time:        1.485s
```

**Tests cover:**
- GatewayTokenPolicy: valid token, missing sub, malformed act.sub, no act, nested act chain, OLB bypass, invest bypass
- PingOneAuthorizeClient: PERMIT, DENY, INDETERMINATE, unreachable (fail-closed), no-authz config
- McpTokenExchangeClient: OLB exchange, invest exchange, tools/list default, D-05 next-hop aud, no access_token error
- buildAuthorizeMcpRequest pipeline: permit+exchange→forward, deny→403, unavailable→403, exchange failure→502, no-authz→exchange still happens

## Commits

- `91a87f24` feat(243-02): gateway auth pipeline — PingOne Authorize + RFC 8693 exchange
- `8cab3c7d` fix(243-02): add devBypass field to GatewayConfig test stubs — 35/35 pass

## Requirements Satisfied

| ID | Description | Status |
|----|-------------|--------|
| D-03 | Gateway exchanges tokens for upstream MCP-server audience (RFC 8693) | ✅ |
| D-05 | Per-hop aud enforcement — gateway-aud tokens only at gateway boundary | ✅ |
| D-06 | PingOne Authorize evaluates permit/deny before any upstream forwarding | ✅ |
