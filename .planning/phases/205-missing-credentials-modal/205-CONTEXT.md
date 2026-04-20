# Phase 205: Missing Credentials Modal — Context

**Gathered:** 2026-04-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Users who attempt an action requiring missing OAuth or worker credentials see a blocking modal that:
1. Detects which credentials are missing (client_id, client_secret, scope, worker token, etc.)
2. Collects them via a multi-step sequential form
3. Shows helpful guidance (collapsible section with step-by-step setup instructions)
4. Validates and submits to the BFF
5. Auto-retries the original action on success

</domain>

<decisions>
## Implementation Decisions

### Form Structure & User Flow
- **D-01:** Sequential form fields — User enters credentials one at a time (client_id → submit → client_secret → submit → etc.), not all fields on one page. Each step becomes its own modal screen.
- **D-02:** Each step has a clearer mental model: "Enter your Client ID" then "Enter your Client Secret" rather than a dense multi-field form.

### Guidance & Help
- **D-03:** Collapsible guidance section — "How to find your credentials?" button/header that expands/collapses a help section (not always visible, not a separate modal, not a link).
- **D-04:** For worker tokens: Step-by-step instructions within the collapsible section. Example: "1. Go to PingOne Admin. 2. Click Worker Apps. 3. Select [app name]. 4. Create or copy token. 5. Paste here."
- **D-05:** For OAuth clients: Similar step-by-step guidance directing user to PingOne OAuth application creation workflow.

### Error Handling & Validation
- **D-06:** Dual error display — Inline field-level errors (red border + error text under field) + form-level toast at top/bottom of modal for server/validation failures.
  - Field-level: "Client ID must be at least 10 characters" (format/length validation)
  - Toast: "Client ID already registered in PingOne" (server-side conflicts)
- **D-07:** Modal stays open after submission failure — User can adjust fields and resubmit using the same modal. No close/restart required.
- **D-08:** Cancel button always available — User can abandon the flow at any step; action is not retried.

### Keyboard & Accessibility
- **D-09:** Standard form UX for keyboard:
  - Tab: cycles through fields in order (no auto-submit)
  - Escape: cancels and closes modal
  - Enter: does NOT submit on field; user must click Submit button
  - This matches existing modal patterns (TransactionConsentModal)

### the agent's Discretion
- Exact wording of field labels and help text (e.g., "Client ID" vs "OAuth Client ID")
- Animation/transition timing between sequential steps
- Modal overlay styling (color, opacity, positioning)
- Retry delay (if any backoff is needed for PingOne rate limits)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing Modal & Form Patterns
- [banking_api_ui/src/components/TransactionConsentModal.js](banking_api_ui/src/components/TransactionConsentModal.js) — Modal structure, state management, overlay styling; used as template for credentials modal
- [banking_api_ui/src/components/FidoStepUpModal.js](banking_api_ui/src/components/FidoStepUpModal.js) — Step-by-step modal flow pattern (similar sequential UX)
- [banking_api_ui/src/App.css](banking_api_ui/src/App.css) — Existing modal CSS classes (overlay, card, button styles)

### Credential Storage & PingOne Integration
- [banking_api_server/services/configStore.js](banking_api_server/services/configStore.js) — Persistent credential storage (backend key-value store)
- [banking_api_server/services/pingoneAppConfigService.js](banking_api_server/services/pingoneAppConfigService.js) — PingOne Management API calls to update app config (redirect URIs, scopes)
- [banking_api_server/config/oauthUser.js](banking_api_server/config/oauthUser.js) & [banking_api_server/config/oauthAdmin.js](banking_api_server/config/oauthAdmin.js) — OAuth client credential requirements (what fields are mandated)

### Project Context & Non-Negotiables
- [CLAUDE.md](CLAUDE.md) — Project guide, phase workflow, regression list
- [REGRESSION_PLAN.md](REGRESSION_PLAN.md) §1 — Protected files and areas; credentials modal changes must NOT break OAuth flows
- [.planning/PROJECT.md](.planning/PROJECT.md) — "Tokens stay server-side" is mandatory; credentials modal never exposes raw values to browser

### Error Handling Pattern
- [banking_api_server/src/services/errorMessageBuilder.js](banking_api_server/src/services/errorMessageBuilder.js) — User-facing error message construction; reference for tone and field-specific error text

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

**Modal Structure:**
- `TransactionConsentModal.js` — Complete modal component with state, overlay, buttons. Reuse CSS and component shape (not logic).
- `FidoStepUpModal.js` — Step-by-step modal flow; reference for sequential UX patterns.

**Form Inputs:**
- `SetupPage.js` uses standard `<input type="text" />` and `<input type="password" />` patterns with label + help text.
- Existing modals use inline validation feedback (red borders, error text).

**Styling:**
- `App.css` already has modal overlay classes (`.otp-step-up-modal`, etc.) — reuse these for consistency.
- Banking theme colors and button styles from existing modals.

### Established Patterns

**Sequential UX:** `FidoStepUpModal` shows how to render one step at a time with Next/Back buttons. Credentials modal follows same pattern: render current field, show "Next" button to advance.

**Error Recovery:** `TransactionConsentModal` stays open on validation failure, user adjusts and resubmits. Same pattern applies here.

**Collapsible Sections:** Existing components use `<details>/<summary>` for expandable help. Can reuse.

### Integration Points

**Trigger:** App.js or BankingAgent.js catches API error (e.g., `missing_credentials` response code or `error_code: 'credentials_missing'`).

**Submission:** POST to `/api/config/credentials/set` (to be created in Phase 205 planning).

**Retry:** After successful submission, re-invoke the original action (stored in state or localStorage).

</code_context>

<specifics>
## Specific Ideas

- Sequential steps should show progress: "Step 1 of 3: Client ID" → "Step 2 of 3: Client Secret" → "Step 3 of 3: Scope"
- Collapsible guidance text should be prefaced with an info icon for visual clarity
- When user submits a field and moves to the next, store intermediate values in state so if they cancel/close, they can re-open and continue from that point (or reset on timeout)
- Consider a "Copy to clipboard" helper for PingOne values that users need to enter

</specifics>

<deferred>
## Deferred Ideas

- **Credential validation UI** — Real-time syntax checking ("valid format", "invalid format") as user types. Deferred to Phase 206.
- **Credentials reset/revoke** — Button to clear stored credentials or revoke from PingOne. Deferred (separate phase).
- **Credentials expiry warnings** — Notify user when stored credentials approach expiration. Deferred.
- **Multi-step setup wizard** — Animated flow to create OAuth app in PingOne from within modal. Deferred (complex, better as standalone tool).

</deferred>

---

*Phase: 205-missing-credentials-modal*
*Context gathered: 2026-04-20*
