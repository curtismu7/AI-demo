# Phase 03 Plan 02 — SUMMARY
## Plan: `03-02` — STAB-02 cold-start KV snapshot tests + STAB-03 production safety guard test

**Phase:** `03-vercel-stability`
**Status:** ✅ Complete
**Commit:** `d74d53d`

---

## What Was Built

No production code changes. Both behaviors were already implemented and working; this plan adds automated tests that prove they work and prevent silent regression.

### Task 1 — Cold-start account restoration tests (STAB-02)

**`banking_api_server/src/__tests__/accounts-cold-start.test.js`** — 5 tests:

| Test | Verifies |
|------|---------|
| A | GET /accounts/my returns 3 accounts restored from a 3-item KV snapshot |
| B | Each snapshot account not in memory triggers `dataStore.createAccount` (cold-start path) |
| C | Empty snapshot falls through to `provisionDemoAccounts`, then `demoScenarioStore.save` with `accountSnapshot` |
| D | Warm instance (non-empty dataStore) does NOT call `demoScenarioStore.load` |
| E | Snapshot with `accountType=investment` correctly re-creates the investment account |

Mock strategy: mirrors `demo-scenario-api.test.js` — `../../data/store`, `../../services/demoScenarioStore`, `../../middleware/auth`, `../../middleware/demoMode` (blockInDemoMode is a factory: `(_label) => (req, res, next) => next()`).

### Task 2 — Production safety guard test (STAB-03)

**`banking_api_server/src/__tests__/server-production-guard.test.js`** — 2 tests:

| Test | Verifies |
|------|---------|
| 1 | `spawnSync(server.js)` with `SKIP_TOKEN_SIGNATURE_VALIDATION=true + NODE_ENV=production` exits with code 1 and stderr contains `'SKIP_TOKEN_SIGNATURE_VALIDATION'` |
| 2 | Same flag with `NODE_ENV=development` does NOT exit with code 1 (guard only triggers in production) |

Uses `child_process.spawnSync` so the test captures exit code without contaminating Jest's own process.

---

## Test Results

```
Test Suites: 52 passed, 52 total
Tests:       893 passed, 7 skipped, 0 failed
```

---

## Requirements Satisfied

- **STAB-02:** ✅ GET /api/accounts/my restores accounts from KV snapshot on cold-start (5 tests confirming behavior)
- **STAB-03:** ✅ Server exits 1 when `SKIP_TOKEN_SIGNATURE_VALIDATION=true` in production (2 tests)
