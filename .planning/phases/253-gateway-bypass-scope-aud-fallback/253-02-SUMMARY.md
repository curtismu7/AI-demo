# Phase 253 Plan 02 — SUMMARY

## What Was Built

Added `_resolveFinalMcpAudience()` helper to `banking_api_server/services/agentMcpTokenService.js` and wired it into `_performTwoExchangeDelegation()` to dynamically select the correct Exchange #2 audience based on gateway bypass mode.

## Changes

| File | Change |
|------|--------|
| `banking_api_server/services/agentMcpTokenService.js` | Module-level `_bypassCache` + `_resolveFinalMcpAudience()` helper; `twoExFinalAud` now resolved via `await _resolveFinalMcpAudience(...)` |

## Behavior

| Condition | Final Audience (Exchange #2) |
|-----------|------------------------------|
| `MCP_GATEWAY_HTTP_URL` not set (direct mode) | `mcp-server.pingdemo.com` |
| Gateway `/health` returns `devBypass: true` | `mcp-server.pingdemo.com` |
| Gateway `/health` returns `devBypass: false` | `mcp-gateway.pingdemo.com` (unchanged) |
| Gateway unreachable (probe fails/times out) | `mcp-server.pingdemo.com` (safe fallback) |

Cache TTL: 30 seconds. Probe timeout: 500ms.

## Verification

- `node -e "require('./banking_api_server/services/agentMcpTokenService.js'); console.log('require OK')"` → `require OK` ✓

## Commit

`feat(253-02): dynamic final-audience via _resolveFinalMcpAudience (gateway bypass probe)`
