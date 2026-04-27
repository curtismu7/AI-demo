---
plan: 233-05
status: complete
completed_at: 2026-04-26
commit: 4859733f
---

# Summary — 233-05: POST /api/admin/app-events Endpoint + appEventClient

## What was done
- Added `POST /api/admin/app-events` route to `banking_api_server/routes/admin.js`:
  - Protected with `authenticateToken` middleware
  - Validates required fields: `category`, `severity`, `message`
  - Calls `appEventService.logEvent()` and returns `201 { event }`
  - Returns `400` for missing fields, `500` on internal error
- Created `banking_api_ui/src/services/appEventClient.js`:
  - Exports `postAppEvent(category, severity, message, options)` 
  - Fire-and-forget: never throws, swallows all errors silently via `console.debug`
  - Posts to `/api/admin/app-events` with `credentials: 'include'`

## Files changed
- `banking_api_server/routes/admin.js`
- `banking_api_ui/src/services/appEventClient.js` (new)

## Verification
- `authenticateToken` import already present in admin.js; no new auth dependency
- Unit tests pass (CimdSimPanel, SideNav, buttonRouting snapshots all green)
