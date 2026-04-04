# Phase 38: Family Delegation — Context

**Gathered:** 2026-04-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver a family account delegation feature: an authenticated user (the "delegator") grants one or more family members (the "delegates") scoped access to their bank account. Includes:

1. **`/delegation` page** — manage delegates (add, view, revoke)
2. **BFF delegation API** — create/list/revoke delegations, provision delegate users in PingOne via Management API, store delegation records, send email notifications
3. **Worker App Config tab** — new tab on `/config` page to view/edit PingOne Management API worker app credentials
4. **Delegation history** — audit trail of grant and revoke events per delegator

This is NOT about: OAuth `may_act` / agent token exchange (that's Phase 21); MCP token delegation (Phase 37); or real PingOne policy enforcement at the resource server level (demo-grade only).

</domain>

<decisions>
## Implementation Decisions

### D-01: Delegate User Provisioning
Create a new PingOne user via Management API when the delegate email doesn't already exist as a user. Flow:
1. BFF looks up email via `pingOneUserLookupService.js` (existing)
2. If not found → create user via Management API (worker app client_credentials) — `pingoneBootstrapService.js` pattern
3. If found → use existing user; skip provisioning
4. Store delegation record locally (delegator userId → delegate userId + granted scopes)

### D-02: Delegation UX Placement
Dedicated `/delegation` page linked from the Dashboard. Full-page experience for demo presentation. Route: `/delegation`. Nav link added to dashboard header or sidebar.

### D-03: Worker App Config Tab
New tab on the existing `/config` page. Tab label: "Worker App". Content:
- Editable form fields: `pingone_client_id` (Management API worker), `pingone_client_secret`, `pingone_environment_id` (read from configStore — already exist as fields)
- "Test connection" button — BFF route that calls Management API with current credentials and returns pass/fail
- Save button — persists updated values via existing `configStore.js` `set()` API

### D-04: Worker App Credential Persistence
`configStore.js` + SQLite on localhost (consistent with all other config fields). `pingone_client_id` and `pingone_client_secret` keys already exist in configStore — no new schema needed. New key needed: distinguish the "worker for delegation" from other PingOne clients if they differ (agent should check if `pingone_client_id` is already used for another purpose and add a `delegation_worker_client_id` key if needed to avoid collision).

### Agent's Discretion: Delegation Scope Controls
Implement granular per-operation scopes: `view_accounts`, `view_balances`, `create_deposit`, `create_withdrawal`, `create_transfer`. Stored as a JSON array on the delegation record. UI presents as checkboxes when adding a delegate. Default: `view_accounts` + `view_balances` (read-only) pre-checked; write ops opt-in.

### Agent's Discretion: Delegation Storage
Store delegation records in SQLite (localhost) / a simple in-memory store (Vercel) — NOT in PingOne. This keeps the demo self-contained and avoids requiring extra PingOne policy setup. Each record: `{ id, delegatorUserId, delegateUserId, delegateEmail, scopes[], grantedAt, revokedAt, status }`.

### Agent's Discretion: Email Notification
Use existing `emailService.js` for:
- "You have been granted access to [Delegator Name]'s accounts" — sent to delegate on grant
- "Your access to [Delegator Name]'s accounts has been revoked" — sent to delegate on revoke
Email is best-effort (demo); no retry required. If `emailService` is not configured, log and continue.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### PingOne Management API patterns
- `banking_api_server/services/pingoneBootstrapService.js` — worker app client_credentials token flow and Management API call patterns
- `banking_api_server/services/pingOneUserLookupService.js` — existing user lookup by email (reuse for delegate lookup)
- `banking_api_server/services/oauthUserService.js` — PingOne user creation patterns if applicable

### Config / credential storage
- `banking_api_server/services/configStore.js` — how keys are defined, read, set, and persisted to SQLite/env; `pingone_client_id`, `pingone_client_secret`, `pingone_environment_id` already exist as fields (lines 47, 64–65)

### Email
- `banking_api_server/services/emailService.js` — existing email sending; use for delegation grant/revoke notifications

### Config UI tab pattern
- `banking_api_ui/src/components/Config.js` — how `VercelConfigTab` is imported and mounted (line 16, 744); follow same pattern for new Worker App tab
- `banking_api_ui/src/components/VercelConfigTab.js` — reference implementation for a config tab

### Existing delegation audit infrastructure
- `banking_api_server/middleware/delegationAuditLogger.js` — already mounted in server.js (lines 195, 399); logs JWT `act`/`may_act` claims — note this is for token-level audit, not the feature-level delegation records

### Regression guard
- `REGRESSION_PLAN.md` §1 — check before touching server.js, session middleware, or oauth routes

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `pingoneBootstrapService.js` — worker token (client_credentials) + Management API calls; reuse for delegate user creation
- `pingOneUserLookupService.js` — email lookup; reuse as first step before provisioning
- `emailService.js` — email notifications; reuse for grant/revoke events
- `configStore.js` — `pingone_client_id` / `pingone_client_secret` / `pingone_environment_id` keys already defined; Worker App tab reads/writes these
- `VercelConfigTab.js` — exact pattern to follow for new `WorkerAppConfigTab.js`
- `Config.js` — mount new tab here (follows `VercelConfigTab` mount pattern)
- `adminConfig.js` (route) — likely home for new `/api/admin/config/worker-test` test-connection endpoint

### Established Patterns
- BFF-only token custody — delegation API routes must be BFF-side; no tokens to browser
- SQLite via `better-sqlite3` for local persistence (configStore already handles this)
- SSE for long-running ops (if provisioning is slow, consider SSE progress; otherwise a simple POST response is fine for a single user creation)
- Config page uses inline tab panels — no separate route per tab

### Integration Points
- Add `/delegation` route to React Router (`App.js`)
- Add `GET/POST/DELETE /api/delegation` routes in BFF `server.js` (or a new `routes/delegation.js`)
- New service: `banking_api_server/services/delegationService.js` — delegation CRUD + PingOne provisioning orchestration
- Dashboard: add "Manage delegates" link/button pointing to `/delegation`

</code_context>

<specifics>
## Specific Ideas

- Delegation scope checkboxes should map clearly to the MCP tool names from Phase 37 (`get_my_accounts`, `get_account_balance`, `get_my_transactions`, `create_deposit`, `create_withdrawal`, `create_transfer`) so the demo can later show a delegate's agent only seeing their granted tools — even if that wiring is not built in Phase 38.
- "Test connection" for the Worker App tab should hit `GET /api/admin/config/worker-test` and return `{ ok: true, environmentId, appName }` or `{ ok: false, error }`.

</specifics>

<deferred>
## Deferred Ideas

- Scope area 1 (delegation scope controls) was skipped interactively — handled under Agent's Discretion above.
- MCP-level enforcement of delegation scopes (delegate's agent actually restricted to granted tools) — belongs in a future phase once delegation records exist.
- PingOne policy-based delegation (using Authorization Server policies rather than local records) — out of scope for this milestone.
- Email delivery confirmation / retry logic — demo-grade only per project constraints.

</deferred>

---

*Phase: 38-family-delegation*
*Context gathered: 2026-04-04*
