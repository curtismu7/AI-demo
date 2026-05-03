# Phase 265: Demo data page — Create demo user with may_act, P1MFA registration — Research

**Researched:** 2026-05-03
**Domain:** PingOne Management API — user provisioning, password setting, may_act PATCH, email OTP MFA enrollment; React DemoDataPage UI extension
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Create a brand-new PingOne user via BFF worker token (`POST /environments/{envId}/users`). Do NOT modify the currently logged-in user.
- **D-02:** Email is user-specified — an input field in the UI accepts the email to create. No auto-generated email.
- **D-03:** Password is fixed (`Demo1234!` or a clearly documented constant). The result card shows both email and password so the presenter can copy and log in immediately.
- **D-04:** Email OTP device — enroll using the user's email address (same as the login email). No extra phone number input needed.
- **D-05:** MFA enrollment is automatic and part of the single provisioning flow. One button creates user + sets may_act + enrolls email OTP. The presenter never clicks twice.
- **D-06:** Use the existing `mfa.js` enrollment pattern. Since the new user has no session, the BFF must use a worker token (not user access token) to call PingOne MFA enrollment on their behalf.
- **D-07:** `mayAct` value is auto-detected at provision time: BFF reads `PINGONE_MCP_TOKEN_EXCHANGER_CLIENT_ID` from `configStore.getEffective()` and sends `{ sub: "<clientId>" }` as the attribute body. Attribute name is camelCase `mayAct` (PingOne attribute), body shape is `{ sub: clientId }` — verified against working `demoScenario.patchMayAct()` in the codebase.
- **D-08:** Stored as a JSON object (not a stringified JSON string) on the PingOne user attribute `mayAct`. The PATCH body to PingOne is `{ mayAct: { sub: "<clientId>" } }`. This matches the shape the existing may_act toggle writes and the BFF token exchange flow reads.
- **D-09:** If `PINGONE_MCP_TOKEN_EXCHANGER_CLIENT_ID` is not configured, show a warning in the step log ("may_act not set — MCP token exchanger client ID not configured") but continue provisioning.
- **D-10:** New top section "Create Demo User" above all existing sections in DemoDataPage. The section heading is `demo-data-section__heading` style.
- **D-11:** Input field for email + a "Provision" button. Disable the button while provisioning is in progress.
- **D-12:** Inline step log: each provisioning step appears as it completes with a status icon (✓ / ✗). Steps: "Create PingOne user", "Set may_act attribute", "Enroll email OTP MFA". Credentials (email + password) shown at the bottom of the step log on success.
- **D-13:** On success, show a copyable credential card with the new user's email and password. Include a note: "Sign out and log back in as this user to demo delegation."
- **D-14:** On any step failure, show the error inline next to the failed step. Subsequent steps that depend on the failed step are skipped with "⚠ Skipped" label.
- **D-15:** New route file `banking_api_server/routes/demoProvisioning.js` — POST `/api/demo/provision-user`. Uses worker token (same `getManagementToken()` pattern from `pingone-api-calls` skill).
- **D-16:** Route calls PingOne Management API in sequence: (1) POST /users to create user, (2) PATCH /users/{id} to set mayAct, (3) POST /users/{id}/devices to enroll email OTP.
- **D-17:** Route returns a single JSON object with step results array: `{ steps: [{ name, status, detail }], credentials: { email, password } }`.
- **D-18:** Route requires admin session (`requireSession` + admin check, same as other admin routes). The demo provisioning should only be accessible to logged-in admins/presenters.

### Claude's Discretion

- Exact PingOne API endpoint path for MFA device enrollment with a worker token (researcher to confirm)
- Whether PingOne allows setting a custom password directly on user creation or requires a separate PATCH
- CSS class names for the new section (follow existing `demo-data-*` naming convention)
- Error message copy

### Deferred Ideas (OUT OF SCOPE)

- Bulk provisioning (create multiple users at once)
- Delete / cleanup button to remove provisioned demo users
- TOTP / SMS MFA enrollment
- Auto-generated email format
</user_constraints>

---

## Summary

This phase adds a self-contained "Create Demo User" provisioning section to the top of DemoDataPage. The UI sends a single POST to a new BFF route (`/api/demo/provision-user`) which orchestrates three PingOne Management API calls in sequence: create user, PATCH mayAct attribute, and enroll email OTP MFA device — all using a worker (client_credentials) token.

