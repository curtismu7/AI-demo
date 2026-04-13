# Phase 141: Local Setup Wizard — Research

**Researched:** 2026-04-13
**Status:** RESEARCH COMPLETE

---

## Executive Summary

Substantial infrastructure already exists. The phase is primarily about **upgrading and wiring existing pieces** rather than building from scratch. The biggest gaps are: auth gating (wizard must work pre-login), accordion UX, SPEL/schema attribute mapping in the provisioning service, headless smoke tests, and configStore integration after env write.

---

## What Already Exists

### BFF Side

| File | Lines | What it does |
|------|-------|-------------|
| `banking_api_server/routes/setupWizard.js` | 374 | SSE routes: `/api/admin/setup/run`, `/recreate`, `/validate`, `/status` |
| `banking_api_server/services/pingoneProvisionService.js` | 993 | Full provisioning service — worker token, app creation, resource server, `.env` write |
| `banking_api_server/routes/setup.js` | 44 | Public `/api/setup/plan` — bootstrap manifest plan steps |
| `banking_api_server/services/pingoneManagementService.js` | 556 | Lower-level Management API client (token policies, grants) |
| `banking_api_server/scripts/setupResourceServers.js` | ~60 | CLI wrapper around `pingoneManagementService` |

**`pingoneProvisionService` already handles:**
- Worker token via `client_credentials` grant (not env vars — accepts creds directly)
- `initialize(envId, clientId, clientSecret, region)` — no env var dependency
- `findResourceByName(type, name)` — idempotency probe
- Create resource server, scopes, admin app, user app, worker app, demo users
- `writeEnvFile(config, provisioned)` — writes `.env` via `fs.writeFile`

Mounted in `server.js`:
```
/api/setup        → routes/setup.js   (public)
/api/admin/setup  → routes/setupWizard.js (requireAdmin)
```

### UI Side

| File | Lines | What it does |
|------|-------|-------------|
| `banking_api_ui/src/components/SetupWizardTab.js` | 547 | Two-panel wizard (form + SSE log) |
| `banking_api_ui/src/components/SetupPage.js` | 447 | Existing setup page (bootstrap plan + admin probe) |
| `banking_api_ui/src/components/McpInspectorSetupWizard.js` | ? | MCP inspector variant |
| `banking_api_ui/src/components/SetupWizardTab.css` | — | Styles for existing wizard tab |

`SetupWizardTab` already has:
- Form: env ID, worker client ID/secret, region dropdown, public app URL, step-up ACR value
- SSE streaming log with auto-scroll
- Recreate button per skipped resource
- `.env` content display with clipboard copy

Routes in `App.js`: `/setup` → `SetupPage`, `/setup/pingone` → `PingOneSetupGuidePage`
**`/setup/wizard` route does NOT exist yet.**

---

## Gaps to Close

### Gap 1: Auth Gate (BLOCKING)
`/api/admin/setup/*` uses `requireAdmin` middleware. The wizard must work before any user is authenticated — this is the entire point (fresh clone, no OAuth configured yet).

**Fix:** Add a new public router `/api/setup/wizard/*` that mirrors the admin setup routes but skips `requireAdmin`. Rate-limit with `express-rate-limit` (same pattern as `/api/setup/plan`). The existing admin routes can remain for authenticated use.

Alternative avoided: Removing `requireAdmin` from existing admin routes would break security for other admin endpoints sharing that router.

### Gap 2: Accordion UX
`SetupWizardTab.js` is a two-panel layout (form left, SSE log right), not a 5-section accordion.

**Fix:** Create new `SetupWizardPage.js` with accordion sections. Reuse `SetupWizardTab` styles and SSE streaming logic. The new page is not a replacement — it's a different entry point at `/setup/wizard`.

Accordion state pattern:
```jsx
const [sections, setSections] = useState({
  credentials: 'active',   // active | complete | locked
  discovery:   'locked',
  create:      'locked',
  envFile:     'locked',
  smokeTest:   'locked'
});
```
Each section has: header with ✅/🔒 icon, expand/collapse toggle, content, "Next" button that marks it complete and unlocks the next.

