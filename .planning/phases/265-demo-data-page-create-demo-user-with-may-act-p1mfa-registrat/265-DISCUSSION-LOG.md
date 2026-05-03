# Phase 265: Demo data page provisioning - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-03
**Phase:** 265 - Demo data page: create demo user with may_act, P1MFA registration
**Areas discussed:** Target user, MFA device type, may_act value, Page placement & UI

---

## Target User

| Option | Description | Selected |
|--------|-------------|----------|
| Create new PingOne user | BFF worker token creates net-new demo user with may_act + MFA | ✓ |
| Enrich current logged-in user | Adds may_act + MFA to the already-logged-in account | |
| Both — create new + offer current user option | Two buttons for both operations | |

**User's choice:** Create new PingOne user

---

| Option | Description | Selected |
|--------|-------------|----------|
| Fixed demo password shown in UI | `Demo1234!` constant; credentials shown in result card | ✓ |
| Random password shown in UI | Generated once, shown in result card | |
| No password — send PingOne invite email | PingOne sends welcome email | |

**User's choice:** Fixed demo password shown in UI

---

| Option | Description | Selected |
|--------|-------------|----------|
| demo+timestamp@yourdomain.com | Unique per run, auto-generated | |
| User-specified — input field in the UI | Presenter types the email | ✓ |
| Fixed demo username (overwrite if exists) | Always the same email | |

**User's choice:** User-specified email input field

---

## MFA device type

| Option | Description | Selected |
|--------|-------------|----------|
| Email OTP | Uses login email, route already exists | ✓ |
| SMS OTP | Requires phone number input field | |
| TOTP (authenticator app) | QR code, most realistic enterprise MFA | |

**User's choice:** Email OTP

---

| Option | Description | Selected |
|--------|-------------|----------|
| Automatic — part of create-user flow | Single button: create user + may_act + email OTP | ✓ |
| Separate step — create then enroll MFA | Two-step UI, two clicks | |

**User's choice:** Automatic, one-click

---

## may_act value

| Option | Description | Selected |
|--------|-------------|----------|
| MCP token exchanger client_id | `{"client_id": "<PINGONE_MCP_TOKEN_EXCHANGER_CLIENT_ID>"}` | |
| User-specified sub — input field | Presenter pastes any client_id | |
| Auto-detect from configStore at runtime | BFF reads configStore at provision time | ✓ |

**User's choice:** Auto-detect from configStore at runtime

---

| Option | Description | Selected |
|--------|-------------|----------|
| `{"client_id": "<id>"}` as JSON string | Matches existing may_act toggle format | ✓ |
| Plain string — just the client_id value | Simpler but mismatched format | |

**User's choice:** JSON string `{"client_id": "<id>"}`

---

## Page placement & UI

| Option | Description | Selected |
|--------|-------------|----------|
| New top section 'Create Demo User' | Prominent, presenter sees first | ✓ |
| New card next to existing may_act quick-action | Compact, grouped | |
| Separate tab or accordion panel | Clean but hidden behind a click | |

**User's choice:** New top section above existing sections

---

| Option | Description | Selected |
|--------|-------------|----------|
| Inline step log — each step appears as it completes | ✓/✗ per step, credentials at end | ✓ |
| Simple success toast + result card | Spinner, then result | |
| Modal with step log | Modal popup with steps | |

**User's choice:** Inline step log with credential result card

---

## Claude's Discretion

- CSS class names for new section (follow `demo-data-*` convention)
- Exact PingOne API endpoint for MFA device enrollment via worker token
- Whether PingOne allows password set on user creation or requires a separate PATCH
- Error message copy

## Deferred Ideas

- Bulk provisioning — out of scope
- Delete/cleanup button — separate phase
- TOTP/SMS MFA enrollment — email OTP chosen; other types deferred
- Auto-generated email format — deferred