All three PingOne API calls are already proven in the codebase. `pingOneUserService.createPingOneUser` shows the exact user-create + password-set sequence. `mfaService.enrollEmailDevice` shows the email OTP enrollment using a worker token. `demoScenario.patchMayAct` shows the mayAct PATCH body. The new route is a lightweight orchestration wrapper that reuses these proven calls.

The key implementation insight: password setting is a **separate** `PUT /users/{id}/password` call after user creation — it cannot be set in the POST body. Email OTP enrollment via worker token creates the device as `ACTIVE` immediately (no OTP confirmation loop required). The mayAct attribute stored on the PingOne user is `mayAct` (camelCase, not `may_act`) and the body is `{ sub: "<clientId>" }`, matching the existing toggle in demoScenario.js.

**Primary recommendation:** Implement `demoProvisioning.js` as a thin orchestrator that imports `getManagementToken` from `pingOneClientService`, calls `mfaService.enrollEmailDevice` (worker-token path already implemented), and PATCHes mayAct using the same body shape as `demoScenario.patchMayAct`. Do not build a new PingOne API client — reuse existing services.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Provisioning UI (email input, step log, credential card) | Frontend/Browser | — | React component in DemoDataPage.js |
| POST /api/demo/provision-user | API/BFF | — | Admin-only route, worker token must stay server-side |
| PingOne user creation | API/BFF → PingOne Management | — | Worker token held server-side |
| PingOne password set | API/BFF → PingOne Management | — | Separate PUT, never exposed to browser |
| PingOne mayAct PATCH | API/BFF → PingOne Management | — | Extends existing demoScenario.patchMayAct pattern |
| PingOne email OTP enrollment | API/BFF → PingOne Management | — | Worker-token path in mfaService.enrollEmailDevice |
| Config lookup (token exchanger client ID) | API/BFF | — | configStore.getEffective, never process.env in route |

---

## Standard Stack

### Core (all already in project — no new installs)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| express | ~4.x | Route handler | Project standard |
| axios | ~1.x | PingOne API HTTP calls | Used in all existing BFF services |
| configStore | project | Runtime config, never process.env | Project pattern (CLAUDE.md) |
| mfaService | project | Email OTP enrollment (worker-token path already exists) | Reuse, don't duplicate |
| pingOneClientService | project | `getManagementToken()` | Exact pattern used by demoScenario.js |

**Installation:** No new packages required. All dependencies are already in `banking_api_server/package.json`.

---

## Architecture Patterns

### System Architecture Diagram

```
DemoDataPage.js (React)
  [email input] + [Provision button]
        │
        │  POST /api/demo/provision-user  { email }
        ▼
demoProvisioning.js (BFF route)
  │  requireAdmin middleware
  │
  ├─ Step 1: POST /v1/environments/{envId}/users    ← getManagementToken()
  │          → userId returned
  │
  ├─ Step 1b: PUT /v1/environments/{envId}/users/{id}/password
  │           body: { value: "Demo1234!" }
  │
  ├─ Step 2: PATCH /v1/environments/{envId}/users/{id}  ← same worker token
  │          body: { mayAct: { sub: "<mcpExchangerClientId>" } }
  │          (skip + warn if PINGONE_MCP_TOKEN_EXCHANGER_CLIENT_ID not set)
  │
  ├─ Step 3: POST /v1/environments/{envId}/users/{id}/devices   ← mfaService.enrollEmailDevice(userId, email)
  │          body: { type: "EMAIL", email }
  │          (uses worker token → device created ACTIVE, no OTP loop)
  │
  └─ Response: { steps: [...], credentials: { email, password } }
        │
        ▼
DemoDataPage.js
  Renders step log (✓/✗ per step) + credential card on success
```

### Recommended Project Structure

No new directories. New files only:
```
banking_api_server/routes/
└── demoProvisioning.js     # NEW: POST /api/demo/provision-user

banking_api_ui/src/components/
├── DemoDataPage.js         # MODIFIED: add CreateDemoUser section at top of JSX
└── DemoDataPage.css        # MODIFIED: add CSS classes for step log + credential card
```

### Pattern 1: PingOne User Creation (worker token)

**What:** POST to `/v1/environments/{envId}/users` with name + email + username + enabled flag, then PUT password separately.

**Source:** Verified in `banking_api_server/services/pingOneUserService.js` lines 161-245 [VERIFIED: codebase]

