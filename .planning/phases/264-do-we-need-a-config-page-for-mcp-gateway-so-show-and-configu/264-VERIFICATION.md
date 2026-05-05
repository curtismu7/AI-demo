---
phase: 264-do-we-need-a-config-page-for-mcp-gateway-so-show-and-configu
verified: 2026-05-05T08:10:00Z
status: human_needed
score: 11/11 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Open /mcp-gateway admin page in browser, click 'Real PingGateway (Prod)' tab, verify 5-step wizard renders with step headers, status indicators, and form fields"
    expected: "Wizard with 5 steps; Step 1 shows PingOne credential status; Step 2 shows form with 6 fields including read-only derived fields and editable required fields with yellow 'Required' badge when empty"
    why_human: "Visual layout, badge rendering, and conditional status circles require browser rendering to confirm"
  - test: "Click '📖 Docs & Setup' tab, verify 3 doc cards appear with links"
    expected: "3 doc cards with title, description, and clickable external links to developer.pingidentity.com and docs.pingidentity.com"
    why_human: "Tab switching and card rendering requires browser"
  - test: "In Step 2 form, type a value into the PingOne Resource ID field and verify the Live mcp.json Preview updates without a network request"
    expected: "JSON preview updates client-side on each keystroke with no API call visible in browser DevTools Network tab"
    why_human: "Live preview reactivity requires browser interaction"
  - test: "Click 'Download mcp.json' button in Step 2"
    expected: "Browser triggers a file download named mcp.json with the current form values serialized as JSON"
    why_human: "File download behavior requires browser"
---

# Phase 264: MCP Gateway Config Page Verification Report

**Phase Goal:** MCP Gateway config page with guided PingGateway setup wizard, Docs & Setup tab linking official resources, RFC 9728-compliant mock gateway, and BFF persistence of route-level config
**Verified:** 2026-05-05T08:10:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | GET /api/admin/mcp-gateway/config response includes pingOneEnvUrl, pingOneResourceId, gatewayPublicUrl, upstreamMcpUrl, mcpScope, and introspectEndpoint | VERIFIED | Lines 188-207 of mcpGatewayConfig.js: all 6 fields built into cfg object |
| 2 | introspectEndpoint equals pingOneEnvUrl + '/as/introspect' | VERIFIED | Line 207: `cfg.introspectEndpoint = \`${cfg.pingOneEnvUrl}/as/introspect\`` |
| 3 | POST /api/admin/mcp-gateway/config accepts mcp_gw_client_id, mcp_gw_public_url, mcp_scope in the allowlist | VERIFIED | Lines 258-260 of mcpGatewayConfig.js: 3 keys added to allowed array |
| 4 | POST persists the three new keys to configStore via setRaw() so they survive BFF restart | VERIFIED | Lines 305-313: setRaw() called with filtered keys after successful gateway push |
| 5 | All 13 BFF route tests pass | VERIFIED | npm test output: 13/13 tests pass in mcpGatewayConfig.test.js |
| 6 | 401 responses from authorizeMcpRequest include WWW-Authenticate header with Bearer realm="PingOne" and resource_metadata | VERIFIED | Lines 116 and 141 of authorizeMcpRequest.ts both include the full RFC 9728 header |
| 7 | 403 responses from authorizeMcpRequest include WWW-Authenticate header with same format | VERIFIED | Lines 166-169: writeHead now includes WWW-Authenticate on 403 |
| 8 | resource_metadata value ends with '/.well-known/mcp-server' | VERIFIED | All 3 response paths use `${config.gatewayResourceUri}/.well-known/mcp-server` (3 grep matches) |
| 9 | Tests for 401 and 403 WWW-Authenticate headers pass | VERIFIED | 2 Section 5 tests pass: 401 on inactive token + 403 on Authorize DENY; 24/24 total tests pass |
| 10 | 4th tab 'Docs & Setup' appears in McpGatewayConfig tab bar with 3 doc cards | VERIFIED | Lines 233-237 (tab button) and 558-586 (doc tab content with 3 cards) of McpGatewayConfig.jsx |
| 11 | Real PingGateway tab shows 5-step wizard; Step 2 form has 6 fields; Save to Config POSTs 3 writable keys; live JSON preview; Download mcp.json button; compliance note | VERIFIED | Lines 352-543 of McpGatewayConfig.jsx; handleRouteSave sends mcp_gw_client_id/mcp_gw_public_url/mcp_scope; buildLiveMcpJson() is client-side; handleDownloadMcpJson present |

