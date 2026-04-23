# Phase 214: Fix FIDO Registration and Check Authentication — Research

**Researched:** 2026-04-23
**Domain:** PingOne FIDO2/WebAuthn Management API, MFA test page UI patterns
**Confidence:** HIGH (all findings from codebase inspection + published patterns)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Fix approach is investigate-and-fix — try the flow, confirm the failure, find the root cause, apply the targeted fix.
- **D-02:** Known symptom: `POST /api/mfa/test/integration/enroll-fido2-complete` returns PingOne `UNEXPECTED_ERROR`. The RP-ID debug box shows green.
- **D-03:** Prime suspects in priority order: (1) Content-Type on the management API PUT, (2) Origin encoding mismatch, (3) Challenge expiry.
- **D-04:** Investigation must add server-side logging of the full PingOne response body.
- **D-05:** Verify full authentication flow after registration is fixed.
- **D-06:** Same Content-Type investigation applies to authentication path.
- **D-07:** Show PingOne Management API curl commands (not BFF-level curls).
- **D-08:** Curls must be dynamically generated with real env ID, region, device IDs, and `$WORKER_TOKEN` placeholder.
- **D-09:** Add curl display to all MFA sections — SMS OTP, Email OTP, FIDO2 enrollment, and FIDO2 authentication.
- **D-10:** Curl display appears under each relevant TestCard, collapsible (same as "Show P1 Response" pattern).
- **D-11:** Curls populate dynamic values from component state once available; show `{DEVICE_ID}` placeholder until then.

### Claude's Discretion

- Implementation of the curl display component (new component vs extending TestCard vs inline)
- Whether to add a copy-to-clipboard button on curls
- Where to source the worker token value (show as `$WORKER_TOKEN`, never expose actual token)
- Exact server-side logging additions for debugging

### Deferred Ideas (OUT OF SCOPE)

- Showing BFF-level curls (the `/api/mfa/test/...` endpoints)
- FIDO2 step-up fix in `Fido2Challenge.js` — deferred unless trivially in scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| D-01 | Investigate and fix FIDO2 registration `UNEXPECTED_ERROR` | See §Root Cause Analysis — Content-Type prime suspect confirmed |
| D-02 | Known failure at enroll-fido2-complete step | `completeFido2Registration` in mfaService.js identified as fix target |
| D-03 | Prioritized suspect list | Content-Type mismatch evidence documented; comparison table provided |
| D-04 | Add detailed server-side error logging | Current logging patterns documented; logging gap identified |
| D-05 | Verify FIDO2 authentication end-to-end after fix | Authentication path (`submitFido2Assertion`) also uses vendor content type — pattern documented |
| D-06 | Investigate Content-Type on authentication path too | `submitFido2Assertion` already uses `application/vnd.pingidentity.assertion.check+json` — note asymmetry |
| D-07 | Show PingOne Management API curls | PingOne API URL patterns documented from codebase |
| D-08 | Dynamic curls with real env ID / device IDs | `configStore.getEffective()` patterns documented; BFF endpoint approach specified |
| D-09 | Curl display in all MFA sections | All section types and their PingOne calls documented |
| D-10 | Collapsible curl display under each TestCard | `TestCard` component structure verified; extension pattern documented |
| D-11 | Populate from state, show placeholders until available | State variable inventory complete for all sections |
</phase_requirements>

---

## Summary

Phase 214 has two independent deliverables: (1) fix the FIDO2 registration failure, and (2) add dynamic PingOne API curl display to all MFA test page sections.

**FIDO2 Registration Fix:** The `completeFido2Registration` function in `mfaService.js` calls `PUT /v1/environments/{envId}/users/{userId}/devices/{deviceId}` with `Content-Type: application/json`. The authentication-side companion function (`submitFido2Assertion`) uses `application/vnd.pingidentity.assertion.check+json`. This asymmetry is the prime suspect for `UNEXPECTED_ERROR`. PingOne's management API uses vendor-specific content types for specialized operations — the pattern is established by `application/vnd.pingidentity.assertion.check+json` (for FIDO2 assertion submission) and `application/vnd.pingidentity.password.set+json` (for password operations in `pingoneProvisionService.js`). The FIDO2 attestation completion PUT likely requires a similar vendor type. The exact type must be discovered by reading the PingOne API documentation or testing empirically during the fix investigation. The plan must include a step to try `application/vnd.pingidentity.credential.fido2.register+json` (or similar) as the first fix attempt, then fall back to empirical discovery if that fails.