```javascript
// Source: pingOneUserService.js createPingOneUser (verified)
// Step 1: Create user
const userPayload = {
  username: email,  // use email as username (simplest for demo)
  email,
  name: { given: firstName, family: lastName },
  enabled: true,
};
const user = await axios.post(`${apiBase}/users`, userPayload, {
  headers: { Authorization: `Bearer ${workerToken}`, 'Content-Type': 'application/json' },
  timeout: 10000,
});
const userId = user.data.id;

// Step 1b: Set password (SEPARATE call — cannot be set in POST body)
await axios.put(`${apiBase}/users/${userId}/password`, { value: DEMO_PASSWORD }, {
  headers: { Authorization: `Bearer ${workerToken}`, 'Content-Type': 'application/json' },
  timeout: 10000,
});
```

**Critical:** Password CANNOT be set in the POST /users body. It requires a separate `PUT /users/{id}/password` with `{ value: "..." }`. [VERIFIED: pingOneUserService.js line 252-255]

### Pattern 2: mayAct PATCH (worker token)

**What:** PATCH `/v1/environments/{envId}/users/{id}` with top-level `mayAct` property. The attribute is stored as `mayAct` (camelCase) in PingOne, and the PATCH body uses `{ sub: "<clientId>" }`.

**Source:** Verified in `banking_api_server/routes/demoScenario.js` lines 580-595 [VERIFIED: codebase]

```javascript
// Source: demoScenario.patchMayAct (verified — lines 580-595)
const mcpExchangerClientId = configStore.getEffective('pingone_mcp_token_exchanger_client_id')
  || configStore.getEffective('PINGONE_MCP_TOKEN_EXCHANGER_CLIENT_ID');

const patchBody = {
  mayAct: mcpExchangerClientId ? { sub: mcpExchangerClientId } : null,
};

await axios.patch(`${apiBase}/users/${userId}`, patchBody, {
  headers: { Authorization: `Bearer ${workerToken}`, 'Content-Type': 'application/json' },
  timeout: 12000,
});
```

**Critical:** The attribute name is `mayAct` (camelCase), not `may_act`. The CONTEXT.md D-07 says to use `PINGONE_MCP_TOKEN_EXCHANGER_CLIENT_ID` — the configStore key for this is `pingone_mcp_token_exchanger_client_id` (lowercase, with fallback to `PINGONE_MCP_TOKEN_EXCHANGER_CLIENT_ID`). Confirmed in `configStore.js` line 527 [VERIFIED: codebase].

**The body uses `{ sub: "<clientId>" }` not `{ client_id: "<clientId>" }`** — the existing toggle in demoScenario writes `{ sub: bffClientId }` (line 585). D-08 says "stringified JSON" but the actual PingOne attribute is stored as an object — the PATCH sends it as a JSON object, not a string. The `may_act` claim that appears in the token is what PingOne maps from this attribute via an attribute mapping. [VERIFIED: codebase — demoScenario.js line 585]

### Pattern 3: Email OTP Enrollment (worker token path)

**What:** POST to `/v1/environments/{envId}/users/{id}/devices` with `{ type: "EMAIL", email }` using a worker token. When using a worker token (not user access token), PingOne creates the device as `ACTIVE` immediately — no OTP confirmation round-trip required.

**Source:** Verified in `banking_api_server/services/mfaService.js` `enrollEmailDevice` function, lines 327-358 [VERIFIED: codebase]

```javascript
// Source: mfaService.enrollEmailDevice (verified — lines 327-358)
// Call with worker token directly. The function already handles this path.
const device = await mfaService.enrollEmailDevice(userId, email);
// device.status will be "ACTIVE" when called with worker token
// device.id, device.type, device.email are returned
```

**The `mfaService.enrollEmailDevice(userId, email)` function already uses a worker token internally** (it calls `_getWorkerToken()` — line 329). No modification to mfaService is needed — call it directly with just userId and email.

**Contrast with SMS:** The SMS enrollment using user token sends an OTP and returns `ACTIVATION_REQUIRED`. Email OTP with worker token creates `ACTIVE` immediately. [VERIFIED: mfaService.js lines 370-424, comment lines 364-368]

### Pattern 4: Admin session auth for new routes

**What:** All admin-only BFF routes use `requireAdmin` middleware from `../middleware/auth`.

**Source:** Verified in `banking_api_server/routes/adminManagement.js` and `banking_api_server/routes/admin.js` [VERIFIED: codebase]

```javascript
// Source: adminManagement.js (verified)
const { requireAdmin } = require('../middleware/auth');
router.post('/', requireAdmin, async (req, res) => { ... });
```

**In server.js**, the new route mounts as:
```javascript
// In server.js, add after existing /api/demo/* registrations (line ~957):
const demoProvisioningRoutes = require('./routes/demoProvisioning');
app.use('/api/demo', demoProvisioningRoutes);
// Route inside demoProvisioning.js uses requireAdmin per-handler
```

