---
phase: 108-add-server-restart-notification-modal-with-ux-polish
plan: 03
subsystem: testing
tags: [jest, testing-library, integration-test, css-animation, ux-polish]

requires:
  - phase: 108-01
    provides: bankingRestartNotificationService, ServerRestartModal
  - phase: 108-02
    provides: Global App integration
provides:
  - 24 integration tests for restart notification flow
  - Polished ServerRestartModal.css with will-change hints and optimized transitions
affects: []

tech-stack:
  added: []
  patterns: [Testing-library integration tests for modal lifecycle, CSS will-change for GPU compositing]

key-files:
  created:
    - banking_api_ui/tests/integration/serverRestart.spec.js
  modified:
    - banking_api_ui/src/components/ServerRestartModal.css

key-decisions:
  - "will-change: transform, opacity on modal overlay — offloads animation to GPU compositor"
  - "24 test cases covering: modal appears on 504, auto-dismiss on recovery, retry button, dismiss button, attempt counter"

requirements-completed: [SERVER-RESTART-03]

duration: 20min
completed: 2026-04-09
---

# Phase 108 Plan 03: Integration Tests + CSS Animation Polish

**24 integration tests for modal lifecycle and 504 flow; CSS optimized with GPU compositing hints and stronger visual polish.**

## Tasks Completed

1. `serverRestart.spec.js` (297 lines, 24 test cases) — modal appears on 504, auto-dismisses on recovery, retry/dismiss buttons, attempt counter, compatibility with other modal stacks
2. `ServerRestartModal.css` — added `will-change: transform, opacity`; tighter shadows; faster fade transitions (0.2s); responsive at 480px

## Commits

- `a22e798`: test(108-03): add comprehensive integration tests for restart notification  
- `e8f8fd9`: perf(108-03): optimize CSS with will-change hints, stronger shadows, faster transitions

## Self-Check: PASSED

- Test file: ✅ 297 lines, 24 test cases
- CSS animations: ✅ @keyframes fadeIn, @keyframes spin, will-change applied
- Build: ✅ clean
