# Phase 265: Demo data page — Create demo user with may_act, P1MFA registration - Context

**Gathered:** 2026-05-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Add a "Create Demo User" provisioning section to the top of DemoDataPage. A single button creates a brand-new PingOne user with `may_act` attribute set (for delegation/token exchange demo) and email OTP MFA enrolled (for step-up auth demo) — all in one click, no PingOne admin console required.

This phase does NOT modify the existing `may_act` toggle (which operates on the current logged-in user) — it adds a parallel capability to provision a *new* user.

</domain>

<decisions>
## Implementation Decisions

### Target User
- **D-01:** Create a brand-new PingOne user via BFF worker token (`POST /environments/{envId}/users`). Do NOT modify the currently logged-in user.
- **D-02:** Email is user-specified — an input field in the UI accepts the email to create. No auto-generated email.
- **D-03:** Password is fixed (`Demo1234!` or a clearly documented constant). The result card shows both email and password so the presenter can copy and log in immediately.

### MFA Enrollment
- **D-04:** Email OTP device — enroll using the user's email address (same as the login email). No extra phone number input needed.
- **D-05:** MFA enrollment is automatic and part of the single provisioning flow. One button creates user + sets may_act + enrolls email OTP. The presenter never clicks twice.
- **D-06:** Use the existing `mfa.js` enrollment pattern. Since the new user has no session, the BFF must use a worker token (not user access token) to call PingOne MFA enrollment on their behalf.

### may_act Attribute
- **D-07:** `mayAct` value is auto-detected at provision time: BFF reads `PINGONE_MCP_TOKEN_EXCHANGER_CLIENT_ID` from `configStore.getEffective()` and sends `{ sub: "<clientId>" }` as the attribute body. **Correction from discuss-phase:** attribute name is camelCase `mayAct` (PingOne attribute), body shape is `{ sub: clientId }` — verified against working `demoScenario.patchMayAct()` in the codebase. The `client_id` key mentioned during discussion does not match the live API.
- **D-08:** Stored as a JSON object (not a stringified JSON string) on the PingOne user attribute `mayAct`. The PATCH body to PingOne is `{ mayAct: { sub: "<clientId>" } }`. This matches the shape the existing may_act toggle writes and the BFF token exchange flow reads.
- **D-09:** If `PINGONE_MCP_TOKEN_EXCHANGER_CLIENT_ID` is not configured, show a warning in the step log ("may_act not set — MCP token exchanger client ID not configured") but continue provisioning.

### Page Placement & UI
- **D-10:** New top section "Create Demo User" above all existing sections in DemoDataPage. The section heading is `demo-data-section__heading` style (consistent with existing sections).
- **D-11:** Input field for email + a "Provision" button. Disable the button while provisioning is in progress.
- **D-12:** Inline step log: each provisioning step appears as it completes with a status icon (✓ / ✗). Steps: "Create PingOne user", "Set may_act attribute", "Enroll email OTP MFA". Credentials (email + password) shown at the bottom of the step log on success.
- **D-13:** On success, show a copyable credential card with the new user's email and password. Include a note: "Sign out and log back in as this user to demo delegation."
- **D-14:** On any step failure, show the error inline next to the failed step. Subsequent steps that depend on the failed step are skipped with "⚠ Skipped" label.

### Backend (BFF)
- **D-15:** New route file `banking_api_server/routes/demoProvisioning.js` — POST `/api/demo/provision-user`. Uses worker token (same `getManagementToken()` pattern from `pingone-api-calls` skill).
- **D-16:** Route calls PingOne Management API in sequence: (1) POST /users to create user, (2) PATCH /users/{id}/attributes to set may_act, (3) POST /users/{id}/devices to enroll email OTP.
- **D-17:** Route returns a streamed JSON response or single JSON object with step results array: `{ steps: [{ name, status, detail }], credentials: { email, password } }`.
- **D-18:** Route requires admin session (`requireSession` + admin check, same as other admin routes). The demo provisioning should only be accessible to logged-in admins/presenters.

### Claude's Discretion
- Exact PingOne API endpoint path for MFA device enrollment with a worker token (researcher to confirm)
- Whether PingOne allows setting a custom password directly on user creation or requires a separate PATCH
- CSS class names for the new section (follow existing `demo-data-*` naming convention)
- Error message copy

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### PingOne API Patterns (BFF)
- `.claude/skills/pingone-api-calls/SKILL.md` — Management API pattern, `getManagementToken()`, user CRUD, error handling
- `banking_api_server/routes/mfa.js` — Existing MFA enrollment routes (enroll/email, enroll/sms-init, enroll/sms-complete) — model the worker-token version on this pattern

### Existing Demo Data Infrastructure
- `banking_api_ui/src/components/DemoDataPage.js` — Place new section at the top; match section heading pattern (`demo-data-section__heading`), step log UI style
- `banking_api_ui/src/components/DemoDataPage.css` — CSS class conventions (`demo-data-*`)
- `banking_api_server/routes/admin.js` — Admin session auth pattern (`requireSession` + admin check)

### Config & Token Exchange
- `banking_api_server/services/configStore.js` — `configStore.getEffective('PINGONE_MCP_TOKEN_EXCHANGER_CLIENT_ID')` for may_act value
- `.claude/skills/oauth-pingone/SKILL.md` — Token patterns (don't duplicate in new route)
- `CLAUDE.md` — BFF security rules, token handling, regression checklist

### Project Instructions
- `REGRESSION_PLAN.md` — Do-not-break list (DemoDataPage is a listed file — check §1 before editing)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `getManagementToken()` pattern in `pingone-api-calls` skill — copy this verbatim into `demoProvisioning.js`
- `mfa.js` `enrollEmailDevice()` call — the new route needs a worker-token variant of the same PingOne API call
- `DemoDataPage.js` step log UI patterns (compliance checklist section) — reuse the ✓/✗ icon + label list style
- `banking_api_server/routes/admin.js` admin auth check pattern

### Established Patterns
- All BFF routes use `require('../services/configStore')` for config, never `process.env` directly
- Section heading CSS: `demo-data-section__heading` h2 inside `demo-data-section`
- Toast notifications: `notifySuccess`, `notifyError` from `../utils/appToast`
- API calls from UI: `apiClient.post('/api/demo/provision-user', body)` (axios-based `apiClient` service)

### Integration Points
- `DemoDataPage.js` — add new `<section className="demo-data-section">` at the top of the return JSX
- `banking_api_server/server.js` — register `app.use('/api/demo', demoProvisioningRoutes)`

</code_context>

<specifics>
## Specific Ideas

- Result card should make it easy for the presenter to copy credentials and narrate: "Here's our demo user — now let me log in as them to show delegation in action."
- Step log style should visually match the compliance checklist already in DemoDataPage (same icon/label pattern).
- The fixed password constant should be defined at the top of the route file so it's easy to find and change.

</specifics>

<deferred>
## Deferred Ideas

- Bulk provisioning (create multiple users at once) — out of scope for this phase
- Delete / cleanup button to remove provisioned demo users — useful but a separate phase
- TOTP / SMS MFA enrollment — email OTP chosen for simplicity; other device types could be added later
- Auto-generated email format — user-specified email was chosen; timestamp-based auto-email could be a future option

</deferred>

---

*Phase: 265-demo-data-page-create-demo-user-with-may-act-p1mfa-registrat*
*Context gathered: 2026-05-03*
