---
phase: 107-make-hostname-and-redirect-uri-configurable-via-admin-config-page
plan: 01
task_count: 2
status: completed
started: 2026-04-08T23:17:00.000Z
completed: 2026-04-08T23:18:30.000Z
commit_hash: 089b9c3
---

# Plan 107-01 SUMMARY — Backend Hostname Configuration Service

## What Was Built

Created backend foundation for runtime hostname configuration, enabling the frontend admin page to read and update the configured BFF hostname without requiring `.env` file edits.

### Artifacts Created

| File | Purpose | Status |
|------|---------|--------|
| `banking_api_server/services/configHostnameService.js` | Hostname config service with validation | ✓ Created |
| `banking_api_server/routes/adminConfig.js` | GET/PUT endpoints for hostname config (modified) | ✓ Updated |

### Exports

**configHostnameService module:**
- `getConfiguredHostname()` → `string` (default: `https://api.pingdemo.com:4000`)
- `setConfiguredHostname(hostname)` → `Promise<void>` (async, persists to configStore)
- `InvalidHostnameError` → error class for validation failures

## Task Completion

### Task 1: Create configHostnameService.js ✓

**Status:** COMPLETED

**Implementation:**
- Hostname validation regex: `^https?:\/\/[a-zA-Z0-9.-]+(:\d{1,5})?$`
- Validates protocol (must be https:// or http://)
- Validates hostname (alphanumeric, dots, hyphens allowed)
- Validates port range (1-65535 if present)
- In-memory cache for performance
- Persistent storage via configStore with key `CONFIGURED_HOSTNAME`
- Detailed logging of configuration changes and errors

**Verification:**
- Service loads without errors
- Default hostname: `https://api.pingdemo.com:4000`
- Validation rejects invalid formats (no protocol, wrong port, etc.)
- Changes persist across module reloads

### Task 2: Add GET/PUT Endpoints to adminConfig.js ✓

**Status:** COMPLETED

**Endpoints:**
```
GET  /api/admin/config/hostname     → { hostname: "..." }
PUT  /api/admin/config/hostname     → { hostname: "...", updated: true }
```

**Behavior:**
- GET: No authentication required (public info, returns current hostname)
- PUT: Admin-gated via `requireAdminOrUnconfigured` (first-run open, then admin-only)
- PUT: Validates hostname format, returns 400 with error message on invalid input
- PUT: Persists to configStore after validation
- Error handling: `InvalidHostnameError` caught and returned as 400, other errors returned as 500

**Verification:**
- GET returns 200 with current hostname
- PUT with valid hostname returns 200 with updated value
- GET after PUT reflects the persisted change
- PUT with invalid hostname returns 400 with clear error message
- Endpoints accessible from local development

## Deviations from Plan

**None — plan executed exactly as written.**

## Self-Checks

| Check | Result | Notes |
|-------|--------|-------|
| Service module created | ✓ | configHostnameService.js exists with all exports |
| Service loads | ✓ | No syntax errors, requires load correctly |
| Default hostname | ✓ | Returns `https://api.pingdemo.com:4000` |
| Hostname validation | ✓ | Regex validation enforces protocol+host±port format |
| GET endpoint | ✓ | Returns 200 with `{ hostname: "..." }` |
| PUT endpoint | ✓ | Updates hostname, returns 200 with updated value |
| Validation errors | ✓ | Invalid hostnames return 400 with error message |
| Persistence | ✓ | Changes persist across requests (verifiedwith GET after PUT) |
| Logging | ✓ | Configuration changes logged with previous/new values |

## Key Files Modified

| File | Changes |
|------|---------|
| `banking_api_server/services/configHostnameService.js` | NEW — Hostname config service |
| `banking_api_server/routes/adminConfig.js` | ADDED — GET/PUT /hostname endpoints |
| `banking_api_server/routes/admin.js` | REVERTED — Removed hostname endpoints (they belong in adminConfig) |

## Issues Encountered

**Issue: Hostname endpoints initially placed in admin.js**
- **Cause:** Misunderstood route registration (admin.js endpoints require authentication)
- **Resolution:** Moved endpoints to adminConfig.js which is registered BEFORE auth guard (`/api/admin/config` routes bypass authentication for initial setup, then respect the `requireAdminOrUnconfigured` gate)
- **Result:** Endpoints now accessible and properly secured

## Ready for Next Phase

✓ Backend API complete and tested
✓ GET endpoint functional (retrieve hostname)
✓ PUT endpoint functional (update hostname with validation)
✓ Configuration persists to configStore
✓ Proper error handling and logging

**Next:** Plan 107-02 — Create frontend admin UI components to consume these endpoints
