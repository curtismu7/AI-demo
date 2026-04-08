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
  **Objective:** Build a resource and scope validation utility that audits PingOne resource server existence, attributes, and scope configurations against canonical values, reports mismatches, and enables user-initiated fixes.
  
  **Scope:** Feature + tests + deployment
  
  **Success Criteria:**
  - ✅ Utility validates all 5 PingOne resources exist with correct names, audiences, and attributes
  - ✅ Utility audits resource scopes against PINGONE_MAY_ACT_SETUP.md reference table
  - ✅ Reports missing, misconfigured, and correctly configured resources (MISSING | CONFIG_ERROR | CORRECT | MISMATCH | NEEDS_REVIEW)
  - ✅ Accessible to authenticated users via `/demo-data` or `/admin`
  - ✅ No breaking changes to existing pages
  - ✅ Unit tests cover resource discovery, attribute validation, and scope comparison
  - ✅ Deployed to Vercel with no auth/session failures

---

# Phase 87 Plan 1: Resource & Scope Validation Utility

## Objective

Deliver a comprehensive validation utility that audits PingOne resource existence, attributes, and scope configurations, then reports status to users within the Super Banking demo app.

## Context

@87-CONTEXT.md
@../../docs/PINGONE_MAY_ACT_SETUP.md (lines 1–889 for scope references)
@../../CLAUDE.md
@../../.claude/skills/pingone-api-calls/SKILL.md

## Implementation

### Task 1: Research & Design API Contract
**Type:** `auto` | **TDD:** `false` | **Reporter:** User

**Objective:** Determine the PingOne Management API endpoint structure for discovering resources and validating their attributes, plus design the utility's data contract.

**What to Investigate:**
1. Review `pingone-api-calls` skill for Management API patterns
2. Locate the endpoint(s) in PingOne docs for:
   - List resource servers in an environment (GET /resources or /resource-servers)
   - Get detailed resource attributes (scopes, audience, auth method)
   - Resource name and ID structure
3. Design the utility's internal data structure:
   - Resource name, audience, ID, scopes (from API)
   - Expected name, audience, scopes (from hardcoded reference)
   - Status enum: `MISSING | CONFIG_ERROR | CORRECT | MISMATCH | NEEDS_REVIEW`
   - Validation results detail: what's wrong (missing scopes, wrong audience, etc.)

**Done Criteria:**
- [ ] API endpoint paths documented in code comments
- [ ] Data contract type defined (TypeScript interface or JSDoc)
- [ ] Reference table from PINGONE_MAY_ACT_SETUP.md Part 1 embedded in constants

**Output:**
```
logs/phase-87-plan-1/{task-1-api-research.md}
  - PingOne Management API endpoints (list resources, get resource details)
  - Proposed data structure (TypeScript/JSDoc)
  - Reference table for all 5 resources (names, audiences)
```

**Verification:**
Report the API endpoints and confirm they match PingOne docs before proceeding.

---

### Task 2: Create Resource Discovery & Validation Service
**Type:** `auto` | **TDD:** `true` | **Reporter:** Acceptance

**Objective:** Build a service layer that discovers PingOne resources and validates their existence, names, and audiences against expected values.

**Behavior (from CONTEXT):**

**Given:** A PingOne environment ID, region, and Management API token
**When:** The audit runs
**Then:**
- Call PingOne API to list all resource servers in the environment
- For each of the 5 expected resources (from hardcoded reference):
  - Check if it exists by name in the returned list
  - Retrieve its resource ID, audience URI, and attributes
  - Compare audience against expected value (exact match required)
  - Check token introspection auth method if applicable
- For each resource found, classify:
  - `CORRECT` — name, ID, and audience all match expected
  - `CONFIG_ERROR` — found but audience or name mismatch (recoverable)
  - `MISSING` — expected resource not in environment (error state)
  - `UNEXPECTED` — resource exists but not in expected list (warning)
- Return array of resource validation results with full details

