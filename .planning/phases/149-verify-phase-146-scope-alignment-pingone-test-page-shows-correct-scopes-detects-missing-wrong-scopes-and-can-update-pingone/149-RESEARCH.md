# Phase 149: Verify Phase 146 Scope Alignment — Research

**Researched:** 2026-04-14
**Domain:** PingOne OAuth scope verification, Management API, pingone-test page UI
**Confidence:** HIGH

---

## Summary

Phase 149 is a verification phase that checks whether Phase 146's scope alignment work is correct and complete. Phase 146 delivered: canonical scope names in `config/scopes.js`, `SCOPE_VOCABULARY.md` registry, `ff_inject_scopes` feature flag, INJECTED badges in TokenChainDisplay, Dashboard warning banner, Scope Reference page, and updates to `pingoneTestRoutes.js` and `PingOneTestPage.jsx`.

**What Phase 149 adds that Phase 146 did not fully deliver:**
1. The pingone-test page currently *shows* scope mismatches in the Asset Table (missing scope badges), but has **no "Fix / Update PingOne" action button** to actually create missing scopes or grant them to apps.
2. The scope detection logic (`verify-assets` endpoint) uses a flat list of expected scopes — it does not validate that the *correct resource server* (the canonical `banking_resource` with `banking:read`, `banking:write`, `banking:admin`) exists with those scopes defined on it.
3. The UI's "Scopes" tab in `AssetTable` only shows scopes from the *first* resource server found, not specifically the banking resource server.

**Primary recommendation:** Phase 149 should (a) verify the existing Phase 146 implementation is actually working end-to-end, (b) add a "Fix in PingOne" action to the pingone-test page that calls the existing `POST /api/admin/management/create-resource-server` + `createScopes` infrastructure, and (c) validate that scope detection correctly targets the banking resource server, not an arbitrary first resource server.

---

## What Phase 146 Actually Built (Verified Code Audit)

[VERIFIED: codebase grep]

### Plan 146-01 — Scope Inventory + Documentation
- `banking_api_server/config/scopes.js` — BANKING_SCOPES refactored: `BANKING_READ = 'banking:read'`, `BANKING_WRITE = 'banking:write'`; `COMPOUND_SCOPES` export for backward compat
- `banking_api_server/SCOPE_VOCABULARY.md` — canonical registry: 9 scopes documented across 3 resource servers
- Existing docs (`OAUTH_SCOPE_CONFIGURATION.md`, `SCOPE_AUTHORIZATION.md`) updated with cross-references

### Plan 146-02 — Feature Flag Infrastructure
- `banking_api_server/services/configStore.js` — `ff_inject_scopes` field added (`public: true, default: 'false'`)
- `banking_api_server/routes/featureFlags.js` — FLAG_REGISTRY entry with `warnIfEnabled: true`
- `banking_api_server/services/agentMcpTokenService.js` — scope injection block at lines 447-493: checks flag → injects `banking:read banking:write` → stores `injected_scope_names` array → pushes tokenEvent

### Plan 146-03 — Token Chain UI
- `TokenChainDisplay.js` — `fmtScope()` enhanced; per-scope badges (`tcd-scope-badge--real` blue vs `tcd-scope-badge--injected` amber); `scopeInjectedHint` on EventRow
- `Dashboard.js` — fetches `/api/admin/config` for `ff_inject_scopes`; shows dismissable warning banner
- Build verified passing (406.99 kB JS)

### Plan 146-04 — Scope Reference Links
- `GET /api/admin/scope-vocabulary` endpoint — reads `SCOPE_VOCABULARY.md`, returns `{success, markdown}`
- `ScopeReferencePage.js` — renders markdown as preformatted text
- `SideNav.js` — "Scope Ref." nav item under Developer Tools with MdMenuBook icon
- `/scope-reference` route in `App.js` under AdminRoute

