# Phase 146: Scope Vocabulary Alignment — Match Code to PingOne — Context

**Gathered:** 2026-04-14  
**Status:** Ready for planning  
**Source:** Interactive discuss-phase  

---

## Phase Boundary

Phase 146 aligns the **scope vocabulary and enforcement across code and PingOne configuration** to create a unified, production-realistic demo of OAuth 2.0 scope-based authorization. This phase audits existing scope definitions, establishes a custom PingOne resource server with formal scopes, documents the canonical scope registry, syncs code enforcement patterns, and updates the pingone-test page to reflect the new vocabulary.

---

## Decisions

### D-01: Comprehensive Audit Approach
- **Audit scope:** Perform ALL THREE levels:
  1. **Option A (Inventory + Report):** List every scope reference in code; compare to PingOne configuration; produce discrepancy report
  2. **Option B (Canonical Registry):** Create single source-of-truth mapping: Scope → Resource Server → Code Enforcement → Routes Used
  3. **Option C (Cleanup):** Identify inconsistencies and refactor code to align with agreed-upon scope vocabulary
- **Rationale:** Comprehensive approach ensures downstream phases have confidence that code matches reality; no hidden assumptions
- **Deliverable:** By end of Phase 146, every scope reference in code must be documented and justified

### D-02: Formal Custom Resource Server (Production-Realistic Approach)
- **Scope naming pattern:** Simplify to 4 canonical scopes + compound variants:
  - `banking:read` — read-only access to accounts and transactions
  - `banking:write` — write access (deposits, withdrawals, transfers)
  - `banking:admin` — administrative access
  - `ai_agent` — identifies AI agent clients (combined with banking:read + banking:write for agent token exchanges)
  - **Compound scopes** (for backward compatibility, if PingOne issues them): `banking:accounts:read`, `banking:transactions:read`, `banking:transactions:write`

- **Implementation approach:**
  1. **Detection:** Add PingOne Management API check in Config service to see if `banking_resource` (the custom resource server) exists
  2. **Automation:** If missing, offer one-click creation via `POST /api/admin/config/create-resource-server` that calls PingOne Management API
  3. **Guidance:** If automation fails, display setup guide in Config UI with manual steps
  4. **Fallback:** Provide instructions for user to create resource server manually via PingOne console

- **Educational value:** Demo uses real PingOne resource servers; tokens actually carry `banking:*` scopes; production-realistic
- **Rationale:** Demo should teach how OAuth 2.0 scopes work in production, not a simplified simulation

### D-03: Documentation Structure — Registry Doc + Rich Code Docs
- **Create new canonical registry:**
  - New file: `banking_api_server/SCOPE_VOCABULARY.md` — single source of truth
  - Contents: Canonical scope list | Description | PingOne Resource Server | Routes enforcing it | Enforcement type (requireScopes vs row-level)
  - Usage: Linked from Config UI, referenced in all scope-related code comments

- **Update existing setup guides:**
  - `banking_api_server/OAUTH_SCOPE_CONFIGURATION.md` → keep as PingOne OAuth setup reference; link to SCOPE_VOCABULARY.md for canonical definitions
  - `banking_api_server/SCOPE_AUTHORIZATION.md` → detail enforcement patterns; link to SCOPE_VOCABULARY.md for scope definitions

- **Rich code documentation (Option C):**
  - Add JSDoc comments to all routes that check scopes: `@scope banking:write` (which scopes required)
  - Schema files (e.g., `config/scopes.js`) have inline comments mapping scope → meaning
  - Generator/automation: Auto-doc tools can extract scope references from JSDoc for future reference docs

- **Rationale:** Separation of concerns — registry answers "what scopes exist and why," code docs answer "where scopes are enforced"