**TDD RED → GREEN → REFACTOR:**

1. **RED:** Write test expecting:
   ```javascript
   const results = await validateResources(client, envId);
   
   expect(results).toHaveLength(5); // or more if unexpected found
   expect(results[0]).toEqual({
     resourceId: "041502b7-9c80-43aa-bf2c-bc5cf41e4bfb",
     name: "Super Banking AI Agent Service",
     audience: "https://ai-agent.pingdemo.com",
     expectedAudience: "https://ai-agent.pingdemo.com",
     status: "CORRECT",
     attributes: {
       ttl: 3600,
       authMethod: "Client Secret Basic"
     }
   });
   
   // Missing resource example
   expect(results).toContainEqual({
     name: "Super Banking Banking API",
     status: "MISSING",
     expectedAudience: "https://banking-api.pingdemo.com"
   });
   ```

2. **GREEN:** Implement `validateResources()` with:
   - Call to PingOne list resources endpoint
   - Hardcoded reference table (5 expected resources)
   - Comparison logic for name, ID, audience
   - Attribute extraction (TTL, auth method)
   - Returns validation result array

3. **REFACTOR:** Extract reference table to `RESOURCE_REFERENCE_TABLE` constant, improve error handling, add logging.

**Done Criteria:**
- [ ] Unit tests pass (`npm test -- resourceValidation` or similar)
- [ ] Service handles missing resources correctly
- [ ] Service handles audience mismatches correctly
- [ ] Service logs each validation check (for debugging)
- [ ] Reference table matches PINGONE_MAY_ACT_SETUP.md exactly

**Output:**
```
banking_api_server/services/resourceValidationService.js (or .ts)
  - validateResources(client, envId) function
  - RESOURCE_REFERENCE_TABLE constant (5 resources)
  - Result type/interface

banking_api_server/services/__tests__/resourceValidation.test.js
  - 12+ test cases (correct, missing, audience mismatch, auth method check, edge cases)
  - Mock PingOne API responses
```

**Verification:**
- [ ] Run `npm test` — all new tests pass
- [ ] Manually test with real PingOne environment

---

### Task 3: Create Scope Validation Service

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

### Task 4: Expose Unified Audit via REST API
**Type:** `auto` | **TDD:** `false` | **Reporter:** Acceptance

**Objective:** Add a BFF route that calls both validation services (resources + scopes) and returns combined results.

**Implementation:**
1. Create new BFF route: `GET /api/pingone/audit` (or `/api/admin/pingone/audit`)
2. Authenticate: Require user to be logged in (existing auth middleware)
3. Orchestrate: Call `validateResources()` then `auditResourceScopes()` with environment/client from `.env`
4. Combine: Merge results (resource validation + scope audit) into single response
5. Return: JSON object with resource and scope audit results
6. Error handling: Try/catch, log to console, return 500 with error message

**Sample Request/Response:**
```bash
GET /api/pingone/audit HTTP/1.1

200 OK
{
  "status": "success",
  "auditedAt": "2026-04-08T15:30:00Z",
  "resourceValidation": [
    {
      "resourceId": "041502b7-9c80-43aa-bf2c-bc5cf41e4bfb",
      "name": "Super Banking AI Agent Service",
      "audience": "https://ai-agent.pingdemo.com",
      "status": "CORRECT"
    },
    {
      "name": "Super Banking Banking API",
      "status": "MISSING"
    }
  ],
  "scopeAudit": [
    {
      "resourceId": "041502b7-9c80-43aa-bf2c-bc5cf41e4bfb",
      "name": "Super Banking AI Agent Service",
      "currentScopes": ["banking:agent:invoke"],
      "expectedScopes": ["banking:agent:invoke"],
      "status": "CORRECT"
    }
  ]
}
```

**Done Criteria:**
- [ ] Route created and responds with 200 + combined audit results
- [ ] Route requires auth (uses existing session middleware)
- [ ] Error responses include useful messages
- [ ] No console errors on call

