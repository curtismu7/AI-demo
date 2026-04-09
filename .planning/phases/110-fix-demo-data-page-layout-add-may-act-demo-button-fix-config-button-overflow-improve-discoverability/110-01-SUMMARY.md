---
phase: 110
plan: "01"
subsystem: banking_api_ui
tags: [ux, demo-data, may_act, toolbar]
dependency_graph:
  requires: []
  provides: [may_act-quick-action, config-button-fix]
  affects: [DemoDataPage.js, DemoDataPage.css]
tech_stack:
  added: []
  patterns: [existing state reuse, BEM CSS]
key_files:
  modified:
    - banking_api_ui/src/components/DemoDataPage.js
    - banking_api_ui/src/components/DemoDataPage.css
decisions:
  - may_act quick-action reuses existing mayActEnabled/handleSetMayAct state — no duplication
  - Config button label shortened to "⚙ Config" with title tooltip preserved
metrics:
  duration: "~20 min"
  completed_date: "2026-04-09"
  tasks_completed: 3
  files_modified: 2
---

# Phase 110 Plan 01: may_act Quick-Action + Config Button Overflow Fix Summary

**One-liner:** Adds a compact `may_act` status+action strip below the hero and shortens the toolbar "PingOne config" label to "⚙ Config" to prevent overflow.

## What Was Built

**Task 1 — may_act quick-action card:**
- `.demo-data-mayact-quick` strip renders directly below the hero section (above Storage)
- Status pill: `✅ present in token` / `❌ absent from token` / `…` (loading) — driven by existing `mayActEnabled` state
- Enable button → `handleSetMayAct(true)`, disabled when `mayActEnabled === true || mayActSaving`
- Clear button → `handleSetMayAct(false)`, disabled when `mayActEnabled === false || mayActSaving`
- "Full controls ↓" link → `scrollIntoView({ behavior: 'smooth' })` to `#demo-mayact-heading`
- Full may_act section at line ~1472 unchanged

**Task 2 — Config button overflow:**
- `<Link to="/config">` label changed from `"PingOne config"` → `"⚙ Config"`
- `title="PingOne environment and OAuth client settings"` preserved for tooltip

**Task 3 — Build:** `npm run build` → exit 0

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| T1+T2 | `9e062c6` | feat(110-01): add may_act quick-action card + fix Config toolbar overflow |

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- [x] `grep "demo-data-mayact-quick" banking_api_ui/src/components/DemoDataPage.js` → 4 matches
- [x] `grep "demo-mayact-heading" banking_api_ui/src/components/DemoDataPage.js` → 3 matches
- [x] `grep "⚙ Config" banking_api_ui/src/components/DemoDataPage.js` → match
- [x] Commit `9e062c6` exists
- [x] `npm run build` → exit 0