### Pattern 5: DemoDataPage section structure

**What:** Each section in DemoDataPage follows a consistent JSX pattern with section heading and CSS class names.

**Source:** Verified in `banking_api_ui/src/components/DemoDataPage.js` lines 835+, `DemoDataPage.css` lines 90, 113, 502+ [VERIFIED: codebase]

```jsx
// Source: DemoDataPage.js existing sections (verified pattern)
<section className="section demo-data-section" aria-labelledby="demo-provision-user-heading">
  <h2 className="demo-data-section__heading" id="demo-provision-user-heading">
    Create Demo User
  </h2>
  <p className="demo-data-hint">...</p>
  {/* input + button */}
  {/* step log */}
  {/* credential card */}
</section>
```

### Pattern 6: apiClient usage from DemoDataPage

**What:** `DemoDataPage.js` imports and uses `apiClient` (axios-based singleton with credentials + spinner) for POST calls.

**Source:** Verified — `DemoDataPage.js` line 8: `import apiClient from '../services/apiClient'` [VERIFIED: codebase]

```javascript
// Source: DemoDataPage.js (verified — e.g. line 218 handleSetMayAct)
const { data } = await apiClient.post('/api/demo/provision-user', { email });
```

### Anti-Patterns to Avoid

- **Using `process.env` directly in the route file:** All config must come from `configStore.getEffective()`. [CLAUDE.md rule]
- **Setting password in the POST /users body:** PingOne does not accept `password` in the create body — always a separate `PUT /users/{id}/password`.
- **Calling `mfaService.enrollEmailDevice` with a user access token:** Don't pass a user token — the function gets its own worker token internally. Just call `enrollEmailDevice(userId, email)`.
- **Using `may_act` (snake_case) as the PATCH attribute key:** The correct key is `mayAct` (camelCase). PingOne maps this to `may_act` in tokens via an app attribute mapping.
- **Using `{ client_id: ... }` in the mayAct body:** The correct shape is `{ sub: "<clientId>" }` — confirmed from the working demoScenario.patchMayAct.
- **Placing the new section anywhere other than the top of the DemoDataPage JSX:** D-10 specifies it must be the first section above all existing sections.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Worker token acquisition | Custom client_credentials flow | `getManagementToken()` from `pingOneClientService` | Already handles auth method variants (basic/post/jwt) |
| Email OTP enrollment | Direct axios call to /devices | `mfaService.enrollEmailDevice(userId, email)` | Already proven; handles worker token, error wrapping, debug info |
| mayAct PATCH | New PingOne client | Direct axios.patch with body shape from demoScenario.patchMayAct | Simple one-liner; pattern fully verified |
| PingOne error surfacing | Custom error handler | Follow demoScenario.js pattern: `err.response?.data?.message \|\| err.message` | Consistent with rest of BFF |

---

## Common Pitfalls

### Pitfall 1: Password must be set via separate PUT, not POST body
**What goes wrong:** Sending `password` in the `POST /users` body results in a 400 or PingOne ignores it — the user is created with no usable password.
**Why it happens:** PingOne's Management API separates identity creation from credential management.
**How to avoid:** Always call `PUT /users/{id}/password` with `{ value: "..." }` after user creation.
**Warning signs:** User created (201) but login with the fixed password fails.

### Pitfall 2: mayAct attribute key is camelCase `mayAct`, not `may_act`
**What goes wrong:** PATCHing `{ may_act: { sub: "..." } }` silently creates a different attribute or fails validation.
**Why it happens:** PingOne schema extension attributes use camelCase names in the API.
**How to avoid:** Use `{ mayAct: { sub: clientId } }` — match exactly what demoScenario.patchMayAct sends (line 585).
**Warning signs:** PATCH succeeds (200) but the diagnose endpoint reports `mayAct attribute is null or missing`.

### Pitfall 3: mfaService._getWorkerToken uses a separate credential chain
**What goes wrong:** The new route's worker token (from `getManagementToken`) and the mfaService's worker token (from `_getWorkerToken`) use different credential keys. If only one set of credentials is configured, one path may fail.
**Why it happens:** `pingOneClientService.getManagementToken` uses `PINGONE_MGMT_CLIENT_ID/SECRET`. `mfaService._getWorkerToken` falls back to `pingone_worker_token_client_id` → `pingone_mgmt_client_id` → `PINGONE_MANAGEMENT_CLIENT_ID`. These overlap but are not identical.
**How to avoid:** Since `enrollEmailDevice` calls `_getWorkerToken()` internally, just call it directly — don't try to share a token. Both will use the same underlying config in the typical setup. No action needed unless the environment has mismatched credentials.
**Warning signs:** Step 1 (user create) succeeds but Step 3 (MFA enroll) fails with `PingOne worker credentials not configured`.