**Output:**
```
banking_api_server/routes/pingoneAudit.js (or integrated into existing routes)
  - GET /api/pingone/audit endpoint
  - Orchestration of resource + scope validation
```

**Verification:**
- [ ] Call via curl/Postman, confirm JSON response
- [ ] Verify resource validation results present
- [ ] Verify scope audit results present
- [ ] Check for correct/missing/mismatch/needs-review status values

---

### Task 5: Build React Component for Display
**Type:** `auto` | **TDD:** `false` | **Reporter:** Acceptance

**Objective:** Create a React component that renders resource validation and scope audit results with clear status indicators.

**Component Behavior:**
1. On load: Call `/api/pingone/audit` (show loading spinner during fetch)
2. On success: Display two sections:
   
   **Section A — Resource Configuration:**
   - Table showing: Resource Name | Audience (Expected vs Current) | Status
   - Status column: ✓ CORRECT (green) | ✗ MISSING (red) | ⚠️ CONFIG_ERROR (orange)
   - Expandable rows to show full resource details (ID, auth method, TTL)
   
   **Section B — Scope Configuration:**
   - Table showing: Resource Name | Current Scopes | Expected Scopes | Status
   - Status column: ✓ CORRECT (green) | ⚠️ MISMATCH (orange) | ? NEEDS_REVIEW (blue)
   - Show delta under each mismatch (missing scopes, extra scopes)

3. On error: Show error message + "Try Again" button
4. "Last Audited" timestamp at top
5. Optional "Refresh Audit" button

**Done Criteria:**
- [ ] Component renders without errors
- [ ] Correctly maps resource validation results to table rows
- [ ] Correctly maps scope audit results to second table
- [ ] Status badges display with correct colors
- [ ] Loading and error states work
- [ ] Responsive on mobile (tables scroll if needed)

**Output:**
```
banking_api_ui/src/components/PingOneAudit.jsx (or .tsx)
  - React component with two-table layout
```

**Verification:**
- [ ] Component displays in Storybook or test environment
- [ ] Mock audit data renders correctly
- [ ] Real API integration works when added to page
- [ ] Both resource and scope results visible simultaneously

---

### Task 6: Integrate into `/demo-data` or Admin Page
**Type:** `auto` | **TDD:** `false` | **Reporter:** Acceptance

**Objective:** Place the PingOne audit component on a user-accessible page.

**Decision Gate:**
- Option A: Embed in existing `/demo-data` page (alongside token exchange demo)
- Option B: Create new `/admin` or `/developer` section
- **Recommend:** Option A (less new code, reuses existing page)

**Implementation:**
1. Add component import to existing page
2. Place component in a new section (e.g., `<Section title="PingOne Configuration Audit" />`)
3. Wire into existing auth/session logic (should be automatic via REST API)
4. Ensure no layout shifts or style conflicts

**Done Criteria:**
- [ ] Component loads on chosen page
- [ ] Component calls API successfully
- [ ] Both resource and scope audit results display in UI
- [ ] No errors in browser console

**Output:**
```
banking_api_ui/src/pages/DemoData.jsx (or AdminPage.jsx)
  - Integration of PingOneAudit component
```

**Verification:**
- [ ] Navigate to `/demo-data` (or `/admin`)
- [ ] PingOne audit section visible
- [ ] Resource configuration table visible
- [ ] Scope configuration table visible
- [ ] Click "Refresh Audit" button → re-fetches data from both services

---

### Task 7: Unit & Integration Tests
**Type:** `auto` | **TDD:** `false` | **Reporter:** Acceptance

**Objective:** Comprehensive test coverage for all services and component.

**Tests to Add:**

**Resource Validation Service Tests (`resourceValidation.test.js`):**
- Resource exists with correct audience (CORRECT status)
- Resource exists but with wrong audience (CONFIG_ERROR status)
- Expected resource doesn't exist (MISSING status)
- Unexpected resource in environment (AUDIT_WARNING status)
- API error handling (timeout, 401, 500)
- Empty resource list handling