### D-04: Scope Injection for Demo Education (Hybrid Approach)
- **Pattern:** Use real PingOne scopes by default; allow optional injection for incomplete setups
- **Mechanism:**
  1. **Setup verification:** Config page displays current status: "Resource server configured: ✓" or "Resource server configured: ✗"
  2. **Fallback mode:** If resource server is missing, offer user two choices:
     - "Fix configuration" — link to setup guide
     - "Use demo mode (inject scopes)" — enable `ff_inject_demo_scopes` feature flag
  3. **Injection logic:** When `ff_inject_demo_scopes === true` AND token lacks `banking:*` scopes, inject them into the token response
  4. **Visibility in UI:**
     - Warning banner above token chain: "⚠️ Scope injection enabled — demo mode (scopes injected by application, not from PingOne)"
     - Scope badges in token inspector: Add "INJECTED" label to any scope that was added by injection (vs issued by PingOne)

- **Rationale:** Allows demo to run even with incomplete setup; transparency (labeled as demo) maintains educational integrity
- **Feature flag:** `ff_inject_demo_scopes` (toggle on Demo Data page / Feature Flags section)

### D-05: Canonical Scope Resource in UI — Fast Access
- **Add "Scope Reference" link in two places:**
  1. **Config dropdown menu:** New link "📚 Scope Reference" → opens SCOPE_VOCABULARY.md or renders as a modal panel
  2. **Hamburger menu (SideNav):** New menu item "Scopes" under Admin or Help section → same destination
- **Purpose:** Users can quickly navigate to scope definitions without hunting through docs
- **Rationale:** Supports learners who want to understand what scopes do during the demo

### D-06: PingOne Test Page Refactor (Part of Phase 146)
- **Scope:** Update `/pingone-test` route and PingOneTestPage.jsx to use the new canonical scope vocabulary
- **Tasks:**
  1. Update test endpoints (`/api/pingone-test/worker-token`, `/api/pingone-test/agent-token`, `/api/pingone-test/exchange`) to align with D-02 naming
  2. Update UI to display scopes using the new canonical terms
  3. Ensure all token exchange tests reflect real custom resource server scopes (not placeholder scopes)
  4. Verify test page scope injection indicators match the main app (both show "INJECTED" badges if applicable)
- **Rationale:** pingone-test page is a teaching tool; it must demonstrate the final scope vocabulary, not an old version

---

## the agent's Discretion

- **Specific UI component for scope reference modal** — planner decides whether to use a modal panel, sidebar overlay, or external link to markdown
- **Timing of resource server creation** — Should automation attempt creation on Config page load, or only on user request? Planner will decide
- **Injection badge styling** — Exact CSS/placement for "INJECTED" labels in token inspector — planner will harmonize with existing badge styles
- **Resource server app permissions/scopes for Management API** — Which scope (e.g., `p1:read:service_auth_server`, `p1:create:service_auth_server`) is needed for automation? Planner will research and document
- **Backward compatibility handling** — If code already uses compound scopes like `banking:transactions:write`, should they be deprecated or kept alongside new canonical ones? Planner will decide deprecation strategy

---

## Canonical References

**Downstream agents MUST read these before planning or implementing:**

### Current Scope Documentation
- [banking_api_server/OAUTH_SCOPE_CONFIGURATION.md](banking_api_server/OAUTH_SCOPE_CONFIGURATION.md) — existing OAuth scope setup guide (to be updated)
- [banking_api_server/SCOPE_AUTHORIZATION.md](banking_api_server/SCOPE_AUTHORIZATION.md) — scope enforcement patterns in code
- [banking_api_server/SCOPE_CONFIGURATION_README.md](banking_api_server/SCOPE_CONFIGURATION_README.md) — scope config quick reference

### Test Files (scope-related)
- [banking_api_server/test-scope-assignments.js](banking_api_server/test-scope-assignments.js) — existing scope assignment tests
- [banking_api_server/test-oauth-provider-scopes.js](banking_api_server/test-oauth-provider-scopes.js) — existing OAuth provider scope tests

