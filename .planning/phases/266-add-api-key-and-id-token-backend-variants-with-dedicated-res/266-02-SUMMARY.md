---
phase: 266
plan: "02"
subsystem: banking_api_server
tags: [sqlite, banking-db, resource-server, jwt-scrubber, path-info, nl-intent, config-store]
dependency_graph:
  requires: [266-01]
  provides: [bankingDb-service, resource-server-identity-accounts-transactions, pathInfo-route, jwtScrubber, nl-intent-api-key-dual-token, demo-api-key-configstore]
  affects: [banking_api_server/services/bankingDb.js, banking_api_server/services/jwtScrubber.js, banking_api_server/routes/resourceServer.js, banking_api_server/routes/pathInfo.js, banking_api_server/services/nlIntentParser.js, banking_api_server/services/configStore.js, banking_api_server/server.js]
tech_stack:
  added: [better-sqlite3 (already installed), node:sqlite fallback (Node 24+)]
  patterns: [idempotent SQLite seeding via fs.existsSync gate, JWT scrubbing via regex, two-tier regression+integration test pattern, jest.resetModules+jest.doMock per-test isolation]
key_files:
  created:
    - banking_api_server/services/bankingDb.js
    - banking_api_server/services/jwtScrubber.js
    - banking_api_server/routes/pathInfo.js
    - banking_api_server/src/__tests__/bankingDb.regression.test.js
    - banking_api_server/src/__tests__/bankingDb.integration.test.js
    - banking_api_server/src/__tests__/resourceServer.identity.regression.test.js
    - banking_api_server/src/__tests__/resourceServer.identity.integration.test.js
    - banking_api_server/src/__tests__/resourceServer.accounts.regression.test.js
    - banking_api_server/src/__tests__/resourceServer.transactions.regression.test.js
    - banking_api_server/src/__tests__/pathInfo.regression.test.js
    - banking_api_server/src/__tests__/pathInfo.integration.test.js
  modified:
    - banking_api_server/routes/resourceServer.js
    - banking_api_server/services/nlIntentParser.js
    - banking_api_server/services/configStore.js
    - banking_api_server/server.js
    - banking_api_server/src/__tests__/nlIntentParser.test.js
decisions:
  - "Use fs.existsSync() gate (not table COUNT) for idempotent DB seed — simpler, avoids bootstrap race"
  - "Detect db.transaction availability at runtime — graceful fallback to manual BEGIN/COMMIT/ROLLBACK for node:sqlite (Node 24+)"
  - "No /dualtoken-info route on pathInfo — Path B uses /api/resource-server/identity directly"
  - "scrubRawJwts applied defense-in-depth on identity response — raw JWT strings never leave server even if accidentally included"
  - "Subject integrity check on POST /identity: bodyIdToken.sub must match req.user.sub → 412 id_token_subject_mismatch"
metrics:
  duration: "~3 hours (resumed from previous session)"
  completed_date: "2026-05-10"
  tasks_completed: 3
  files_changed: 15
---

# Phase 266 Plan 02: SQLite banking-db, resource-server routes, JWT scrubber, pathInfo, NL parser extensions

SQLite-backed banking data service with idempotent seeding, three token-gated resource-server routes (identity/accounts/transactions), JWT scrubber defense-in-depth, Path A info route, and NL intent extensions for api_key_demo/dual_token_demo — all with two-tier regression+integration test coverage (131 tests, all passing).

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| T1 | bankingDb SQLite service + 9 tests | c5a6dcaf | services/bankingDb.js, src/__tests__/bankingDb.regression.test.js, src/__tests__/bankingDb.integration.test.js |
| T2 | Resource server routes + jwtScrubber + startup wire | 57b159b0 | services/jwtScrubber.js, routes/resourceServer.js, routes/pathInfo.js, server.js, 7 test files |
| T3 | pathInfo route + NL parser + configStore demo key | fbd7f32b | routes/pathInfo.js, services/nlIntentParser.js, services/configStore.js, src/__tests__/nlIntentParser.test.js, src/__tests__/pathInfo.regression.test.js, src/__tests__/pathInfo.integration.test.js |

## What Was Built

### bankingDb.js (new service)
- `initBankingDb()`: opens or creates `data/banking-resource-server.db`, creates accounts+transactions schema, seeds from in-memory store once via `fs.existsSync()` idempotency gate
- `getAccountsByUserId(userId)`: parameterized SELECT with WHERE userId = ?
- `getTransactionsByUserId(userId, limit?)`: parameterized SELECT with LIMIT, default 50
- Runtime detection of `db.transaction` availability — falls back to manual `BEGIN/COMMIT/ROLLBACK` for Node 24+ built-in `node:sqlite`

### jwtScrubber.js (new service)
- `scrubRawJwts(value)`: recursive walker that replaces any string matching `^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$` with `[REDACTED_JWT]`
- Applied as defense-in-depth on resource-server identity endpoint response

### resourceServer.js (modified — appended only)
- `GET /identity` and `POST /identity`: dual-token Path B endpoint; POST accepts `{ id_token }` body, decodes without verification, returns sanitized claims; subject integrity check (412 on sub mismatch); audit-logged via appEventService
- `GET /accounts`: Path C endpoint; returns bankingDb accounts for authenticated user
- `GET /transactions`: Path C endpoint; supports `?limit=N`; returns bankingDb transactions for authenticated user
- All three routes require `req.user` (auth middleware must run first)

### pathInfo.js (new route)
- `GET /api/path/apikey-info`: requires session `oauthTokens.accessToken`; returns masked last-4 of `demo_apikey_backend_service_key`, badge, color, returnTo
- Mounted at `app.use('/api/path', ...)` in server.js