**Curl Command Display:** The existing `TestCard` component (line 1539 in MFATestPage.jsx) has a "Show P1 Response" collapsible pattern that can be directly extended or replicated. The recommended approach is a new `PingOneCurlCard` component that follows the same toggle pattern. A new lightweight BFF endpoint (`GET /api/mfa/test/curl-context`) should return the env ID, region, and user ID needed to build accurate curl URLs. Device IDs and DA IDs flow from component state. The worker token is always shown as `$WORKER_TOKEN` in the curl output.

**Primary recommendation:** Implement the FIDO2 fix first by adding detailed error logging and testing the Content-Type hypothesis; curl display is independent and can proceed in parallel or as a second task.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| FIDO2 attestation PUT body/headers | API / Backend (`mfaService.js`) | — | PingOne call lives server-side; Content-Type is a server request header |
| FIDO2 challenge assertion verification | API / Backend (`mfaService.js`) | — | Uses user access token, server-side |
| Browser WebAuthn credential creation | Browser / Client (`MFATestPage.jsx`) | — | `navigator.credentials.create()` must run in browser |
| Curl display UI | Frontend / Client (`MFATestPage.jsx`) | API / Backend (curl-context endpoint) | Template rendered client-side; env ID/region fetched from BFF |
| Dynamic curl context (env ID, region, userId) | API / Backend (`mfaTest.js` new route) | — | Values are server-side config; never embed in UI bundle |

---

## Standard Stack

### Core (no new packages needed)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| axios | existing | PingOne Management API calls | Already in mfaService.js |
| express | existing | BFF route for curl-context endpoint | Already in mfaTest.js |
| React / useState / useCallback | existing | Curl display toggle state | Already in MFATestPage.jsx |

**No new npm packages are required for this phase.** The curl display is implemented with existing React state and standard JSX. The FIDO2 fix is a header change in mfaService.js.

---

## Architecture Patterns

### System Architecture Diagram

```
Browser MFATestPage.jsx
  │
  ├─[Step 1] testFidoEnrollInit()
  │   └─ POST /api/mfa/test/integration/enroll-fido2-init
  │        └─ mfaService.initFido2Registration(userId)
  │             └─ POST api.pingone.{region}/v1/environments/{envId}/users/{userId}/devices
  │                  body: { type:"FIDO2", nickname:"My Passkey" }
  │                  ← returns { id: deviceId, publicKeyCredentialCreationOptions }
  │
  ├─[Step 2] navigator.credentials.create({ publicKey })   [Browser-only, private key never leaves device]
  │
  ├─[Step 3] testFidoEnrollComplete()
  │   └─ POST /api/mfa/test/integration/enroll-fido2-complete
  │        └─ mfaService.completeFido2Registration(userId, deviceId, attestation, origin)
  │             └─ PUT api.pingone.{region}/v1/environments/{envId}/users/{userId}/devices/{deviceId}
  │                  body: { type:"FIDO2", attestation, origin }
  │                  Content-Type: ??? ← FIX TARGET
  │                  ← currently returns UNEXPECTED_ERROR
  │
  └─[Curl Display] GET /api/mfa/test/curl-context
       ← { envId, region, userId }  ← used to build dynamic curls in UI
```

### Recommended Project Structure (changes only)

```
banking_api_server/
  routes/mfaTest.js         # Add GET /curl-context route
  services/mfaService.js    # Fix Content-Type in completeFido2Registration; add logging

banking_api_ui/src/components/
  MFATestPage.jsx           # Add PingOneCurlCard component; wire to all sections
```

### Pattern 1: Existing TestCard "Show P1 Response" Toggle

This is the established pattern for collapsible response display. The curl display MUST follow this exact pattern for visual consistency.

