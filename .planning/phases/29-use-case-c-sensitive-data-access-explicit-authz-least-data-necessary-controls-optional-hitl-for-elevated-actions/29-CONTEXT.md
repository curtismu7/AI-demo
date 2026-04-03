# Phase 29: Use-case C — Sensitive Data Access - Context

**Gathered:** 2026-04-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Demonstrate a third distinct authorization scenario (Use-case C) where the AI agent
requests *restricted account detail fields* — fields that are masked by default and
require both a scope check AND a PingOne Authorize policy decision before the BFF
returns the unmasked values. A browser-side consent banner gates the request: the agent
is held (returns `consent_required: true`) until the user clicks "Reveal" in the UI,
at which point the agent retries and receives the real data.

This phase delivers:
1. **API masking layer** — `accountNumber` always returned masked (`****1234`) plus a
   new `routingNumber` field (also masked `****XXXX`). A new protected endpoint or
   response-shaping flag returns the full values only after authz passes.
2. **BFF authorization gate** — requires `banking:sensitive:read` scope AND a positive
   PingOne Authorize decision; returns `consent_required: true` when the gate is not met.
3. **UI consent banner** — shown when agent tool call is blocked; user clicks "Reveal"
   to signal approval; agent retries and unblocks.
4. **Education panel** — "Sensitive Data & Selective Disclosure" with two tabs:
   Least-data / Minimal Disclosure + RAR / RFC 9396 (selective claims).

**Not in scope:** Write operations on sensitive fields, multi-level field classifications,
production PII redaction, admin-side sensitive data management.

5. **Rich account profile fields** — expand account data model with banking-realistic
   fields (`routingNumber`, `accountNumberFull`, `swiftCode`, `iban`, `branchName`,
   `branchCode`, `openedDate`); change `accountNumber` format from short `CHK-{UID}`
   to 12-digit `000123456789` so masking to `****6789` is visually meaningful; show
   public fields on Dashboard; sensitive fields (`routingNumber`, `accountNumberFull`)
   gated by Phase 29 authz flow; all fields configurable and toggleable on Demo Data
   page (per-account editable inputs + "include in response" checkboxes).

</domain>

<decisions>
## Implementation Decisions

### A — Sensitive Data Fields (D-01)
- **D-01:** Account data model expands significantly. Fields by sensitivity tier:

  **Sensitive (require `banking:sensitive:read` + PAZ consent gate):**
  - `accountNumberFull` — 12-digit e.g. `000012345678` (replaces short `CHK-{UID}` format);
    masked to `****5678` by default
  - `routingNumber` — e.g. `026073150` (checking), `021000021` (savings);
    omitted entirely by default

  **Public (always returned, no gate):**
  - `swiftCode` — e.g. `CHASUS33`
  - `iban` — e.g. `US12CHAS0000012345`
  - `branchName` — e.g. `BX Finance Main Branch`
  - `branchCode` — e.g. `001`
  - `openedDate` — e.g. `2022-01-15`
  - `accountHolderName` — from user profile

- `accountNumber` format **changes** from `CHK-{UID}` to 12-digit `000012345678` so
  masking to `****5678` is visually meaningful. Existing `accountNumber` field renamed
  to `accountNumberFull`; `accountNumber` becomes the masked display value.
- After consent is granted, both sensitive fields return in full. Data is **read-only**.
- All fields stored in `demoScenarioStore` snapshot (survive cold-starts).
- Per-field visibility configurable on Demo Data page (toggle "include in response").

### B — Authorization Gate (D-02)
- **D-02:** The sensitive-data endpoint enforces BOTH:
  1. **Scope check** — token must include `banking:sensitive:read` scope
     (add to `scopeCatalog` / PingOne app scopes; users do NOT get it by default)
  2. **PAZ decision** — PingOne Authorize decision via the existing
     `authorize_mcp_decision_endpoint_id` pathway (same engine as MCP first-tool gate)
- Use `FAIL_OPEN = false` for this flow — if PAZ is unreachable, deny access
  (unlike MCP first-tool which fails open).
