# Phase 141: Local Setup Wizard — Context

**Gathered:** 2026-04-13
**Status:** Ready for planning
**Source:** /gsd-discuss-phase 141

<domain>
## Phase Boundary

A new web-based setup wizard (`/setup/wizard`) that takes a fresh clone from zero configuration to a fully running app. The wizard:

1. Collects PingOne worker credentials and environment info from the user
2. Uses the PingOne Management API to discover/create all required PingOne objects
3. Writes a populated `.env` to the project root (merged, preserving existing keys)
4. Saves credentials to `configStore` SQLite so they are live immediately
5. Runs headless OAuth flow tests to confirm each worker app can obtain tokens
6. Presents a completion summary

This is a **new React UI page** — not a terminal CLI. It reuses patterns from existing `mcp-test` and `pingone-test` pages. All PingOne Management API calls go through `banking_api_server` (BFF), never directly from the browser.

**Out of scope:** DaVinci flows, MFA policy creation, population management, Vercel/production setup.

</domain>

<decisions>
## Implementation Decisions

### D-01: Wizard surface
- **New React page** at `/setup/wizard` route
- Also accessible from the existing `/setup` page via a prominent "Run Setup Wizard" button
- No authentication required — wizard runs before PingOne is configured
- Reuse UI patterns and components from `mcp-test` (`McpInspector.js`) and `pingone-test` (`PingOneTestPage.js`) pages

### D-02: Wizard structure
- **Accordion layout** — each section expands when active, collapses with a ✅ checkmark when complete
- User can reopen any completed section to review or re-run it
- Sections are gated: sections below won't activate until prerequisite sections succeed
- Sections in order:
  1. **Worker Credentials** — environment ID, region, worker client ID, client secret, token auth method (basic/post)
  2. **Discovery** — probe existing PingOne objects, show what exists vs what needs creating
  3. **Create PingOne Objects** — create all missing objects with live per-item progress
  4. **Environment File** — generate and write `.env`, show diff of what changed
  5. **Smoke Test** — run headless OAuth tests, show per-app pass/fail

### D-03: PingOne object automation scope (FULL)
The wizard creates ALL of the following via PingOne Management API:
- **OAuth apps:**
  - Admin WEB_APP (OIDC, Authorization Code + PKCE, redirect URIs: localhost + Vercel)
  - User WEB_APP (OIDC, Authorization Code + PKCE, redirect URIs: localhost + Vercel)
  - Agent WORKER app (client credentials, no redirect URIs)
  - MCP Token Exchanger WORKER app (client credentials, AI_AGENT type, no redirect URIs)
- **Resource servers:**
  - Banking API resource server (`https://banking-api.banking-demo.com`) + scopes
  - MCP server resource server (`https://banking-mcp-server.banking-demo.com`) + scopes
  - Two-exchange resource server (`https://banking-resource-server.banking-demo.com`) + scopes
- **User schema:**
  - `bankingPrincipalUserId` custom attribute (string, mutable) on the default User population schema
- **Token claim mappings:**
  - `bankingPrincipalUserId` mapped as a token claim on both the admin and user OAuth apps

Reuses `setupResourceServers.js` logic and `pingoneManagementService` where applicable.

### D-04: SPEL attribute mapping
- Create `bankingPrincipalUserId` custom attribute on the User schema via Management API
  - Endpoint: `POST /v1/environments/{envId}/schemas/{schemaId}/attributes`
  - Type: `STRING`, mutable, unique: false
- Add token claim mapping on admin WEB_APP and user WEB_APP:
  - Claim name: `bankingPrincipalUserId`
  - Expression: `${user.bankingPrincipalUserId}` (SPEL)
  - Endpoint: `PATCH /v1/environments/{envId}/applications/{appId}/attributeMappings`

### D-05: Credential collection UX
- All secret fields (client_secret) use password input type with show/hide toggle
- Non-secret fields (client_id, environment_id) are plain text inputs
- Token auth method is a dropdown: `client_secret_basic` (default) | `client_secret_post`
- Region is a dropdown: `com` (default) | `ca` | `eu` | `com.au` | `sg` | `asia`
- Worker credentials are collected in Section 1; created app credentials are displayed (read-only) after Section 3 completes

### D-06: .env generation
- Wizard writes to project root `.env`
- **Merge strategy:** only overwrite keys the wizard generates; preserve all other existing keys (e.g. `GROQ_API_KEY`, `ANTHROPIC_API_KEY`, custom flags)
- If `.env` doesn't exist, create it from scratch based on `.env.example` structure
- Write happens via a new BFF endpoint `POST /api/setup/write-env` that accepts a key-value map
- Show a before/after diff of what changed in the UI after writing
- **Also save** to `configStore` SQLite via `configStore.setConfig()` for each key — values are live immediately without server restart

