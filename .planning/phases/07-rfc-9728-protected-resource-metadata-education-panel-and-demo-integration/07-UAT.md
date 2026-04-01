---
status: testing
phase: 07-rfc-9728-protected-resource-metadata-education-panel-and-demo-integration
source:
  - 07-01-SUMMARY.md
  - 07-02-SUMMARY.md
current_test: 4
total_tests: 4
passed: 3
failed: 0
issues: []
---

# UAT — Phase 07: RFC 9728 Protected Resource Metadata

## Tests

### Test 1: Cold Start Smoke Test
- **Status:** ✅ passed
- **Expected:** Kill any running BFF server. Start it fresh (`cd banking_api_server && node server.js` or `npm start`). Server boots without errors and responds to a basic request.

---

### Test 2: Well-known endpoint returns RFC 9728 JSON
- **Status:** ✅ passed
- **Expected:** `curl http://localhost:3001/.well-known/oauth-protected-resource` returns 200 JSON with `resource`, `bearer_methods_supported`, `scopes_supported`, and `resource_name` fields.

---

### Test 3: RFC 9728 tab appears in AgentGatewayPanel
- **Status:** ✅ passed
- **Expected:** Open the app UI and navigate to the Agent Gateway education panel (e.g., click the Agent Gateway link or the RFC 9728 entry in RFCIndexPanel). A third tab labelled **"RFC 9728"** is visible alongside "Pattern overview" and "In this repo".

---

### Test 4: RFC 9728 tab shows live metadata
- **Status:** pending
- **Expected:** Click the **RFC 9728** tab. The panel shows education prose (What is RFC 9728, Well-known URL, Why it matters for AI agents) and a live JSON block fetched from `/api/rfc9728/metadata` (not "Loading…" or an error).

---

## Issues Found

(none yet)
