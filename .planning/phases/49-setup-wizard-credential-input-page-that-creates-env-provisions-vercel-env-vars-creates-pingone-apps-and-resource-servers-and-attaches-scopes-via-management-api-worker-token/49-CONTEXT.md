---
phase: 49
name: setup-wizard
status: discussed
updated: 2026-04-04
---

# Phase 49 — Setup Wizard: Context & Decisions

## Phase Goal

A "Setup" tab added to the existing `/config` page that lets a new deployer enter credentials once and have the full environment provisioned automatically: PingOne apps, resource server, scopes, demo users, `.env` file on disk, and Vercel env vars — all via API calls from the BFF, streaming live progress to the UI.

---

## Decisions

### 1. Entry Point
**Decision:** New "Setup" tab inside the existing Config page (`/config`), alongside the existing "Setup" and "Vercel" tabs.

- Reuses the tab switcher already in `Config.js` (`activeTab` state, tab bar buttons)
- Add `activeTab === 'pingone-setup'` branch
- Tab label: "PingOne Setup"
- No new route needed — purely a new tab panel

### 2. Vercel Integration
**Decision:** User pastes a Vercel API token into the wizard form. The BFF calls the Vercel REST API (`https://api.vercel.com`) directly.

- Existing `routes/vercelConfig.js` already has Vercel API call patterns — reuse its fetch approach
- The BFF endpoint for setup will accept `{ vercelToken, vercelProjectId }` in the request body
- Token is never logged, never returned to client (follow existing OWASP A3 pattern in `vercelConfig.js`)
- Vercel token is used once per setup run, not stored in `.env` unless the user explicitly wants it as `VERCEL_TOKEN`

### 3. PingOne Provisioning Scope
**Decision:** Full zero-to-running provisioning:
1. Create **Admin OIDC app** (WEB_APP, Authorization Code + PKCE, `admin_client_id`)
2. Create **User OIDC app** (WEB_APP, Authorization Code + PKCE, `user_client_id`)
3. Create **Resource Server** (audience: `banking_api_enduser`) with banking scopes
4. Attach scopes to both OIDC apps
5. Set redirect URIs (Vercel production URL + localhost variants)
6. Create demo users: `bankuser` / `Tigers7&` (role: customer) and `bankadmin` / `Tigers7&` (role: admin)

Uses `pingoneBootstrapService.js` patterns. Worker token obtained via client_credentials using the worker app credentials the user enters (same pattern confirmed working: PUT not PATCH to PingOne Management API).

### 4. Wizard UX — Two-Panel Layout
**Decision:** Two-column panel inside the tab:

- **Left panel (input form):** All credential fields — PingOne environment ID, worker client ID/secret, Vercel token, Vercel project ID, public app URL. "Run Setup" button at the bottom.
- **Right panel (live log):** Streaming provisioning log — one line per step as each resource is created. Each step shows ✅ / ⚠️ (skipped) / ❌ (error) status icon + label.

The BFF streams steps via Server-Sent Events (SSE) on `GET /api/admin/setup/stream` (or a chunked response). The UI uses `EventSource` to consume the stream and append log lines in real time.

**Responsive:** Stack vertically on narrow viewports.

### 5. Idempotency — Transparent Skip with Force Option
**Decision:** Re-run safe, but transparent:

- Before creating each resource, the BFF checks if it already exists (GET by name or list + filter)
- If it exists: log line shows `⚠️ Skipped: Admin App already exists (id: xxx)` with a **"Recreate" button** inline in the log
- Clicking "Recreate" sends a separate `POST /api/admin/setup/recreate` with `{ resource: 'admin_app' }` — BFF deletes and recreates just that resource
- Redirect URIs and `.env` values are always updated even on skip (additive, not destructive)
- Demo users: if user already exists, skip creation but still update password to configured value

### 6. .env File Handling
**Decision:** The BFF writes `banking_api_server/.env` from the provisioned values after all resources are created.

- Uses `fs.writeFile` — overwrites if exists, creates if not
- Follows existing key names in `banking_api_server/env.example`
- Written in the final step of the SSE stream: `✅ .env written`
- Displayed to user as a download link / textarea so they can copy it if filesystem write fails (Vercel serverless has no writable FS)
- **On Vercel:** `.env` write skipped automatically; all values go to Vercel env vars via API instead

### 7. New BFF Route
**Decision:** New file `banking_api_server/routes/setupWizard.js`, mounted at `/api/admin/setup`.

- `POST /api/admin/setup/run` — accepts credentials JSON body, streams SSE back
- `POST /api/admin/setup/recreate` — accepts `{ resource }`, deletes + recreates one resource
- Protected behind admin auth middleware (same as `vercelConfig.js`)
- Reuses `pingoneBootstrapService.js` for PingOne Management API calls
- New service: `banking_api_server/services/pingoneProvisionService.js` — focused provisioning logic (create app, create resource server, attach scope, create user)

