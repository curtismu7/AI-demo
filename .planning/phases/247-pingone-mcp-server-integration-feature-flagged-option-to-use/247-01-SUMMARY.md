# Phase 247 — Plan 01 Summary

**Plan:** 247-01 — Feature flag + mcpMode in BFF config route  
**Status:** Complete  
**Commit:** feat(247-01): add mcp_use_pingone_server flag + mcpMode to gateway config route

## What Was Built

### Task 1: FLAG_REGISTRY entry
Added `mcp_use_pingone_server` to `FLAG_REGISTRY` in `banking_api_server/routes/featureFlags.js`:
- Category: `MCP Server`
- Position: immediately after `mcp_use_legacy_protocol`
- `defaultValue: false` — existing behaviour unchanged by default
- `warnIfEnabled: true` — warns admin before enabling

### Task 2: mcpMode in config route
Added `mcpMode` as the first field in the `res.json({...})` call in `GET /api/admin/mcp-gateway/config`:
- `'pingone'` when `configStore.get('mcp_use_pingone_server') === 'true'`
- `'custom'` otherwise (default)

## Files Modified
- `banking_api_server/routes/featureFlags.js` — 1 new flag entry (~20 lines)
- `banking_api_server/routes/mcpGatewayConfig.js` — 1 new line in res.json()

## Verification
- `node -e "require('./banking_api_server/routes/featureFlags.js')"` — exits 0
- FLAG_REGISTRY entry: category=MCP Server, defaultValue=false, warnIfEnabled=true, prev=mcp_use_legacy_protocol ✅
- `node -e "require('./banking_api_server/routes/mcpGatewayConfig.js')"` — typeof function ✅
- mcpMode appears at line 208 with correct ternary ✅
