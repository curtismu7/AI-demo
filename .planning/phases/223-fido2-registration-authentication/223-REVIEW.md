---
status: issues_found
phase: 223
phase_name: fido2-registration-authentication
depth: standard
files_reviewed: 5
files_reviewed_list:
  - banking_api_server/routes/mfa.js
  - banking_api_server/routes/mfaTest.js
  - banking_api_server/services/mfaService.js
  - banking_api_server/src/__tests__/mfaService.test.js
  - banking_api_ui/src/components/MFATestPage.jsx
findings:
  critical: 1
  warning: 2
  info: 1
  total: 4
reviewed_at: 2026-04-25
---

# Phase 223 Code Review

## Scope
Reviewed source changes for phase 223 using git-diff fallback scope and validated behavior with targeted tests:
- Command run: `cd banking_api_server && ./node_modules/.bin/jest src/__tests__/mfaService.test.js --runInBand`
- Result: 3 failing tests, 19 passing tests

## Findings

### CR-223-01: Unauthenticated MFA test integration endpoints allow worker-token actions against arbitrary users
Severity: Critical

Location:
- banking_api_server/server.js:690
- banking_api_server/routes/mfaTest.js:282
- banking_api_server/routes/mfaTest.js:321
- banking_api_server/routes/mfaTest.js:389
- banking_api_server/routes/mfaTest.js:419
- banking_api_server/routes/mfaTest.js:477
- banking_api_server/routes/mfaTest.js:525
- banking_api_server/routes/mfaTest.js:553
- banking_api_server/routes/mfaTest.js:589
- banking_api_server/routes/mfaTest.js:616

Problem:
- `app.use("/api/mfa/test", mfaTestRoutes)` is mounted without `authenticateToken`.
- `_resolveCredentials()` allows `req.body.userId`/`req.query.userId` override and falls back to worker token mode.
- This enables unauthenticated callers to invoke MFA device operations for arbitrary user IDs.

Risk:
- Unauthorized enrollment/challenge operations and cross-user device manipulation.

Recommended fix:
- Guard `/api/mfa/test` with `authenticateToken` at mount level or per-route.
- Restrict `userId` override to admin-only test mode (explicit role check + feature flag).
- Disable worker fallback for unauthenticated requests.

### WR-223-01: Test suite drift vs implementation for `submitFido2Assertion`
Severity: Warning

Location:
- banking_api_server/services/mfaService.js:237
- banking_api_server/src/__tests__/mfaService.test.js:291

Problem:
- Service uses `axios.post()` with content type `application/vnd.pingidentity.assertion.check+json`.
- Test expects `axios.put()` and fails accordingly.

Evidence:
- Failing test: `submitFido2Assertion › sends PUT with assertion payload`

Recommended fix:
- Update test expectation to assert `axios.post` and verify request headers/content-type, or adjust implementation if PUT is required by contract.

### WR-223-02: Additional test regressions indicate contract mismatch in MFA service behavior
Severity: Warning

Location:
- banking_api_server/services/mfaService.js:264
- banking_api_server/services/mfaService.js:475
- banking_api_server/src/__tests__/mfaService.test.js:323
- banking_api_server/src/__tests__/mfaService.test.js:363

Problem:
- `listMfaDevices()` attaches `_debug` to returned array object, breaking strict `toEqual([])` expectation.
- `initFido2Registration()` now posts `{ type: "FIDO2", nickname: "My Passkey" }` while test expects `{ type: "FIDO2_PLATFORM" }`.

Evidence:
- Failing tests:
  - `listMfaDevices › returns empty array when _embedded is absent`
  - `initFido2Registration › posts FIDO2_PLATFORM to /devices and returns deviceId + creationOptions`

Recommended fix:
- Align tests with current contract, or normalize service responses/contracts and update both code and tests consistently.

### IN-223-01: Route-level MFA challenge endpoints are correctly guarded and include refresh-retry handling
Severity: Info

Location:
- banking_api_server/routes/mfa.js:33
- banking_api_server/routes/mfa.js:74
- banking_api_server/routes/mfa.js:148

Observation:
- Core MFA challenge endpoints are protected by `authenticateToken` and implement token-expiry refresh-retry behavior via `_tryRefresh()`.

## Summary
- Critical: 1
- Warning: 2
- Info: 1
- Total: 4

## Suggested Next Step
- Run: `/gsd-code-review-fix 223`