**Scope Audit Service Tests (`scopeAudit.test.js`):**
- Correct scope comparison (exact match, ignoring order)
- Mismatch detection (missing scopes, extra scopes)
- Resource with no expected scopes (Agent Gateway case)
- API error handling (timeout, 401, 500)
- Empty response handling

**Unified Audit API Integration Tests (`pingoneAudit.integration.test.js`):**
- GET `/api/pingone/audit` responds with valid JSON
- Response includes resource validation results
- Response includes scope audit results
- Response includes `status`, `resourceValidation`, `scopeAudit` fields
- Requires authentication (should fail without session)

**Component Tests (`PingOneAudit.test.jsx`):**
- Renders loading state while fetching
- Renders both resource and scope tables on success
- Shows error message on API failure
- Status badges display correct colors for each severity level
- Refresh button triggers re-fetch
- Resource table and scope table both present

**Done Criteria:**
- [ ] `npm test` passes all new tests
- [ ] Coverage ≥ 80% for both service layers
- [ ] Coverage ≥ 75% for React component
- [ ] No console warnings or errors during test run

**Output:**
```
banking_api_server/services/__tests__/resourceValidation.test.js
  - Resource validation service tests

banking_api_server/services/__tests__/scopeAudit.test.js
  - Scope audit service tests

banking_api_ui/src/components/__tests__/PingOneAudit.test.jsx
  - Component unit tests

banking_api_server/__tests__/integration/pingoneAudit.integration.test.js
  - E2E test of full /api/pingone/audit flow
```

**Verification:**
- [ ] `npm test` passes
- [ ] `npm run build` succeeds (no TypeErrors)

---

### Task 8: Build & Deploy
**Type:** `auto` | **TDD:** `false` | **Reporter:** Acceptance

**Objective:** Build and deploy to Vercel with no regressions.

**Steps:**
1. Run `npm run build` in `banking_api_ui/` → exit code 0
2. Run `npm test` → all tests pass
3. Commit all new files and changes
4. Push to remote branch
5. Deploy to Vercel preview (if available) or `vercel --prod`
6. Test live: navigate to app, log in, view PingOne audit component
7. Verify both resource validation and scope audit work correctly
8. Verify all 5 resources appear in results

**Done Criteria:**
- [ ] Build succeeds (no TypeErrors, no unhandled rejections)
- [ ] Tests pass
- [ ] Deployed to Vercel
- [ ] PingOne audit component accessible and functional on live site
- [ ] Resource validation results display correctly
- [ ] Scope audit results display correctly
- [ ] No new console errors on page load

**Output:**
Console verification, Vercel deployment URL, live component demo

**Verification:**
- [ ] Visit deployed app
- [ ] Log in as test user
- [ ] Navigate to `/demo-data`
- [ ] PingOne Configuration Audit section visible with two tables
- [ ] Resource Configuration table shows all expected resources
- [ ] Scope Configuration table shows scope comparisons
- [ ] Click "Refresh Audit" — both tables update

---

## Deviations & Blockers

*(Filled during execution)*

## Success Criteria ✓

- [x] Phase planned with 8 tasks
- [ ] Task 1: API contract researched (resource discovery + scope validation endpoints)
- [ ] Task 2: Resource validation service built with tests (discovery, attribute validation)
- [ ] Task 3: Scope audit service built with tests (scope comparison logic)
- [ ] Task 4: Unified REST API exposed (/api/pingone/audit)
- [ ] Task 5: React component built with two-table layout
- [ ] Task 6: Component integrated into /demo-data
- [ ] Task 7: All tests pass (≥80% service coverage, ≥75% component)
- [ ] Task 8: Deployed to Vercel with verified functionality

---

*Plan: 87-1 | Created: 2026-04-08 | Status: Ready for execution*