### Plan 146-05 — PingOne Test Page Refactor
- `pingoneTestRoutes.js` — JSDoc header updated with canonical scope vocab reference; `EXPECTED_BANKING_SCOPES` includes both canonical and compound: `['banking:read', 'banking:write', 'banking:accounts:read', 'banking:accounts:write', 'banking:transactions:read', 'banking:transactions:write']`
- `PingOneTestPage.jsx` — `TEST_CONFIG.authzToken.requiredScopes` includes `banking:read`; `EXPECTED_BANKING_SCOPES` const updated to match

---

## Gaps Between Phase 146 Deliverables and Phase 149 Goal

[VERIFIED: codebase grep + code reading]

### Gap 1: No "Update PingOne" Action in pingone-test Page

**Current state:** The `AssetTable` component shows missing scopes with `asset-badge--missing` badges and a warning row for apps missing expected scopes. However, there is **no button or API call** to fix the issue from the test page.

**What exists for fixing (already built, just not wired to test page):**
- `POST /api/admin/management/setup-resource-server` — creates resource server + scopes + apps using `managementService.setupCompleteResourceServer()`
- `POST /api/admin/management/create-resource-server` — creates a single resource server
- `managementService.createScopes(resourceServerId, scopes)` — creates scopes on existing resource server
- `managementService.createResourceServer()` + `createScopes()` are already fully implemented in `pingoneManagementService.js`

**What Phase 149 needs to add:**
- A "Fix: Create Banking Resource Server" button in the test page (shown when resource server missing)
- A "Fix: Add Missing Scopes" button (shown when resource server exists but scopes are missing)
- BFF endpoint `POST /api/pingone-test/fix-scopes` that orchestrates the fix using the existing management service methods (or can reuse `POST /api/admin/management/setup-resource-server`)

### Gap 2: Scope Detection Targets Wrong Resource Server

**Current state:** In `verify-assets` endpoint (line 290-302):
```javascript
// Gets scopes from FIRST resource server found — not necessarily the banking one
if (resourcesResult.success && resourcesResult.resourceServers && resourcesResult.resourceServers.length > 0) {
  const resourceServerId = resourcesResult.resourceServers[0].id;
  const scopesResult = await managementService.getScopes(resourceServerId);
```

**Problem:** If PingOne has multiple resource servers, the first one may not be the banking resource server. The detection should look for a resource server whose name contains "banking" or whose audience matches `PINGONE_AUDIENCE_ENDUSER`.

**What Phase 149 needs to fix:** Update `verify-assets` to find the banking resource server by name or audience before checking scopes on it.

### Gap 3: Missing Scope Detection Is Not Granular Enough

**Current state:** `missingScopesByApp` in `verify-assets` compares each app's `grantedResources[].scopes` against `EXPECTED_BANKING_SCOPES`. However, the scopes fetched via `getApplicationResources()` come from `r._embedded?.scopes || r.scopes || []` mapped to `s.name || s`. PingOne may return scope objects with `id` fields, not just names — this mapping needs verification.

**SCOPE_VOCABULARY.md defines canonical scopes as:**
- `banking:read`, `banking:write`, `banking:admin` (core)
- `banking:sensitive`, `banking:ai:agent` (core, less critical for basic tests)

**Current `EXPECTED_BANKING_SCOPES` in test page includes compound scopes** (`banking:accounts:read`, etc.) which are deprecated — the verification should distinguish between canonical missing (high priority) vs compound missing (informational).

### Gap 4: pingone-test Scope Tab Only Shows First Resource Server's Scopes

**Current state:** `AssetTable`'s "Scopes" tab renders `scopes={assetVerification.scopes?.data || []}` which comes from `scopesAsset` — the scopes of only the first resource server. If banking resource server is not first, this tab is misleading.

**Fix needed:** Either show scopes for all resource servers with their names, or specifically show the banking resource server's scopes with a label.

---

## Existing Infrastructure to Reuse

[VERIFIED: codebase reading]

