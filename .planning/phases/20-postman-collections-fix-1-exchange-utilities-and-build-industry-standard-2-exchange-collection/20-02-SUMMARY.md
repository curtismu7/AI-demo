---
plan: 20-02
phase: 20-postman-collections-fix-1-exchange-utilities-and-build-industry-standard-2-exchange-collection
status: complete
completed: "2026-04-02"
commit: 56df684
subsystem: docs/postman
tags: [postman, collections, PAZ, revocation, advanced-utilities]
dependency_graph:
  requires: []
  provides: [BX-Finance-Advanced-Utilities]
  affects: [docs/]
tech_stack:
  added: []
  patterns: [Postman Collection v2.1, prerequest validation, test scripts]
key_files:
  created:
    - docs/BX-Finance-Advanced-Utilities.postman_collection.json
decisions:
  - Built from scratch rather than modifying Webinar source (D-11 — source stays untouched)
  - Replaced hardcoded client_id 7bb93320 and client_secret lIW-QkCx2... with {{MCP_CLIENT_ID}}/{{MCP_CLIENT_SECRET}} (security requirement — no hardcoded credentials)
  - Added Authorization header to PAZ request (missing from source)
  - resources.environmentId hardcoded UUID replaced with {{PINGONE_ENVIRONMENT_ID}}
metrics:
  duration: "~15 minutes"
  tasks: 1
  files: 1
---

# Phase 20 Plan 02: Create BX-Finance-Advanced-Utilities Collection

Extracted PAZ Policy Decision + Token Revocation from Webinar source into a clean production-ready collection with UPPERCASE vars, pre-request validation, test scripts, and no hardcoded credentials.

## Tasks Completed

| Task | Result |
|------|--------|
| 1: Build Advanced Utilities from Webinar source | ✅ 2 requests created; all old vars replaced; hardcoded client credentials parameterized; pre-request + test scripts added |

## Deviations from Plan

**1. [Rule 2 - Security] Hardcoded client_secret in Webinar Revocation request**
- **Found during:** Task 1 inspection
- **Issue:** Source Webinar `Token Revocation` request had hardcoded `client_id: 7bb93320-...` and `client_secret: lIW-QkCx2...` in the request body
- **Fix:** Replaced with `{{MCP_CLIENT_ID}}` and `{{MCP_CLIENT_SECRET}}` per UPPERCASE convention and security best practices
- **Files modified:** `docs/BX-Finance-Advanced-Utilities.postman_collection.json` (new file)
- **Commit:** 56df684

**2. [Rule 2 - Completeness] Missing Authorization header on PAZ request**
- **Found during:** Task 1 inspection of source
- **Issue:** PAZ request in Webinar source had no Authorization header; but PAZ requires a Bearer token for auth
- **Fix:** Added `Authorization: Bearer {{mcp_exchanged_token}}` header
- **Commit:** 56df684

## Self-Check: PASSED

- `docs/BX-Finance-Advanced-Utilities.postman_collection.json` exists ✅
- info.name = "BX Finance — Advanced Utilities" ✅
- 2 items: PAZ Policy Decision + Token Revocation ✅
- Hardcoded UUID cc26aaa9 not present ✅
- Hardcoded client credentials not present ✅
- Webinar source file unchanged ✅