```jsx
// Source: banking_api_ui/src/components/MFATestPage.jsx line 1563
{rawResult !== undefined && rawResult !== null && (
  <div className="test-card-raw">
    <button
      type="button"
      className="test-card-raw-toggle"
      onClick={() => setRawOpen((o) => !o)}
    >
      {rawOpen ? "▾ Hide P1 Response" : "▸ Show P1 Response"}
    </button>
    {rawOpen && (
      <pre className="test-card-raw-json">
        {JSON.stringify(rawResult, null, 2)}
      </pre>
    )}
  </div>
)}
```

### Pattern 2: PingOneCurlCard Component (recommended new component)

Following the toggle pattern above, a new component renders the curl for a given PingOne call. It takes the curl string as a prop and manages its own open/closed state. This keeps MFATestPage.jsx clean and avoids duplicating toggle logic.

```jsx
// New component — place inline in MFATestPage.jsx (no separate file needed given project pattern)
function PingOneCurlCard({ label, curlCommand }) {
  const [open, setOpen] = useState(false);
  if (!curlCommand) return null;
  return (
    <div className="test-card-raw">
      <button
        type="button"
        className="test-card-raw-toggle"
        onClick={() => setOpen((o) => !o)}
      >
        {open ? `▾ Hide curl — ${label}` : `▸ Show curl — ${label}`}
      </button>
      {open && (
        <pre className="test-card-raw-json" style={{ whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
          {curlCommand}
        </pre>
      )}
    </div>
  );
}
```

A copy-to-clipboard button can be placed inside the `{open && ...}` block (Claude's Discretion). The recommended approach is a simple `navigator.clipboard.writeText(curlCommand)` call with no library dependency.

### Pattern 3: New BFF Curl-Context Endpoint

```javascript
// Source: banking_api_server/routes/mfaTest.js (new route to add)
// GET /api/mfa/test/curl-context
router.get('/curl-context', async (req, res) => {
  try {
    const configStore = require('../services/configStore');
    await configStore.ensureInitialized();
    const envId  = configStore.getEffective('pingone_environment_id') || '';
    const region = configStore.getEffective('pingone_region') || 'com';
    const { userId } = await _resolveCredentials(req);
    res.json({ envId, region, userId });
  } catch (err) {
    console.error('[MFA Test] GET /curl-context failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});
```

The React component calls this once on mount and stores the result in a `curlCtx` state variable:
```jsx
const [curlCtx, setCurlCtx] = useState(null);
// In useEffect / loadConfig:
const { data } = await apiClient.get('/api/mfa/test/curl-context');
setCurlCtx(data);
```

### Pattern 4: Curl Template Construction

Build curl strings as template literals from component state. Use `$WORKER_TOKEN` for the authorization header — never interpolate the actual token.

```javascript
// Example — FIDO2 init (enroll)
function buildFido2InitCurl(curlCtx) {
  if (!curlCtx?.envId) return null;
  const base = `https://api.pingone.${curlCtx.region}/v1/environments/${curlCtx.envId}`;
  return `curl -X POST \\
  "${base}/users/${curlCtx.userId}/devices" \\
  -H "Authorization: Bearer $WORKER_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"type":"FIDO2","nickname":"My Passkey"}'`;
}

