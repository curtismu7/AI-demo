---
phase: 266
plan: 03
subsystem: banking_api_ui, banking_api_server
tags: [token-chain, ui, credentialPath, visual-identity, spec-education, activity-logs]
dependency_graph:
  requires:
    - 266-01 (credentialPath field in gateway _meta response)
  provides:
    - credentialPath plumbing through bankingAgentService → TokenChainContext → TokenChainDisplay
    - per-segment visual identity: blue (oauth_bearer) / amber (api_key) / teal (dual_token)
    - SpecRefPill: clickable spec-citation pills on each chain segment with offline explainers
    - specGuide.js: static catalogue of 19 IETF/OIDC/MCP specs with titles, URLs, summaries
    - ActivityLogs GATEWAY_PATH category + path sub-labels + INTROSPECTION act-chain display
    - appEventService EVENT_CATEGORIES.GATEWAY_PATH
  affects:
    - banking_api_ui/src/services/bankingAgentService.js
    - banking_api_ui/src/context/TokenChainContext.js
    - banking_api_ui/src/components/TokenChainDisplay.js
    - banking_api_ui/src/components/TokenChainDisplay.css
    - banking_api_ui/src/components/ActivityLogs.js
    - banking_api_server/services/appEventService.js
tech_stack:
  added: []
  patterns:
    - credentialPath field rides through arbitrary event shape in TokenChainContext (no schema change)
    - SpecRefPill: useState for expand/collapse; splits " + " multi-spec citations; offline SPEC_GUIDE lookup
    - CSS approach: tcd-path-{credentialPath} className on tcd-event-wrap, child .tcd-path-badge
key_files:
  created:
    - banking_api_ui/src/components/specGuide.js
  modified:
    - banking_api_ui/src/services/bankingAgentService.js
    - banking_api_ui/src/context/TokenChainContext.js
    - banking_api_ui/src/components/TokenChainDisplay.js
    - banking_api_ui/src/components/TokenChainDisplay.css
    - banking_api_ui/src/components/FloatingTokenChainPanel.js
    - banking_api_ui/src/components/TokenChainModal.js
    - banking_api_ui/src/components/ActivityLogs.js
    - banking_api_ui/src/components/BankingAgent.js
    - banking_api_server/services/appEventService.js
decisions:
  - "SpecRefPill placed inside tcd-event-title-row alongside the segment label for minimal layout impact"
  - "tcd-path-badge placed as direct child of tcd-event-wrap (before tcd-event div) for full-width path identity"
  - "INTROSPECTION act-chain uses inline styles (consistent with ActivityLogs existing pattern)"
  - "H2 audit: all 7 BankingAgent setTokenEvents call sites produce oauth_bearer default; no stamping needed at call sites"
  - "Task 3 implementation split across Task 1 (specGuide, SpecRefPill, CSS) and Task 2 (ActivityLogs act-chain) commits"
metrics:
  duration: ~35 minutes
  completed: 2026-05-10
  tasks: 3
  files: 9
---

# Phase 266 Plan 03: credentialPath UI plumbing + spec-citation educational panels

Per-segment visual identity (blue/amber/teal) in Token Chain UI, spec-citation pills with offline explainers, and ActivityLogs gateway path labels with INTROSPECTION delegation trail.

## What Was Built

### Task 1: credentialPath plumbing + TokenChainDisplay visual identity

**bankingAgentService.js** (success path, after building allTokenEvents):
- Reads `data.result?._meta?.credentialPath` (defaults to `'oauth_bearer'`)
- Reads `data.result?._meta?.tokenEvents` (gateway-synthesized events — the dual_token 4-segment narrative)
- Merges gateway events into the chain (deduplicating by id)
- Stamps every event with `credentialPath` via `.map(evt => ({ ...evt, credentialPath: evt.credentialPath || credentialPath }))`

**TokenChainContext.js**: JSDoc added to `setTokenEvents` documenting `credentialPath` and `specRef` optional fields.

**specGuide.js** (new file): 19-entry static spec catalogue covering RFC 6749, 6750, 7515, 7517, 7519, 7662, 8414, 8693, 8707, 9068, 9728, OIDC Core, MCP 2025-11-25, identity-chaining draft, and composite entries. All offline — no fetch calls.

**TokenChainDisplay.js**:
- Added `import { SPEC_GUIDE } from './specGuide'`
- Added `SpecRefPill` component: splits `" + "` multi-spec citations, renders clickable pill(s) linking to canonical docs, hover/click expands 1-3 sentence summary from SPEC_GUIDE
- Modified `EventRow` return: wraps `tcd-event-wrap` with `tcd-path-{credPath}` className + `data-credential-path` attribute; renders `<span className="tcd-path-badge">` with exact plain-text badge strings
- Renders `<SpecRefPill specRef={event.specRef} />` inline next to segment label when `event.specRef` is set

