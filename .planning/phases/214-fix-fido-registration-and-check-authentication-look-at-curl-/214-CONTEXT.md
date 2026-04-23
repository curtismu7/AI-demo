# Phase 214: Fix FIDO Registration and Check Authentication — Context

**Gathered:** 2026-04-23
**Status:** Ready for planning

<domain>
## Phase Boundary

Fix the FIDO2 registration completion failure (PingOne `UNEXPECTED_ERROR`), verify the FIDO2 authentication challenge flow works end-to-end, and add dynamic PingOne Management API curl commands to all MFA sections (SMS, Email, FIDO2) on the MFA test page.

</domain>

<decisions>
## Implementation Decisions

### FIDO2 Registration Fix

- **D-01:** The fix is **investigate-and-fix** — there is no assumed root cause going in. Try the registration flow, confirm the failure, find the root cause, apply the targeted fix.
- **D-02:** Known symptom: `POST /api/mfa/test/integration/enroll-fido2-complete` returns PingOne `UNEXPECTED_ERROR` (code: `UNEXPECTED_ERROR`). The RP-ID debug box shows green (rp.id matches browser hostname), so RP-ID mismatch is NOT the cause.
- **D-03:** Prime suspects to investigate (in priority order):
  1. **Content-Type header** on the management API PUT — `completeFido2Registration` uses `application/json`, but the authentication path (`submitFido2Assertion`) uses `application/vnd.pingidentity.assertion.check+json`. A FIDO2-specific content type may be required for the registration completion PUT.
  2. **Origin encoding** — the `origin` field in the attestation body (`window.location.origin`) may not match what PingOne stored at `enroll-fido2-init` time.
  3. **Challenge expiry** — FIDO2 challenges expire after a short window (~60s); add timing logging to rule this out.
- **D-04:** Investigation should add server-side logging of the full PingOne response body (not just `err.message`) to surface the internal reason behind `UNEXPECTED_ERROR`.

### FIDO2 Authentication (Challenge Flow)

- **D-05:** Verify the full authentication flow **after** registration is fixed: initiate → auto-select FIDO2 device → poll challenge status for `publicKeyCredentialRequestOptions` → browser `navigator.credentials.get()` → `verify-fido2`.
- **D-06:** The same Content-Type investigation applies — if the authentication path uses the wrong type, fix it there too.

### Curl Command Display

- **D-07:** Show **PingOne Management API curl commands** (not BFF-level curls) — the actual HTTP calls the BFF sends to `api.pingone.{region}/v1/environments/{envId}`.
- **D-08:** Curls must be **dynamically generated** — show real values (actual env ID from configStore, actual device IDs captured after each step, worker token placeholder). Not static templates with `{{ENV_ID}}`.
- **D-09:** Add curl display to **all MFA sections** — SMS OTP, Email OTP, and FIDO2 (both enrollment and authentication). Consistent treatment across the page.
- **D-10:** Curl display should appear **under each relevant TestCard**, collapsible (like the existing "Show P1 Response" pattern). Each curl shows the method, URL, headers, and body for the PingOne call that step triggers.
- **D-11:** For steps where real dynamic values (device ID, DA ID) are only known after a prior step runs, the curl should populate those values from component state once available; show `{DEVICE_ID}` placeholder until they are.

### Claude's Discretion

- Implementation of the curl display component (new component vs extending TestCard vs inline)
- Whether to add a copy-to-clipboard button on curls
- Where to source the worker token value in the displayed curl (show as `$WORKER_TOKEN` env var reference; do not expose the actual token value)
- Exact server-side logging additions for debugging

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### FIDO2 Implementation (Server)
- `banking_api_server/services/mfaService.js` — `completeFido2Registration`, `submitFido2Assertion`, `initFido2Registration`; the PUT body shape and Content-Type headers are the fix target
- `banking_api_server/routes/mfaTest.js` — All FIDO2 test routes (`/integration/enroll-fido2-init`, `/integration/enroll-fido2-complete`, `/integration/verify-fido2`, `/integration/challenge/:daId/status`)

### FIDO2 Implementation (UI)
- `banking_api_ui/src/components/MFATestPage.jsx` — Contains all FIDO2 test sections, TestCard component, WhatIsHappening component, existing "Show P1 Response" pattern
- `banking_api_ui/src/components/Fido2Challenge.js` — Step-up challenge component (different flow from test page, uses `/api/auth/mfa/challenge`)

### Regression Guard
- `REGRESSION_PLAN.md` §4 entry dated 2026-04-22 — Documents the RP-ID mismatch + signed-byte decode fixes that were already applied; do not revert these

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `TestCard` component (in MFATestPage.jsx:1539) — Has "Show P1 Response" toggle pattern with `rawResult` prop. The curl display can follow this same collapsible pattern.
- `WhatIsHappening` component (in MFATestPage.jsx:1455) — Shows API flow per section. Curl commands are complementary, not duplicative.
- `apiCallTrackerService` + `SectionApiCalls` — Already captures runtime BFF call data; curls are for the PingOne-layer calls, different from what this tracks.
- `configStore.getEffective()` — Source for env ID and region needed to build dynamic PingOne URLs in curls.

### Established Patterns
- All raw response displays in MFATestPage use a collapsible `<pre>` block with a toggle button
- The `_resolveCredentials` helper in mfaTest.js resolves userId + token; the curl display mirrors what this function does under the hood
- Server routes return `pingError` in error responses — leverage this for better debugging during investigation

### Integration Points
- `mfaService.js` → `_apiBaseUrl()` + `_getWorkerToken()` define the PingOne Management API base; these are the correct sources for curl URL construction
- The BFF may need a new lightweight endpoint (e.g. `GET /api/mfa/test/curl-templates`) that returns dynamic curl templates with real env ID, region, and userId filled in

</code_context>

<specifics>
## Specific Ideas

- The `UNEXPECTED_ERROR` is PingOne's generic internal error — check Content-Type first, as PingOne FIDO2 management APIs often require a specific vendor content type for attestation completion
- Curl display should show the worker token as `$WORKER_TOKEN` (never expose the real value) but use the real env ID and region from configStore
- Regression log entry 2026-04-22 notes the RP-ID patch uses env var `PINGONE_FIDO2_RP_ID` — this is relevant context for the investigation

</specifics>

<deferred>
## Deferred Ideas

- Showing BFF-level curls (the `/api/mfa/test/...` endpoints) — user chose PingOne layer only
- FIDO2 step-up fix in `Fido2Challenge.js` (separate from test page flow) — if discovered broken during testing, file separately unless trivially in-scope

</deferred>

---

*Phase: 214-fix-fido-registration-and-check-authentication-look-at-curl-*
*Context gathered: 2026-04-23*