// Example — FIDO2 complete (with deviceId from state)
function buildFido2CompleteCurl(curlCtx, deviceId) {
  if (!curlCtx?.envId) return null;
  const base = `https://api.pingone.${curlCtx.region}/v1/environments/${curlCtx.envId}`;
  const devId = deviceId || '{DEVICE_ID}';
  return `curl -X PUT \\
  "${base}/users/${curlCtx.userId}/devices/${devId}" \\
  -H "Authorization: Bearer $WORKER_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"type":"FIDO2","attestation":{"id":"...","rawId":"...","type":"public-key","response":{"clientDataJSON":"...","attestationObject":"..."}},"origin":"https://your-host.com"}'`;
}
```

The Content-Type header in the curl template for `completeFido2Registration` should be updated to reflect whatever fix is applied to `mfaService.js` (i.e., if the fix is a vendor content type, the curl template must show the same vendor type).

### Anti-Patterns to Avoid

- **Embedding real tokens in curl output:** The worker token is a high-value secret. Always use `$WORKER_TOKEN` as a shell variable reference.
- **Hardcoding env IDs in the UI:** The curl template must call the BFF for env ID rather than reading from a JS bundle constant.
- **Triggering curl-context on every render:** Fetch once in a `useEffect` at mount time, store in state.
- **Using `innerHTML` to render curl text:** Use `<pre>` with text content or `{curlCommand}` JSX — no `dangerouslySetInnerHTML`.

---

## Root Cause Analysis

### FIDO2 `UNEXPECTED_ERROR` — What the Code Shows

**[VERIFIED: codebase inspection]**

`completeFido2Registration` in `mfaService.js` (lines 456-503):

```javascript
const resp = await axios.put(url, body, {
  headers: {
    Authorization: `Bearer ${workerToken}`,
    "Content-Type": "application/json",   // ← LINE 478 — prime suspect
  },
  timeout: 15000,
});
```

Compare with `submitFido2Assertion` (lines 208-236):

```javascript
const { data } = await axios.post(url, body, {
  headers: {
    Authorization: `Bearer ${userAccessToken}`,
    "Content-Type": "application/vnd.pingidentity.assertion.check+json",  // vendor type
  },
  timeout: 15000,
});
```

The authentication path already uses a PingOne vendor content type. The enrollment completion path uses `application/json`. This is a structural inconsistency that aligns exactly with D-03 suspect #1.

### What Other PingOne Vendor Types Exist in This Codebase

**[VERIFIED: grep of banking_api_server/]**

| Content-Type | Used For | File |
|---|---|---|
| `application/vnd.pingidentity.assertion.check+json` | FIDO2 authentication assertion | mfaService.js |
| `application/vnd.pingidentity.password.set+json` | Password management | pingoneProvisionService.js |
| `application/vnd.pingidentity.usernamePassword.check+json` | Username/password check (test only) | __tests__/ |
| `application/vnd.pingidentity.devices.reorder+json` | Device reordering | (documented in PingOne API search results) |

This pattern strongly suggests that FIDO2 attestation completion also requires a specific vendor type. The exact type is unknown from codebase alone — it must be confirmed against PingOne documentation or discovered empirically.

**Candidate types to investigate (in order):**
1. `application/vnd.pingidentity.credential.fido2.register+json` — plausible analogy to assertion type
2. `application/vnd.pingidentity.device.register+json` — simpler variant
3. `application/json` with additional required body fields — if attestation is OK but body is missing a field

### Additional Logging Needed (D-04)

The current `completeFido2Registration` already logs an error block:
```javascript
console.error(
  "[MFA] completeFido2Registration failed: status=%s code=%s details=%j body=%j",
  err.response?.status, pingErr?.code, pingErr?.details || pingErr?.message, body,
);
```

However, this does NOT log the full raw `pingErr` object including all detail fields. The fix should change `pingErr?.details || pingErr?.message` to `JSON.stringify(pingErr)` to capture the full response body, which may contain an `innerError` or `details` array with the actual internal reason behind `UNEXPECTED_ERROR`.

### FIDO2 Authentication Path (D-05, D-06)

`submitFido2Assertion` in mfaService.js already uses:
- Method: `POST` (not PUT — the auth endpoint is `deviceAuthentications`, not `devices`)
- URL: `https://auth.pingone.{region}/{envId}/deviceAuthentications/{daId}` (AUTH server, not management API)
- Content-Type: `application/vnd.pingidentity.assertion.check+json`

This path is architecturally different from the registration path: it hits the AUTH server (not management API) and already uses a vendor content type. If the registration fix unblocks enrollment, the authentication path has a higher probability of working already. Verification still required per D-05.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Base64url encoding for curl display | Custom encode function | `btoa().replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")` (already in MFATestPage) | Edge cases with padding and URL safety |
| Clipboard API wrapper | Custom clipboard service | `navigator.clipboard.writeText(text).catch(...)` | Browser built-in with permission handling |
| Curl string sanitisation | HTML escaping | Use `<pre>` with React text children — React auto-escapes | Prevents XSS from any raw response fields injected into curl |

---

## Common Pitfalls

### Pitfall 1: FIDO2 Attestation Origin Mismatch (D-03 Suspect #2)

