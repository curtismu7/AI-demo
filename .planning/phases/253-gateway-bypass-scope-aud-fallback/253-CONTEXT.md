# Phase 253 Context — Gateway Bypass Fallback

## Problem Statement

When `MCP_GW_DEV_BYPASS=true` the gateway forwards the inbound bearer token
unchanged to the MCP server. The BFF two-exchange delegation currently issues
a final token with `aud=https://mcp-gateway.pingdemo.com`. The MCP server
validates `aud` against `MCP_SERVER_RESOURCE_URI=https://mcp-server.pingdemo.com`
→ mismatch → 401 `gateway_auth_failed`.

Separately, when `MCP_GATEWAY_HTTP_URL` is not set the BFF falls back to
direct WebSocket to the MCP server, but the token still carries the wrong
audience.

Users see opaque 401/403 errors. The happy path must work regardless of whether
the gateway is running, in bypass mode, or in production mode.

## Decisions

### D-01 — Dynamic final-exchange audience based on gateway mode
The BFF (`agentMcpTokenService.js`) must detect the active mode at call time:
- **Gateway mode (useGateway=true, bypass=false):** final `aud = PINGONE_RESOURCE_MCP_GATEWAY_URI` (`mcp-gateway.pingdemo.com`)
- **Bypass mode (useGateway=true, bypass=true) or direct mode (useGateway=false):** final `aud = PINGONE_RESOURCE_MCP_SERVER_URI` (`mcp-server.pingdemo.com`)

Detection: call `GET http://localhost:3005/health` and check response body for `devBypass` field, OR read `MCP_GW_DEV_BYPASS` from the gateway's env via a new BFF health endpoint. Simplest: the gateway exposes its bypass status at `GET /health` → BFF reads it.

### D-02 — Gateway health endpoint exposes bypass mode
`banking_mcp_gateway/src/server/GatewayServer.ts` `GET /health` response adds:
```json
{ "status": "ok", "devBypass": true/false, "gatewayResourceUri": "..." }
```

### D-03 — BFF resolves final audience at exchange time (not startup)
`agentMcpTokenService.js` `_performTwoExchangeDelegation()` resolves the final
audience by:
1. If `useGateway=false` → use `PINGONE_RESOURCE_MCP_SERVER_URI`
2. If `useGateway=true` → call gateway `/health`, check `devBypass`
   - bypass=true → use `PINGONE_RESOURCE_MCP_SERVER_URI`
   - bypass=false → use `PINGONE_RESOURCE_MCP_GATEWAY_URI` (current behaviour)

Cache the bypass check for 30 seconds (avoid per-request HTTP).

### D-04 — MCP server resource URI stays mcp-server.pingdemo.com
`MCP_SERVER_RESOURCE_URI=https://mcp-server.pingdemo.com` is the stable value.
Never change it to match the gateway audience.

### D-05 — PINGONE_RESOURCE_TWO_EXCHANGE_URI in .env stays mcp-gateway.pingdemo.com
This is the default for production (gateway running, bypass off). The dynamic
resolution in D-03 overrides it at runtime when bypass/direct mode is detected.

## Deferred Ideas

- Auto-restarting downed servers (addressed in Phase 251)
- Admin UI health panel (addressed in Phase 251)
- Per-server log files (Phase 252)

## Claude's Discretion

- Timeout for gateway health probe: 500ms (fast enough to not slow down first call)
- Cache TTL: 30 seconds
- If gateway health probe fails (gateway down): fall back to mcp-server audience
