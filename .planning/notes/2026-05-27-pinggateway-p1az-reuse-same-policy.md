---
title: PingGateway P1AZ reuse — same policy endpoint, no new policy needed
date: 2026-05-27
context: PingGateway product deployment plan (future); P1AZ wiring exploration
---

## Key fact

When the PingGateway product is deployed in front of `demo_mcp_gateway`, its
`PingAuthorizeFilter` should point at the **same P1AZ Sideband API instance and
worker ID** that `demo_mcp_gateway` already uses. No new policy authoring is needed.

## How PingGateway calls P1AZ

From the PingGateway 2026+ `PingAuthorizeFilter` config:

```json
{
  "name": "AuthorizePolicyDecision",
  "type": "PingAuthorizeFilter",
  "config": {
    "gatewayServiceUri": "&{P1AZ_GATEWAY_SERVICE_URI}",
    "secretsProvider": "SecretsStore",
    "gatewayCredentialSecretId": "p1az.gateway.credential"
  }
}
```

`gatewayServiceUri` = the same base URL as `PINGAUTHORIZE_ENDPOINT` in `demo_mcp_gateway`.

## What the PingGateway plan will need

When the PingGateway plan is written:
1. Set `P1AZ_GATEWAY_SERVICE_URI` env var to the same P1AZ endpoint value
2. Provision a sideband credential in the P1AZ console for the PingGateway gateway instance
   (separate credential from the one used by demo_mcp_gateway — same policy, different credential)
3. `PingAuthorizeFilter` placement: after `McpValidationFilter`, before `OAuth2TokenExchangeFilter`
   (or the passthrough handler if using passthrough mode)

## Important: PingAuthorizeFilter requires PingGateway 2026+

This filter does not exist in 2025.11. Confirmed the target version is 2026+ per exploration.

## Topology reminder

```
Browser → BFF (:3001) → [FF: ping_gateway_enabled]
  → PingGateway (PingAuthorizeFilter → passthrough to demo_mcp_gateway)
  → demo_mcp_gateway (:3005, P1AZ FF can be off when PingGateway is enforcing)
  → demo_mcp_server (:8080)
```

When `MCP_GW_P1AZ_ENABLED=false` on demo_mcp_gateway and PingGateway is active,
PingGateway's `PingAuthorizeFilter` is the sole P1AZ enforcement point. This avoids
double-calling the policy per request.

See related note: [[p1az-gateway-wiring-already-functional]]
See related todo: [[p1az-gateway-feature-flag-todo]]
