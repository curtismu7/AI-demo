---
phase: 04-education-content
plan: 03
subsystem: ui
tags: [react, education, tour, demo]

requires:
  - phase: 04-01
    provides: EducationBar hamburger menu (tour button added here)
  - phase: 04-02
    provides: (independent, same wave 1 prerequisites)
provides:
  - RFC 9700 row in RFCIndexPanel
  - DemoTourContext (9-step tour state + TOUR_STEPS)
  - DemoTourModal (fixed-position step-through modal)
  - DemoTourProvider mounted in App.js
  - Start Tour button in EducationBar
affects: [App.js providers, EducationBar, RFCIndexPanel, demo presenter workflow]

tech-stack:
  added: []
  patterns:
    - "React Context + Provider pattern for tour state"
    - "Fixed-position modal with progress bar (bottom-right)"

key-files:
  created:
    - banking_api_ui/src/context/DemoTourContext.js
    - banking_api_ui/src/components/tour/DemoTourModal.js
    - banking_api_ui/src/components/tour/DemoTourModal.css
  modified:
    - banking_api_ui/src/components/education/RFCIndexPanel.js
    - banking_api_ui/src/App.js
    - banking_api_ui/src/components/EducationBar.js

key-decisions:
  - "TOUR_STEPS exported from DemoTourContext (DemoTourModal imports from same file)"
  - "DemoTourProvider wraps EducationUIProvider in App.js to access tour from EducationBar"
  - "DemoTourModal only renders when isOpen=true (no DOM cost when closed)"

requirements-completed:
  - EDU-03
  - EDU-04

duration: 18min
completed: 2026-04-01
---

# Phase 04 Plan 03: RFC 9700 + Guided Demo Tour Summary

**RFC 9700 added to reference index; 9-step guided demo tour with context, progress bar, and keyboard navigation implemented end-to-end.**

## Performance

- **Duration:** 18 min
- **Completed:** 2026-04-01
- **Tasks:** 5 (RFC 9700, DemoTourContext, DemoTourModal + CSS, App.js mount, EducationBar button)
- **Files modified:** 3 modified, 3 created

## Accomplishments

- **RFC 9700**: Added row to `RFCIndexPanel.js` ROWS array (after RFC 9396 entry):
  - "OAuth 2.0 Security Best Current Practice" — security baseline row with no panel link (panel: null)
- **DemoTourContext.js**: Created with `DemoTourProvider`, `useDemoTour`, `TOUR_STEPS` (9 steps covering all 3 auth flows + token exchange showcase)
- **DemoTourModal.js + DemoTourModal.css**: Fixed bottom-right modal with:
  - Red progress bar (4px, animated width transition)
  - Step N of 9 label in header
  - Prev (disabled at step 0) + Next/Finish buttons
  - Optional action CTA (React Router Link for route actions)
  - Escape key to close
- **App.js**: `DemoTourProvider` wrapping `EducationUIProvider`; `<DemoTourModal />` mounted with `!isApiTrafficOnlyPage` guard
- **EducationBar.js**: "🗺 Guided Demo Tour (5 min)" featured button at top of full panel (calls `tour.start()`)
- Build passes

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED

- `grep -n "RFC 9700" RFCIndexPanel.js` → line 21
- `grep -n "useDemoTour\|DemoTourProvider\|TOUR_STEPS" DemoTourContext.js` → all present
- `ls banking_api_ui/src/components/tour/` → DemoTourModal.js DemoTourModal.css
- `npm run build` → `Compiled successfully.`
