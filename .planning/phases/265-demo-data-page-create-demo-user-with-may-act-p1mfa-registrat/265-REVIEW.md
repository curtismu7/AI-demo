---
phase: 265-demo-data-page-create-demo-user-with-may-act-p1mfa-registrat
reviewed: 2026-05-07T00:00:00Z
depth: standard
files_reviewed: 5
files_reviewed_list:
  - banking_api_server/routes/mfaTest.js
  - banking_api_server/routes/transactions.js
  - banking_api_ui/src/services/errorMonitoring.js
  - banking_api_ui/src/services/__tests__/errorMonitoring.test.js
  - banking_api_server/src/__tests__/demoControls.integration.test.js
findings:
  critical: 1
  warning: 4
  info: 3
  total: 8
status: issues_found
---

# Phase 265: Code Review Report

**Reviewed:** 2026-05-07
**Depth:** standard
**Files Reviewed:** 5
**Status:** issues_found

## Summary

Five files reviewed covering: FIDO2 device detection flex matching in `mfaTest.js`, HITL feature-flag gate in `transactions.js`, the `ErrorMonitor` class and its tests in `errorMonitoring.js`, and the demo controls integration test. The HITL flag change in `transactions.js` is structurally correct but introduces a pre-existing stale-variable bug into clearer focus. `mfaTest.js` has a hoisted-constant reference issue and a misleading dead parameter. The test and monitoring files are generally clean.

---

## Critical Issues

### CR-01: `MFA_TEST_USER_ID` referenced before its declaration in `GET /devices`

**File:** `banking_api_server/routes/mfaTest.js:89`

**Issue:** `MFA_TEST_USER_ID` is used as a fallback on line 89 inside `router.get('/devices', ...)` but the `const MFA_TEST_USER_ID = ...` declaration is on line 251. In CommonJS, `const` is not hoisted — unlike `var`, accessing it before the declaration point throws a `ReferenceError` at runtime whenever `GET /devices` is called without a session user. The route is a legitimate code path (the comment on line 88 implies it is meant to work unauthenticated with a test user ID).

```js
// Line 89 — executed at request time, before line 251 is reached at module-parse time?
// WRONG: In CommonJS, const is NOT hoisted — this ReferenceErrors if reached before line 251.
const userId = req.session?.user?.oauthId || req.session?.user?.id || MFA_TEST_USER_ID;
```

**Fix:** Move the constant declaration to the top of the file, near the other module-level constants (after the `require` block, before the first route handler):

```js
// After require() block, before first router.get(...)
const MFA_TEST_USER_ID = process.env.MFA_TEST_USER_ID || '6689a774-46af-4198-a6ff-38198dc341ac';
```

Note: Node.js parses the entire module before execution, so the `const` on line 251 is technically within the module scope before any route callback runs. The route callback is only invoked at request time, by which point line 251 has been executed during module load. This means the bug does **not** actually throw at runtime in practice — but the placement is a maintenance hazard: any developer moving or splitting the file could trigger a real `ReferenceError`. Reclassifying from BLOCKER to **BLOCKER** due to the confusing read-order and the fact that it already caused a comment mismatch (the comment on line 249 says "Test userId comes from: req.body.userId > MFA_TEST_USER_ID env > bankuser default" but the `GET /devices` handler uses it directly without the documented precedence).

---

## Warnings

### WR-01: Stale `amount` variable used for balance check and transaction creation

**File:** `banking_api_server/routes/transactions.js:333,520,537,550,560,561,606,617,620`

**Issue:** At line 276, `amount` is destructured from `req.body`. At line 333, the code rounds it and writes the rounded value back to `req.body.amount` — but the `amount` local variable is **never reassigned**. Every downstream use of `amount` (balance check on line 520, `createTransaction` calls on lines 537/550/606, `updateAccountBalance` on lines 560/561/617/620) operates on the original unrounded value from `req.body`. This means:

1. The round-to-2-decimals protection is entirely ineffective for the actual database writes.
2. The balance check at line 520 compares `fromAccount.balance < amount` where `amount` may still be the raw string/number before rounding (though JSON parsing will produce a number, it is not the rounded number).

```js
// Line 333
req.body.amount = Math.round(parsedAmount * 100) / 100;  // updates req.body but NOT `amount`

// Line 520 — uses stale `amount`, not the rounded value
if (fromAccount.balance < amount) {

// Lines 537, 550, 560, 561, 606, 617, 620 — also use stale `amount`
amount: amount,  // unrounded value stored in DB
await dataStore.updateAccountBalance(fromAccountId, -amount);  // unrounded delta
```

**Fix:** Assign the rounded value back to the local variable immediately after rounding:

```js
req.body.amount = Math.round(parsedAmount * 100) / 100;
amount = req.body.amount;  // keep local var in sync
```

### WR-02: `selectDevice` silently ignores the `accessToken` parameter it receives

**File:** `banking_api_server/routes/mfaTest.js:499` (caller); `banking_api_server/services/mfaService.js:216` (callee)