### D-07: Idempotency + Reset mode
- **Default (idempotent):** Before creating any object, wizard probes PingOne to check if it exists by name/type
  - Existing objects show as "already exists ✓" (grey)
  - Missing objects are created and show as "created ✓" (green)
  - Failed objects show as "failed ✗" with error detail (red)
- **Reset & Recreate toggle** in the Section 3 header:
  - When enabled: wizard deletes existing objects (with confirmation prompt) then recreates them fresh
  - Only available after successful initial discovery (Section 2 must complete first)

### D-08: Smoke test
- Wizard runs headless `client_credentials` grant against each created WORKER app:
  - Agent WORKER app
  - MCP Token Exchanger WORKER app
  - Worker/Management API app (if credentials provided)
- Each grant attempt shows: app name, token endpoint, result (✅ token received | ❌ error + message)
- Smoke test is triggered by a "Run Tests" button in Section 5
- On pass: show "Setup complete" banner with links to `/` (app home) and `/api/auth/oauth/login` (admin login)
- On partial failure: show which apps failed with copy-paste curl commands to debug manually

### D-09: Folded todos
- Script PingOne resource server + scope setup via Management API — wizard wires `setupResourceServers.js` logic into the creation flow
- Add `STEP_UP_ACR_VALUE` prompt — wizard collects this in Section 1 (optional, with tooltip explanation) and includes it in the generated `.env`
- Update AGENT_OAUTH credentials in `.env` for MCP Token Exchanger — wizard generates and writes these after creating the exchanger app in Section 3

### Claude's Discretion
- Exact UI component implementation (CSS, layout details, loading spinners) — follow patterns from `pingone-test` and `mcp-inspector` pages
- BFF endpoint design for discovery and creation calls (route structure, response format)
- Error retry logic (how many retries on transient PingOne API errors)
- Exact PingOne Management API pagination handling when listing existing objects

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing setup infrastructure
- `banking_api_server/scripts/setupResourceServers.js` — existing resource server + scope creation CLI (reuse logic)
- `banking_api_server/services/pingoneManagementService.js` — Management API client (reuse for all PingOne calls)
- `banking_api_server/routes/setup.js` — existing `/api/setup` route (extend, don't replace)
- `banking_api_server/services/pingoneBootstrapService.js` — existing manifest-based bootstrap service

### Reference UI pages (pattern sources)
- `banking_api_ui/src/components/PingOneTestPage.js` — test-page UI pattern to reuse
- `banking_api_ui/src/components/McpInspector.js` — inspector accordion/section pattern to reuse

### Configuration and env
- `.env.example` — canonical catalog of all env vars (wizard generates a subset of these)
- `banking_api_server/services/configStore.js` — runtime config store (wizard writes here after creating objects)
- `banking_api_server/scripts/check-env.js` — env validation run at server startup

### Routing
- `banking_api_ui/src/App.js` — add `/setup/wizard` route here (no auth guard)
- `banking_api_server/server.js` — add new setup API route mount here

### Project rules
- `CLAUDE.md` — project-wide coding standards
- `REGRESSION_PLAN.md` — do-not-break list

</canonical_refs>

<specifics>
## Specific Implementation Notes

- Wizard is accessible pre-auth — it must work when `PINGONE_ENVIRONMENT_ID` is not yet set
- The BFF `/api/setup/write-env` endpoint must validate that it's running locally (not on Vercel) before writing to disk
- `configStore.setConfig()` accepts key-value pairs — use this to apply wizard output without restart
- Worker credentials (client ID + secret + auth method) are asked UP FRONT in Section 1 before any PingOne calls
- The accordion sections should use the same card/panel visual style as `PingOneTestPage` or `McpInspector`
- Redirect URIs to register: `http://localhost:3001/api/auth/oauth/callback` (admin), `http://localhost:3001/api/auth/oauth/user/callback` (user), plus Vercel equivalents from `PUBLIC_APP_URL` if provided
- STEP_UP_ACR_VALUE is optional — show it with a "(optional)" label and a tooltip: "ACR value for MFA step-up. Leave blank to use app default policy."

</specifics>

<deferred>
## Deferred Ideas

- DaVinci flow creation — too complex for automated scripting in this phase
- MFA policy creation — requires PingOne MFA Policy API, out of scope
- Population management (create custom populations) — out of scope
- Vercel/production deployment wizard — separate concern, out of scope
- Postman collection auto-population with created client IDs — nice-to-have, future phase

</deferred>

---

*Phase: 141-local-setup-wizard-guided-pingone-configuration-app-resource*
*Context gathered: 2026-04-13 via /gsd-discuss-phase 141*
