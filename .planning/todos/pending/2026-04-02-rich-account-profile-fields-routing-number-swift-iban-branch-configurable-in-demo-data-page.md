---
created: 2026-04-02T15:52:08.079Z
title: Rich account profile fields — routing number, SWIFT, IBAN, branch, configurable in demo data page
area: ui
files:
  - banking_api_server/routes/accounts.js:74-116
  - banking_api_server/data/store.js:170-280
  - banking_api_ui/src/components/DemoData.js
  - banking_api_ui/src/components/Dashboard.js
---

## Problem

Account records today expose only: `id`, `accountType`, `accountNumber` (short `CHK-{UID}` format), `name`, `balance`, `currency`, `isActive`. This is minimal and doesn't feel like a real bank account. The demo would be more convincing and educational if accounts showed the kind of data a real banking API returns, including routing number, SWIFT/BIC code, IBAN, branch name, and account holder name. These fields are also needed by Phase 29 (Use-case C sensitive data access) as the "sensitive" fields that require explicit authorization.

Additionally, these fields need to be:
- **Stored** in the account data model (not just displayed as hardcoded mocks)
- **Shown in the UI** on the dashboard account card or a dedicated account detail view
- **Configurable** on the Demo Data page — user can edit values per-account and choose which fields are shown/hidden
- **Selectable** — user picks which fields to expose (e.g., hide IBAN for a US-only demo, show SWIFT for international scenario)

## Solution

### New account fields to add (per account record)

| Field | Example | Sensitivity |
|-------|---------|-------------|
| `routingNumber` | `026073150` | Sensitive (Phase 29) |
| `accountNumberFull` | `000123456789` | Sensitive (Phase 29) |
| `swiftCode` | `CHASUS33` | Moderate |
| `iban` | `US12CHAS0000012345` | Moderate |
| `branchName` | `BX Finance Main Branch` | Public |
| `branchCode` | `001` | Public |
| `accountHolderName` | `Alex Johnson` | Public (from user profile) |
| `openedDate` | `2022-01-15` | Public |

### Implementation approach

1. **Data model** — Add fields to `provisioning()` in `accounts.js` with realistic
   defaults. Store in `demoScenarioStore` snapshot so they survive cold-starts.

2. **API response** — `GET /api/accounts/my` returns all non-sensitive fields always.
   Sensitive fields (`routingNumber`, `accountNumberFull`) require
   `banking:sensitive:read` scope (Phase 29 gate).

3. **UI** — Account card on Dashboard shows public fields; sensitive fields show as
   masked with optional "reveal" (Phase 29 consent flow) or just display the data
   if not gating.

4. **Demo Data page** — New "Account Profile Fields" section:
   - Per-account editable inputs for each field
   - Toggle checkboxes: "Include in API response" per field (drives which fields
     are returned; e.g., uncheck IBAN for US-only demo scenarios)
   - Save writes back to `demoScenarioStore`

5. **Account number format** — Change from short `CHK-{UID}` to a proper-looking
   12-digit number `000123456789` so masking to `****6789` makes visual sense.

### Priority
This should happen before or alongside Phase 29. The routing number and full account
number format particularly need to land in Phase 29's implementation.
