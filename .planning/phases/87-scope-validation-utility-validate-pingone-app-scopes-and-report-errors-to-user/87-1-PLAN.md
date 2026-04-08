---
phase: 87
plan: 1
name: "Scope Validation Utility - Phase 1: Build and Ship"
type: "feature"
autonomous: false
wave: 1
depends_on: null
requirements: null

frontmatter: |
  **Objective:** Build a scope validation utility that audits PingOne resource server configurations against canonical values, reports mismatches, and enables user-initiated fixes.
  
  **Scope:** Feature + tests + deployment
  
  **Success Criteria:**
  - ✅ Utility audits all 5 PingOne resource servers against PINGONE_MAY_ACT_SETUP.md reference
  - ✅ Displays correctly configured resources (✓) and mismatches (⚠️)
  - ✅ Accessible to authenticated users via `/demo-data` or `/admin`
  - ✅ No breaking changes to existing pages
  - ✅ Unit tests cover audit logic and scope comparison
  - ✅ Deployed to Vercel with no auth/session failures

---

# Phase 87 Plan 1: Scope Validation Utility

## Objective

Deliver a working scope validation utility that audits PingOne resource scopes and reports status to users within the Super Banking demo app.

## Context

@87-CONTEXT.md
@../../docs/PINGONE_MAY_ACT_SETUP.md (lines 1–889 for scope references)
@../../CLAUDE.md
@../../.claude/skills/pingone-api-calls/SKILL.md

## Implementation

### Task 1: Research & Design API Contract
**Type:** `auto` | **TDD:** `false` | **Reporter:** User

**Objective:** Determine the PingOne Management API endpoint structure for reading resource servers and their scopes, plus design the utility's data contract.

**What to Investigate:**
1. Review `pingone-api-calls` skill for Management API patterns
2. Locate the endpoint(s) in PingOne docs for:
   - List resource servers in an environment
   - Get detailed scope list for each resource server
3. Design the utility's internal data structure:
   - Resource name, audience, current scopes (from API)
   - Expected scopes (from hardcoded reference)
   - Status enum: `CORRECT | MISMATCH | NEEDS_REVIEW`
   - Mismatches detail: what's missing, what's extra

**Done Criteria:**
- [ ] API endpoint paths documented in code comments
- [ ] Data contract type defined (TypeScript interface or JSDoc)
- [ ] Reference table from PINGONE_MAY_ACT_SETUP.md embedded in constants or read from JSON

**Output:**
```
logs/phase-87-plan-1/{task-1-api-research.md}
  - PingOne Management API endpoints (resource-servers, scopes)
  - Proposed data structure (TypeScript/JSDoc)
  - Reference table as JSON constant
```

**Verification:**
Report the API endpoints and confirm they match PingOne docs before proceeding.

---

### Task 2: Create Utility Service Layer
**Type:** `auto` | **TDD:** `true` | **Reporter:** Acceptance

**Objective:** Build a reusable service that audits PingOne resource scopes and compares against expected values.

**Behavior (from CONTEXT):**

**Given:** A PingOne environment ID, region, and Management API token
**When:** The audit is run
**Then:**
- For each of the 5 expected resources: call PingOne API to get current scope list
- Compare current vs expected (from hardcoded reference table)
- Mark as `CORRECT` if scopes match exactly (ignore order)
- Mark as `MISMATCH` if scopes differ (show delta)
- Mark as `NEEDS_REVIEW` for ambiguous cases (Agent Gateway, MCP Gateway)
- Return array of audit results with metadata

**TDD RED → GREEN → REFACTOR:**

1. **RED:** Write test expecting:
   ```javascript
   const results = await auditResourceScopes(client, envId);
   
   expect(results).toHaveLength(5);
   expect(results[0]).toEqual({
     resourceId: "...",
     name: "Super Banking AI Agent Service",
     audience: "https://ai-agent.pingdemo.com",
     currentScopes: ["banking:agent:invoke"],
     expectedScopes: ["banking:agent:invoke"],
     status: "CORRECT",
     mismatches: null
   });
   
   // Mismatch example
   expect(results[1].status).toBe("MISMATCH");
   expect(results[1].mismatches).toEqual({
     missing: ["banking:agent:invoke"],
     extra: ["agent:invoke"]
   });
   ```

2. **GREEN:** Implement `auditResourceScopes()` with:
   - Hardcoded reference table (5 resources)
   - Mock or real API call to PingOne
   - Comparison logic
   - Returns audit result array

3. **REFACTOR:** Extract reference table to `SCOPE_REFERENCE_TABLE` constant, improve error handling.