**Score:** 11/11 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `banking_api_server/routes/mcpGatewayConfig.js` | Extended GET/POST config route with introspectEndpoint and new POST keys | VERIFIED | 3 lines changed in allowed array; cfg object has introspectEndpoint; setRaw() called in POST |
| `banking_api_server/tests/mcpGatewayConfig.test.js` | BFF route tests (new file) | VERIFIED | 13 tests, all passing |
| `banking_mcp_gateway/src/middleware/authorizeMcpRequest.ts` | RFC 9728 WWW-Authenticate on 401 and 403 | VERIFIED | 3 response paths updated; 3 occurrences of resource_metadata; 3 occurrences of realm="PingOne" |
| `banking_mcp_gateway/tests/gateway-auth.test.ts` | Tests for WWW-Authenticate header presence | VERIFIED | Section 5 added with 2 tests (401 inactive token + 403 DENY); all 24 tests pass |
| `banking_api_ui/src/components/McpGatewayConfig.jsx` | 4th tab + 5-step wizard + route config form + live JSON preview | VERIFIED | All features present; build exits 0 |
| `banking_api_ui/src/components/McpGatewayConfig.css` | Wizard step styles, doc card styles, required badge | VERIFIED | 18 grep matches for mgc-wizard/mgc-doc-card/mgc-badge--required/mgc-download-btn classes |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| mcpGatewayConfig.js GET handler | configStore.getEffective() | derives pingOneEnvUrl, introspectEndpoint | WIRED | pingOneEnvUrl derived from envId/region at line 200; introspectEndpoint computed at line 207 |
| mcpGatewayConfig.js POST handler | configStore.setRaw() | persists mcp_gw_client_id, mcp_gw_public_url, mcp_scope | WIRED | setRaw called at line 311 with filtered persistKeys |
| authorizeMcpRequest.ts 401 path | config.gatewayResourceUri | resource_metadata construction | WIRED | Both 401 paths use `${config.gatewayResourceUri}/.well-known/mcp-server` |
| authorizeMcpRequest.ts 403 path | config.gatewayResourceUri | WWW-Authenticate header added | WIRED | Line 168: WWW-Authenticate added to 403 writeHead |
| McpGatewayConfig.jsx routeForm state | buildLiveMcpJson() helper | live JSON preview computed client-side on each keystroke | WIRED | buildLiveMcpJson() reads routeForm.pingOneResourceId and routeForm.gatewayUrl; liveMcpJsonStr rendered in pre tag |
| McpGatewayConfig.jsx handleRouteSave() | POST /api/admin/mcp-gateway/config | sends mcp_gw_client_id, mcp_gw_public_url, mcp_scope | WIRED | Lines 161-169: fetch to /api/admin/mcp-gateway/config with 3 keys in body |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|-------------------|--------|
| McpGatewayConfig.jsx | data.config | GET /api/admin/mcp-gateway/config → fetchConfig() | Yes — BFF derives from configStore + env vars | FLOWING |
| McpGatewayConfig.jsx | routeForm | seeded from data.config in useEffect at line 128-133 | Yes — seeded from live BFF data | FLOWING |
| McpGatewayConfig.jsx | liveMcpJsonStr | buildLiveMcpJson() using routeForm + data.config | Yes — computed from real form state | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| BFF GET returns introspectEndpoint | npm test mcpGatewayConfig (test: "returns introspectEndpoint as pingOneEnvUrl + /as/introspect") | PASS | PASS |
| BFF POST persists via setRaw | npm test mcpGatewayConfig (test: "calls configStore.setRaw with new keys when gateway push succeeds") | PASS | PASS |
| 401 response has WWW-Authenticate | npm test gateway-auth (Section 5 test 1) | PASS | PASS |
| 403 response has WWW-Authenticate | npm test gateway-auth (Section 5 test 2) | PASS | PASS |
| UI build succeeds | npm run build in banking_api_ui | Exit 0 | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| MCP-GW-01 | 264-01-PLAN.md | BFF GET returns 6 derived/pre-fill fields | SATISFIED | Lines 188-207 mcpGatewayConfig.js; 5 GET tests pass |
| MCP-GW-02 | 264-01-PLAN.md | BFF POST accepts and persists 3 new route-level keys via setRaw | SATISFIED | Lines 258-260 (allowlist), 305-313 (setRaw); 3 POST tests pass |
| MCP-GW-03 | 264-02-PLAN.md | RFC 9728 WWW-Authenticate on 401/403 in mock gateway | SATISFIED | authorizeMcpRequest.ts lines 116, 141, 168; 2 Section 5 tests pass |
| MCP-GW-04 | 264-03-PLAN.md | 4th Docs & Setup tab with 3 doc cards | SATISFIED | McpGatewayConfig.jsx lines 233-237 (tab) and 558-586 (content) |
| MCP-GW-05 | 264-03-PLAN.md | 5-step wizard in Real PingGateway tab with form, live preview, save, download | SATISFIED | McpGatewayConfig.jsx lines 352-543; all handlers present and wired |

