---
phase: 266
plan: "05"
subsystem: ui-diagrams
tags: [architecture, mermaid, diagrams, credential-paths, banking_resource_server, phase-266-r2]
dependency_graph:
  requires: [266-04]
  provides: [266-05-diagrams]
  affects: [architecture-pages, token-flow-inspector, narrative-panel, agent-flow-panel]
tech_stack:
  added: []
  patterns:
    - mermaid-cli v10 requires flowchart declaration on line 1 (no leading comments or frontmatter)
    - credentialPath read from ctx?.events?.[0]?.credentialPath with oauth_bearer fallback
    - Path badge colors: blue #004687 (oauth_bearer), amber #ca8a04 (api_key), teal #0d9488 (dual_token)
key_files:
  created: []
  modified:
    - banking_api_ui/src/components/ArchitectureFlowPage.js
    - banking_api_ui/src/components/SequenceDiagramPage.js
    - banking_api_ui/src/components/ArchitectureTokenFlowPage.js
    - banking_api_ui/src/components/TokenExchangeFlowDiagram.jsx
    - banking_api_ui/src/components/NarrativePanel.js
    - banking_api_ui/src/components/AgentFlowDiagramPanel.js
    - banking_api_ui/src/components/UnifiedTokenFlowInspector.jsx
    - banking_api_ui/src/components/OidcFlowTimeline.js
    - architecture-simple.mmd
    - architecture.mmd
    - i4ai-ref-arch.mmd
    - mcp-security-gateway.mmd
    - banking_api_ui/public/architecture/overview.png
    - banking_api_ui/public/architecture/overview2.png
    - banking_api_ui/public/architecture/token-flow.png
    - banking_api_ui/public/architecture/token-flow2.png
decisions:
  - "OidcFlowTimeline: Case 2 (JSDoc audit comment only) — component covers OIDC login flow only, no downstream credential calls found via grep; path-aware rendering not needed"
  - "mermaid-cli v10 requires flowchart declaration as first line — moved all comments inside the diagram body; frontmatter (--- title: ---) also incompatible with v10 parser"
  - "TokenExchangeFlowDiagram: static HTML panel below existing SVG rather than dynamic path rendering — minimal diff, no existing hook to attach to"
  - "architecture-simple.mmd render failure root cause was leading %% comment lines, not cylinder syntax — fix: move flowchart LR to line 1"
metrics:
  duration_minutes: 95
  completed_date: "2026-05-11"
  tasks_completed: 4
  tasks_total: 4
  files_modified: 16
---

# Phase 266 Plan 05: Architecture Diagram Updates for Phase 266 R2 — Summary

Three-path credential architecture (api_key, dual_token, oauth_bearer) wired through all 8 React visualization components and all 4 mermaid source diagrams, with regenerated PNGs, surfacing banking_resource_server as a distinct live backend node.

## Tasks Completed

| # | Task | Commit | Key Changes |
|---|------|--------|-------------|
| 1 | ArchitectureFlowPage — banking_resource_server node + 3 path scenarios | 3cdfa254 | BankingRS + SQLite nodes; gw-rs-identity (teal), gw-rs-bankingdata (blue), rs-sqlite (dashed); 3 new SCENARIO_STEPS_FLOW arrays; 3 new select options |
| 2 | SequenceDiagramPage + ArchitectureTokenFlowPage + TokenExchangeFlowDiagram | 54f37a24 | 3 path scenarios in SCENARIOS + SCENARIO_STEPS_TF; static credential-disposition panel in TokenExchangeFlowDiagram; 3 select options each |
| 3 | NarrativePanel + AgentFlowDiagramPanel + UnifiedTokenFlowInspector + OidcFlowTimeline | f27ef37e | credentialPath badge + narration in NarrativePanel; AFD path badge in AgentFlowDiagramPanel; path ribbon in UTFI AgentFlowSection; JSDoc audit comment in OidcFlowTimeline |
| 4 | Mermaid source diagrams + PNG regeneration | d47c4109 | All 4 .mmd updated; flowchart LR moved to line 1 in architecture-simple.mmd; all 4 PNGs regenerated successfully |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] mermaid-cli v10 incompatibility with leading comment lines**
- **Found during:** Task 4 — architecture-simple.mmd render failure
- **Issue:** mermaid-cli v10 parser requires the diagram type declaration (`flowchart LR`) as the very first line. Leading `%%` comment lines and YAML frontmatter (`---`) both cause `Parse error on line 1`. The other three .mmd files already started with `flowchart`/`sequenceDiagram` so they rendered fine. architecture-simple.mmd had a `---\ntitle:...\n---` frontmatter block, then comment lines before `flowchart LR`.
- **Fix:** Removed YAML frontmatter (converted to inline `%% title:` comment inside diagram body), moved `flowchart LR` to line 1, moved all comment lines inside the flowchart body.
- **Files modified:** `architecture-simple.mmd`
- **Commit:** d47c4109

**2. [Rule 2 - Missing content] TokenExchangeFlowDiagram had no path display**
- **Found during:** Task 2
- **Issue:** The plan specified path-aware rendering for TokenExchangeFlowDiagram but the component is SVG-based with no existing event hook or token chain context.
- **Fix:** Added a static HTML panel below the existing education buttons listing all 3 paths with color-coded labels. This is minimal-diff and matches plan intent without requiring a major refactor of the SVG component.
- **Files modified:** `banking_api_ui/src/components/TokenExchangeFlowDiagram.jsx`
- **Commit:** 54f37a24

## Known Stubs

None. All path labels, narrations, and diagram nodes are wired to real data (`credentialPath` from token chain context) or accurately describe the implemented architecture.

## Threat Flags

None. This plan modifies only visualization/diagram components and static .mmd source files. No new network endpoints, auth paths, or schema changes.

## Self-Check: PASSED

Files verified:
- `architecture-simple.mmd` — exists, flowchart LR on line 1
- `architecture.mmd` — exists, BankingRS + SQLite nodes present
- `i4ai-ref-arch.mmd` — exists, alt/else block present
- `mcp-security-gateway.mmd` — exists, BANKING_RS + SQLITE + API_KEY_BACKEND present
- `banking_api_ui/public/architecture/overview.png` — 284K, rendered successfully
- `banking_api_ui/public/architecture/overview2.png` — 256K, rendered successfully
- `banking_api_ui/public/architecture/token-flow.png` — 576K, rendered successfully
- `banking_api_ui/public/architecture/token-flow2.png` — 184K, rendered successfully
- `banking_api_ui/src/components/NarrativePanel.js` — PATH_LABELS + PATH_NARRATION + credentialPath badge present
- `banking_api_ui/src/components/AgentFlowDiagramPanel.js` — AFD_PATH_LABELS + AFD_PATH_COLORS + badge present
- `banking_api_ui/src/components/UnifiedTokenFlowInspector.jsx` — utfiCredentialPath + path ribbon present
- `banking_api_ui/src/components/OidcFlowTimeline.js` — Phase 266 audit JSDoc block present
- UI build: `Compiled successfully.` (exit 0)

Commits verified:
- 3cdfa254 — feat(266-05): ArchitectureFlowPage
- 54f37a24 — feat(266-05): SequenceDiagramPage + ArchitectureTokenFlowPage + TokenExchangeFlowDiagram
- f27ef37e — feat(266-05): NarrativePanel + AgentFlowDiagramPanel + UnifiedTokenFlowInspector + OidcFlowTimeline
- d47c4109 — feat(266-05): mermaid source diagrams + PNGs