**Done Criteria:**
- [ ] Unit tests pass (`npm test -- scopeAudit` or similar)
- [ ] Service handles missing/extra scopes correctly
- [ ] Service logs each comparison (for debugging)
- [ ] Reference table matches PINGONE_MAY_ACT_SETUP.md exactly

**Output:**
```
banking_api_server/services/scopeAuditService.js (or .ts)
  - auditResourceScopes(client, envId) function
  - SCOPE_REFERENCE_TABLE constant
  - Result type/interface

banking_api_server/services/__tests__/scopeAudit.test.js
  - 10+ test cases (correct, mismatch, edge cases)
  - Mock PingOne API responses
```

**Verification:**
- [ ] Run `npm test` — all new tests pass
- [ ] Manually test with real PingOne environment (once API token available)

---

### Task 3: Expose Utility via REST API
**Type:** `auto` | **TDD:** `false` | **Reporter:** Acceptance

**Objective:** Add a BFF route that calls the scope audit service and returns results.

**Implementation:**
1. Create new BFF route: `GET /api/scopes/audit` (or `/api/admin/scopes/audit`)
2. Authenticate: Require user to be logged in (existing auth middleware)
3. Append: Call `auditResourceScopes()` with environment/client from `.env`
4. Return: JSON array of audit results
5. Error handling: Try/catch, log to console, return 500 with error message

**Sample Request/Response:**
```bash
GET /api/scopes/audit HTTP/1.1

200 OK
{
  "status": "success",
  "auditedAt": "2026-04-08T15:30:00Z",
  "results": [
    {
      "resourceId": "041502b7-9c80-43aa-bf2c-bc5cf41e4bfb",
      "name": "Super Banking AI Agent Service",
      "audience": "https://ai-agent.pingdemo.com",
      "currentScopes": ["banking:agent:invoke"],
      "expectedScopes": ["banking:agent:invoke"],
      "status": "CORRECT"
    },
    {
      "resourceId": "c9d85ed5-15b2-48bd-8085-25f005a1f92f",
      "name": "Super Banking Agent Gateway",
      "currentScopes": ["agent:invoke"],
      "expectedScopes": [],
      "status": "NEEDS_REVIEW",
      "mismatches": {
        "extra": ["agent:invoke"]
      }
    }
  ]
}
```

**Done Criteria:**
- [ ] Route created and responds with 200 + audit results
- [ ] Route requires auth (uses existing session middleware)
- [ ] Error responses include useful messages
- [ ] No console errors on call

**Output:**
```
banking_api_server/routes/scopeAudit.js (or integrated into existing routes)
  - GET /api/scopes/audit endpoint
```

**Verification:**
- [ ] Call via curl/Postman, confirm JSON response
- [ ] Verify all 5 resources in response
- [ ] Check for correct/mismatch/needs-review status values

---

### Task 4: Build React Component for Display
**Type:** `auto` | **TDD:** `false` | **Reporter:** Acceptance

**Objective:** Create a React component that renders scope audit results with clear status indicators.

**Component Behavior:**
1. On load: Call `/api/scopes/audit` (show loading spinner during fetch)
2. On success: Display table with:
   - Resource Name (column 1)
   - Current Scopes (column 2)
   - Expected Scopes (column 3)
   - Status badge (column 4): ✓ CORRECT (green) | ⚠️ MISMATCH (orange) | ? NEEDS_REVIEW (blue)
3. On error: Show error message + "Try Again" button
4. "Last Audited" timestamp at top
5. Optional "Refresh Audit" button

**UI Layout:**
```
┌─────────────────────────────────────────────────────────────────────┐
│ PingOne Scope Validation Status                                      │
│ Last audited: 2026-04-08 15:30:00 UTC  [Refresh Audit]             │
├─────────────────────────────────────────────────────────────────────┤
│ Resource Name               | Current | Expected | Status           │
├─────────────────────────────────────────────────────────────────────┤
│ Super Banking AI Agent      | banking:| banking: | ✓ CORRECT        │
│                             | agent:  | agent:   |                  │
│                             | invoke  | invoke   |                  │
├─────────────────────────────────────────────────────────────────────┤
│ Super Banking Agent Gateway | agent:  | (none)   | ⚠️ NEEDS_REVIEW  │
│                             | invoke  |          |                  │
├─────────────────────────────────────────────────────────────────────┤
│ ...                                                                  │
└─────────────────────────────────────────────────────────────────────┘
```

**Done Criteria:**
- [ ] Component renders without errors
- [ ] Correctly maps audit results to table rows
- [ ] Status badges display with correct colors
- [ ] Loading and error states work
- [ ] Responsive on mobile (scopes wrap if needed)

