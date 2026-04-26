# Phase 214: Fix FIDO Registration and Check Authentication — Pattern Map

**Mapped:** 2026-04-23
**Files analyzed:** 3
**Analogs found:** 3 / 3

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `banking_api_server/services/mfaService.js` | service | request-response (PingOne Management API) | `mfaService.js` itself — `submitFido2Assertion` (lines 208-236) | exact (same file, same function shape) |
| `banking_api_server/routes/mfaTest.js` | route | request-response (GET endpoint) | `mfaTest.js` itself — `GET /worker-token` (lines 572-586) | exact (same file, same pattern) |
| `banking_api_ui/src/components/MFATestPage.jsx` | component | request-response + event-driven | `MFATestPage.jsx` itself — `TestCard` (lines 1539-1581) and `SectionApiCalls` (lines 10-24) | exact (same file, established toggle patterns) |

---

## Pattern Assignments

### `banking_api_server/services/mfaService.js` (service, request-response)

**Change scope:** Fix `completeFido2Registration` (lines 456-503) — Content-Type header and error logging.

**Analog — working vendor content-type call:** `submitFido2Assertion` (lines 208-236)

**Vendor Content-Type pattern** (lines 221-231):
```javascript
const { data } = await axios.post(
  url,
  body,
  {
    headers: {
      Authorization: `Bearer ${userAccessToken}`,
      "Content-Type": "application/vnd.pingidentity.assertion.check+json",
    },
    timeout: 15000,
  },
);
```

**Fix target — current broken pattern** (lines 473-479):
```javascript
const resp = await axios.put(url, body, {
  headers: {
    Authorization: `Bearer ${workerToken}`,
    "Content-Type": "application/json",   // ← CHANGE THIS to vendor type
  },
  timeout: 15000,
});
```

**Improved error logging pattern — replace lines 483-490:**

Current (insufficient — misses full pingErr and innerError):
```javascript
console.error(
  "[MFA] completeFido2Registration failed: status=%s code=%s details=%j body=%j",
  err.response?.status,
  pingErr?.code,
  pingErr?.details || pingErr?.message,
  body,
);
```

Target pattern (log full pingErr object so innerError is visible):
```javascript
console.error(
  "[MFA] completeFido2Registration failed: status=%s pingError=%j requestBody=%j",
  err.response?.status,
  pingErr,          // full object — reveals innerError and detail arrays
  body,
);
```

**`_wrapError` helper** (lines 70-83) — used throughout; do not change; `completeFido2Registration` re-throws via this at line 501:
```javascript
function _wrapError(fnName, err) {
  const pingErr = err.response?.data;
  console.error(`[MFA] ${fnName} failed:`, pingErr || err.message);
  const e = new Error(
    pingErr?.message || pingErr?.detail || "MFA operation failed",
  );
  e.status = err.response?.status || 500;
  e.pingError = pingErr;
  const status = err.response?.status;
  if (status === 401) e.code = "token_expired";
  else if (status === 404 || status === 410) e.code = "challenge_expired";
  return e;
}
```

**Logging convention** (lines 464-469) — prefix + structured args, preserve:
```javascript
console.log(
  "[MFA] completeFido2Registration: PUT %s type=FIDO2 attestation.id=%s origin=%s",
  url,
  attestation?.id,
  origin || "(none)",
);
```

---

### `banking_api_server/routes/mfaTest.js` (route, request-response)

**Change scope:** Add `GET /curl-context` route.

**Analog:** `GET /worker-token` (lines 572-586) — same pattern: no body, reads configStore, handles error, returns JSON.

**Route pattern to copy** (lines 572-586):
```javascript
router.get('/worker-token', async (req, res) => {
  try {
    const configStore = require('../services/configStore');
    await configStore.ensureInitialized();
    const token = await oauthService.getAgentClientCredentialsTokenWithExpiry();
    res.json({
      success: true,
      status: token.token ? 'valid' : 'missing',
      expiresAt: token.expiresAt,
    });
  } catch (err) {
    console.error('[MFA Test] Worker token error:', err.message);
    res.json({ success: false, error: err.message });
  }
});
```

