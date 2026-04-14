# Phase 146: Scope Vocabulary Alignment — Research

**Date:** 2026-04-14  
**Status:** RESEARCH COMPLETE

---

## Executive Summary

Phase 146 aligns OAuth 2.0 scope vocabulary across PingOne configuration, BFF code, and UI to enable production-realistic scope-based authorization. **Key finding:** Infrastructure exists (resource server creation API, token injection patterns, feature flags framework) to implement all decisions from CONTEXT.md. Primary work is:

1. **Audit + Rename** — Current code uses `banking:general:read` / `banking:general:write`; Phase 146 simplifies to `banking:read` / `banking:write` (D-02)
2. **Resource Server Setup** — Create standalone custom PingOne resource server with `createResourceServer()` API (already implemented)
3. **Scope Injection Feature** — Implement `ff_inject_scopes` flag pattern (similar to existing `ff_inject_may_act`)
4. **Documentation** — Create SCOPE_VOCABULARY.md registry (D-03) linking scope → resource server → code enforcement → routes
5. **PingOne Test Page** — Update endpoints to use new scope vocabulary (D-06)

---

## 1. Current Scope Vocabulary (Inventory)

### Code Layer (`banking_api_server/config/scopes.js`)

**Current naming:**
```javascript
const BANKING_SCOPES = {
  BANKING_READ: 'banking:general:read',
  BANKING_WRITE: 'banking:general:write',
  ADMIN: 'banking:admin',
  SENSITIVE: 'banking:sensitive',
  AI_AGENT: 'banking:ai:agent',
  AI_AGENT_IDENTITY: 'ai_agent'
};
```

**User type mappings (existing):**
- Admin: `banking:admin`, `banking:read`, `banking:write`, `banking:sensitive`, `banking:ai:agent`, `ai_agent`
- Customer: `banking:read`, `banking:write`, `banking:ai:agent`
- ReadOnly: `banking:read`
- AI Agent: `banking:ai:agent`, `ai_agent`, `banking:read`, `banking:write`

### Documentation Layer

**Files to update (D-03):**
- `banking_api_server/OAUTH_SCOPE_CONFIGURATION.md` — Existing guide lists:
  - Read: `banking:accounts:read`, `banking:transactions:read`, `banking:read` (compound variants)
  - Write: `banking:transactions:write`, `banking:write`
  - Admin: `banking:admin`
  - Special: `ai_agent`

- `banking_api_server/SCOPE_AUTHORIZATION.md` — Existing enforcement guide with manual route mappings

- **New:** `banking_api_server/SCOPE_VOCABULARY.md` (D-03) — To be created; canonical registry with:
  - Scope name (canonical, simplified per D-02)
  - Human description
  - PingOne resource server (e.g., "Main Banking API")
  - Routes enforcing it
  - Enforcement type (requireScopes vs row-level)

### Authorization Enforcement Layer

**Current pattern** (`middleware/auth.js`, routes access):
- `requireScopes(['banking:read'])` middleware checks token scopes
- **Intentional gap:** `GET /transactions/my` and `POST /transactions` do NOT use `requireScopes()` because OIDC tokens without custom resource server don't carry `banking:*` scopes; rely on row-level ownership checks instead (documented in REGRESSION_PLAN §1)

**Key insight:** Scope enforcement is comment-documented but not systematically indexed. Phase 146 creates the registry to surface this.

---

## 2. Resource Server Infrastructure (PingOne Management API)

### Existing Implementation

**Service:** `banking_api_server/services/pingoneManagementService.js`

```javascript
async createResourceServer(name, description, audienceUri) {
  // POST /v1/environments/{env}/resourceServers
  // Returns: { resourceServer: { id, name, description, audience: [...] } }
}

async getResourceServers() {
  // GET /v1/environments/{env}/resourceServers
  // Returns: { resourceServers: [...] } or { _embedded: { resourceServers: [...] } }
}
```

**Provisioning:** `banking_api_server/services/pingoneProvisionService.js`

```javascript
async createResourceServer(name, description, audience) {
  // Creates via Management API, returns full resource object
}
```

**Called by:** `pingoneBootstrapService.js` during setup; already has logic for detecting missing resource server and creating it.

### Resource Server Audiences (D-02 Pattern)

Current setup uses:
- **Main Banking API** (ENDUSER_AUDIENCE): Carries `banking:read`, `banking:write`, `banking:admin` scopes
- **Optional MCP Resource** (MCP_RESOURCE_URI): Separate audience for MCP tool tokens

### How Authorization Works (RFC 8707)