**What goes wrong:** The `origin` field sent in the PUT body may not match what PingOne stored at init time. The init call does not send an origin, so PingOne uses the RP ID as the expected origin root. If `window.location.origin` (e.g., `https://api.pingdemo.com`) differs from what was in the `clientDataJSON` at credential creation time, PingOne rejects it.

**Why it happens:** The `testFidoEnrollComplete` handler sends `origin: window.location.origin` in the BFF request body. The BFF passes it to `completeFido2Registration`. If the app is served from a different origin in test vs. production, these won't match.

**How to avoid:** Verify that the origin sent in the PUT body matches the origin embedded in the `clientDataJSON` from `navigator.credentials.create()`. The `clientDataJSON` decoded from the credential response always contains the exact origin the browser used — that is the ground truth. Log both values server-side.

**Warning signs:** `UNEXPECTED_ERROR` persists after Content-Type fix; detailed error log shows origin-related detail.

### Pitfall 2: Challenge Expiry During Registration (D-03 Suspect #3)

**What goes wrong:** PingOne FIDO2 challenges have short TTLs (typically 60 seconds). If the user takes longer than the window to complete the browser WebAuthn prompt, the PUT at step 3 arrives after challenge expiry.

**How to avoid:** Add a `Date.now()` timestamp at init and log elapsed time at complete. Log `challengeExpiredAt` if returned in the PingOne error details.

**Warning signs:** `UNEXPECTED_ERROR` only happens on slow attempts; fast attempts succeed.

### Pitfall 3: TestCard rawResult prop not updating the curl

**What goes wrong:** If the `PingOneCurlCard` is placed outside the `TestCard` but the device ID state is only set inside a callback, a render cycle may show a placeholder curl even after the step succeeded.

**How to avoid:** Build curl strings in the JSX return, not in callbacks. React state updates trigger re-renders, so curl templates built from state variables (`enrollSmsDeviceId`, `fidoEnrollData?.deviceId`, etc.) automatically update.

### Pitfall 4: Worker token exposed in curl output

**What goes wrong:** Some implementations interpolate the actual `Authorization` token value for "convenience."

**How to avoid:** Hardcode the literal string `$WORKER_TOKEN` (with `$` sign) in all curl headers. This is a shell variable convention that demonstrates usage without exposing credentials.

---

## Code Examples

### Existing PingOne Vendor Content-Type Usage (authentication path)

```javascript
// Source: banking_api_server/services/mfaService.js lines 220-232
const { data } = await axios.post(url, body, {
  headers: {
    Authorization: `Bearer ${userAccessToken}`,
    "Content-Type": "application/vnd.pingidentity.assertion.check+json",
  },
  timeout: 15000,
});
```

### Current completeFido2Registration (fix target)

```javascript
// Source: banking_api_server/services/mfaService.js lines 471-479
const resp = await axios.put(url, body, {
  headers: {
    Authorization: `Bearer ${workerToken}`,
    "Content-Type": "application/json",   // ← CHANGE THIS
  },
  timeout: 15000,
});
```

### Improved Error Logging Pattern

```javascript
// Proposed replacement for the catch block in completeFido2Registration
} catch (err) {
  const pingErr = err.response?.data;
  console.error(
    "[MFA] completeFido2Registration failed: status=%s pingError=%j requestBody=%j",
    err.response?.status,
    pingErr,          // full object — reveals innerError and detail arrays
    body,
  );
  throw err;
}
```

### BFF Curl-Context Route (new)

```javascript
// Source: to add in banking_api_server/routes/mfaTest.js
router.get('/curl-context', async (req, res) => {
  try {
    const configStore = require('../services/configStore');
    await configStore.ensureInitialized();
    const envId  = configStore.getEffective('pingone_environment_id') || '';
    const region = configStore.getEffective('pingone_region') || 'com';
    const { userId } = await _resolveCredentials(req);
    res.json({ envId, region, userId });
  } catch (err) {
    console.error('[MFA Test] GET /curl-context:', err.message);
    res.status(500).json({ error: err.message });
  }
});
```

---

## Runtime State Inventory