**New `GET /curl-context` — adapt the above pattern:**
```javascript
/**
 * GET /api/mfa/test/curl-context
 * Returns env ID, region, and resolved userId for building dynamic PingOne API curls in the UI.
 * Worker token value is NEVER returned — use $WORKER_TOKEN placeholder in curl templates.
 */
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

**`_resolveCredentials` helper** (lines 237-268) — called exactly this way in the new route; reads session or falls back to worker token + env var user:
```javascript
async function _resolveCredentials(req) {
  const overrideUserId = req.body?.userId || req.query?.userId;
  if (overrideUserId) {
    const workerToken = await mfaService.getWorkerToken();
    return { userId: overrideUserId, accessToken: workerToken, ... source: 'worker-override' };
  }
  const sessionUserId = req.session?.user?.id;
  const sessionToken = req.session?.oauthTokens?.accessToken;
  if (sessionUserId && sessionToken) {
    return { userId: sessionUserId, accessToken: sessionToken, ... source: 'session' };
  }
  const workerToken = await mfaService.getWorkerToken();
  return { userId: MFA_TEST_USER_ID, accessToken: workerToken, ... source: 'worker' };
}
```

**Error response shape used by all integration routes** (e.g. line 521):
```javascript
res.status(err.status || 500).json({ success: false, error: err.message, pingError: err.pingError });
```

**Placement:** Insert the new `GET /curl-context` route before `module.exports = router;` at line 588, immediately after `GET /worker-token` at line 586.

---

### `banking_api_ui/src/components/MFATestPage.jsx` (component, request-response + event-driven)

**Change scope:** Add `PingOneCurlCard` component definition; add `curlCtx` state; fetch curl context in `loadConfig` `useEffect`; wire `PingOneCurlCard` instances under each relevant `TestCard` in all three enrollment sections.

#### A. New `PingOneCurlCard` component

**Analog:** `SectionApiCalls` component (lines 10-24) and `TestCard` raw-toggle block (lines 1563-1578).

**`SectionApiCalls` — simplest existing toggle component** (lines 10-24):
```jsx
function SectionApiCalls() {
  const [open, setOpen] = useState(false);
  return (
    <div className="section-api-calls">
      <button
        type="button"
        className="section-api-toggle"
        onClick={() => setOpen((o) => !o)}
      >
        {open ? "▾ Hide API Calls" : "▸ Show API Calls"}
      </button>
      {open && <ApiCallDisplay sessionId="mfa-test" />}
    </div>
  );
}
```

**`TestCard` raw-toggle block — the exact collapsible pre pattern** (lines 1563-1578):
```jsx
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

**New `PingOneCurlCard` — combine both patterns above:**
```jsx
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

**Placement:** Define `PingOneCurlCard` immediately after `TestCard` (after line 1581), before `export default`.

#### B. `curlCtx` state and data fetch

**Analog:** `loadConfig` callback (lines 120-135) and `useEffect` (lines 178-181).

**`loadConfig` pattern** (lines 120-135):
```jsx
const loadConfig = useCallback(async () => {
  try {
    const { data } = await apiClient.get("/api/mfa/test/config");
    if (data.success !== false) {
      setConfig(data);
      setLoading(false);
    } else {
      setError(`Failed to load config: ${data.error}`);
      setLoading(false);
    }
  } catch (err) {
    console.error("Config error:", err);
    setError(`Failed to load config: ${err.message}`);
    setLoading(false);
  }
}, []);
```

**Mount useEffect** (lines 178-181):
```jsx
useEffect(() => {
  loadConfig();
  loadWorkerToken();
}, [loadConfig, loadWorkerToken]);
```

**New curlCtx state declaration** — add alongside existing state declarations (near line 95):
```jsx
const [curlCtx, setCurlCtx] = useState(null);
```

**Fetch curl context — add to the mount `useEffect` or extend `loadConfig`:**
```jsx
// Inside the try block of loadConfig (or a separate loadCurlCtx callback):
const ctxRes = await apiClient.get("/api/mfa/test/curl-context");
setCurlCtx(ctxRes.data);
// Non-fatal: if /curl-context fails, curlCtx stays null; PingOneCurlCard renders nothing
```

#### C. Curl template builder functions

**Pattern:** Inline helper functions (not class methods, not hooks) — consistent with the existing `_wrapError` / `_apiBaseUrl` pattern in services. In the React component, build as plain functions above the JSX return.

```jsx
function buildSmsEnrollInitCurl(ctx) {
  if (!ctx?.envId) return null;
  const base = `https://api.pingone.${ctx.region}/v1/environments/${ctx.envId}`;
  return `curl -X POST \\\n  "${base}/users/${ctx.userId}/devices" \\\n  -H "Authorization: Bearer $WORKER_TOKEN" \\\n  -H "Content-Type: application/json" \\\n  -d '{"type":"SMS","phone":{"number":"+1XXXXXXXXXX"}}'`;
}

function buildFido2InitCurl(ctx) {
  if (!ctx?.envId) return null;
  const base = `https://api.pingone.${ctx.region}/v1/environments/${ctx.envId}`;
  return `curl -X POST \\\n  "${base}/users/${ctx.userId}/devices" \\\n  -H "Authorization: Bearer $WORKER_TOKEN" \\\n  -H "Content-Type: application/json" \\\n  -d '{"type":"FIDO2","nickname":"My Passkey"}'`;
}

function buildFido2CompleteCurl(ctx, deviceId) {
  if (!ctx?.envId) return null;
  const base = `https://api.pingone.${ctx.region}/v1/environments/${ctx.envId}`;
  const devId = deviceId || '{DEVICE_ID}';
  // Content-Type header must be updated to match whatever fix is applied in mfaService.js
  return `curl -X PUT \\\n  "${base}/users/${ctx.userId}/devices/${devId}" \\\n  -H "Authorization: Bearer $WORKER_TOKEN" \\\n  -H "Content-Type: application/json" \\\n  -d '{"type":"FIDO2","attestation":{...},"origin":"${window.location.origin}"}'`;
}
```

#### D. `PingOneCurlCard` placement in JSX — follow existing `TestCard` placement

**Analog — TestCard placement for SMS init** (lines 1014-1020):
```jsx
<TestCard
  title="Enroll SMS Device"
  status={enrollSmsInitStatus}
  error={enrollSmsInitError}
  onTest={testEnrollSmsInit}
  rawResult={rawEnrollSmsInit}
