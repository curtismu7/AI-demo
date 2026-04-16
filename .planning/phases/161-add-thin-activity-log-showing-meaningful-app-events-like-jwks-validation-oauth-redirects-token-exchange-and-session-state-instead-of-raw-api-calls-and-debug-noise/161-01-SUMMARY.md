---
date: 2026-04-16
phase: 161
plan: 01
status: COMPLETE
---

# Phase 161-01 SUMMARY: Backend Service + API

## Objective
Create the `appEventService` backend service and API endpoint for structured app event capture.

## Delivered

### 1. appEventService.js (NEW)
**Location:** `banking_api_server/services/appEventService.js`

✅ **Complete Implementation:**
- In-memory ring buffer (500 max events, auto-evicts oldest)
- Event categories: oauth, token_exchange, session, jwks, mcp, auth_lifecycle
- Event severities: info, warning, error
- Full Event object shape with id, timestamp, category, severity, message, tag, metadata, flowId, username
- Exports:
  - `logEvent(category, severity, message, options)` — adds event to buffer
  - `getEvents({ category, severity, limit, since })` — filtered retrieval (newest first)
  - `getEventsByCategory()` — category summary counts
  - `clearEvents()` — buffer reset
  - `generateFlowId()` — random ID for grouping related events
  - `EVENT_CATEGORIES` and `EVENT_SEVERITIES` constants

**Verification:**
```bash
node -e "const svc = require('./banking_api_server/services/appEventService'); 
svc.logEvent('oauth', 'info', 'test event', { tag: 'test' }); 
const evts = svc.getEvents({}); 
console.log(evts.length === 1 ? 'PASS' : 'FAIL');"
# Output: PASS
```

### 2. Admin API Routes (ADDED to admin.js)
**Location:** `banking_api_server/routes/admin.js` (lines ~690+)

✅ **Two new routes behind `requireAdmin` + `requireScopes(['banking:admin'])`:**

**GET /api/admin/app-events** — Retrieve curated app events
- Query params: `category`, `severity`, `limit` (0-500), `since` (ISO timestamp)
- Response: `{ events: [...], total: count, categories: { oauth: X, session: Y, ... } }`
- Supports filtering by category, severity, and time range
- Newest events first

**GET /api/admin/app-events/categories** — Event summary by category
- Response: `{ categories: { oauth: X, session: Y, ... } }`
- No query params

**Verification:**
```bash
grep -c "app-events" banking_api_server/routes/admin.js
# Output: 6 (two route definitions + descriptions)

node -c banking_api_server/routes/admin.js && echo "✅ Syntax valid"
# Output: ✅ Syntax valid
```

## Security

**Threat Mitigation:**
- T-161-01 (I / Info Disclosure): Admin-only endpoints behind `requireAdmin` + scope validation
- T-161-02 (D / DoS): Ring buffer fixed size prevents unbounded memory growth
- T-161-03 (I / Info Disclosure): Event metadata doesn't contain full tokens (only scopes, expiry, token type)

## Task Completion

✅ **All tasks COMPLETE:**
- Task 1: appEventService.js with ring buffer and category system — DONE
- Task 2: Admin API endpoints with filtering — DONE

## Next Steps

→ **Phase 161-02:** Instrument event sources (oauthUser.js, oauthService.js, sqliteSessionStore.js, server.js JWKS)

→ **Phase 161-03:** Enhanced ActivityLogs.js UI with timeline, category icons, flow grouping, expandable metadata

## Files Modified

- ✅ NEW: `banking_api_server/services/appEventService.js` (145 lines)
- ✅ MODIFIED: `banking_api_server/routes/admin.js` (appends +45 lines, no breaking changes)

## Build Status

✅ `npm run build` passes (verified for UI)
✅ Node syntax check: admin.js and appEventService.js valid