- Simulated-authorize fallback must also apply (for local demo without live PAZ).

### C — HITL Consent Flow (D-03)
- **D-03:** Agent-triggered, browser-gated flow:
  1. Agent MCP tool call requests sensitive account details.
  2. BFF checks scope + PAZ. If gate fails → returns
     `{ ok: false, consent_required: true, reason: 'sensitive_data_access' }`.
  3. UI receives `consent_required: true` → renders a **consent banner** (not OTP modal)
     in the agent conversation panel: "🔒 Agent is requesting access to sensitive
     account details. [Reveal] [Deny]".
  4. User clicks "Reveal" → BFF stores a short-lived (60s TTL) consent token in
     session keyed to `(userId, 'sensitive_read')`.
  5. Agent retries the same tool call → BFF sees the session consent token → scope
     check bypassed for this session window → PAZ decision still evaluated.
  6. Consent token is single-use or expires after 60s (TTL only, no OTP required).
- The banner is shown in the banking agent chat panel (not a modal blocking the whole UI).
- Do NOT reuse `transactionConsentChallenge.js` (it's wired to dollar amounts); create
  a parallel lightweight session-consent mechanism.

### D — Education Panel (D-04)
- **D-04:** Education drawer: "Sensitive Data & Selective Disclosure"
  - **Tab 1: Least-Data Principle** — only return data the agent actually
    needs; field-level scopes; masking patterns; why agents shouldn't get full PII
  - **Tab 2: RAR / RFC 9396** — Rich Authorization Requests for selective data
    claims; complements the existing RARPanel.js (which covers the RAR concept) by
    showing a concrete banking example with the `banking:sensitive:read` scope
  - Follow existing education panel pattern: `EducationDrawer` wrapper, tabs array,
    inline styles, register in `EducationPanelsHost.js` + `educationCommands.js` +
    `educationIds.js`

### Folded Todos
- **Rich account profile fields** (todo: `2026-04-02-rich-account-profile-fields-routing-number-swift-iban-branch-configurable-in-demo-data-page.md`) — Expand account data model with banking-realistic fields; make configurable on Demo Data page. Account number format change is a prerequisite for Phase 29 consent-reveal masking to work visually. Fields: `routingNumber`, `accountNumberFull`, `swiftCode`, `iban`, `branchName`, `branchCode`, `openedDate`, `accountHolderName`.

### Agent's Discretion
- Which specific agent chip / command triggers use-case C (e.g., "View full account
  details" chip in the banking agent)
- Exact mock routing number values per account type
- Toast / feedback copy after user clicks Reveal
- Education panel color accent (follow existing phase palette)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### HITL + Consent (existing patterns to build alongside, not replace)
- `banking_api_server/services/transactionConsentChallenge.js` — existing consent
  challenge flow (OTP, dollar-amount-gated); use as reference pattern, not base class
- `banking_api_server/services/mcpLocalTools.js` — `hitlBlocksLocalWrite()`,
  `HITL_LOCAL_AGENT_MESSAGE` pattern — reference for how MCP tool returns
  `consent_challenge_required: true` to the caller

### Authorization (existing PAZ gate)
- `banking_api_server/services/mcpToolAuthorizationService.js` — PAZ decision engine,
  `ff_authorize_mcp_first_tool`, `FAIL_OPEN`, `simulated` vs `pingone` engine
- `banking_api_server/services/pingOneAuthorizeService.js` — PAZ parameter mapping,
  Trust Framework attribute names
- `docs/PINGONE_AUTHORIZE_PLAN.md` §Parts 9-12 — AUD validation, act.sub vs
  act.client_id, transaction limit policies, two-hop chain

### Account data model
- `banking_api_server/routes/accounts.js` — provisioning (lines 74-116); existing
  `accountNumber` field shape (`CHK-{UID}`); `GET /api/accounts/my` response shape
- `banking_api_server/data/store.js` — `createAccount`, `getAccountById`,
  `getAccountsByUserId`

### Account data + Demo Data page
- `banking_api_ui/src/components/DemoData.js` — Demo Data page where account fields become configurable; add "Account Profile Fields" section with per-account editors and field visibility toggles

### Education panel pattern
- `banking_api_ui/src/components/education/EducationPanelsHost.js` — how to register panels
- `banking_api_ui/src/components/education/educationIds.js` — ID constants
- `banking_api_ui/src/components/education/educationCommands.js` — chat commands
- `banking_api_ui/src/components/education/LlmLandscapePanel.js` — canonical example
  of the current panel pattern (tabs, inline styles, helper components)
- `banking_api_ui/src/components/education/RARPanel.js` — existing RAR content
  (Tab 2 must not duplicate this; extend or cross-reference it)

### Scope catalog
- `banking_api_ui/src/config/agentMcpScopes.js` — `AGENT_MCP_SCOPE_CATALOG`,
  `DEFAULT_AGENT_MCP_ALLOWED_SCOPES` — add `banking:sensitive:read` here
- `banking_api_server/middleware/auth.js` — `requireScopes()` middleware

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `transactionConsentChallenge.js` — consent lifecycle pattern (create/confirm/verify);
  NOT directly reused but serves as the blueprint for the lightweight session-consent token
- `mcpLocalTools.js` — `hitlBlocksLocalWrite()` — returning `consent_required: true`
  from an MCP tool is already established; extend same pattern
- `mcpToolAuthorizationService.js` — plug into existing `checkMcpToolAuthorization()`
  or create a parallel `checkSensitiveDataAccess()` function using the same PAZ engine
- `educationIds.js` / `educationCommands.js` / `EducationPanelsHost.js` — standard
  wiring for new panel registration

### Established Patterns
- Scope enforcement: `requireScopes(['banking:sensitive:read'])` middleware in route handlers
- PAZ: `pingOneAuthorizeService.evaluateDecision()` called from BFF service layer
- Education panels: one file per panel, export default function, tabs array, `EducationDrawer`
- HITL response shape: `{ error: 'consent_challenge_required', consent_challenge_required: true }`

### Integration Points
- New BFF route: `GET /api/accounts/sensitive-details` or a query param
  `?include_sensitive=true` on the existing accounts route — behind
  `requireScopes + PAZ + session-consent` gate
- New session key: `req.session.sensitiveReadConsent = { grantedAt, expiresAt, userId }`
- New UI component: `SensitiveConsentBanner.js` rendered inside the banking agent panel
  when agent returns `consent_required: true`
- MCP tool: new `get_sensitive_account_details` tool in `BankingToolProvider` or extend
  existing `get_accounts` with a `sensitive` flag

</code_context>

<specifics>
## Specific Ideas

- Consent banner copy: "🔒 The agent is requesting your full account number and routing
  number. These are sensitive fields." → [Reveal] [Deny]
- After Reveal: show a brief "✓ Access granted (60s)" indicator in the banner before it
  dismisses
- `routingNumber` values: `026073150` (Checking), `021000021` (Savings) — realistic
  looking US routing numbers for the demo
- Masked display: account number `CHK-ABC123` → displayed as `****3` (last char only
  since the format is short) or better: generate longer format `CHK-0000-{UID}` so
  masking `****{last4}` makes more visual sense. Planner to decide exact format.
- PAZ decision context for sensitive access: `DecisionContext = SensitiveDataAccess`
  (new context value alongside `McpFirstTool`)

</specifics>

<deferred>
## Deferred Ideas

- Multi-tiered data classification (public / sensitive / restricted / top-secret)
- Per-field scope granularity (separate scopes for account number vs routing vs address)
- User-configurable "always allow sensitive" session preference
- Sensitive data audit log (track every reveal event to a persistent log)
- "Deny" flow closes the consent window and returns a user-friendly error to the agent

None of these were requested — capturing to avoid re-raising in future discussions.

</deferred>

---

*Phase: 29-use-case-c-sensitive-data-access-explicit-authz-least-data-necessary-controls-optional-hitl-for-elevated-actions*
*Context gathered: 2026-04-02*
