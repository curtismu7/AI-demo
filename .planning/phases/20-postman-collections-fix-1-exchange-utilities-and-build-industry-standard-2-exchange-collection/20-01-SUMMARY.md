---
plan: 20-01
phase: 20-postman-collections-fix-1-exchange-utilities-and-build-industry-standard-2-exchange-collection
status: complete
completed: "2026-04-02"
commit: 1c4f75f
subsystem: docs/postman
tags: [postman, collections, variables, environment]
dependency_graph:
  requires: []
  provides: [BX-Finance-1-Exchange-Step-by-Step, pi.flow-collections-UPPERCASE-vars, BX-Finance-Shared-env]
  affects: [docs/]
tech_stack:
  added: []
  patterns: [Postman Collection v2.1, UPPERCASE var naming convention]
key_files:
  created:
    - docs/BX-Finance-1-Exchange-Step-by-Step.postman_collection.json
    - docs/BX-Finance-Shared.postman_environment.json
  modified:
    - docs/BX Finance — 1-Exchange Delegated Chain — pi.flow.postman_collection.json
    - docs/BX Finance — 2-Exchange Delegated Chain — pi.flow.postman_collection.json
  deleted:
    - docs/BX Finance — 1-Exchange Delegated Chain (sub-steps).postman_collection.json
    - docs/BX-Finance-MayAct-Chain.postman_collection.json
    - docs/BX-Finance-MayAct-Chain.postman_environment.json
    - docs/BX Finance — 2-Exchange Delegated Chain.postman_environment.json
decisions:
  - Renamed MayAct-Chain → 1-Exchange-Step-by-Step per D-01
  - Applied D-05 var rename to all pi.flow collections; banking_app_client_id → PINGONE_CORE_CLIENT_ID (per D-06 — same BFF actor role as ai_agent_client_id)
  - BX-Finance-Shared env uses type:secret for PINGONE_CORE_USER_CLIENT_SECRET, PINGONE_CORE_CLIENT_SECRET, MCP_CLIENT_SECRET, TEST_PASSWORD
metrics:
  duration: "~25 minutes"
  tasks: 5
  files: 8
---

# Phase 20 Plan 01: Postman Restructure — Rename, Upgrade Vars, Shared Env, Delete Deprecated

Renamed MayAct-Chain collection, upgraded both pi.flow collections to UPPERCASE var naming (D-05), created unified BX-Finance-Shared environment, deleted 4 deprecated files.

## Tasks Completed

| Task | Result |
|------|--------|
| 1: Rename MayAct-Chain → 1-Exchange-Step-by-Step | ✅ Created `BX-Finance-1-Exchange-Step-by-Step.postman_collection.json` with info.name = "BX Finance — 1-Exchange Step-by-Step (RFC 8693)" |
| 2: Upgrade 1-exchange pi.flow vars | ✅ All D-05 renames applied; banking_app_client_id → PINGONE_CORE_CLIENT_ID; resource → ENDUSER_AUDIENCE; no old {{refs}} remain |
| 3: Upgrade 2-exchange pi.flow vars | ✅ All D-05 renames applied; ai_agent_client_id → PINGONE_CORE_CLIENT_ID; MCP_RESOURCE_URI collection var added |
| 4: Create BX-Finance-Shared.postman_environment.json | ✅ 16 vars: PINGONE_ENVIRONMENT_ID, PINGONE_BASE_URL, PINGONE_REGION, user/core/mcp client creds (secret-typed), TEST_USERNAME/PASSWORD, ENDUSER_AUDIENCE, MCP_RESOURCE_URI, PINGONE_API_AUDIENCE, PAZ_DECISION_ENDPOINT_ID |
| 5: git rm deprecated files | ✅ 4 deprecated files removed via git rm |

## Deviations from Plan

**1. [Rule 1 - Deviation] `banking_app_client_id` not in D-05 table**
- **Found during:** Task 2
- **Issue:** The 1-exchange pi.flow collection uses `banking_app_client_id` / `banking_app_client_secret` (not `ai_agent_client_id`) for the BFF actor client in the token exchange. D-05 table doesn't cover this name explicitly.
- **Fix:** Applied D-06 logic: `banking_app_client_id` serves the same role as `ai_agent_client_id` (BFF/actor client) → renamed to `PINGONE_CORE_CLIENT_ID` / `PINGONE_CORE_CLIENT_SECRET`.
- **Files modified:** `docs/BX Finance — 1-Exchange Delegated Chain — pi.flow.postman_collection.json`
- **Commit:** 1c4f75f

## Self-Check: PASSED

- `docs/BX-Finance-1-Exchange-Step-by-Step.postman_collection.json` exists ✅
- `docs/BX-Finance-Shared.postman_environment.json` exists ✅
- Both pi.flow collections: no old {{refs}} remain ✅
- 4 deprecated files removed ✅
- All JSON parses without error ✅
