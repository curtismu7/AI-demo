# Phase 141: Local Setup Wizard — Guided PingOne Configuration — Context

**Gathered:** 2026-04-13
**Status:** Ready for planning

<domain>
## Phase Boundary

Create a multi-step guided wizard at `/setup/wizard` that walks a developer through provisioning a fresh PingOne environment for local dev. The wizard: validates credentials, creates resource servers + scopes + 4 apps + `mcp_exchanger` app + SPEL attribute mapping, creates demo users, and generates a `.env` file. App is fully runnable on completion. The existing `SetupWizardTab` (used in admin panel) is preserved alongside this new route.

</domain>

<decisions>
## Implementation Decisions

### Wizard Layout
- **D-01:** Accordion layout — all steps visible simultaneously, each step expands/collapses. Not horizontal tabs, not card stack.

### Execution Mode
- **D-02:** Hybrid — Step 1 (credentials) is filled manually by the user and validated on submit. After credentials validated, a "Run All" button fires the full SSE provisioning pipeline for all remaining steps in one shot.

### SPEL Attribute Mapping
- **D-03:** Pre-built — wizard auto-creates the SPEL mapping using known claim names (`p1UserType`, `account_ids`, etc.). No user text input required. `pingoneProvisionService.js` must be extended to add this step.

### Secret Masking
- **D-04:** Toggle reveal — credential fields shown as `••••••` by default with an eye icon to toggle visibility. Standard `<input type="password">` with show/hide toggle.

### Resume Behavior
- **D-05:** Resume step — wizard state (completed steps, created object IDs) persisted to `localStorage` key `pingoneSetupWizard.v1`. Secrets are NOT persisted. On return, user re-enters credentials then continues from last completed step.

### Route
- **D-06:** New dedicated route `/setup/wizard` — new React component `SetupWizard.js`. Registered in `App.js` router alongside existing routes.

### Error Recovery
- **D-07:** Per-step retry — when a provisioning step fails, only that step gets a "Retry" button. Steps after the failed step remain collapsed/locked until it succeeds.

### Relationship to Existing SetupWizardTab
- **D-08:** Alongside — `SetupWizardTab.js` is NOT modified or deleted. The new wizard is a wholly separate component at `/setup/wizard`. Both coexist.

### MCP Exchanger App
- **D-09:** Phase 141 adds `mcp_exchanger` application creation to `provisionEnvironment()` — a dedicated worker-type app for token exchange (needed by phase 143). This is the 5th app in the provisioning pipeline after admin, user, MCP server, and worker apps.

### Claude's Discretion
- Exact accordion animation style (CSS transition, no JS animation library)
- Toast library: use the existing pattern in the app (check for `react-toastify` or native; use whichever is already imported)
- Nav link to `/setup/wizard` placement: new item in existing nav or standalone — agent decides based on existing nav structure
- Step numbering: 1-based, displayed as "Step 1", "Step 2", etc. per UI-SPEC copywriting

</decisions>

<specifics>
## Specific Ideas

- Copywriting is locked in `141-UI-SPEC.md` — wizard title "BX Finance — PingOne Setup", step names per copywriting contract table
- Color system locked in `141-UI-SPEC.md` — step active `#004687`, complete `#16a34a`, error `#b91c1c`, incomplete `#d1d5db`
- Completion screen shows checklist of what was created with green ticks, "Open Dashboard →" navigates to `/dashboard`, "Start Over" clears localStorage
- All 5 action buttons on the Run All step should show the SSE log stream inline (the existing `streamSSEResponse` pattern from `SetupWizardTab.js` is the reference)
- `.env` output block uses monospace, `#f8fafc` background, "📋 Copy .env" button using Clipboard API with toast feedback

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### UI Design System
- `.planning/phases/141-local-setup-wizard-guided-pingone-configuration-app-resource/141-UI-SPEC.md` — Full color, typography, spacing, copywriting contract, completion screen wireframe, and open questions (now resolved)

### Existing Wizard Infrastructure (read before modifying)
- `banking_api_server/services/pingoneProvisionService.js` — `provisionEnvironment()` pipeline — add `mcp_exchanger` creation step and SPEL mapping step here
- `banking_api_server/routes/setupWizard.js` — BFF SSE routes — `POST /api/admin/setup/run` is the endpoint the new wizard calls
- `banking_api_ui/src/components/SetupWizardTab.js` — Existing single-form wizard — reference for `streamSSEResponse()`, `generateEnvContents()`, SSE event parsing pattern. DO NOT modify.

### Routing
- `banking_api_ui/src/App.js` — Add `/setup/wizard` route here

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `SetupWizardTab.js` → `streamSSEResponse(url, body, onStep, onComplete, onError)`: copy this SSE streaming pattern into the new wizard component
- `SetupWizardTab.js` → `generateEnvContents(result, config)`: copy or import this for `.env` generation
- `banking_api_server/routes/setupWizard.js` → `POST /api/admin/setup/run`: already accepts all needed fields (`envId`, `workerClientId`, `workerClientSecret`, `region`, `publicAppUrl`, `vercelToken`, `vercelProjectId`, `audience`, `stepUpAcrValue`)
- `banking_api_server/services/pingoneProvisionService.js` → `provisionEnvironment()` + `recreateResource()`: extend here for `mcp_exchanger` + SPEL steps

### Established Patterns
- The existing app uses `navigator.clipboard.writeText()` for copy-to-clipboard with toast notifications — match this pattern
- Session/localStorage pattern: inspect existing usage in `SetupWizardTab.js` for any prior localStorage use; if none, use `JSON.stringify` to `localStorage.setItem('pingoneSetupWizard.v1', ...)`
- SSE stream from `POST /run` emits `{ step, icon, message, result? }` objects — the new wizard parses these to update per-step status

### Integration Points
- `banking_api_server/services/pingoneProvisionService.js` → add `mcp_exchanger` after `worker-app` steps (~line 865), before the `config` (env file write) step
- `banking_api_server/services/pingoneProvisionService.js` → add SPEL mapping step after `mcp_exchanger`, using known claim names from PingOne attribute mapping API
- `banking_api_ui/src/App.js` → register `<Route path="/setup/wizard" element={<SetupWizard />} />`

</code_context>

<deferred>
## Deferred Ideas

- Vercel deployment wizard path (Vercel env var writing) — existing `SetupWizardTab.js` handles this; not in scope for local dev wizard
- Dark mode — not in scope
- i18n / multi-language — not in scope
- Any validation of existing PingOne objects before creating (the `already exists` handling in `provisionEnvironment` covers idempotency)

</deferred>

---

*Phase: 141-local-setup-wizard-guided-pingone-configuration-app-resource*
*Context gathered: 2026-04-13*