### Pitfall 4: DemoDataPage section position
**What goes wrong:** New section is placed below existing sections, causing the regression guard for DemoDataPage to fail because the page structure changed.
**Why it happens:** The JSX return has existing `<section>` elements; inserting at the wrong position breaks presentation order.
**How to avoid:** Insert the `<section className="section demo-data-section">` block immediately after the `persistenceNote` banner block and before the `storageBackend` section (approximately line 834). This places it at the visual top of the scrollable sections.
**Warning signs:** `npm run build` passes but the Create Demo User section appears in the middle of the page.

### Pitfall 5: Email OTP status is ACTIVE (not ACTIVATION_REQUIRED) with worker token
**What goes wrong:** Route validates device status === 'ACTIVE' and fails if it's 'ACTIVATION_REQUIRED'.
**Why it happens:** When using a user access token for enrollment, PingOne returns `ACTIVATION_REQUIRED` and sends an OTP. Worker token skips this — device is `ACTIVE` immediately.
**How to avoid:** The step log for "Enroll email OTP MFA" should treat any successful (non-error) response from `enrollEmailDevice` as success. Do not require `status === 'ACTIVE'` check — just absence of thrown error.

### Pitfall 6: `requireAdmin` vs `authenticateToken` middleware
**What goes wrong:** Using only `authenticateToken` allows non-admin users to provision PingOne users.
**Why it happens:** `authenticateToken` validates session but does not check role.
**How to avoid:** Use `requireAdmin` (which is imported alongside `authenticateToken` from `../middleware/auth`). The admin routes in `adminManagement.js` use `requireAdmin` directly on each handler. [VERIFIED: adminManagement.js]

---

## Code Examples

### New Route Skeleton: demoProvisioning.js

```javascript
// banking_api_server/routes/demoProvisioning.js
'use strict';
const express = require('express');
const axios = require('axios');
const router = express.Router();
const { requireAdmin } = require('../middleware/auth');
const { getManagementToken } = require('../services/pingOneClientService');
const mfaService = require('../services/mfaService');
const configStore = require('../services/configStore');

const DEMO_PASSWORD = 'Demo1234!';

router.post('/provision-user', requireAdmin, async (req, res) => {
  const { email } = req.body;
  if (!email || typeof email !== 'string') {
    return res.status(400).json({ error: 'invalid_request', message: 'email is required' });
  }

  const envId  = configStore.getEffective('pingone_environment_id') || configStore.getEffective('PINGONE_ENVIRONMENT_ID');
  const region = configStore.getEffective('pingone_region') || configStore.getEffective('PINGONE_REGION') || 'com';
  const apiBase = `https://api.pingone.${region}/v1/environments/${envId}`;

  const steps = [];
  let userId = null;

  // ── Step 1: Create PingOne user ────────────────────────────────────────────
  let workerToken;
  try {
    workerToken = await getManagementToken();
  } catch (err) {
    return res.status(503).json({ error: 'management_token_failed', message: err.message });
  }

  try {
    const resp = await axios.post(`${apiBase}/users`, {
      username: email,
      email,
      name: { given: 'Demo', family: 'User' },
      enabled: true,
    }, {
      headers: { Authorization: `Bearer ${workerToken}`, 'Content-Type': 'application/json' },
      timeout: 10000,
    });
    userId = resp.data.id;

    // Set password (separate call — cannot be set in POST body)
    await axios.put(`${apiBase}/users/${userId}/password`, { value: DEMO_PASSWORD }, {
      headers: { Authorization: `Bearer ${workerToken}`, 'Content-Type': 'application/json' },
      timeout: 10000,
    });
    steps.push({ name: 'Create PingOne user', status: 'ok', detail: `userId: ${userId}` });
  } catch (err) {
    const detail = err.response?.data?.message || err.message;
    steps.push({ name: 'Create PingOne user', status: 'error', detail });
    steps.push({ name: 'Set may_act attribute', status: 'skipped' });
    steps.push({ name: 'Enroll email OTP MFA', status: 'skipped' });
    return res.json({ steps, credentials: null });
  }

  // ── Step 2: Set mayAct attribute ───────────────────────────────────────────
  const mcpClientId = configStore.getEffective('pingone_mcp_token_exchanger_client_id')
    || configStore.getEffective('PINGONE_MCP_TOKEN_EXCHANGER_CLIENT_ID');

  if (!mcpClientId) {
    steps.push({ name: 'Set may_act attribute', status: 'warning', detail: 'Skipped — PINGONE_MCP_TOKEN_EXCHANGER_CLIENT_ID not configured' });
  } else {
    try {
      await axios.patch(`${apiBase}/users/${userId}`, {
        mayAct: { sub: mcpClientId },
      }, {
        headers: { Authorization: `Bearer ${workerToken}`, 'Content-Type': 'application/json' },
        timeout: 12000,
      });
      steps.push({ name: 'Set may_act attribute', status: 'ok', detail: `mayAct.sub = ${mcpClientId}` });
    } catch (err) {
      const detail = err.response?.data?.message || err.message;
      steps.push({ name: 'Set may_act attribute', status: 'error', detail });
      // Continue to MFA step
    }
  }

  // ── Step 3: Enroll email OTP MFA ──────────────────────────────────────────
  try {
    const device = await mfaService.enrollEmailDevice(userId, email);
    steps.push({ name: 'Enroll email OTP MFA', status: 'ok', detail: `deviceId: ${device.id}` });
  } catch (err) {
    const detail = err.message;
    steps.push({ name: 'Enroll email OTP MFA', status: 'error', detail });
  }

  return res.json({
    steps,
    credentials: { email, password: DEMO_PASSWORD },
  });
});

