---
phase: 108-add-server-restart-notification-modal-with-ux-polish
plan: 01
subsystem: ui
tags: [react, modal, fetch, retry, exponential-backoff, 504]

requires:
  - phase: 107-make-hostname-and-redirect-uri-configurable-via-admin-config-page
    provides: Stable app infrastructure for modal integration
provides:
  - bankingRestartNotificationService with 504 detection, exponential backoff, useRestartModal hook
  - ServerRestartModal component with fade-in animation, spinner, retry/dismiss buttons
  - ServerRestartModal.css with @keyframes fadeIn, @keyframes spin, z-index 9999
affects: [108-02, 108-03, App.js integration]

tech-stack:
  added: []
  patterns: [Global singleton state service with React hook subscriber, AbortController for fetch timeouts]

key-files:
  created:
    - banking_api_ui/src/services/bankingRestartNotificationService.js
    - banking_api_ui/src/components/ServerRestartModal.js
    - banking_api_ui/src/components/ServerRestartModal.css
  modified: []

key-decisions:
  - "Use global singleton state (not React Context) for restart service — simpler, no provider wrapping needed"
  - "Exponential backoff: 1s, 2s, 4s, max 30s with 30 attempt cap (~15 min total coverage)"
  - "z-index 9999 to stack above all existing modals (HITL at 1000, auth modals at 100)"

requirements-completed: [SERVER-RESTART-01]

duration: 25min
completed: 2026-04-09
---

# Phase 108 Plan 01: Server Restart Notification Service + Modal Component

**504-triggered modal with fade-in animation and exponential backoff retry using singleton service pattern and useRestartModal hook.**

## Tasks Completed

1. `bankingRestartNotificationService.js` (282 lines) — singleton state store, `handle504Error()`, `monitorApiHealth()`, `useRestartModal()` hook, `checkServerHealth()`, `manualRetry()`
2. `ServerRestartModal.js` (72 lines) — modal component wired to `useRestartModal()`, spinner, attempt counter, Retry Now + Dismiss buttons
3. `ServerRestartModal.css` (256 lines) — `@keyframes fadeIn` (0.3s), `@keyframes spin` (1s infinite), z-index 9999, responsive layout

## Commits

- `e14194f`: feat(108-01): add bankingRestartNotificationService with 504 detection and exponential backoff retry  
- `65982e2`: feat(108-01): add ServerRestartModal component with animations and UX polish

## Self-Check: PASSED

- Files exist: ✅ all three created
- Commits exist: ✅ e14194f, 65982e2
- Build: ✅ clean