This is a bug fix + UI enhancement phase, not a rename/migration. Runtime state inventory does not apply.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | BFF server | ✓ | Existing | — |
| React 18 | MFATestPage.jsx | ✓ | Existing | — |
| navigator.credentials | WebAuthn in browser | ✓ (check at runtime) | Browser native | Error message if absent |
| navigator.clipboard | Copy-to-clipboard | ✓ (modern browsers) | Browser native | Omit button if undefined |
| PingOne Management API | FIDO2 PUT | ✓ (live) | — | Error surfaced in UI |

No missing dependencies that block execution.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Jest (existing) |
| Config file | `banking_api_server/package.json` (jest config) |
| Quick run command | `cd banking_api_server && npx jest mfaService --no-coverage` |
| Full suite command | `cd banking_api_server && npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| D-01/D-03 | completeFido2Registration sends correct Content-Type | unit | `npx jest mfaService -t "completeFido2Registration"` | ✅ `banking_api_server/src/__tests__/mfaService.test.js` |
| D-04 | Error logging includes full pingError object | unit | `npx jest mfaService -t "completeFido2Registration"` | ✅ |
| D-08 | curl-context endpoint returns envId, region, userId | unit/smoke | `npx jest mfaTest` (new test if needed) | ❌ Wave 0 gap |
| D-10 | PingOneCurlCard renders and toggles | manual | `npm run build` (exit 0 verifies JSX validity) | — |

### Sampling Rate

- Per task commit: `cd banking_api_server && npx jest mfaService --no-coverage`
- Per wave merge: `cd banking_api_ui && npm run build` (exit 0) + `cd banking_api_server && npm test`
- Phase gate: Both pass before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] Update `mfaService.test.js` — add test asserting `completeFido2Registration` uses the corrected Content-Type header
- [ ] Consider adding smoke test for `GET /api/mfa/test/curl-context` (low priority — manual verification acceptable)

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Hard-coded RP-ID overrides | Preserve PingOne's rp.id directly | 2026-04-22 regression fix | Registration must NOT override rp.id |
| Signed-byte WebAuthn decode ignored | `safeBase64ToBytes` handles Java signed-byte arrays | 2026-04-22 regression fix | Must not revert this |
| SMS enrollment worker-only | Prefer user access token for OTP flow | 2026-04-22 regression fix | Must not revert this |

**Do not break (from REGRESSION_PLAN.md 2026-04-22 entry):**
- RP domain must match serving host in WebAuthn options
- Signed-byte WebAuthn fields (`challenge`, `user.id`) must decode via `safeBase64ToBytes`
- SMS OTP test flow must prefer user-token enrollment path

---

## Open Questions

1. **Exact vendor Content-Type for FIDO2 attestation completion**
   - What we know: PingOne uses vendor types for FIDO2 assertion (`assertion.check+json`) and password set (`password.set+json`). Registration completion likely uses a similar type.
   - What's unclear: The exact string is not findable through web search alone; PingOne's public API docs do not publish the full vendor type list in a web-accessible format.
   - Recommendation: The executor must (a) check the official PingOne API reference for `PUT /environments/{envId}/users/{userId}/devices/{deviceId}` for FIDO2, (b) try `application/vnd.pingidentity.credential.fido2.register+json` as a first attempt, and (c) if that fails, check the full raw error response from step D-04 logging for any `hint` or `supportedContentType` field in the PingOne error body.

2. **Whether curl-context needs a separate route or can piggyback on `/config`**
   - What we know: `/api/mfa/test/config` already exists and returns mfa config. The env ID and region are available from `configStore.getEffective()`.
   - What's unclear: Whether the logged-in userId is needed in the curl or if a placeholder like `{USER_ID}` is better.
   - Recommendation: Add the dedicated `/curl-context` route as specified in D-07. This keeps the concern separate and allows the route to call `_resolveCredentials(req)` to get the actual userId without duplicating credential logic.

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No (MFA test page is admin-only tooling, not production auth) | — |
| V3 Session Management | Partial | `req.session` already managed by BFF session middleware |
| V4 Access Control | No | `/api/mfa/test/*` routes are admin tool; no new auth gates added |
| V5 Input Validation | Yes | `deviceId` and `attestation` fields validated before PingOne call |
| V6 Cryptography | No | No new crypto; FIDO2 crypto is handled by PingOne server-side |

### Known Threat Patterns for Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Token exposure in curl output | Information Disclosure | Always render `$WORKER_TOKEN` literal — never interpolate token value |
| Origin spoofing in attestation body | Tampering | Origin comes from client; PingOne validates against RP ID — do not allow caller to override arbitrarily |
| Attestation replay | Spoofing | PingOne validates challenge freshness; challenge expiry logging helps detect this |

---

## Project Constraints (from CLAUDE.md)

- Read `REGRESSION_PLAN.md` §1 before editing any listed files. State what will NOT be broken.
- Minimal diff — name the component/element; do not refactor unrelated code.
- After any `banking_api_ui` edit: `npm run build` in `banking_api_ui/` must exit 0.
- Bug fixes: add entry to `REGRESSION_PLAN.md` §4 per template.
- Do not edit marketing-only pages.
- Plan mode required (3+ steps, auth/session/MFA touching code).
- BFF + security: tokens stay server-side. Worker token must NEVER be returned to browser.
- Files in scope: `mfaService.js`, `mfaTest.js`, `MFATestPage.jsx` — all are in REGRESSION_PLAN.md scope or adjacent to listed files; treat with care.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The `completeFido2Registration` Content-Type is the primary cause of `UNEXPECTED_ERROR` | Root Cause Analysis | Fix may require additional investigation of origin or challenge expiry |
| A2 | `application/vnd.pingidentity.credential.fido2.register+json` is the correct vendor type | Open Questions | Wrong type = continued `UNEXPECTED_ERROR`; executor must verify empirically |
| A3 | The FIDO2 authentication path (`submitFido2Assertion`) is likely functional since it already uses the correct vendor type | Architecture | If auth path also broken, separate Content-Type investigation needed |
| A4 | `GET /api/mfa/test/curl-context` can reuse `_resolveCredentials()` from mfaTest.js | Standard Stack | `_resolveCredentials` is a private function in the same file — yes it can be used inline |

---

## Sources

### Primary (HIGH confidence)

- [VERIFIED: codebase] `banking_api_server/services/mfaService.js` — all function implementations, Content-Type headers confirmed via direct read
- [VERIFIED: codebase] `banking_api_ui/src/components/MFATestPage.jsx` — TestCard component structure (line 1539), all state variables, all callback implementations confirmed via direct read
- [VERIFIED: codebase] `banking_api_server/routes/mfaTest.js` — all routes, `_resolveCredentials` helper confirmed via direct read
- [VERIFIED: codebase] `banking_api_server/services/configStore.js` — `getEffective()` implementation, env fallback map confirmed via direct read
- [VERIFIED: grep] `banking_api_server/` — all vendor content-types in use (`vnd.pingidentity.*`)
- [VERIFIED: codebase] `REGRESSION_PLAN.md` §4 entry 2026-04-22 — prior FIDO2 fix context confirmed

### Secondary (MEDIUM confidence)

- [CITED: web search] PingOne uses `application/vnd.pingidentity.devices.reorder+json` for device ordering — confirms vendor-type pattern
- [CITED: web search] PingOne FIDO2 attestation options (none, direct, audit) — confirms attestation feature exists
- [ASSUMED: analog to assertion.check+json] Attestation completion likely requires a vendor Content-Type by analogy

### Tertiary (LOW confidence)

- [ASSUMED] Candidate Content-Type `application/vnd.pingidentity.credential.fido2.register+json` — not found in official docs during search; must be verified empirically

---

## Metadata

**Confidence breakdown:**
- Standard Stack: HIGH — no new packages; existing patterns well understood from codebase
- Architecture: HIGH — all files read, data flow traced
- FIDO2 Root Cause: MEDIUM-HIGH — Content-Type prime suspect confirmed by asymmetry; exact vendor type is ASSUMED
- Curl Display Pattern: HIGH — TestCard pattern verified, all state variables inventoried
- Pitfalls: HIGH — all from code inspection and regression history

**Research date:** 2026-04-23
**Valid until:** 2026-05-23 (stable domain; PingOne API changes infrequent)