**Output:**
```
banking_api_ui/src/components/ScopeValidationAudit.jsx (or .tsx)
  - React component
```

**Verification:**
- [ ] Component displays in Storybook or test environment
- [ ] Mock audit data renders correctly
- [ ] Real API integration works when added to page

---

### Task 5: Integrate into `/demo-data` or Admin Page
**Type:** `auto` | **TDD:** `false` | **Reporter:** Acceptance

**Objective:** Place the scope validation component on a user-accessible page.

**Decision Gate:**
- Option A: Embed in existing `/demo-data` page (alongside token exchange demo)
- Option B: Create new `/admin` or `/developer` section
- **Recommend:** Option A (less new code, reuses existing page)

**Implementation:**
1. Add component import to existing page
2. Place component in a new section (e.g., `<Section title="PingOne Scope Validation" />`)
3. Wire into existing auth/session logic (should be automatic via REST API)
4. Ensure no layout shifts or style conflicts

**Done Criteria:**
- [ ] Component loads on chosen page
- [ ] Component calls API successfully
- [ ] Audit results display in UI
- [ ] No errors in browser console

**Output:**
```
banking_api_ui/src/pages/DemoData.jsx (or AdminPage.jsx)
  - Integration of ScopeValidationAudit component
```

**Verification:**
- [ ] Navigate to `/demo-data` (or `/admin`)
- [ ] Scope validation section visible
- [ ] Click "Refresh Audit" button → re-fetches data

---

### Task 6: Unit & Integration Tests
**Type:** `auto` | **TDD:** `false` | **Reporter:** Acceptance

**Objective:** Comprehensive test coverage for service and component.

**Tests to Add:**

**Service Tests (`scopeAudit.test.js`):**
- Correct scope comparison (exact match, ignoring order)
- Mismatch detection (missing scopes, extra scopes)
- Resource with no expected scopes (Agent Gateway case)
- API error handling (timeout, 401, 500)
- Empty response handling

**Component Tests (`ScopeValidationAudit.test.jsx`):**
- Renders loading state while fetching
- Renders results table on success
- Shows error message on API failure
- Status badges display correct colors
- Refresh button triggers re-fetch

**API Integration Tests (if applicable):**
- GET `/api/scopes/audit` responds with valid JSON
- Response includes all 5 expected resources
- Response includes `status`, `mismatches` fields

**Done Criteria:**
- [ ] `npm test` passes all new tests
- [ ] Coverage ≥ 80% for service layer
- [ ] No console warnings or errors during test run

**Output:**
```
banking_api_server/services/__tests__/scopeAudit.test.js
  - Service unit tests (if not done in Task 2)

banking_api_ui/src/components/__tests__/ScopeValidationAudit.test.jsx
  - Component unit tests

banking_api_server/__tests__/integration/scopeAudit.integration.test.js (optional)
  - E2E test of full /api/scopes/audit flow
```

**Verification:**
- [ ] `npm test` passes
- [ ] `npm run build` succeeds (no TypeErrors)

---

### Task 7: Build & Deploy
**Type:** `auto` | **TDD:** `false` | **Reporter:** Acceptance

**Objective:** Build and deploy to Vercel with no regressions.

**Steps:**
1. Run `npm run build` in `banking_api_ui/` → exit code 0
2. Run `npm test` → all tests pass
3. Commit all new files and changes
4. Push to remote branch
5. Deploy to Vercel preview (if available) or `vercel --prod`
6. Test live: navigate to app, log in, view scope validation component
7. Verify all 5 resources render correctly

**Done Criteria:**
- [ ] Build succeeds (no TypeErrors, no unhandled rejections)
- [ ] Tests pass
- [ ] Deployed to Vercel
- [ ] Scope validation component accessible and functional on live site
- [ ] No new console errors on page load

**Output:**
Console verification, Vercel deployment URL

**Verification:**
- [ ] Visit deployed app
- [ ] Log in
- [ ] Navigate to `/demo-data`
- [ ] Scope validation section visible and responsive
- [ ] API calls succeed (network tab in DevTools)

---

## Deviations & Blockers

*(Filled during execution)*

## Success Criteria ✓

- [x] Phase planned with 7 tasks
- [ ] Task 1: API contract researched (user/AI decision)
- [ ] Task 2: Audit service built with tests
- [ ] Task 3: REST API exposed
- [ ] Task 4: React component built
- [ ] Task 5: Component integrated into page
- [ ] Task 6: Tests pass
- [ ] Task 7: Deployed to Vercel

---

*Plan: 87-1 | Created: 2026-04-08 | Status: Ready for execution*