**TokenChainDisplay.css** (appended):
- `.tcd-path-oauth_bearer` — blue left-border (#004687)
- `.tcd-path-api_key` — amber left-border (#ca8a04) + light amber background
- `.tcd-path-dual_token` — teal left-border (#0d9488) + light teal background
- `.tcd-path-badge` — coloured background per path variant
- Spec-citation pill classes: `.tcd-specref-group`, `.tcd-specref-pill`, `.tcd-specref-unknown`, `.tcd-specref-link-icon`, `.tcd-specref-explainer`, `.tcd-specref-explainer-row`

**BankingAgent.js**: H2 audit comment block documenting all 7 `setTokenEvents` call sites and their credentialPath origins. Conclusion: all 7 default to `oauth_bearer`; the new Phase 266 paths all flow through `bankingAgentService.callMcpTool`.

### Task 2: FloatingTokenChainPanel + TokenChainModal pass-through + ActivityLogs + appEventService

**FloatingTokenChainPanel.js**: JSDoc comment confirms credentialPath pass-through (delegates to TokenChainPanel → TokenChainDisplay; no code change needed).

**TokenChainModal.js**: JSDoc comment confirms credentialPath pass-through (renders TokenChainDisplay directly; no code change needed).

**appEventService.js**: Added `GATEWAY_PATH: 'gateway_path'` to EVENT_CATEGORIES.

**ActivityLogs.js**:
- `CATEGORY_ICONS.gateway_path = null` (no emoji per REGRESSION_PLAN §0)
- `CATEGORY_LABELS.gateway_path = 'Gateway Path'`
- `GATEWAY_PATH_LABELS` const: `gateway.path.bearer → 'OAUTH BEARER PATH'`, `gateway.path.apikey → 'API-KEY PATH'`, `gateway.path.dualtoken → 'ACCESS + ID-TOKEN PATH'`
- `gateway_path` events render coloured sub-label badge in event detail (amber/teal/blue by tag)
- `introspection` events render visible delegation trail when `evt.metadata.act` present: `user (sub=X) → via gateway-client → banking_resource_server (aud=Y)`

### Task 3: specGuide.js + spec-citation rendering (R3)

Task 3 implementation was completed within Tasks 1 and 2:
- specGuide.js created in Task 1 with 19 entries (16 IETF datatracker URLs)
- SpecRefPill component added to TokenChainDisplay.js in Task 1
- Spec-citation CSS added to TokenChainDisplay.css in Task 1
- INTROSPECTION act-chain rendering added to ActivityLogs.js in Task 2

## Deviations from Plan

### Auto-fixed Issues

None.

### Minor structural decisions

**1. Task 3 work merged into Tasks 1/2 commits**
- specGuide.js creation and SpecRefPill were done during Task 1 implementation as they are tightly coupled to the TokenChainDisplay changes. The plan described Task 3 as separate but all code fits naturally in the Task 1/2 changeset with clean atomic commits.

**2. tcd-event-wrap receives path class (not a new wrapper div)**
- Plan suggested a new wrapper `<div className={`tcd-segment tcd-path-${path}`}>` around existing content. Implementation adds the class directly to the existing `tcd-event-wrap` div to minimize diff and avoid layout regressions.

**3. BankingAgent.js H2 audit found 7 call sites (not 8)**
- The plan's acceptance criteria said `wc -l` returns 8. The worktree base (e3e62a58) has 7 call sites; the plan was written against the main branch which had 8. No new call sites were added by Plan 03 — all are correctly defaulting to `oauth_bearer`.

## Known Stubs

None. All three visual paths render correctly when credentialPath is present on events. When absent (pre-existing events, test events), events default to `oauth_bearer` / blue identity — backwards compatible.

## Threat Flags

No new threat surface. credentialPath is a public label (same as shown in the UI info pages). No secrets, no new network endpoints.

## Self-Check: PASSED

Files exist:
- banking_api_ui/src/components/specGuide.js: FOUND
- banking_api_ui/src/components/TokenChainDisplay.css (tcd-path-api_key class): FOUND
- banking_api_server/services/appEventService.js (GATEWAY_PATH): FOUND

Commits:
- f2df6b9d feat(266-03): credentialPath plumbing + visual identity in TokenChainDisplay — FOUND
- 5fa16060 feat(266-03): GATEWAY_PATH category + ActivityLogs path labels + pass-through comments — FOUND

Build: `cd banking_api_ui && npm run build` exits 0 — VERIFIED
