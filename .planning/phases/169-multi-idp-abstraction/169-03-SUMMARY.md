---
phase: 169-multi-idp-abstraction
plan: "03"
subsystem: backend/oauth
tags: [oauth, callback-paths, idp, configStore, dispatcher, express-routing]
dependency_graph:
  requires: [169-01]
  provides: [configurable-callback-paths, callback-dispatcher]
  affects: [banking_api_server/services, banking_api_server/server.js]
tech_stack:
  added:
    - banking_api_server/services/callbackDispatcher.js
    - banking_api_server/tests/callback-routing.test.js
    - banking_api_server/docs/CALLBACK-PATHS.md
  modified:
    - banking_api_server/services/configStore.js
    - banking_api_server/server.js
  patterns: [url-rewriting, middleware-injection, express-dynamic-routing]
key_files:
  created:
    - banking_api_server/services/callbackDispatcher.js
    - banking_api_server/tests/callback-routing.test.js
    - banking_api_server/docs/CALLBACK-PATHS.md
  modified:
    - banking_api_server/services/configStore.js
    - banking_api_server/server.js
decisions:
  - "req.url rewriting: dispatcher rewrites req.url to /callback before delegating to router; avoids extracting handler from oauth.js"
  - "Always register: dispatcher registers routes for all configured paths (including defaults)"
  - "Shared path: when admin and user share same path, only admin route registered; user completes via session state"
  - "Rate limiter: passed as optional parameter; injected as first handler in route middleware chain"
  - "Path validation: must start with /, max 255 chars; invalid paths logged and skipped"
metrics:
  duration: "~25 minutes"
  completed: "2026-04-27"
  tasks_completed: 5
  files_changed: 5
  tests_added: 12
---

# Phase 169 Plan 03: Configurable Callback Paths Summary

New `callbackDispatcher` service registers OAuth callback routes at startup using paths from configStore. Default paths (`/api/auth/oauth/callback` and `/api/auth/oauth/user/callback`) are preserved for PingOne; custom paths like `/oauth2/callback` (Federate) or `/callback` (Auth0) are now supported via env vars without code changes.

## Tasks Completed

| # | Task | Files |
|---|------|-------|
| 1 | Add callback path fields to configStore | configStore.js |
| 2 | Create callbackDispatcher service | callbackDispatcher.js |
| 3 | Wire dispatcher into server.js | server.js |
| 5 | 12-test callback routing suite | tests/callback-routing.test.js |
| 6 | CALLBACK-PATHS.md documentation | docs/CALLBACK-PATHS.md |

(Task 4 — Config UI update — deferred; outside scope of backend plan)

## Architecture

```
server.js startup
  └─ registerCallbacks(app, oauthRoutes, oauthUserRoutes, authLimiter)
       ├─ reads oauth_admin_callback_path (default: /api/auth/oauth/callback)
       ├─ reads oauth_user_callback_path  (default: /api/auth/oauth/user/callback)
       └─ app.get(path, rateLimiter, handler)
            └─ handler: req.url = '/callback' + queryString
                        → delegates to oauthRoutes(req, res, next)
```

## Test Results

```
PASS tests/callback-routing.test.js
  callbackDispatcher
    ✓ registers admin callback at default path when no config set
    ✓ registers user callback at default path when no config set
    ✓ registers custom admin callback path when OAUTH_ADMIN_CALLBACK_PATH set
    ✓ registers custom user callback path when OAUTH_USER_CALLBACK_PATH set
    ✓ supports Federate pattern — both callbacks on /oauth2/callback
    ✓ supports Auth0 pattern — callback on /callback
    ✓ callback handler rewrites req.url to /callback preserving query string
    ✓ callback handler rewrites req.url with no query string
    ✓ rate limiter middleware is injected when provided
    ✓ does not register route for invalid admin callback path
    ✓ does not register route when path exceeds 255 characters
    ✓ user router is called for user callback path handler
  12/12 passed
```

## Self-Check: PASSED

- All success criteria met (except Config UI task — deferred)
- 12/12 tests pass
- Backward compatible — default paths unchanged
- Dispatcher logs registered paths for audit