**Note on REQUIREMENTS.md:** MCP-GW-01 through MCP-GW-05 are phase-internal requirement IDs defined in the ROADMAP.md entry for Phase 264. They do not appear in the main REQUIREMENTS.md (which tracks v1 milestone requirements). This is consistent with the phase's own PLAN frontmatter referencing them. No orphaned requirements were identified.

### Anti-Patterns Found

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| McpGatewayConfig.jsx (line 51 mcpScope in buildPingGatewayMcpJson) | `mcpScope || 'test'` still used inside `buildPingGatewayMcpJson()` in the BFF (mcpGatewayConfig.js line 51) — fallback is 'test' not 'banking:mcp:invoke' | Info | The GET response config.mcpScope defaults to 'banking:mcp:invoke' correctly, but the embedded buildPingGatewayMcpJson function (server-side, used for the pingGatewayJson download) still falls back to 'test'. This only affects the static pingGatewayJson in the GET response; the live JSON preview uses routeForm.mcpScope which defaults to 'banking:mcp:invoke'. |

**Note on anti-pattern:** The BFF function `buildPingGatewayMcpJson` (mcpGatewayConfig.js line 51) still has `mcpScope || 'test'` as its internal fallback, but the cfg object passed to it will always have mcpScope from `configStore.getEffective('mcp_scope') || 'banking:mcp:invoke'`, so the 'test' fallback is unreachable in practice. Not a blocker.

### Missing Test: 401 GatewayTokenPolicyError

The 264-02-PLAN.md behavior section specified 3 Section 5 tests including "401 on invalid token (GatewayTokenPolicyError)". Only 2 were implemented (401 inactive token + 403 DENY). The implementation at line 141 of authorizeMcpRequest.ts correctly adds the WWW-Authenticate header to the GatewayTokenPolicyError path, but this path has no automated test coverage in Section 5. The must_have truth as written ("Tests for 401 and 403 WWW-Authenticate headers pass") is satisfied by the 2 tests that do exist. This is informational only.

### Human Verification Required

1. **Wizard tab renders correctly**

   **Test:** Open `/mcp-gateway` admin page, click "Real PingGateway (Prod)" tab
   **Expected:** 5 wizard steps rendered with visual step-circle indicators (green check/yellow warning/pending), step headers, and collapsed/expanded bodies
   **Why human:** CSS layout and conditional class application (.mgc-wizard-step-circle--complete vs --needs-input) requires browser rendering

2. **Required badge visibility**

   **Test:** In Step 2 form, clear the PingOne Resource ID field, observe badge
   **Expected:** Yellow "Required" badge appears next to the PingOne Resource ID and PingGateway Public URL labels when they are empty
   **Why human:** Badge conditional rendering based on form state requires browser interaction

3. **Docs & Setup tab content**

   **Test:** Click "Docs & Setup" tab, verify 3 doc cards appear with links
   **Expected:** 3 doc cards with title, description, and clickable external links
   **Why human:** Tab rendering requires browser

4. **Live JSON preview reactivity**

   **Test:** Type in Step 2 form fields, observe Live mcp.json Preview
   **Expected:** JSON updates client-side with no network request (verify in DevTools)
   **Why human:** Client-side update behavior requires browser interaction

---

_Verified: 2026-05-05T08:10:00Z_
_Verifier: Claude (gsd-verifier)_