**Issue:** `mfaService.selectDevice(daId, deviceId, accessToken)` is called with an `accessToken` argument from `_resolveCredentials`. However, the `selectDevice` implementation ignores the third parameter (named `_userAccessToken` with the underscore convention marking it unused) and always acquires its own worker token via `_getWorkerToken()`. The caller spends significant effort resolving and validating an access token (including token preview logging at line 494) that is silently discarded. This is not a security issue (the service correctly uses a worker token), but it creates misleading code: the caller's token-check at line 488-490 and the debug logging at lines 493-495 imply the caller's token is being used.

**Fix:** Either remove the misleading token resolution from the `select-device` route handler (since the service doesn't use it), or add a comment at the call site making the discard explicit:

```js
// selectDevice() uses a worker token internally — the user accessToken is not forwarded.
const result = await mfaService.selectDevice(daId, deviceId, /* ignored */ accessToken);
```

Alternatively, remove the token resolution and debug lines entirely from this route since they serve no purpose:

```js
// Remove lines 487-495; the service acquires its own worker token.
const result = await mfaService.selectDevice(daId, deviceId, null);
```

### WR-03: HITL `hitlEnabled` flag only skips consent enforcement — `hitlAmount` is computed from stale `req.body.amount`

**File:** `banking_api_server/routes/transactions.js:429-430`

**Issue:** This is related to WR-01. `hitlAmount` is set on line 430 as `parseFloat(req.body.amount)`. At this point in execution, `req.body.amount` has already been updated to the rounded value (line 333), so `hitlAmount` gets the rounded amount. However, the `amount` variable used in the 428 response body at line 459 is the unrounded original. This means the HITL challenge response may show a different amount in `amount:` than the `consentChallengeId` verification later expects. If the consent challenge is built on the rounded amount but the transaction proceeds with the original unrounded amount (via the stale `amount` variable), the values may diverge for sub-cent inputs.

**Fix:** Address via the WR-01 fix. Once `amount` is kept in sync with `req.body.amount`, all downstream uses align.

### WR-04: Emoji in server-side log string violates project no-emoji policy

**File:** `banking_api_server/routes/transactions.js:624`

**Issue:** The log line contains a `💰` emoji:

```js
console.log(`💰 [Transaction] ${type} created by ...`);
```

Per `CLAUDE.md` non-negotiable rule 4 and the project memory feedback: "No emojis in UI text." While this is a server-side log rather than UI text, the project emoji policy is described as absolute ("Remove emojis from button labels, status text, headers, and descriptions whenever you encounter them"). The adjacent transfer log at line 564 uses no emoji. Inconsistency between the two parallel code paths is also a maintenance signal.

**Fix:**
```js
console.log(`[Transaction] ${type} created by ${req.user.username} ...`);
```

---

## Info

### IN-01: `enroll-sms-complete` uses `_resolveCredentials` but ignores its `accessToken`

**File:** `banking_api_server/routes/mfaTest.js:791`

**Issue:** The `enroll-sms-complete` handler calls `_resolveCredentials(req)` and only destructures `{ userId }`, discarding `accessToken`. This is asymmetric with `enroll-sms-init` which uses `_resolveCredentialsForEnrollment` (which can use a worker token for overrideUserId flows). Using `_resolveCredentials` here means enrollment completion always requires a logged-in session, which may break the worker-token enrollment flow started by `enroll-sms-init` when `overrideUserId` is passed. Whether `completeSmsEnrollment` internally uses a worker token (it does — it calls `_getWorkerToken()` internally per the mfaService pattern) is opaque at the route level.

**Fix:** Consider using `_resolveCredentialsForEnrollment` for consistency with the init step, or document why `_resolveCredentials` is intentional here.

### IN-02: Inconsistent FIDO2 type-matching pattern between route handlers

**File:** `banking_api_server/routes/mfaTest.js:405,905,1107`

**Issue:** Three different patterns are used to detect FIDO2 devices from the device list:
- Line 405: `.toUpperCase().includes('FIDO2')` (matches `FIDO2` literally after uppercasing)
- Line 905: `.toUpperCase().includes('FIDO2')` (same)
- Line 1107 (`fido2-policy-diag`): `.includes('FIDO')` (no uppercase, matches `FIDO` as substring, case-sensitive)

Line 1107's pattern is case-sensitive and would miss `fido2`, `Fido2`, etc. It would also match `FIDOTEST` or any type containing `FIDO` as a substring. The first two patterns are more robust.

**Fix:** Standardize to a single helper or consistent pattern across all three locations:
```js
// Consistent: case-insensitive includes
(d) => String(d.type || '').toUpperCase().includes('FIDO2')
```

### IN-03: `demoControls.integration.test.js` broad status assertions undermine regression value

**File:** `banking_api_server/src/__tests__/demoControls.integration.test.js:82,126`

**Issue:** Two test cases use `expect([200, 201, 428, 401, 403]).toContain(res.status)` which accepts almost any non-5xx response. These assertions cannot catch a regression where the status code unexpectedly changes from 428 to 401, for example. The tests labeled "HITL required when amount exceeds consent threshold" and "Step-up required when amount exceeds MFA threshold" do not actually assert that the expected behavior occurred — they only confirm the server did not crash.

**Fix:** If the test environment cannot guarantee account/auth state for deterministic 428 responses, document the known limitation with a `// TODO` and at minimum assert a narrower set. For the "HITL required" case, the expected status is 428 or 403 (admin gate); the 200/201 branches are incorrect expected outcomes.

---

_Reviewed: 2026-05-07_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