### Regression Plan (Critical Areas)
- [REGRESSION_PLAN.md](REGRESSION_PLAN.md) §1 — "Transaction routes — intentional no requireScopes()" — explains why some routes don't enforce scopes (row-level checks instead)
- [REGRESSION_PLAN.md](REGRESSION_PLAN.md) §1 — "ff_inject_may_act — synthetic may_act" — existing injection pattern to mirror for scope injection

### PingOne Management API Documentation
- PingOne Custom Resource Servers — Management API endpoint for creating / reading resource servers and scopes (to be researched during planning)

---

## Code Context

### Existing Reusable Assets
- **Feature flag pattern:** `ff_inject_may_act` exists in `configStore.js` and is toggled on Demo Data page — clone this pattern for `ff_inject_demo_scopes`
- **Config verification pattern:** `ConfigurationPage.tsx` already queries `/api/admin/config` for settings — extend to check resource server status (new endpoint: `GET /api/admin/config/resource-server-status`)
- **Token injection logic:** Existing code in `agentMcpTokenService.js` injects `may_act` claim — similar approach can be used for scope injection

### Established Patterns
- **Scope enforcement:** Routes use `requireScopes(scope)` middleware (e.g., `POST /transactions`); some routes skip this for documented reasons (row-level checks)
- **Feature flag toggle:** Existing `configStore.getEffective('ff_...')` pattern; feature flags toggled on Demo Data page and readable via `GET /api/admin/config/feature-flags`
- **Token responses:** BFF returns token via `routes/oauthUser.js` and `routes/oauth.js`; injection point is before token is sent to client

### Integration Points
- **Config service:** `banking_api_server/services/configStore.js` — add resource server creation logic + feature flag for injection
- **PingOne Management API client:** `banking_api_server/services/pingoneManagementClient.js` or `pingoneProvisionService.js` — use for resource server creation
- **Token endpoint:** `routes/oauthUser.js`, `routes/oauth.js` — where token response is formed; injection happens here
- **UI components:** `banking_api_ui/src/components/Configuration/` — add scope reference modal/link; update Config dropdown

---

## Specifics

### Current Scope Definitions (From Code)
```
Read: banking:accounts:read, banking:transactions:read, banking:read
Write: banking:transactions:write, banking:write
Admin: banking:admin
AI Agent: ai_agent
```

### Real-World Alignment
- Standard OIDC tokens from PingOne (without custom resource server) carry: `openid`, `profile`, `email` (no `banking:*` scopes)
- Custom resource server tokens: Will carry formal `banking:read`, `banking:write`, `banking:admin` (as created in Phase 146)
- Agent flows: Receive `ai_agent` + delegated scopes via token exchange

### Demo Injection Scenario
- User has incomplete PingOne setup (no custom resource server)
- Demo still works if `ff_inject_demo_scopes=true`
- Token claims show injected scopes with "INJECTED FOR DEMO" indicator
- Educational value preserved; transparency maintained

### PingOne Resource Server Naming
- Convention: "banking_resource" (consistent with existing `banking_mcp_01` naming style in demo)
- Scopes defined in resource server: `banking:read`, `banking:write`, `banking:admin`

---

## Deferred Ideas

- **Advanced scope scenarios** (e.g., time-limited scopes, scope delegation chains) — candidate for future educational phase
- **Scope audit automation** (e.g., CI/CD checks that scopes in code match PingOne every deploy) — future DevOps phase
- **Multi-tenant scope patterns** — out of scope for v1 demo (single-tenant only)

---

## Folded Todos / Items in Scope

None explicit, but Phase 146 addresses implicit needs:
- **Latent issue:** PingOne test page uses old scope names/patterns — aligned with current work
- **Latent issue:** Code has inconsistent scope enforcement (some routes check, some don't) — justified and documented
- **Latent issue:** No single reference for "what scopes exist" — resolved by SCOPE_VOCABULARY.md

---

*Phase 146 context — Ready for research and planning.*
*Phase dependency: Phase 145 (MCP server audit) completed → Phase 146 (scope alignment) → Phase 147+*
