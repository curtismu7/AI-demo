---
phase: 109
plan: "01"
subsystem: banking_api_ui
tags: [bug-fix, agent-ui, placement, demo-data]
dependency_graph:
  requires: []
  provides: [stable-placement-button-UX]
  affects: [AgentUiModeToggle.js]
tech_stack:
  added: []
  patterns: [localStorage direct write, no React state update before reload]
key_files:
  modified:
    - banking_api_ui/src/components/AgentUiModeToggle.js
decisions:
  - For reload paths, write localStorage directly instead of calling setAgentUi()
  - Keep setAgentUi() only for reload:false (middle split-view) path
metrics:
  duration: "~15 min"
  completed_date: "2026-04-09"
  tasks_completed: 1
  files_modified: 1
---

# Phase 109 Plan 01: Fix Agent FAB Visual Jump on Placement Buttons Summary

**One-liner:** Prevent agent FAB/dock from visually jumping when placement buttons are clicked by writing localStorage directly instead of updating React context before the reload.

## What Was Built

Single targeted fix in `AgentUiModeToggle.js`, `applyAndReload()` function:

**Before (caused jump):**
```js
setAgentUi(next);  // Immediately updated React context → FAB jumps
const saved = await persistBankingAgentUi(next);
// ... 350ms later: window.location.reload()
```

**After (no jump):**
```js
if (opts.reload) {
  // Write to localStorage only — reload re-inits context cleanly, no visual jump
  try { localStorage.setItem('banking_agent_ui_v2', JSON.stringify(next)); } catch (_) {}
} else {
  setAgentUi(next);  // middle/split-view: intentional live update, no reload
}
const saved = await persistBankingAgentUi(next);
```

**Why it works:** `AgentUiModeContext.readState()` reads from `banking_agent_ui_v2` on mount. The page reload (350ms later) triggers a fresh mount, reads the new placement from localStorage, and renders it correctly — zero intermediate visual state.

**Middle placement preserved:** `handlePlacement('middle')` calls `applyAndReload(next, { reload: false })` — the `opts.reload` guard keeps `setAgentUi()` for this path so the split-view layout updates immediately as intended.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| Fix | `6595727` | Remove setAgentUi from reload paths in applyAndReload |
| CHANGELOG | `2fa5973` | Fix CHANGELOG entry for Phase 109 |

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- [x] `banking_api_ui/src/components/AgentUiModeToggle.js` modified
- [x] Commits `6595727` and `2fa5973` exist
- [x] `npm run build` → exit 0
- [x] `opts.reload` guard correctly splits behavior