### Management API Methods (already in `pingoneManagementService.js`)
| Method | Purpose | Auth Required |
|--------|---------|---------------|
| `getResourceServers()` | List all resource servers | Worker token |
| `createResourceServer(name, desc, audienceUri)` | Create new resource server | Worker token (admin session) |
| `createScopes(resourceServerId, scopes[])` | Add scopes to resource server | Worker token |
| `getScopes(resourceServerId)` | List scopes on resource server | Worker token |
| `setupCompleteResourceServer(config)` | Create RS + scopes + apps in one call | Worker token |
| `getApplicationResources(appId)` | Get resource servers + scopes for an app | Worker token |
| `getApplicationGrants(appId)` | Get grant objects for an app | Worker token |

### Existing Routes (already registered)
- `POST /api/admin/management/setup-resource-server` — requires `requireAdmin` middleware
- `POST /api/admin/management/create-resource-server` — requires `requireAdmin` middleware

### Worker Token Acquisition (already in `verify-assets`)
The `verify-assets` route already calls `oauthService.getAgentClientCredentialsToken()` and initializes `managementService` with it. The fix endpoint can follow the same pattern.

### Feature Flag Pattern (for "demo scope injection")
`configStore.getEffective('ff_inject_scopes')` returns `'true'`/`'false'` string. Use `=== 'true'` comparison as done in Plan 146-02.

---

## Architecture Patterns

### Recommended: Fix Action Flow (new in Phase 149)

```
User clicks "Fix: Create Banking Resource Server" in pingone-test
  → POST /api/pingone-test/fix-banking-resource-server
    → oauthService.getAgentClientCredentialsToken()
    → managementService.initialize(workerToken)
    → managementService.getResourceServers() — check if banking RS exists
    → if not exists: managementService.createResourceServer("Main Banking API", ..., audienceUri)
    → managementService.createScopes(rsId, canonical_scopes)
    → return {success, created, skipped, errors}
  → UI shows success/error toast; re-runs verify-assets to confirm
```

### Banking Resource Server Identity
The banking resource server should be identified by matching:
- Name contains "banking" (case-insensitive) OR
- Audience URI matches `configStore.getEffective('pingone_audience_enduser')` (env var `PINGONE_AUDIENCE_ENDUSER`)

### Canonical Scopes to Create on Banking Resource Server
Per `SCOPE_VOCABULARY.md` and `config/scopes.js`:
```javascript
const BANKING_RESOURCE_SERVER_SCOPES = [
  { name: 'banking:read', description: 'Read-only access to accounts, balances, and transactions' },
  { name: 'banking:write', description: 'Write access for deposits, withdrawals, transfers' },
  { name: 'banking:admin', description: 'Full administrative access' },
  { name: 'banking:sensitive', description: 'Sensitive data access (PII, account details)' },
  { name: 'banking:ai:agent', description: 'AI agent identification on banking resource tokens' },
];
```

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead |
|---------|-------------|-------------|
| Resource server creation | Custom PingOne API call | `managementService.createResourceServer()` — already implemented |
| Scope creation | Custom POST to PingOne | `managementService.createScopes()` — already implemented |
| Worker token for management | Custom client_credentials call | `oauthService.getAgentClientCredentialsToken()` — already used in verify-assets |
| Admin auth gate | Custom session check | `requireAdmin` middleware — already in adminManagement routes |
| Scope injection tracking | New tracking mechanism | `claims.injected_scope_names` already established by Plan 146-02 |

---

## Common Pitfalls

### Pitfall 1: Worker Token vs Admin Session for Management API

**What goes wrong:** Phase 146's `verify-assets` uses `oauthService.getAgentClientCredentialsToken()` to get the worker token. This token may not have PingOne Management API scopes (`p1:read:*`, `p1:create:*`) if the worker app isn't configured with them.

**Why it happens:** PingOne Management API requires specific management scopes — the worker app client credentials must be granted those scopes in PingOne's application configuration.