### Gap 3: SPEL / Schema Attribute Mapping (NOT IMPLEMENTED)
`pingoneProvisionService.js` has no methods for:
- Schema attribute creation (`POST /v1/environments/{envId}/schemas/{schemaId}/attributes`)
- Token claim / attribute mapping (`POST /v1/environments/{envId}/applications/{appId}/attributeMappings`)
- Application secret retrieval (`GET /v1/environments/{envId}/applications/{appId}/secret`)

**PingOne API details:**

```
# Step 1: Get schema ID
GET https://api.pingone.{region}/v1/environments/{envId}/schemas
→ _embedded.schemas[0].id

# Step 2: Create custom attribute
POST https://api.pingone.{region}/v1/environments/{envId}/schemas/{schemaId}/attributes
{
  "name": "bankingPrincipalUserId",
  "type": "STRING",
  "enabled": true,
  "unique": false,
  "multivalued": false,
  "description": "Banking demo principal user ID"
}

# Step 3: Add attribute mapping to app (OIDC only)
POST https://api.pingone.{region}/v1/environments/{envId}/applications/{appId}/attributes
{
  "name": "bankingPrincipalUserId",
  "value": "${user.bankingPrincipalUserId}",
  "required": false
}

# Get app client secret after creation
GET https://api.pingone.{region}/v1/environments/{envId}/applications/{appId}/secret
→ { secret: "..." }
```

**Fix:** Add 4 new methods to `PingOneProvisionService`:
- `getSchemaId()` — GET schemas, return first schema ID
- `createCustomAttribute(schemaId, name, type)` — create user schema attribute
- `addAttributeMapping(appId, name, spellExpression)` — map claim to app
- `getApplicationSecret(appId)` — retrieve client secret after creation

### Gap 4: Smoke Test (NOT IMPLEMENTED)
No headless `client_credentials` test exists in the provisioning flow.

**Fix:** Add `runSmokeTests(provisioned, config)` to `PingOneProvisionService`:
```javascript
async runSmokeTest(appName, clientId, clientSecret, envId, region) {
  // POST to /as/token with client_credentials
  // Return { app: appName, success: bool, error: string|null }
}
```
Test each WORKER app created during provisioning. Stream per-app results via SSE. Agent app + MCP Token Exchanger app are the primary targets.

### Gap 5: configStore Integration (NOT IMPLEMENTED)
`writeEnvFile` in `pingoneProvisionService` uses `fs.writeFile` only. Does not call `configStore.setConfig()`.

**Fix:** After writing `.env`, call `configStore.setConfig(key, value)` for each key that maps to a known configStore key:
```javascript
const configStore = require('./configStore');
configStore.setConfig('pingone_environment_id', config.envId);
configStore.setConfig('pingone_region', config.region);
// ... etc for each key
```
This makes values live immediately without server restart.

**Guard:** Check `isVercel` before writing `.env` file (already present in the route config object). On Vercel, skip file write, do configStore only.

### Gap 6: /setup/wizard Route + SetupPage Link (MISSING)
`App.js` has no `/setup/wizard` route. `SetupPage.js` has no link to the wizard.

**Fix:**
- Add `<Route path="/setup/wizard" element={<SetupWizardPage />} />` to `App.js` (no auth guard, before the `*` catch-all)
- Add "Launch Full Setup Wizard" button/link in `SetupPage.js`

### Gap 7: run-bank.sh URL Print (MISSING)
On first launch (no `.env` or env vars), `run-bank.sh` should print the wizard URL prominently.

**Fix:** Add env check in `run-bank.sh`:
```bash
if [[ -z "${PINGONE_ENVIRONMENT_ID}" ]]; then
  echo ""
  echo "  ⚙️  First-time setup? Run the Setup Wizard:"
  echo "  ${CLIENT_URL}/setup/wizard"
  echo ""
fi
```

---

## Implementation Plan