module.exports = router;
```

### server.js registration (two lines to add)

```javascript
// In banking_api_server/server.js, near line 957 (after existing /api/demo/* registrations):
const demoProvisioningRoutes = require('./routes/demoProvisioning');
app.use('/api/demo', demoProvisioningRoutes);
```

### DemoDataPage.js — new section placement

The new section must be the **first** `<section className="section demo-data-section">` in the JSX return. Current first section is the `storageBackend` conditional section (~line 834). Insert above it:

```jsx
{/* ── Create Demo User ────────────────────────────────────── */}
<section className="section demo-data-section" aria-labelledby="demo-provision-user-heading">
  <h2 className="demo-data-section__heading" id="demo-provision-user-heading">
    Create Demo User
  </h2>
  <p className="demo-data-hint">
    Provision a new PingOne user with <code>may_act</code> attribute and email OTP MFA pre-enrolled.
    After creation, sign out and log in as this user to demo delegation.
  </p>
  {/* email input + Provision button */}
  {/* step log (renders once provisioning starts) */}
  {/* credential card on success */}
</section>
```

### DemoDataPage.css — new CSS classes

Follow `demo-data-*` naming convention. New classes needed:

```css
/* ── Create Demo User section ─────────────────────────── */

.demo-data-provision__row {
  display: flex;
  gap: 0.5rem;
  align-items: flex-end;
  margin-bottom: 1rem;
}

.demo-data-provision__input {
  flex: 1;
  padding: 0.55rem 0.65rem;
  border: 1px solid #CCCCCC;
  border-radius: 8px;
  font-size: 0.95rem;
}

