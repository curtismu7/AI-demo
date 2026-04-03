---
phase: 04-education-content
plan: 01
subsystem: ui
tags: [react, education, oidc, oauth]

requires: []
provides:
  - OIDC 2.1 education drawer panel with 3 tabs (what-changed, why-agents, spec-links)
  - EDU.OIDC_21 constant in educationIds.js
  - Oidc21Panel registered in EducationPanelsHost and EducationBar
affects: [education panels, EducationBar menu]

tech-stack:
  added: []
  patterns:
    - "EducationDrawer + tabs pattern (same as existing LoginFlowPanel)"

key-files:
  created:
    - banking_api_ui/src/components/education/Oidc21Panel.js
  modified:
    - banking_api_ui/src/components/education/educationIds.js
    - banking_api_ui/src/components/education/EducationPanelsHost.js
    - banking_api_ui/src/components/EducationBar.js

key-decisions:
  - "Used EducationDrawer shared component (3-tab structure matching all other education panels)"
  - "Added OIDC_21 button to OAuth flows section of EducationBar"

requirements-completed:
  - EDU-01

duration: 12min
completed: 2026-04-01
---

# Phase 04 Plan 01: OIDC 2.1 Education Panel Summary

**OIDC 2.1 drawer panel with 3 tabs — what changed, why AI agents care, spec links — accessible from EducationBar hamburger menu.**

## Performance

- **Duration:** 12 min
- **Completed:** 2026-04-01
- **Tasks:** 3 (create panel, register in 3 files, build verify)
- **Files modified:** 4

## Accomplishments

- Created `Oidc21Panel.js` with `EducationDrawer` shell and 3 tabs:
  - **What changed** — PKCE mandatory, implicit removed, resource indicators, refresh rotation, nonce replay protection; comparison table OIDC 1.0 vs 2.1
  - **Why AI agents care** — how each change closes an agent-specific attack surface; "this demo is OIDC 2.1-aligned" callout
  - **Spec & links** — openid.net draft link, RFC 7636/8707/9700 links, cross-link to Login Flow panel
- Registered `OIDC_21: 'oidc-21'` in `educationIds.js`
- Added `<Oidc21Panel>` to `EducationPanelsHost.js`
- Added "OIDC 2.1 spec alignment" button to the OAuth flows section of `EducationBar.js`
- Build passes (exit 0)

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- `grep OIDC_21 educationIds.js` → line 26
- `grep Oidc21Panel EducationPanelsHost.js` → import line 21, JSX line 47
- `grep OIDC_21 EducationBar.js` → button at line 212
- `npm run build` → `Compiled successfully.`