**How to avoid:** The fix endpoint should handle `403` or `401` from PingOne Management API gracefully and return a clear error message: "Worker app lacks management API permissions — grant p1:create:resourceServer scope in PingOne console." Check existing `pingone-api-calls` skill for pattern.

**Warning signs:** `managementService.createResourceServer()` returns `{ success: false, error: 'Insufficient scope' }`

### Pitfall 2: Resource Server Already Exists (409 Conflict)

**What goes wrong:** If PingOne already has a resource server with the same name or audience, `createResourceServer()` will fail with 409.

**How to avoid:** The fix endpoint should call `getResourceServers()` first, find if one already exists (by name or audience), and skip creation if found. Then call `createScopes()` on the existing RS — `createScopes()` will 409 on existing scope names, which the code handles per-scope in the `results` array.

### Pitfall 3: Scope Tab Shows Wrong Resource Server

**What goes wrong:** `verify-assets` picks `resourceServers[0]` for scope display. If the environment has OIDC resource servers (PingOne's built-in `openid`, `profile`) listed first, the scopes tab shows OIDC scopes not banking scopes.

**How to avoid:** Filter resource servers to find the banking one before getting scopes. Match by name containing "banking" or audience matching `PINGONE_AUDIENCE_ENDUSER`.

### Pitfall 4: Build Failure from JSX/Import Changes

**What goes wrong:** Adding new state handlers, imports, or components to `PingOneTestPage.jsx` (21K tokens) can cause compilation errors.

**How to avoid:** Run `npm run build` in `banking_api_ui/` after each task. The file is large — use surgical edits, not rewrites. Follow CLAUDE.md: "minimal diff — name the component/element; do not refactor unrelated code."

### Pitfall 5: `requireAdmin` on New Fix Endpoint

**What goes wrong:** The existing `POST /api/admin/management/create-resource-server` requires `requireAdmin` (admin session). The pingone-test fix endpoint may be called from a non-admin session state in development.

**How to avoid:** Either (a) add the fix endpoint to the pingone-test routes and use the same `authenticateToken` + admin role check as other admin routes, or (b) call the existing `POST /api/admin/management/setup-resource-server` from the UI using `apiClient.post()` (which carries the session cookie). Option (b) reuses existing endpoints.

---

## Code Examples

### Scope Detection — Find Banking Resource Server by Name/Audience
```javascript
// In verify-assets (updated pattern)
// [ASSUMED] — pattern based on existing getResourceServers() return shape
const bankingResourceServer = (resourcesResult.resourceServers || []).find(rs => {
  const audienceEnduser = configStore.getEffective('pingone_audience_enduser');
  const nameLower = (rs.name || '').toLowerCase();
  const audience = rs.audience || rs.accessControl?.audience || '';
  return nameLower.includes('banking') ||
    (audienceEnduser && audience === audienceEnduser);
});
const resourceServerId = bankingResourceServer?.id ||
  (resourcesResult.resourceServers[0]?.id);
```

### Fix Endpoint Pattern (new BFF route)
```javascript
// POST /api/pingone-test/fix-banking-resource-server
// [ASSUMED] — modeled on verify-assets pattern + adminManagement create-resource-server
router.post('/fix-banking-resource-server', async (req, res) => {
  // 1. Get worker token
  const workerToken = await oauthService.getAgentClientCredentialsToken();
  managementService.initialize(workerToken);
  
  // 2. Check if banking RS exists
  const rsResult = await managementService.getResourceServers();
  const existing = (rsResult.resourceServers || []).find(rs =>
    rs.name?.toLowerCase().includes('banking')
  );
  
  // 3. Create if missing
  let rsId = existing?.id;
  if (!rsId) {
    const audienceUri = configStore.getEffective('pingone_audience_enduser')
      || 'https://banking-api.banking-demo.com';
    const created = await managementService.createResourceServer(
      'Main Banking API', 'Banking resource server', audienceUri
    );
    rsId = created.id;
  }
  
  // 4. Create scopes (idempotent — existing scopes return errors per scope, not fatal)
  const CANONICAL_SCOPES = [
    { name: 'banking:read', description: 'Read access' },
    { name: 'banking:write', description: 'Write access' },
    { name: 'banking:admin', description: 'Admin access' },
  ];
  const scopeResult = await managementService.createScopes(rsId, CANONICAL_SCOPES);
  
  res.json({ success: true, resourceServerId: rsId, scopes: scopeResult });
});
```

### UI Fix Button (in AssetTable or separate section)
```jsx
// [ASSUMED] — modeled on existing TestCard onTest pattern in PingOneTestPage.jsx
const [fixingScopes, setFixingScopes] = useState(false);
const [fixResult, setFixResult] = useState(null);

const fixBankingResourceServer = async () => {
  setFixingScopes(true);
  try {
    const { data } = await apiClient.post('/api/pingone-test/fix-banking-resource-server');
    setFixResult(data);
    if (data.success) {
      notifySuccess('Banking resource server fixed — re-running verification...');
      await verifyAssets();  // Re-run the verify-assets call
    }
  } catch (err) {
    notifyError('Fix failed: ' + err.message);
  } finally {
    setFixingScopes(false);
  }
};
```

---

## Standard Stack

No new dependencies needed for Phase 149. All required libraries are already in the project:
- `axios` — HTTP calls to PingOne Management API [VERIFIED: in pingoneManagementService.js]
- `express` — BFF routing [VERIFIED: project-wide]
- `react` + `apiClient` — UI API calls [VERIFIED: PingOneTestPage.jsx uses these]

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | React build verification (`npm run build`) — no formal test framework for UI integration tests |
| Config file | `banking_api_ui/package.json` (build script) |
| Quick run command | `cd /Users/cmuir/P1Import-apps/Banking/banking_api_ui && npm run build` |
| Full suite command | Same — build verification is the primary gate |

### Phase Requirements → Test Map
| Behavior | Test Type | Automated Command |
|----------|-----------|-------------------|
| Test page shows canonical scopes | Manual visual check via browser | N/A — verify `EXPECTED_BANKING_SCOPES` includes `banking:read`, `banking:write`, `banking:admin` |
| Missing scopes detection works | Unit-style grep check | `grep -r "EXPECTED_BANKING_SCOPES" banking_api_server/routes/pingoneTestRoutes.js` |
| Fix endpoint created | grep check | `grep -r "fix-banking-resource-server" banking_api_server/routes/pingoneTestRoutes.js` |
| Build passes after UI changes | Build gate | `cd banking_api_ui && npm run build` (exit 0) |
| Banking RS identified by name/audience | grep check | Verify `bankingResourceServer.find` logic in verify-assets |

### Wave 0 Gaps
None — no new test files required. Verification is: (a) build passes, (b) grep checks confirm code, (c) manual browser test on `/pingone-test` page.

---

## Security Domain

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V4 Access Control | Yes | `requireAdmin` middleware on fix endpoints; admin session cookie required |
| V5 Input Validation | Yes | `audienceUri` and scope names from config/constants, not raw user input |
| V6 Cryptography | No | No crypto changes |

### Fix Endpoint Security
- The fix endpoint calls PingOne Management API using a worker token (server-side, never exposed to browser) — BFF pattern maintained [VERIFIED: existing pattern in verify-assets]
- No raw tokens or credentials returned to UI
- Management API calls use `this.getHeaders()` which uses stored worker token, not user-controlled input

---

## Project Constraints (from CLAUDE.md)

1. **REGRESSION_PLAN.md §1 must be read before editing listed files** — transaction routes + scope enforcement are listed; Phase 149 does not touch route enforcement, only the test page
2. **After any `banking_api_ui` edit:** `npm run build` must exit 0
3. **Minimal diff** — add fix button and endpoint; do not refactor PingOneTestPage
4. **Bug fixes must be added to REGRESSION_PLAN.md §4**
5. **BFF + security** — tokens stay server-side; fix endpoint follows BFF pattern (worker token acquired server-side, never sent to UI)
6. **No marketing pages** — `/pingone-test` is a technical test page, not marketing; safe to edit

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Banking resource server identified by name containing "banking" or audience matching `PINGONE_AUDIENCE_ENDUSER` | Gap 2 / Code Examples | Low — if wrong, the find() returns undefined and falls back to `resourceServers[0]` (same as current behavior) |
| A2 | Fix endpoint can reuse `oauthService.getAgentClientCredentialsToken()` for management API calls | Architecture Patterns | Medium — worker token may lack management API scopes; plan should include graceful error handling |
| A3 | `managementService.createScopes()` handles 409 (already exists) per-scope without failing the whole call | Don't Hand-Roll | Low — already handles per-scope errors in `results` array (verified in code) |
| A4 | `POST /api/pingone-test/fix-banking-resource-server` is accessible without `requireAdmin` middleware (session-based admin check instead) | Pitfall 5 | Medium — may need to match the admin auth pattern from adminManagement.js |

**If A2 or A4 are wrong:** The planner should add a task to verify worker token scopes and align auth middleware before implementing the fix button.

---

## Open Questions

1. **Should "Update PingOne" be a single-click fix or a guided wizard?**
   - What we know: `setupCompleteResourceServer()` can create RS + scopes in one call
   - What's unclear: Phase description says "can update PingOne" — one-click is simpler; wizard is more educational
   - Recommendation: One-click fix button with clear success/error feedback; add "what this does" tooltip for education

2. **Should the fix endpoint be on `/api/pingone-test/*` or reuse `/api/admin/management/*`?**
   - What we know: `POST /api/admin/management/setup-resource-server` already does this with `requireAdmin`
   - What's unclear: pingone-test page may not always be visited in an admin session
   - Recommendation: Add a thin wrapper on `POST /api/pingone-test/fix-banking-resource-server` that uses the same worker-token pattern as `verify-assets` (no separate admin session requirement for this internal test tool)

3. **Should `banking:admin` be in `EXPECTED_BANKING_SCOPES` for detection?**
   - What we know: Current `EXPECTED_BANKING_SCOPES` has `banking:read` and `banking:write` but not `banking:admin`
   - What's unclear: Whether all apps need `banking:admin` (only admin app should)
   - Recommendation: Keep `EXPECTED_BANKING_SCOPES` as per-app expectations; check admin app specifically for `banking:admin`

---

## Sources

### Primary (HIGH confidence)
- Codebase read: `banking_api_server/routes/pingoneTestRoutes.js` — verify-assets endpoint, EXPECTED_BANKING_SCOPES
- Codebase read: `banking_api_ui/src/components/PingOneTestPage.jsx` — TEST_CONFIG, AssetTable, EXPECTED_BANKING_SCOPES const
- Codebase read: `banking_api_server/services/pingoneManagementService.js` — all management methods
- Codebase read: `banking_api_server/routes/adminManagement.js` — create-resource-server endpoint
- Codebase read: `banking_api_server/config/scopes.js` — canonical scope definitions
- Codebase read: `banking_api_server/SCOPE_VOCABULARY.md` — canonical registry
- Phase 146 summaries: 146-01 through 146-05-SUMMARY.md — what was actually built

### Secondary (MEDIUM confidence)
- Phase 146 CONTEXT.md — original decisions (D-01 through D-06) — context for what was planned
- INJECTION-TRACKING-CLARIFICATION.md — refined plan for injected scope tracking

---

## Metadata

**Confidence breakdown:**
- What Phase 146 built: HIGH — verified by reading code and summaries
- Gap analysis: HIGH — identified by reading verify-assets endpoint and test page
- Fix endpoint design: MEDIUM — design is sound but exact PingOne API behavior for management API scopes is ASSUMED
- Standard stack: HIGH — no new dependencies

**Research date:** 2026-04-14
**Valid until:** 2026-05-14 (stable domain)
