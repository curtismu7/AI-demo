---
phase: 111-scope-audit-compliance-app-ids
plan: "01"
subsystem: banking_api_server
tags: [config, oauth, pingone, mcp, token-exchange]
dependency_graph:
  requires: []
  provides: [worker-client-id-config, mcp-exchanger-client-id-config]
  affects: [agentMcpTokenService, pingOneAuthorizeService, validateTwoExchangeConfig]
tech_stack:/gsd-discuss-phase 116
  added: []
  patterns: [configStore-getEffective, pingoneBackendDefaults-fallback]
key_files:
  created: []
  modified:
    - banking_api_server/config/pingoneBackendDefaults.js
    - banking_api_server/services/configStore.js
decisions:
  - "Use pingone_worker_client_id (long-form) as key to match getEffective() lookup chain"
  - "Fix validateTwoExchangeConfig to use configStore.getEffective() before raw env var"
metrics:
  duration: "~15 minutes"
  completed: "2025-07-07"
  tasks_completed: 3/gsd-plan-phase 116
  files_modified: 2
---

# Phase 111 Plan 01: Scope Audit Compliance — App IDs Summary

**One-liner:** Wired Worker Token (95dc946f) and MCP Token Exchanger (6380065f) client IDs into configStore priority chain via pingoneBackendDefaults.js fallbacks and FIELD_DEFS entries.

## What Was Built

Phase 111 Plan 01 closed the configuration drift between the PingOne console (where both apps existed) and code config (where neither client ID was baked in). Local dev can now work without setting `PINGONE_AUTHORIZE_WORKER_CLIENT_ID` or `AGENT_OAUTH_CLIENT_ID` env vars manually.

## Changes Made

### `banking_api_server/config/pingoneBackendDefaults.js`
- Added `pingone_worker_client_id: '95dc946f-5e0a-4a8b-a8ba-b587b244e005'` — last-resort fallback for Worker Token app
- Added `pingone_mcp_token_exchanger_client_id: '6380065f-f328-41c2-81ed-1daeec811285'` — last-resort fallback for MCP Token Exchanger app
- Keys match the `configStore.getEffective()` call convention (lowercase long-form)

### `banking_api_server/services/configStore.js`
- FIELD_DEFS: added `PINGONE_MCP_TOKEN_EXCHANGER_CLIENT_ID: { public: true, default: '' }`
- FIELD_DEFS: added `pingone_worker_client_id: { public: true, default: '' }` (lowercase alias)
- envFallbackMap: added `pingone_worker_client_id: ['PINGONE_AUTHORIZE_WORKER_CLIENT_ID']`
- `validateTwoExchangeConfig()`: changed `mcpClientId` from `process.env.AGENT_OAUTH_CLIENT_ID` to `configStore.getEffective('pingone_mcp_token_exchanger_client_id') || process.env.AGENT_OAUTH_CLIENT_ID`

## Priority Chain (after this plan)

For `pingone_worker_client_id`:
1. KV/SQLite runtime config (Config UI)
2. `PINGONE_AUTHORIZE_WORKER_CLIENT_ID` env var
3. `pingoneBackendDefaults.js` → `'95dc946f-...'` ← NEW

For `pingone_mcp_token_exchanger_client_id`:
1. KV/SQLite runtime config (Config UI)
2. `PINGONE_MCP_TOKEN_EXCHANGER_CLIENT_ID` or `AGENT_OAUTH_CLIENT_ID` env var
3. `pingoneBackendDefaults.js` → `'6380065f-...'` ← NEW

## Commits

| Hash | Description |
|------|-------------|
| `17bf553` | feat(111-01): wire Worker and MCP Token Exchanger client IDs into config |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Short-form keys already existed in file, would not be found by getEffective()**
- **Found during:** Task 1 verification
- **Issue:** `pingoneBackendDefaults.js` already had `worker_client_id` and `mcp_client_id` (short-form keys from a previous session). These would never be found by `configStore.getEffective('pingone_worker_client_id')` since the lookup uses the full key name.
- **Fix:** Replaced short-form keys with `pingone_worker_client_id` and `pingone_mcp_token_exchanger_client_id` to match the lookup chain.
- **Files modified:** `banking_api_server/config/pingoneBackendDefaults.js`
- **Commit:** `17bf553`

**2. [Rule 1 - Bug] validateTwoExchangeConfig read mcpClientId from process.env only**
- **Found during:** Task 3 investigation
- **Issue:** The plan cited `agentMcpTokenService.js` line 912, but the actual code uses `configResult.credentials.mcpClientId` which is populated by `validateTwoExchangeConfig()` in `configStore.js`. That function read `process.env.AGENT_OAUTH_CLIENT_ID` directly, bypassing the configStore priority chain.
- **Fix:** Updated `validateTwoExchangeConfig()` in `configStore.js` to use `configStore.getEffective('pingone_mcp_token_exchanger_client_id') || process.env.AGENT_OAUTH_CLIENT_ID`.
- **Files modified:** `banking_api_server/services/configStore.js`
- **Commit:** `17bf553`

## Verification

- `grep pingone_worker_client_id banking_api_server/config/pingoneBackendDefaults.js` → ✅ found
- `grep PINGONE_MCP_TOKEN_EXCHANGER_CLIENT_ID banking_api_server/services/configStore.js` → ✅ found in FIELD_DEFS
- `grep pingone_worker_client_id banking_api_server/services/configStore.js` → ✅ found in FIELD_DEFS + envFallbackMap
- `grep getEffective.*pingone_mcp_token_exchanger banking_api_server/services/configStore.js` → ✅ found in validateTwoExchangeConfig
- `npm run build` → ✅ exit 0

## Self-Check: PASSED

- `17bf553` commit exists: ✅
- `pingoneBackendDefaults.js` has `pingone_worker_client_id`: ✅
- `configStore.js` has `pingone_worker_client_id.*public.*true`: ✅ (line 112)
- `validateTwoExchangeConfig` uses `configStore.getEffective`: ✅ (line 614)