/>
```

**New pattern — `PingOneCurlCard` immediately after each `TestCard`:**
```jsx
<TestCard
  title="Enroll SMS Device"
  status={enrollSmsInitStatus}
  error={enrollSmsInitError}
  onTest={testEnrollSmsInit}
  rawResult={rawEnrollSmsInit}
/>
<PingOneCurlCard
  label="POST — Enroll SMS Device (PingOne)"
  curlCommand={buildSmsEnrollInitCurl(curlCtx)}
/>
```

**TestCard placement for FIDO2 init** (lines 1088-1094):
```jsx
<TestCard
  title="Initiate FIDO2 Enrollment"
  status={fidoEnrollInitStatus}
  error={fidoEnrollInitError}
  onTest={testFidoEnrollInit}
  rawResult={rawFidoEnrollInit}
/>
```

**New pattern — FIDO2 init curl (device ID not yet available):**
```jsx
<PingOneCurlCard
  label="POST — Initiate FIDO2 Enrollment (PingOne)"
  curlCommand={buildFido2InitCurl(curlCtx)}
/>
```

**TestCard for FIDO2 complete** (lines 1134-1141 — conditionally rendered after `fidoEnrollData` is set):
```jsx
{fidoEnrollData?.publicKeyCredentialCreationOptions && (
  <TestCard
    title="Complete FIDO2 Registration"
    status={fidoEnrollCompleteStatus}
    error={fidoEnrollCompleteError}
    onTest={testFidoEnrollComplete}
    rawResult={rawFidoEnrollComplete}
  />
)}
```

**New pattern — FIDO2 complete curl (device ID from `fidoEnrollData`):**
```jsx
{fidoEnrollData?.publicKeyCredentialCreationOptions && (
  <>
    <TestCard ... />
    <PingOneCurlCard
      label="PUT — Complete FIDO2 Registration (PingOne)"
      curlCommand={buildFido2CompleteCurl(curlCtx, fidoEnrollData?.id)}
    />
  </>
)}
```

---

## Shared Patterns

### Toggle / Collapsible Display
**Source:** `MFATestPage.jsx` lines 1539-1581 (`TestCard`) and lines 10-24 (`SectionApiCalls`)
**Apply to:** New `PingOneCurlCard` component
- `useState(false)` for open/closed
- `type="button"` on toggle button (prevents form submit)
- CSS classes `test-card-raw`, `test-card-raw-toggle`, `test-card-raw-json` — reuse for visual consistency
- Guard `if (!curlCommand) return null` so component is inert when curl context not yet loaded

### Error Handling in Routes
**Source:** `mfaTest.js` line 521 (pattern repeated in every integration route)
**Apply to:** New `GET /curl-context` route
```javascript
res.status(err.status || 500).json({ success: false, error: err.message, pingError: err.pingError });
```

### PingOne Vendor Content-Type
**Source:** `mfaService.js` line 227 (`submitFido2Assertion`)
**Apply to:** `completeFido2Registration` Content-Type fix
```javascript
"Content-Type": "application/vnd.pingidentity.assertion.check+json"
```
The exact vendor type for FIDO2 attestation completion is unknown — the executor must determine it empirically. The `submitFido2Assertion` line above is the structural model to copy; only the string value changes.

### `configStore.getEffective()` Access Pattern
**Source:** `mfaTest.js` lines 573-575 (`GET /worker-token`)
**Apply to:** New `GET /curl-context` route
```javascript
const configStore = require('../services/configStore');
await configStore.ensureInitialized();
const envId = configStore.getEffective('pingone_environment_id') || '';
const region = configStore.getEffective('pingone_region') || 'com';
```

### `apiClient.get` in useCallback
**Source:** `MFATestPage.jsx` lines 120-135 (`loadConfig`)
**Apply to:** curl context fetch in `loadConfig` or separate `loadCurlCtx`
- Wrap in `try/catch`; non-fatal failure is acceptable (curl card simply does not render)
- Call from the existing mount `useEffect`

### Security: No Token in Curl Output
**Source:** Not an existing code pattern — an explicit constraint from D-03 (Pitfall 4 in RESEARCH.md)
**Apply to:** All curl template builder functions
- Always use the literal string `$WORKER_TOKEN` in the `Authorization` header string
- Never interpolate any actual token value, even partially

---

## No Analog Found

All three files are being modified (not created from scratch) and have close analogs within themselves. No files in this phase lack an analog.

---

## Metadata

**Analog search scope:** `banking_api_server/services/mfaService.js`, `banking_api_server/routes/mfaTest.js`, `banking_api_ui/src/components/MFATestPage.jsx`
**Files scanned:** 3 primary files (all analogs are within the same files being modified)
**Pattern extraction date:** 2026-04-23