### Plan 01 — BFF: Public wizard route + provisioning enhancements
**Files:** `banking_api_server/routes/setupWizard.js`, `banking_api_server/services/pingoneProvisionService.js`, `banking_api_server/server.js`

Tasks:
1. Add 4 new methods to `PingOneProvisionService`: `getSchemaId`, `createCustomAttribute`, `addAttributeMapping`, `getApplicationSecret`
2. Wire schema + SPEL setup into `provisionEnvironment()` flow (after app creation, before env write)
3. Add `runSmokeTests()` method — headless client_credentials per worker app
4. Add `runSmokeTests` call in provisioning flow (or expose as separate endpoint)
5. Integrate `configStore.setConfig()` into `writeEnvFile()` / `writeEnvAndPersist()`
6. Add public router `/api/setup/wizard` in `setupWizard.js` (no `requireAdmin`)
7. Mount in `server.js`: `app.use('/api/setup/wizard', setupWizardPublicRoutes)`

### Plan 02 — React: SetupWizardPage (accordion)
**Files:** `banking_api_ui/src/components/SetupWizardPage.js`, `banking_api_ui/src/components/SetupWizardPage.css`, `banking_api_ui/src/App.js`, `banking_api_ui/src/components/SetupPage.js`

Tasks:
1. Create `SetupWizardPage.js` with 5-section accordion (reuse SSE streaming from `SetupWizardTab`)
2. Section 1: Credential form (env ID, worker creds, region, auth method, public URL, step-up ACR)
3. Section 2: Discovery — call `GET /api/setup/wizard/status`, show existing vs missing objects table
4. Section 3: Create — `POST /api/setup/wizard/run` SSE stream, per-item status rows, Reset toggle
5. Section 4: Env File — display generated `.env` diff (changed keys highlighted), confirm write button
6. Section 5: Smoke Test — `POST /api/setup/wizard/smoke-test`, per-app pass/fail, completion banner
7. Create `SetupWizardPage.css`
8. Add `/setup/wizard` route to `App.js` (no auth guard)
9. Add "Launch Setup Wizard →" button to `SetupPage.js`

### Plan 03 — Polish: run-bank.sh + Reset mode + validation
**Files:** `run-bank.sh`, `banking_api_server/routes/setupWizard.js`, `banking_api_ui/src/components/SetupWizardPage.js`

Tasks:
1. Add first-launch wizard URL hint to `run-bank.sh`
2. Add `POST /api/setup/wizard/recreate` (mirrors existing `/api/admin/setup/recreate` but public)
3. Wire Reset & Recreate toggle in Section 3 (pass `forceRecreate: true` to BFF)
4. Add `POST /api/setup/wizard/smoke-test` as standalone endpoint
5. `app/api/setup/wizard/write-env` — standalone env merge endpoint (separate from run)

---

## Validation Architecture

| Test | Command | What it proves |
|------|---------|---------------|
| Unit: provisionService schema methods | Jest mock axios | Schema attribute + SPEL mapping API calls fire correctly |
| Integration: wizard route public | Supertest `POST /api/setup/wizard/run` | Route accessible without auth, returns SSE stream |
| Integration: env write merge | Supertest + temp `.env` file | Existing keys preserved, wizard keys overwritten |
| Manual: smoke test | Wizard UI → Run Tests | Each worker app returns a token from PingOne |
| E2E: full wizard | Playwright (optional) | Form → SSE log shows all ✅ → completion banner |

---

## Security Notes

- Public wizard routes (`/api/setup/wizard/*`) accept worker credentials in POST body — **HTTPS only in production** (already enforced by Express + Vercel TLS)
- Rate limiting required: 5 requests/minute per IP on `/api/setup/wizard/run` (expensive PingOne calls)
- `.env` write must check `isVercel` — never write to disk on serverless
- Worker credentials from request body are **not logged** (mask in console output)
- Reset & Recreate requires explicit `forceRecreate: true` flag — no accidental deletion

## RESEARCH COMPLETE
