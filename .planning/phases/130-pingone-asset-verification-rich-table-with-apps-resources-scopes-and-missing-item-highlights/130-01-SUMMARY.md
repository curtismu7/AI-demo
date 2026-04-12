---
phase: 130-pingone-asset-verification-rich-table-with-apps-resources-scopes-and-missing-item-highlights
plan: 01
subsystem: api
tags: [pingone, management-api, verify-assets, resource-servers, scopes]

requires: []
provides:
  - "getApplicationResources(appId) method on pingoneManagementService — fetches per-app granted resources + scopes via PingOne Management API"
  - "Enriched /api/pingone-test/verify-assets response with per-app grantedResources, missing.apps, missing.scopesByApp, expectedApps, expectedScopes"
affects: [pingone-test, verify-assets, asset-verification-ui]

tech-stack:
  added: []
  patterns:
    - "Parallel Promise.all over app list to fetch per-app resources in one async batch"
    - "Missing-item analysis computed server-side using EXPECTED_APP_NAMES / EXPECTED_BANKING_SCOPES constants"

key-files:
  created: []
  modified:
    - banking_api_server/services/pingoneManagementService.js
    - banking_api_server/routes/pingoneTestRoutes.js

key-decisions:
  - "EXPECTED_APP_NAMES and EXPECTED_BANKING_SCOPES declared as constants inside the route handler (not env vars) for simplicity"
  - "scopesAsset still uses first resource server for summary tile backward-compat"
  - "appResourcesMap keyed by app.id so UI can look up per-app resources by ID"

patterns-established:
  - "Per-app resource enrichment: loop apps, call getApplicationResources in parallel, build id→resources map, attach in response"

requirements-completed:
  - APP-RESOURCE-SCOPE-TABLE
  - MISSING-HIGHLIGHT

duration: 12min
completed: 2026-04-12
---

# Phase 130 Plan 01 Summary

**Server-side enrichment: `getApplicationResources(appId)` + verify-assets now returns per-app resource/scope data and missing-item analysis.**

## Performance

- **Duration:** 12 min
- **Completed:** 2026-04-12
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

### Task 1 — `getApplicationResources(appId)` in pingoneManagementService
- Added new async method after `enableResourceServer`
- Uses `GET /v1/environments/{envId}/applications/{appId}/resources`
- Returns `{ success, resources: [{ id, name, scopes: [string] }] }`
- Handles `_embedded.scopes` or top-level `scopes` array gracefully
- Uses `this.handleError` for consistent error handling

### Task 2 — Enriched verify-assets route
- Defined `EXPECTED_APP_NAMES` (4 Super Banking apps) and `EXPECTED_BANKING_SCOPES` (4 banking scopes) as route constants
- Enriches each app in parallel via `Promise.all` + `getApplicationResources`
- Builds `appResourcesMap` keyed by app.id
- Computes `missingApps`, `missingScopesByApp` for missing-item analysis
- New response fields: `assets.applications.data[].grantedResources`, `assets.missing`, `assets.expectedApps`, `assets.expectedScopes`
- Backward-compatible: `count` fields for all four summary tiles still present

## API Response Shape (new fields)

```json
{
  "assets": {
    "applications": {
      "data": [{ "id": "...", "name": "...", "type": "...", "grantedResources": [{ "id": "...", "name": "...", "scopes": ["banking:accounts:read"] }] }]
    },
    "missing": {
      "apps": ["Super Banking AI Agent App"],
      "resourcesByApp": {},
      "scopesByApp": { "app-id": ["banking:transactions:write"] }
    },
    "expectedApps": ["Super Banking User App", "..."],
    "expectedScopes": ["banking:accounts:read", "..."]
  }
}
```
