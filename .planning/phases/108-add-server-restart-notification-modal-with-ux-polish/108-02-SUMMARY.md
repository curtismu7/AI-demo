---
phase: 108-add-server-restart-notification-modal-with-ux-pollution
plan: 02
subsystem: ui
tags: [react, app-integration, error-handling, fetch, 504]

requires:
  - phase: 108-01
    provides: bankingRestartNotificationService, ServerRestartModal component
provides:
  - ServerRestartModal globally mounted in App.js
  - monitorApiHealth() initialized on app mount
  - bankingAgentService.js updated with 504 and timeout detection
affects: [108-03, all API call paths]

tech-stack:
  added: []
  patterns: [Global modal mount at App root, 504 instrumentation in service layer]

key-files:
  created: []
  modified:
    - banking_api_ui/src/App.js
    - banking_api_ui/src/services/bankingAgentService.js

key-decisions:
  - "Mount ServerRestartModal before DemoTourModal in App.js render tree — ensures restart notification takes priority"
  - "bankingAgentService 504 detection is instrumentation only — service layer handles modal display"
  - "monitorApiHealth() called in useEffect with empty deps — runs once on app mount, lifetime of app"

requirements-completed: [SERVER-RESTART-02]

duration: 20min
completed: 2026-04-09
---

# Phase 108 Plan 02: Global Integration — App.js Mount + API Error Wiring

**ServerRestartModal mounted globally in App.js, monitorApiHealth initialized on mount, bankingAgentService wired with 504/timeout detection.**

## Tasks Completed

1. `App.js` — imported `ServerRestartModal` + `monitorApiHealth`; mounted `<ServerRestartModal />` before `<DemoTourModal />`; `monitorApiHealth()` called in `useEffect([], [])` on mount
2. `bankingAgentService.js` — added `if (response.status === 504)` checks at all major fetch sites; timeout detection in catch blocks via `statusCode: 504` annotations

## Commits

- `a963826`: feat(108-02): mount ServerRestartModal globally and initialize monitoring in App.js  
- `d5496ac`: feat(108-02): add 504 and timeout error detection to bankingAgentService  
- `4af25f3`: feat(108-02): add verification documentation and fix lint warning

## Self-Check: PASSED

- ServerRestartModal in App.js: ✅ line 576
- monitorApiHealth called: ✅ line 196 in useEffect
- 504 detection in bankingAgentService: ✅ confirmed at lines 155–159
- Build: ✅ clean
