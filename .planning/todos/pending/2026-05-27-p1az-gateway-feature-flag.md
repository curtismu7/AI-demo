---
title: Add ff_p1az_gateway / MCP_GW_P1AZ_ENABLED flag to demo_mcp_gateway
date: 2026-05-27
priority: medium
---

## What

Add a runtime feature flag `ff_p1az_gateway` (env var `MCP_GW_P1AZ_ENABLED=true/false`)
to `demo_mcp_gateway` that gates whether real P1AZ is called or local scope evaluation
runs — independently of whether `PINGAUTHORIZE_ENDPOINT` / `PINGAUTHORIZE_WORKER_ID`
are set.

## Why

Currently the gateway uses env var *presence* as the only gate. This means:
- You can't configure P1AZ credentials in `.env` without activating it immediately
- There's no runtime toggle (no admin panel flip, no mid-demo switch)
- The UI education panel has no authoritative signal to show P1AZ as active/inactive

## Files to change

| File | Change |
|---|---|
| `demo_mcp_gateway/src/config.ts` | Add `p1azEnabled: boolean` field; read from `MCP_GW_P1AZ_ENABLED` env var |
| `demo_mcp_gateway/src/auth/PingOneAuthorizeClient.ts` | Gate on `config.p1azEnabled` AND endpoint presence |
| `demo_mcp_gateway/src/pingAuthorizeGuard.ts` | Same gate update |
| `demo_mcp_gateway/src/server/` or admin config route | Expose `p1azEnabled` in `/admin/config` response |
| `demo_mcp_gateway/.env.example` | Document `MCP_GW_P1AZ_ENABLED=false` |

## Behaviour after change

- `MCP_GW_P1AZ_ENABLED=false` (or unset) → local scope evaluation always, regardless of endpoint vars
- `MCP_GW_P1AZ_ENABLED=true` + endpoint vars set → calls real P1AZ Sideband API
- `MCP_GW_P1AZ_ENABLED=true` + endpoint vars absent → logs warning, falls back to local scope (no crash)
- Gateway logs `[P1AZ] mode=live` or `[P1AZ] mode=local-scope` per request for traceability

## When PingGateway is wired

No change to this flag needed. PingGateway's `PingAuthorizeFilter` uses its own
`gatewayServiceUri` config pointing at the same P1AZ instance. The two paths
(demo_mcp_gateway FF path + PingGateway native filter) operate independently.

See related notes: [[p1az-gateway-wiring-already-functional]], [[pinggateway-p1az-reuse-same-policy]]