### 8. New React Component
**Decision:** New component `banking_api_ui/src/components/SetupWizardTab.js`.

- Owned entirely by this phase — no changes to existing `Config.js` logic, just add the tab entry and render `<SetupWizardTab />` when `activeTab === 'pingone-setup'`
- Uses `EventSource` API for SSE log streaming
- Log lines stored in component state as array: `[{ id, icon, message, resourceKey? }]`
- "Recreate" buttons only shown on skipped lines that have a `resourceKey`

---

## Scope Boundaries

**In scope:**
- PingOne: create Admin app, User app, Resource Server, attach banking scopes, create `bankuser` + `bankadmin` demo users
- Vercel: set all env vars from provisioned values via Vercel REST API
- Local: write `banking_api_server/.env`
- UI: two-panel tab in Config, SSE log, inline Recreate buttons

**Out of scope (deferred):**
- PingOne Authorize policy setup (Phase 27)
- MCP server provisioning
- Population management beyond default population
- Vercel project creation (assumes project ID already known)

---

## Key Files to Touch

| File | Change |
|------|--------|
| `banking_api_ui/src/components/Config.js` | Add "PingOne Setup" tab button + render `<SetupWizardTab />` |
| `banking_api_ui/src/components/SetupWizardTab.js` | **New** — two-panel UI + SSE log |
| `banking_api_server/routes/setupWizard.js` | **New** — `/api/admin/setup` BFF route |
| `banking_api_server/services/pingoneProvisionService.js` | **New** — PingOne provisioning logic |
| `banking_api_server/server.js` | Mount new route |
| `banking_api_server/services/pingoneBootstrapService.js` | Reuse/extend for provision calls |

---

## PingOne Resources to Create

```
Resource Server:
  name: "Super Banking API"
  audience: "banking_api_enduser"
  scopes: banking:read, banking:write, banking:transfer, banking:admin,
          banking:agent:invoke, p1:read:user, p1:update:user

Admin App (WEB_APP):
  name: "Super Banking Admin App"
  grantTypes: [AUTHORIZATION_CODE]
  tokenEndpointAuthMethod: CLIENT_SECRET_BASIC
  pkce: S256 required
  redirectUris: [
    "{publicAppUrl}/api/auth/oauth/callback",
    "http://localhost:3000/api/auth/oauth/callback",
    "http://localhost:3001/api/auth/oauth/callback",
    "http://localhost:4000/api/auth/oauth/callback"
  ]
  scopes: openid, profile, email, offline_access + all banking scopes

User App (WEB_APP):
  name: "Super Banking User App"
  grantTypes: [AUTHORIZATION_CODE]
  tokenEndpointAuthMethod: CLIENT_SECRET_BASIC
  pkce: S256 required
  redirectUris: [
    "{publicAppUrl}/api/auth/oauth/user/callback",
    "http://localhost:3000/api/auth/oauth/user/callback",
    "http://localhost:3001/api/auth/oauth/user/callback",
    "http://localhost:4000/api/auth/oauth/user/callback"
  ]
  scopes: openid, profile, email, offline_access + all banking scopes

Demo Users:
  bankuser  | Tigers7& | population: default | role: customer
  bankadmin | Tigers7& | population: default | role: admin
```

---

## .env Keys Written After Provisioning

```
PINGONE_ENVIRONMENT_ID=<from form>
PINGONE_REGION=com
PINGONE_ADMIN_CLIENT_ID=<provisioned>
PINGONE_ADMIN_CLIENT_SECRET=<provisioned>
PINGONE_USER_CLIENT_ID=<provisioned>
PINGONE_USER_CLIENT_SECRET=<provisioned>
PUBLIC_APP_URL=<from form>
SESSION_SECRET=<generated 32-byte random hex>
ENDUSER_AUDIENCE=banking_api_enduser
FF_TWO_EXCHANGE_DELEGATION=true
CIBA_ENABLED=true
STEP_UP_METHOD=email
STEP_UP_AMOUNT_THRESHOLD=250
```

---

## Vercel Env Vars Set After Provisioning

Same keys as `.env` above, set via `PATCH /v9/projects/{projectId}/env/{envId}` (or `POST` to create). Uses Vercel API token from the form — never stored in configStore.

---

## Notes for Researcher / Planner

- PingOne Management API uses **PUT** (not PATCH) for application updates — confirmed working in this session
- Worker token: `POST /as/token` with `client_credentials`, `client_secret_basic` auth (`-u clientId:secret`)
- Scope assignment: first attach scope to Resource Server, then grant scope to OIDC app via `/applications/{appId}/grants`
- Creating a user requires knowing the `populationId` — BFF should `GET /environments/{envId}/populations` and use the first (default) population
- `pingoneBootstrapService.js` already has `probeManagementApiAccess()` — reuse for validation step before provisioning
- SSE on Vercel serverless has a 30s timeout — break provisioning into fast sequential steps to stay under limit; each step is one API call