1. **On `/authorize`:** Include `&resource={audience}` to trigger PingOne to narrow token scope to that resource
2. **Problem:** When requesting OIDC scopes (`openid profile email`) + custom API scopes (`banking:*`) together, PingOne returns `invalid_scope: "May not request scopes for multiple resources"`
3. **Solution** (already implemented in `oauthAuthorizeResource.js`):
   - Detect if request mixes OIDC + custom scopes
   - Omit `&resource=` parameter in that case
   - PingOne issues token with both OIDC scopes + custom scopes (multi-resource aware)

---

## 3. Token Injection Patterns (D-04 Mechanic)

### Existing Patterns in Codebase

**Pattern 1: `ff_inject_may_act` (deprecated)**
- Feature flag in `configStore.js`: `ff_inject_may_act` (default: `false`)
- When `true` and user token lacks `may_act` claim, BFF adds synthetic `may_act: { client_id: "..." }`
- Used in `agentMcpTokenService.js` lines 396–432 (for agent actor tokens when PingOne can't issue them)
- Logged in tokenEvents for UI Token Chain display: `[BFF-INJECTED may_act: ...]`

**Pattern 2: `ff_inject_audience`**
- Feature flag in `configStore.js`: `ff_inject_audience` (default: `false`)
- When `true` and token lacks MCP resource URI in `aud` claim, BFF adds it
- Also used in `agentMcpTokenService.js` lines 656–677 (for MCP token narrowing when PingOne incomplete)
- Logged in tokenEvents: `[BFF-INJECTED aud: ...]`

**Both patterns share:**
1. Feature flag gate (toggleable in Feature Flags admin API)
2. Injection logic only when claim is absent (don't override real values)
3. TokenEvent logging to UI for transparency
4. Warning/demo label in UI (INJECTED badge)

### Applying Pattern to Scopes (D-04 Implementation)

For `ff_inject_scopes` (new):
```javascript
// In configStore.js
ff_inject_scopes: { public: true, default: 'false' },

// In agentMcpTokenService.js (or session response handler)
const shouldInjectScopes = configStore.getEffective('ff_inject_scopes') === 'true';
if (shouldInjectScopes && !userTokenHasBankingScopes(claims)) {
  claims.scope = (claims.scope || '') + ' banking:read banking:write';
  tokenEvents.push({
    label: '[BFF-INJECTED scope: banking:read banking:write]',
    injected: true
  });
}
```

### Feature Flags Infrastructure (D-04 Config)

**Location:** `banking_api_server/routes/featureFlags.js` (FLAG_REGISTRY)

**Existing flags for reference:**
- `authorize_enabled` — transaction authorization master toggle
- `ff_authorize_simulated` — use in-process mock vs real PingOne
- `step_up_enabled` — require MFA for high-value transactions
- `ff_inject_may_act` — synthetic may_act claim
- `ff_inject_audience` — synthetic aud claim

**Pattern to follow:** Add `ff_inject_scopes` flag with:
- Category: "OAuth Scopes"
- Description: "When active and token lacks banking scopes, inject banking:read + banking:write. Demo mode only — shows 'INJECTED' labels in token inspector."
- Impact: "OFF = real scopes only. ON = scopes injected when missing."
- Warning: "Enabled" (demo mode)

---

## 4. Scope Enforcement Inventory (For SCOPE_VOCABULARY.md)

### Routes Using requireScopes()

**From code review of `banking_api_server/routes/*.js`:**

```javascript
// authorization.js
GET /api/accounts — ['banking:accounts:read', 'banking:read']

// Not enforcing (row-level checks instead):
GET /api/transactions/my
POST /api/transactions (deposits, withdrawals, transfers)
// Reason (REGRESSION_PLAN §1): tokens without custom resource server have no banking:* scopes; use ownership checks

// Admin routes
GET /api/admin/* — ['banking:admin']

// Compound scopes (backward compatibility, may be deprecated)
POST /api/accounts — ['banking:write']

// AI Agent / MCP
POST /api/mcp/tool — (with agent-specific enforcement)
```

### Enforcement Types

1. **Scope gate** — `requireScopes()` middleware rejects if token lacks required scope
2. **Row-level checks** — Route validates user owns resource (e.g., account owner can view own transactions)
3. **Client type detection** — Route checks `aud` claim to identify agent vs end-user token

---

## 5. Token Chain UI Display (D-04 Transparency)

### Current TokenChainDisplay Component

Already shows:
- User access token (decoded, all claims)
- Agent access token (if present)
- MCP access token (if exchanged)
- Token events (API calls, exchanges, errors)
- Scope claim in token ("scope": "openid profile email...")

### Adding Injection Badges (D-04 Implementation)

**Location:** `banking_api_ui/src/components/TokenChainDisplay.js` (existing)

**Enhancement:** When `tokenEvent.injected === true`:
- Add badge near scope name: `<Badge>INJECTED</Badge>`
- Tooltip: "This scope was added by the application (demo mode) — not issued by PingOne"
- Same badge styling for `may_act` and `aud` injections (consistent visual language)

### UI Warning Banner (D-04 Education)

**Location:** `banking_api_ui/src/components/Dashboard.js` (config/warning area)

**Banner content (when `ff_inject_scopes` is active):**
```
⚠️ SCOPE INJECTION ENABLED — Demo mode
Scopes are being added by the application and are not from PingOne. 
Check the Token Chain to see which scopes are 'INJECTED'.
```

---

## 6. PingOne Test Page Updates (D-06)

### Test Endpoints (Current Structure)

**File:** `banking_api_server/routes/pingoneTestRoutes.js`

**Endpoints to update:**
- `GET /api/pingone-test/worker-token` — Gets admin (worker app) token for config API calls
- `GET /api/pingone-test/authz-token` — Gets end-user authorization token (with scopes)
- `GET /api/pingone-test/agent-token` — Gets agent (MCP client) token
- `GET /api/pingone-test/exchange-user-to-mcp` — RFC 8693 exchange: user → MCP
- `GET /api/pingone-test/exchange-user-agent-to-mcp` — RFC 8693 exchange: user (subject) + agent (actor) → MCP

**All use `sessionId = req.query.sessionId || 'pingone-test'` for API call tracking**

### UI Component

**File:** `banking_api_ui/src/components/PingOneTestPage.jsx`

**Display updates needed (D-06):**
1. Show canonical scope names in test results (not old compound names)
2. Decode and display full JWT claims (already done per Phase 133)
3. Add scope injection status for each token (INJECTED vs real)
4. Verify all token exchange tests reflect new vocabulary

---

## 7. Canonical Scope Reference UI (D-05)

### Implementation Pattern

**Location:** Two places per D-05 decision

1. **Config Dropdown:**
   - File: `banking_api_ui/src/pages/ConfigPage.jsx` (or similar)
   - Add menu item: "📚 Scope Reference" → links to modal or markdown render of SCOPE_VOCABULARY.md

2. **Hamburger Menu (SideNav):**
   - File: `banking_api_ui/src/components/SideNav.jsx`
   - Add menu item: "Scopes" under "Help" or "Admin" section → same destination

**Modal or Render Options (agent discretion D-05):**
- Option A: Hyperlink to `banking_api_server/SCOPE_VOCABULARY.md` (external markdown)
- Option B: Fetch from `/api/admin/scope-vocabulary` endpoint (BFF serves markdown as HTML)
- Option C: Embed as `.jsx` component with styling (best UX)

**Recommendation:** Option B (fetch from BFF) — allows docs to live in code but render dynamically with styling.

---

## 8. Task Breakdown Roadmap

### Group 1: Scope Inventory + Documentation
- **Task 1a:** Audit code for all scope references; create SCOPE_VOCABULARY.md registry (D-03)
- **Task 1b:** Update `config/scopes.js` with new canonical names per D-02 (banking:read → banking:general:read becomes banking:read)
- **Task 1c:** Update existing docs (OAUTH_SCOPE_CONFIGURATION.md, SCOPE_AUTHORIZATION.md) with cross-references to SCOPE_VOCABULARY.md

### Group 2: Resource Server Setup + Injection
- **Task 2a:** Add `ff_inject_scopes` feature flag to featureFlags.js (D-04)
- **Task 2b:** Implement scope injection logic (if token lacks banking:* scopes + flag enabled, inject them)
- **Task 2c:** Add scope injection logging to tokenEvents for UI display

### Group 3: UI Updates
- **Task 3a:** Add INJECTED badges to Token Chain display (D-04 transparency)
- **Task 3b:** Add warning banner when scope injection active (D-04 education)
- **Task 3c:** Add Scope Reference link to Config dropdown + Hamburger menu (D-05)
- **Task 3d:** Create `/api/admin/scope-vocabulary` endpoint to serve SCOPE_VOCABULARY.md

### Group 4: PingOne Test Page Refactor (D-06)
- **Task 4a:** Update pingoneTestRoutes.js to use canonical scope names
- **Task 4b:** Verify PingOneTestPage.jsx displays new scope vocabulary
- **Task 4c:** Ensure test page scope injection indicators match main app

### Group 5: Testing + Verification
- **Task 5a:** Test complete flow: Resource server creation → token with banking:* scopes → enforcement → UI display
- **Task 5b:** Verify token injection fallback (test with and without resource server)
- **Task 5c:** Regression test: Ensure backward compatibility (existing flows still work)

---

## 9. Key Decisions (From CONTEXT.md — Verified)

| Decision | Finding | Implication |
|----------|---------|------------|
| **D-01: Comprehensive audit** | Code patterns already inventoried in existing tests + docs; registry creation is systematic work | 2–3 tasks for audit + documentation |
| **D-02: Simplified scope names** | Current code uses `banking:general:read`; need to change to `banking:read` (simpler, matches OAuth best practices) | Refactor scopes.js + all references |
| **D-03: Dual doc approach** | SCOPE_VOCABULARY.md for registry; OAUTH_SCOPE_CONFIGURATION.md + SCOPE_AUTHORIZATION.md for enforcement details (cross-linked) | 3 files (1 new, 2 updated) |
| **D-04: Scope injection demo mode** | `ff_inject_scopes` flag + tokenEvents logging + UI badges (mirroring existing `ff_inject_may_act` pattern) | 1 flag + 2 UI components |
| **D-05: Scope reference in UI** | Two entry points (Config menu + SideNav); use `/api/admin/scope-vocabulary` endpoint | 1 endpoint + 2 menu items |
| **D-06: Test page refactor** | Endpoints already exist; update scope display + verify injection indicators | Update 5 test endpoints + test page component |

---

## 10. Implementation Approach Recommendations

### Architecture Pattern: Registry + Injection + Display

1. **Single source of truth:** SCOPE_VOCABULARY.md (registry file)
2. **Control via feature flags:** ff_inject_scopes toggles demo mode
3. **Transparency in UI:** TokenChain displays injected scopes; warning banner educates

### No Breaking Changes

- Backward compatibility preserved: Compound scopes can coexist with canonical names
- Deprecation path: Issue warnings in console when old scope names encountered; plan full deprecation for Phase 147+
- Fallback logic: If resource server missing, injection provides education path

### Learning Value (Per CONTEXT.md Phase Boundary)

- Users learn OAuth 2.0 scope vocabulary standards
- See real PingOne resource server in action (or fallback demo mode)
- Understand token derivation + scope narrowing via RFC 8707 resource parameter

---

## 11. Validation Architecture (Nyquist Dimension 8)

### Core Validation Dimensions

| Dimension | Check | Verifier |
|-----------|-------|----------|
| 1: Flows | Token acquisition with banking scopes; scope-gated endpoints allow/deny correctly | `/pingone-test` endpoints + route tests |
| 2: Edge Cases | Token without scopes (injection fallback); mixed OIDC+API scopes (resource param omitted) | Unit tests + integration coverage |
| 3: Errors | Invalid scope errors handled; injection transparently logged | TokenChainDisplay + error handling tests |
| 4: Performance | Scope injection doesn't add latency; registry endpoint < 100ms | Perf tests (optional Phase 147) |
| 5: Security | No scope leakage in logs; injection only in demo mode via flag | Log audit (optional Phase 147) |
| 6: Consistency | PingOne scopes match code scopes match UI display across all pages | Regression tests |
| 7: Documentation | SCOPE_VOCABULARY.md correct + referenced + accessible from UI | Doc verification (automated) |
| 8: Learning | User can understand scope vocabulary, resource servers, injection fallback from UI + docs | UX/UAT verification |

### Automated Verification (Phase 146 Completion)

```bash
# Check 1: SCOPE_VOCABULARY.md exists and is referenced
grep -l "SCOPE_VOCABULARY" banking_api_server/*.md

# Check 2: All routes using requireScopes() are documented
grep -r "requireScopes" banking_api_server/routes/*.js | wc -l

# Check 3: Scope injection flag exists
grep "ff_inject_scopes" banking_api_server/services/configStore.js

# Check 4: Token Chain displays INJECTED badges
grep "INJECTED" banking_api_ui/src/components/TokenChainDisplay.js

# Check 5: Test page updated
grep "banking:read\|banking:write" banking_api_server/routes/pingoneTestRoutes.js

# Check 6: Scope reference link in UI
grep "Scope Reference\|scope-vocabulary" banking_api_ui/src/**/*.jsx
```

---

## RESEARCH COMPLETE

**Status:** Ready for planning. All infrastructure exists; Phase 146 is systematic documentation + scope name alignment + feature flag + UI enhancements.

**Next step:** `/gsd-plan-phase 146` to create 4–5 executable plans decomposing work into parallel tasks.
