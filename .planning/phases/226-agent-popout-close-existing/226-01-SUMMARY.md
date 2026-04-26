---
phase: 226-agent-popout-close-existing
plan: 01
status: complete
completed: 2026-04-24
---

# Plan 226-01 Summary

## What was built
- `banking_api_ui/src/components/BankingAgent.js` — `onPopout` prop added to destructure; `onPopout?.()` called immediately after `window.open()` in pop-out button onClick
- `banking_api_ui/src/components/UserDashboard.js` — `onPopout` wired at both inline render sites: right-dock (`setRightAgentOpen(false)`) and middle (`setMiddleAgentOpen(false)`)
- `REGRESSION_PLAN.md` — §4 entry added for Phase 226

## Verification
- `npm run build` exits 0
- `grep -c "onPopout" BankingAgent.js` → 2 (destructure + call site)
- `grep -c "onPopout" UserDashboard.js` → 2 (one per placement)
- `middleAgentOpen` useState initializer unchanged
