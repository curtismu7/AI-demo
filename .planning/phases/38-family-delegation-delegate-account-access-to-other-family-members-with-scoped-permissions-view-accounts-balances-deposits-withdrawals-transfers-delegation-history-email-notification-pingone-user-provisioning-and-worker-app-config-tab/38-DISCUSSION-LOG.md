# Phase 38: Family Delegation — Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-04
**Phase:** 38-family-delegation
**Areas discussed:** Delegate user provisioning, Delegation UX placement, Worker app config tab

---

## Delegate User Provisioning

| Option | Description | Selected |
|--------|-------------|----------|
| Create new PingOne user automatically | BFF calls Management API with worker app client_credentials to provision user, then grants delegation. Uses existing `pingoneBootstrapService.js` pattern. | ✓ |
| Require delegate to already exist | Simpler; lookup by email, fail gracefully if not found. Less demo impact. | |
| You decide | Use whatever fits existing code | |

**User's choice:** Option 1 — Create new PingOne user automatically
**Notes:** No additional clarifications.

---

## Delegation UX Placement

| Option | Description | Selected |
|--------|-------------|----------|
| Dedicated `/delegation` page | Full-page experience linked from dashboard. Demo-presentable as standalone feature. | ✓ |
| Section on the Dashboard | Collapsible card alongside account cards. Lower navigation friction. | |
| Modal/drawer from Dashboard | "Manage delegates" button opens a panel. Uses existing drawer infrastructure. | |

**User's choice:** Option 1 — Dedicated `/delegation` page
**Notes:** No additional clarifications.

---

## Worker App Config Tab

| Option | Description | Selected |
|--------|-------------|----------|
| Read-only status display | Shows worker app `client_id`, environment URL, and "Test connection" button. | |
| Editable config form | Update worker app credentials in UI, save to BFF config store. | ✓ |
| You decide | Fit to existing Config page structure | |

**User's choice:** Option 2 — Editable config form

### Follow-up: Credential persistence

| Option | Description | Selected |
|--------|-------------|----------|
| `configStore.js` (existing pattern) | In-memory at runtime + SQLite on localhost. Consistent with all other Config fields. | ✓ |
| In-memory only | Applies for current server session, resets on restart. | |
| You decide | Use existing config infrastructure | |

**User's choice:** Option 1 — `configStore.js` + SQLite on localhost
**Notes:** User specified "and on sqlite on localhost version" — confirming SQLite-backed persistence for local dev.

---

## Agent's Discretion

- **Delegation scope controls** (area 1 — not selected for discussion): Agent will implement granular per-operation scopes (`view_accounts`, `view_balances`, `create_deposit`, `create_withdrawal`, `create_transfer`) as checkboxes, pre-checking read-only by default.
- **Delegation storage**: SQLite locally / in-memory on Vercel — local records, not PingOne policies.
- **Email notifications**: Use existing `emailService.js` for grant/revoke; best-effort (demo-grade).

## Deferred Ideas

- MCP-level scope enforcement for delegates — future phase
- PingOne policy-based delegation — out of milestone scope
