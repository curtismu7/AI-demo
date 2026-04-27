---
phase: 242-pingone-api-transparency-all-test-pages-show-actual-api-endp
plan: "02"
subsystem: frontend/PingOneTestPage
tags: [react, api-transparency, ApiCallPreviewCard, PingOneTestPage]
---

# 242-02 Summary — ApiCallPreviewCard wired into PingOneTestPage

## What was done

- Fixed import: changed `./shared/ApiCallPreviewCard` → `./ApiCallPreviewCard` (the new wave-1 component with full props)
- Extended `TestCard` inner component signature to accept `docsSectionTitle`, `endpoint`, `label` props (additive; no existing props changed)
- Wired `docsSectionTitle` into the existing `PingOneApiPanel` call inside `TestCard`
- Updated existing inline RFC8693 example card (pre-existing at line ~1601) to use new prop names (`docsUrl`, `docsSectionTitle`, `label` replacing old `docUrl`, `docLabel`, `description`)
- Added `docsSectionTitle` + `endpoint` to 8 `TestCard` call sites that already had `pingoneRequest`:
  - Agent Token (client_credentials)
  - 2-Exchange: User/Admin Token + Agent CC → MCP Gateway
  - 2-Exchange: ID Token + Agent CC → MCP Gateway (exchange186)
  - Simple Exchange: 401-triggered (exchange401)
  - Management API: Applications, Resource Servers, Scopes, Users
- Added 3 explicit inline `<ApiCallPreviewCard>` instances for sections with live data:
  - Agent token section (`agentPingoneReq`)
  - Exchange2 section (`exchange2PingoneReq`)
  - Exchange186 section (`exchange186PingoneReq`)
- Added static `<ApiCallPreviewCard>` in Worker Token section (no live state vars — static card with null request/response)

## ApiCallPreviewCard instances added: 6 total references

1. Import (line 11)
2. Existing inline RFC8693 example card (updated to new props)
3. Worker Token static card (new)
4. Agent Token explicit card (new, conditional on `agentPingoneReq`)
5. Exchange2 explicit card (new, conditional on `exchange2PingoneReq`)
6. Exchange186 explicit card (new, conditional on `exchange186PingoneReq`)

Exchange401, apps, resources, scopes, users sections pass `docsSectionTitle`+`endpoint` to TestCard but do not have additional explicit cards (PingOneApiPanel inside TestCard shows the data).

## Verification

- `grep -c "ApiCallPreviewCard" PingOneTestPage.jsx` → **6** (criterion: >= 6) ✓
- `grep "apidocs.pingidentity.com" PingOneTestPage.jsx` → **13 lines** (criterion: exits 0) ✓
- `npm run build` → **exit 0** ✓
