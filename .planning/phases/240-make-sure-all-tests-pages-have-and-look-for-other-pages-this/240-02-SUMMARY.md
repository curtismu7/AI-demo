---
plan: 240-02
status: complete
commits: [0341191f]
---
# Plan 240-02 Summary

Normalized `pingoneRequest` shape in `mfaTest.js` and added regression tests.

## What changed

**`banking_api_server/routes/mfaTest.js`** — Added `normalizePingoneRequest(debugReq)` helper at top of file. Replaced all 15 `_debug.request` assignments with normalized form:
```js
resBody.pingoneRequest = normalizePingoneRequest(result._debug && result._debug.request);
```
The helper guarantees `{ method: string, url: string, body: any|null }` whenever a PingOne call was made, even if `_debug` fields are missing or inconsistent.

**`banking_api_server/routes/pingoneTestRoutes.js`** — Audited. The `_p1ReqDebug()` function already produces `{ method, url, contentType, body }` — no changes needed.

## New test files

**`src/__tests__/mfaTest.routes.test.js`** — 4 tests across 2 suites:
- SMS OTP initiate success: `pingoneRequest.method` is string, `.url` is string, `body` key present
- SMS OTP initiate failure: same assertions on error path
- No `_debug`: pingoneRequest absent or properly typed
- Email OTP initiate: normalized shape on success

**`src/__tests__/pingoneTestRoutes.routes.test.js`** — 3 tests across 3 suites:
- authz-token: pingoneRequest shape check
- agent-token: pingoneRequest shape check
- scope guard: pingoneTestRoutes router loads without importing production auth routes

## Test results

`npm test -- --testPathPattern="mfaTest.routes|pingoneTestRoutes.routes"` → **7/7 pass**

## Scope compliance

`routes/authorize.js`, `routes/oauth.js` — not opened, not modified.