.demo-data-step-log {
  margin: 0.75rem 0;
  padding: 0.75rem 1rem;
  border: 1px solid var(--app-border, #e5e7eb);
  border-radius: 8px;
  background: #f9fafb;
}

.demo-data-step-log__item {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  font-size: 0.85rem;
  padding: 0.2rem 0;
  color: #374151;
}

.demo-data-step-log__icon--ok    { color: #16a34a; }
.demo-data-step-log__icon--error { color: #dc2626; }
.demo-data-step-log__icon--skip  { color: #d97706; }
.demo-data-step-log__icon--pending { color: #6b7280; }

.demo-data-credential-card {
  margin-top: 0.75rem;
  padding: 0.75rem 1rem;
  background: #f0fdf4;
  border: 1px solid #86efac;
  border-radius: 8px;
  font-size: 0.85rem;
}

.demo-data-credential-card__note {
  margin-top: 0.5rem;
  color: #374151;
  font-style: italic;
}
```

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|-----------------|--------|
| Admin must manually create user in PingOne console | One-click provisioning from Demo Data page | Presenter-friendly; no PingOne console access required |
| Email OTP enrollment requires user session + OTP confirmation | Worker token enrollment creates ACTIVE device directly | No OTP round-trip; instant provisioning |
| mayAct must be set via existing toggle (modifies currently logged-in user) | New section provisions a fresh user with mayAct pre-set | Non-destructive; logged-in admin session unaffected |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Password set via `PUT /users/{id}/password` with body `{ value: "..." }` is accepted by PingOne with a worker token | Code Examples, Pitfall 1 | `[VERIFIED: pingOneUserService.js lines 252-255]` — confirmed by existing working implementation |
| A2 | Email OTP enrollment via worker token creates device as ACTIVE immediately (no OTP loop) | Pitfall 5, Code Examples | `[VERIFIED: mfaService.js lines 364-368]` — comment explicitly documents this behavior |
| A3 | `mayAct` PATCH body shape `{ sub: clientId }` is correct | Pattern 2 | `[VERIFIED: demoScenario.js line 585]` — confirmed from working patchMayAct |
| A4 | `PINGONE_MCP_TOKEN_EXCHANGER_CLIENT_ID` configStore key is `pingone_mcp_token_exchanger_client_id` (lowercase) | Pattern 2 | `[VERIFIED: configStore.js line 527]` |
| A5 | New section must be inserted before storageBackend section at ~line 834 to be "top of page" | Pitfall 4 | `[VERIFIED: DemoDataPage.js lines 834-835]` — storageBackend is first current section |

**This table is nearly empty of ASSUMED items — all critical claims were verified against the codebase in this session.**

---

## Open Questions (RESOLVED)

1. **`name.given` / `name.family` vs `givenName` / `familyName` in POST /users body**
   - What we know: `pingOneUserService.js` sends `name: { given: firstName, family: lastName }` (line 192)
   - What's unclear: PingOne API docs may use `givenName`/`familyName` at top level
   - Recommendation: Use the `name: { given, family }` shape since it's already proven working in this codebase.
   - **RESOLVED:** Use `name: { given, family }` — proven working pattern in this codebase.

2. **Population for new demo users**
   - What we know: `pingOneUserService` optionally sets `population.id` for admin users (line 197-199)
   - What's unclear: Should demo provisioned users go into a specific population?
   - Recommendation: Omit `population` from the POST body to use the default population. CONTEXT.md does not specify a population requirement.
   - **RESOLVED:** Omit `population` — use default population, no requirement in CONTEXT.md.

3. **Does the DemoDataPage.js sticky nav need updating?**
   - What we know: There is a sticky `demo-data-page__nav` sidebar with jump links (Phase 110)
   - What's unclear: Whether the nav items are hardcoded or data-driven
   - Recommendation: If nav is hardcoded, add a "Create Demo User" link at the top. Check DemoDataPage.js nav rendering logic before planning the nav update.
   - **RESOLVED:** Plan 02 Task 1 includes a sub-step to add the nav link — executor reads DemoDataPage.js nav section and adds the jump link.

---

## Environment Availability

Step 2.6 SKIPPED for external tool dependencies — all calls are HTTP to PingOne Management API using existing axios/configStore infrastructure already running. No new CLI tools, runtimes, or local services required.

Required configuration (existing, not new):
| Dependency | Required By | Available | Notes |
|------------|------------|-----------|-------|
| PingOne Management API credentials | All 3 steps | Checked at runtime | `PINGONE_MGMT_CLIENT_ID` + `PINGONE_MGMT_CLIENT_SECRET` via configStore |
| `PINGONE_ENVIRONMENT_ID` | All 3 steps | Checked at runtime | Existing config |
| `PINGONE_MCP_TOKEN_EXCHANGER_CLIENT_ID` | Step 2 (mayAct) | Optional — warns if missing | D-09: warn but continue |

---

## Validation Architecture

Nyquist validation status: `.planning/config.json` not checked for this phase — applying default (enabled).

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Jest (CRA default) |
| Config file | `banking_api_ui/package.json` (CRA), `banking_api_server/jest.config.js` |
| Quick run command | `cd banking_api_ui && CI=true npm test -- --testPathPattern=DemoDataPage --watchAll=false` |
| Full suite command | `cd banking_api_ui && CI=true npm test --watchAll=false` |
| Build verification | `cd banking_api_ui && npm run build` (exit 0 required per CLAUDE.md) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| D-11 | Email input + Provision button render | unit | `CI=true npm test -- --testPathPattern=DemoDataPage` | ✅ `DemoDataPage.test.js` exists |
| D-12 | Step log renders after provision | unit | same | ✅ existing test file |
| D-13 | Credential card renders on success | unit | same | ✅ existing test file |
| D-15 | POST /api/demo/provision-user route | unit | `cd banking_api_server && npm test -- --testPathPattern=demoProvisioning` | ❌ Wave 0 — new file |
| D-18 | requireAdmin blocks non-admin | unit | same | ❌ Wave 0 — new file |

### Sampling Rate

- **Per task commit:** `cd banking_api_ui && CI=true npm run build` (exit 0)
- **Per wave merge:** `cd banking_api_ui && CI=true npm test --watchAll=false`
- **Phase gate:** Build exit 0 + no new test failures before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `banking_api_server/routes/__tests__/demoProvisioning.test.js` — covers D-15, D-18 (POST route, admin guard, step result shape)
- [ ] Existing `DemoDataPage.test.js` must be updated to mock `apiClient.post('/api/demo/provision-user')` — add test cases for step log rendering and credential card

*(Existing test infrastructure covers the UI framework; only the new route file needs a new test file)*

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | Route is admin-session-gated, no new auth mechanism |
| V3 Session Management | No | Uses existing session; no new session state |
| V4 Access Control | Yes | `requireAdmin` middleware (verified existing pattern) |
| V5 Input Validation | Yes | Email validated server-side before PingOne call |
| V6 Cryptography | No | Fixed password constant — no crypto needed in this phase |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Unauthenticated user provisioning | Elevation of Privilege | `requireAdmin` on POST /api/demo/provision-user |
| Email injection in PingOne API call | Tampering | Validate email format server-side (regex or existing pattern from selfServiceUsers.js) |
| Fixed demo password exposure in logs | Information Disclosure | Never log `DEMO_PASSWORD` constant; log only userId and email |
| Worker token leakage | Information Disclosure | Token obtained per-request, never serialized to response |

---

## Project Constraints (from CLAUDE.md)

| Constraint | Applies To |
|------------|-----------|
| Read REGRESSION_PLAN.md §1 before editing listed files | DemoDataPage.js is listed — confirm §1 before editing |
| Minimal diff — do not refactor unrelated code | DemoDataPage.js has 2000+ lines; touch only what's needed |
| After any UI edit: `npm run build` exit 0 required | DemoDataPage.js + DemoDataPage.css changes |
| Bug fixes → REGRESSION_PLAN.md §4 entry | Not applicable (new feature, not a fix) |
| All PingOne calls through banking_api_server (never from browser) | demoProvisioning.js is BFF-side |
| Client secrets from `configStore.getEffective()`, never `process.env` in route files | demoProvisioning.js |
| `timeout: 10000` on all axios calls | demoProvisioning.js |
| Do not edit marketing-only pages | Not applicable |

---

## Sources

### Primary (HIGH confidence)

- `banking_api_server/services/pingOneUserService.js` — User creation + password set pattern (lines 161-265)
- `banking_api_server/services/mfaService.js` — `enrollEmailDevice` worker-token path (lines 327-358), worker-vs-user token behavior documented (lines 364-368)
- `banking_api_server/routes/demoScenario.js` — `patchMayAct` exact body shape, configStore key names (lines 529-614)
- `banking_api_server/services/pingOneClientService.js` — `getManagementToken()` canonical implementation (lines 40-79)
- `banking_api_server/services/configStore.js` — `pingone_mcp_token_exchanger_client_id` key + fallback (lines 527-529)
- `banking_api_server/middleware/auth.js` — `requireAdmin` middleware (lines 829-826)
- `banking_api_ui/src/components/DemoDataPage.js` — Section JSX pattern, `apiClient` usage (lines 8, 218, 834+)
- `banking_api_ui/src/components/DemoDataPage.css` — CSS class conventions (lines 90, 113, 502+)
- `.claude/skills/pingone-api-calls/SKILL.md` — Canonical BFF patterns (getManagementToken, error handling, configStore usage)
- `CLAUDE.md` — Project constraints, BFF security rules

### Secondary (MEDIUM confidence)

- `banking_api_server/routes/selfServiceUsers.js` — Email validation pattern for input guard

---

## Metadata

**Confidence breakdown:**
- PingOne API calls (user create, password set, mayAct PATCH, email OTP enroll): HIGH — all four patterns verified against working code in this codebase
- Route structure and admin auth: HIGH — verified from adminManagement.js and auth.js middleware
- DemoDataPage UI section pattern: HIGH — verified from existing section JSX in DemoDataPage.js
- CSS class conventions: HIGH — verified from DemoDataPage.css

**Research date:** 2026-05-03
**Valid until:** 2026-06-03 (stable codebase; PingOne Management API patterns are stable)
