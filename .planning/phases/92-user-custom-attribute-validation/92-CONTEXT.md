---
phase: 92-user-custom-attribute-validation
created: 2026-04-08
status: locked
---

# Phase 92: user-custom-attribute-validation — Context

## Domain

Validate that users have the required PingOne custom attributes configured correctly, report missing/incorrect attributes, and provide fix capability. This phase integrates into Phase 90's scope/resource check tooling, adding user attribute validation alongside scope and resource URL validation.

Target audience: Demo admin users who need to verify that demo accounts are correctly configured with required PingOne attributes (e.g., account number, account type, transaction limit for step-up MFA).

---

## Decisions

### D-01: Custom attributes are PingOne user attributes
Custom attributes are stored in PingOne's user schema, not in the banking app's database. Examples:
- `banking_account_number` — customer's account number
- `banking_account_type` — "checking" or "savings"
- `banking_step_up_threshold` — transaction amount that triggers step-up MFA
- `banking_customer_tier` — "standard" or "premium"

Rationale: Single source of truth. Attributes can be managed via PingOne UI or Management API. Simpler than maintaining a separate attribute database.

### D-02: Attribute schema is defined in code
The set of required attributes and their validation rules (e.g., account_number must be 10 digits) are defined in a JSON schema file. Example: `banking_api_server/config/userAttributeSchema.json`.

Rationale: Allows Phase 90's configuration UI to dynamically discover required attributes without hard-coding. Single source of truth for validation rules.

### D-03: Validator service checks all required attributes
Create a new service `banking_api_server/services/userAttributeValidator.js` that:
1. Reads the schema
2. For each logged-in user, checks if all required attributes are present in their PingOne user object
3. Reports missing/invalid attributes with a fix suggestion

Rationale: Reusable validator logic. Can be called from the Phase 90 config panel, from login flows, or from admin tools.

### D-04: Fix capability via PingOne Management API
The validator can trigger a "fix" action that uses the Management API (worker app token) to populate missing attributes with sensible defaults. Example:
- Missing `banking_account_number` → assign sequential account number
- Missing `banking_step_up_threshold` → assign default of 250

Rationale: Automatic remediation reduces manual admin burden. User can always override defaults via PingOne UI afterward.

### D-05: Integration into Phase 90 config panel
Phase 90 delivers a "Config Check" panel that validates scopes and resource URLs. Phase 92 adds a "User Attributes" section to that same panel, showing:
- List of required attributes
- For current user: which are present, which are missing
- One-click "Fix" button that populates missing attributes

Rationale: Single admin experience for "is the PingOne app configured correctly?". No separate UI panel needed.

### D-06: Scope rules and attribute rules are separate
Phase 90 validates scopes; Phase 92 validates attributes. A user can have correct scopes but missing attributes (or vice versa). The validator reports both independently.

Rationale: Clear separation of concerns. Scopes govern API access; attributes govern business logic (step-up thresholds, account types, etc.).

### D-07: Validation happens at the BFF
User attribute validation is executed on the BFF (not in the UI, not in MCP server). The BFF has access to the PingOne Management API and the current user's token.

Rationale: Security boundary. Tokens stay server-side. Prevents UI from attempting to modify PingOne directly.

### D-08: No changes to auth flows
Phases 1-2 auth flows (user login, CIBA) are unchanged. Attribute validation is advisory (a report), not a gate. A user without all required attributes can still log in; they just see a warning from Phase 90's config panel.

Rationale: Don't introduce new login failures. Focus on admin observability via the config panel.

---

## Deferred Ideas

- Automatic on-login attribute remediation (blocking fix) — future phase
- Attribute value editor UI in the demo — future phase
- Bulk user attribute upload / migration — future phase
- Attribute audit trail / change log — future phase
- Custom attribute schema versioning — future phase

---

## Canonical Refs

- `.planning/phases/90-*/90-*-PLAN.md` — Phase 90 plans (scope/resource validation, config panel)
- `banking_api_server/services/oauthClientRegistry.js` — Scope validation service; reuse patterns
- `banking_api_server/services/` — Directory structure for new validator service
- `banking_api_server/routes/` — Where a new `/api/admin/validate-user-attributes` endpoint will live
- `banking_api_ui/src/components/ConfigPanel.tsx` (or similar) — Phase 90's config panel; Phase 92 extends it
- `.env.example` — Environment variables; will need `PINGONE_MANAGEMENT_API_URL`, worker app credentials (already present from Phase 90)
- `REGRESSION_PLAN.md` — No-break list; login flows must remain unchanged
- `docs/PINGONE_CUSTOM_ATTRIBUTES.md` — Future doc describing the attribute schema and defaults

---

## Specific Context

**Why Phase 92 depends on Phase 91 (not Phase 90 only)**: The conversation notes Phase 92 depending on Phase 91, but logically it depends on Phase 90 (for the config panel integration). The dependency chain is: 90 → 91 → 92, where each phase adds to the previous. Phase 92 re-uses Phase 90's config panel and Phase 91's OAuth patterns.

Actually, let me re-read the roadmap entry... The ROADMAP shows Phase 92 depends on Phase 91. This may be intentional: Phase 91 establishes the pattern of "client attribute validation" (for external clients); Phase 92 applies that pattern to user validation. Either way, Phase 92 integrates with Phase 90's config UI.

**User Attribute Schema Example**:
```json
{
  "required": [
    {
      "name": "banking_account_number",
      "type": "string",
      "pattern": "^[0-9]{10}$",
      "description": "10-digit account number"
    },
    {
      "name": "banking_account_type",
      "type": "enum",
      "allowedValues": ["checking", "savings"],
      "description": "Account type"
    }
  ],
  "optional": [
    {
      "name": "banking_step_up_threshold",
      "type": "number",
      "default": 250,
      "description": "Step-up MFA trigger amount"
    }
  ]
}
```

**No changes to BFF logic**: Phase 92 is advisory/reporting only. It does NOT change how the BFF enforces scopes or processes transactions. It just reports to the admin "your users are missing these attributes".

---

## The agent's Discretion

- Where exactly to store the attribute schema file (could be `banking_api_server/config/`, `banking_api_server/services/`, or `.planning/docs/`)
- The default values for auto-fix (e.g., how to assign sequential account numbers)
- Whether to cache the schema or reload it on each check
- Exact UI layout and wording in Phase 90's extended config panel
