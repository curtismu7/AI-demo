# Phase 240 Research - PingOne API/request/response/docs-link coverage

Date: 2026-04-26

## Objective
Create an implementation-ready plan to guarantee all test pages (and select adjacent pages where appropriate) consistently show:
1. actual PingOne API endpoint
2. request JSON sent to PingOne
3. response JSON from PingOne
4. docs link to PingOne API reference

## Current State Findings

1. Core test pages already use shared API trace panel
- `banking_api_ui/src/components/MFATestPage.jsx` imports `PingOneApiPanel` and wires many `pingoneRequest` / `pingoneResponse` fields.
- `banking_api_ui/src/components/AuthzTestPage.jsx` imports `PingOneApiPanel` and displays request + response for evaluate flows.
- `banking_api_ui/src/components/PingOneTestPage.jsx` imports `PingOneApiPanel` and passes per-card request/response props.

2. Backend request/response debug shape exists but is uneven across routes
- `banking_api_server/routes/mfaTest.js`, `banking_api_server/routes/authorize.js`, and `banking_api_server/routes/pingoneTestRoutes.js` commonly return `pingoneRequest` and `pingoneResponse`.
- PingOne endpoint metadata in `pingoneRequest` is present for many routes but not fully standardized for docs-link resolution.

3. Docs-link requirement is not standardized
- Search found no broad, shared mapping of call type -> PingOne docs URL.
- Existing `PingOneApiPanel` usage focuses on request/response rendering; docs-link propagation is not consistently wired.

4. Test-page routes and neighboring diagnostic pages
- Confirmed test-page routes in `App.js`: `/pingone-test`, `/mfa-test`, `/authz-test`.
- Nearby pages with diagnostic intent: `/api-traffic`, `/oauth-debug-logs`, `/delegated-access`.
- D-04 should include only pages where PingOne call transparency is first-class and not generic API telemetry.

## Recommended Implementation Strategy

1. Coverage audit first, then contract
- Build an explicit coverage matrix of all test sections and identify missing endpoint/request/response/docs-link fields.
- Define a normalized UI contract for PingOne call trace payloads including docs metadata.

2. Keep shared component approach
- Extend `PingOneApiPanel` to support endpoint label and docs link.
- Avoid per-page bespoke rendering to prevent regression drift.

3. Normalize backend trace fields
- Add a route/service helper for constructing consistent `pingoneRequest` / `pingoneResponse` payloads with optional docs key/url.
- Ensure all test-page backend paths return the same shape.

4. Add targeted verification
- Automated checks for required fields in key route responses.
- UI build verification after any `banking_api_ui` edits.

## Candidate Additional Pages (D-04)

Include candidates only if they present PingOne call-specific educational/debug content:
- Include candidate: `DelegatedAccessPage` (already token-exchange API call + claim narrative)
- Conditional include: `OAuthDebugLogViewer` (if it can render PingOne-specific records cleanly)
- Exclude by default: generic traffic/log pages that are not PingOne-focused

## Risks and Mitigations

- Risk: Regressions from broad UI edits across multiple pages.
  - Mitigation: keep changes through shared panel + minimal per-page wiring.
- Risk: exposing proxy/internal-only payloads instead of real PingOne request metadata.
  - Mitigation: enforce endpoint/method/body in normalized request object from server routes.
- Risk: docs links drifting or becoming inconsistent.
  - Mitigation: single mapping source for PingOne API doc URLs and route-to-doc binding.

## Files Implicated

- UI: `banking_api_ui/src/components/PingOneApiPanel.jsx`, `banking_api_ui/src/components/PingOneApiPanel.css`, `banking_api_ui/src/components/MFATestPage.jsx`, `banking_api_ui/src/components/AuthzTestPage.jsx`, `banking_api_ui/src/components/PingOneTestPage.jsx`
- Server: `banking_api_server/routes/mfaTest.js`, `banking_api_server/routes/authorize.js`, `banking_api_server/routes/pingoneTestRoutes.js`, selected PingOne service helpers
- Optional D-04 pages: `banking_api_ui/src/components/DelegatedAccessPage.js`, `banking_api_ui/src/components/OAuthDebugLogViewer.js`