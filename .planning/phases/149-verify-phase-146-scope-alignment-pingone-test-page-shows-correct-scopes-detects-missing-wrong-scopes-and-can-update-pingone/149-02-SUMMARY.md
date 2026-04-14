---
phase: 149
plan: 02
subsystem: banking_api_ui
tags: [scope-fix-panel, pingone-test-page, css, ui]
dependency_graph:
  requires: [149-01]
  provides: [scope-fix-panel-ui, fix-banking-resource-server-handler]
  affects: [PingOneTestPage.jsx, PingOneTestPage.css]
tech_stack:
  added: []
  patterns: [useCallback, useState, apiClient.post]
key_files:
  modified:
    - banking_api_ui/src/components/PingOneTestPage.jsx
    - banking_api_ui/src/components/PingOneTestPage.css
decisions:
  - Renamed fixingScopes state to scopeFixing to match plan convention
  - Updated CSS from light yellow theme to dark red-accent theme matching page's dark design
  - Handler now passes `sessionId: 'pingone-test'` param + uses notifySuccess/notifyError
metrics:
  duration: ~8min
  completed: 2026-04-14
  tasks: 2
  files: 2
---

# Phase 149 Plan 02: Scope Fix Panel UI + CSS Summary

**One-liner:** Scope-fix-panel conditionally renders below AssetTable with isBankingRS and missingCanonicalScopes conditions, fix-btn calls POST fix-banking-resource-server and auto-reruns verifyAssets on success.

## What Was Built

- **scope-fix-panel** renders when `missingCanonicalScopes.length > 0 OR scopes.isBankingRS === false`
- **Conditional messages:** "Banking resource server not found" when `isBankingRS === false`; individual `asset-badge` spans per missing scope
- **Button text:** "Fix: Create Banking Resource Server" vs "Fix: Add Missing Scopes" based on `isBankingRS`
- **Handler** `fixBankingResourceServer` posts to `/api/pingone-test/fix-banking-resource-server` with `sessionId` param, calls `verifyAssets()` on success with `notifySuccess`
- **CSS** updated from light yellow to dark red-accent theme; added `__header`, `__icon`, `fix-btn` classes

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add scope-fix-panel to PingOneTestPage.jsx | 368baaf | PingOneTestPage.jsx |
| 2 | Add CSS to PingOneTestPage.css | 368baaf | PingOneTestPage.css |

## Verification

- `npm run build` → exit 0 ✓
- scope-fix-panel condition covers both `missingCanonicalScopes` and `isBankingRS === false`
- Fix handler re-runs `verifyAssets()` on success

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] fixingScopes renamed to scopeFixing; handler updated**
- **Found during:** Task 1
- **Issue:** Existing state used `fixingScopes`; plan JSX referenced `scopeFixing`
- **Fix:** Renamed state and updated handler to use `setScopeFixing` and `notifySuccess/notifyError` pattern
- **Files modified:** PingOneTestPage.jsx
- **Commit:** 368baaf

**2. [Rule 1 - Bug] CSS updated from light theme to dark theme**
- **Found during:** Task 2
- **Issue:** Existing CSS used light yellow (`#fef9c3`) inconsistent with dark page design and plan spec
- **Fix:** Replaced with dark red-accent rgba colors; renamed `__heading` to `__header`; added `__icon` and `fix-btn` classes
- **Files modified:** PingOneTestPage.css
- **Commit:** 368baaf

## Self-Check: PASSED

- `banking_api_ui/src/components/PingOneTestPage.jsx` — FOUND
- `banking_api_ui/src/components/PingOneTestPage.css` — FOUND
- commit `368baaf` — FOUND