### nlIntentParser.js (modified)
- Added `api_key_demo` action: routes "show special offers", "use the api-key path", "show me promotions"
- Added `dual_token_demo` action: routes "show my profile card", "use the access-and-id-token path", "dual token path"

### configStore.js (modified)
- New field: `demo_apikey_backend_service_key: { public: false, default: 'demo-api-key-0000' }`
- Env fallback: `DEMO_APIKEY_SERVICE_KEY` → `demo_apikey_backend_service_key`

## Test Coverage

131 tests across 10 suites — all passing:

| Suite | Tests | What it covers |
|-------|-------|----------------|
| bankingDb.regression | 7 | Schema creation, idempotent seed gate, single transaction, parameterized queries |
| bankingDb.integration | 2 | Real SQLite in tmp file, row counts match seed data |
| resourceServer.identity.regression | 9 | GET+POST /identity auth, body, sub mismatch, JWT scrubbing |
| resourceServer.identity.integration | 3 | Real configStore read, identity shape with real session |
| resourceServer.accounts.regression | 2 | 401 without auth, 200 + array with auth |
| resourceServer.transactions.regression | 3 | 401, 200 + array, ?limit param forwarded |
| pathInfo.regression | 2 | 401 without session, 200 + masked key + correct shape |
| pathInfo.integration | 3 | JWT scrubber pure unit, real configStore masked value |
| nlIntentParser (new tests 6-12) | 7 | api_key_demo, dual_token_demo, no regression on existing actions |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] node:sqlite lacks db.transaction()**
- **Found during:** T1 (bankingDb implementation)
- **Issue:** Node 24+ built-in `node:sqlite` does not implement `db.transaction(fn)`. Plan assumed better-sqlite3 API throughout.
- **Fix:** Added runtime detection: `if (typeof db.transaction === 'function') { db.transaction(_runInserts)(); } else { db.exec('BEGIN'); try { _runInserts(); db.exec('COMMIT'); } catch (e) { db.exec('ROLLBACK'); throw e; } }`
- **Files modified:** banking_api_server/services/bankingDb.js
- **Commit:** c5a6dcaf

**2. [Rule 1 - Bug] appEventService.logEvent signature mismatch**
- **Found during:** T2 (resourceServer identity route)
- **Issue:** Plan's pseudo-code used `logEvent('INTROSPECTION', 'identity_call', payload)` but real signature is `logEvent(category, severity, message, options)` — 4 positional args.
- **Fix:** Updated call to `logEvent('INTROSPECTION', 'info', 'identity_call', { metadata: {...} })`
- **Files modified:** banking_api_server/routes/resourceServer.js
- **Commit:** 57b159b0

**3. [Rule 1 - Bug] Jest module isolation — jest.doMock() required in worktree**
- **Found during:** T1 test verification
- **Issue:** When running full suite with node_modules symlinked, `jest.mock()` at module level doesn't prevent real better-sqlite3 from being loaded in the same worker. The regression tests tried to open a real SQLite file and failed with "unable to open database file".
- **Fix:** Switched `bankingDb.regression.test.js` to `jest.resetModules()` + `jest.doMock()` in `beforeEach` with `afterEach(() => jest.resetModules())`. This gives each test a fully isolated module registry.
- **Files modified:** banking_api_server/src/__tests__/bankingDb.regression.test.js
- **Commit:** fbd7f32b (included in T3 commit since it was discovered during final suite run)

**4. [Rule 3 - Blocking] No node_modules in worktree**
- **Found during:** T2 test execution
- **Issue:** Git worktrees don't inherit node_modules. Tests for routes (express, supertest) couldn't resolve modules.
- **Fix:** Created symlink: `ln -s /Users/curtismuir/banking/banking_api_server/node_modules /Users/curtismuir/banking/.claude/worktrees/agent-aa089cf2cb62dce51/banking_api_server/node_modules`
- **Not committed** (runtime environment fix, not source code)

## Acceptance Criteria — Verified

- `initBankingDb()` exported and called in server.js startup: confirmed
- `getAccountsByUserId()` and `getTransactionsByUserId()` use parameterized queries: confirmed (test 5, 6)
- `GET /api/resource-server/identity` and `POST /api/resource-server/identity` routes exist: confirmed
- `GET /api/resource-server/accounts` and `GET /api/resource-server/transactions` routes exist: confirmed
- `GET /api/path/apikey-info` returns masked key last-4: confirmed
- `demo_apikey_backend_service_key` in configStore with `public: false`: confirmed
- `DEMO_APIKEY_SERVICE_KEY` env fallback resolves: confirmed (W6 smoke test: smoketest-key-1234)
- NL intents `api_key_demo` and `dual_token_demo` route correctly: confirmed (tests 6-10)
- All 131 tests pass: confirmed

## Known Stubs

None. All routes return real data from bankingDb or configStore with no hardcoded placeholders.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: id_token_decode_no_verify | routes/resourceServer.js | POST /identity decodes id_token without signature verification — by design (demo path, claimed sub validated against session sub, scrubRawJwts applied). Documented in plan. |

## Self-Check: PASSED

- banking_api_server/services/bankingDb.js: FOUND
- banking_api_server/services/jwtScrubber.js: FOUND
- banking_api_server/routes/pathInfo.js: FOUND
- banking_api_server/src/__tests__/bankingDb.regression.test.js: FOUND
- banking_api_server/src/__tests__/resourceServer.identity.regression.test.js: FOUND
- banking_api_server/src/__tests__/pathInfo.regression.test.js: FOUND
- Commit c5a6dcaf: FOUND
- Commit 57b159b0: FOUND
- Commit fbd7f32b: FOUND
- All 131 tests: PASSED
