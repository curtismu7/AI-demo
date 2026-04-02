# Summary — Phase 30, Plan 03: AgentUiModeToggle + Accounts Regression Fix

**Commit:** b855eaa
**Status:** Complete
**Phase:** 30 — agent-layout-modes

---

## What Was Built

1. **AgentUiModeToggle**: Added Left Dock and Right Dock buttons, completing the 5-mode layout picker (Left | Middle | Right | Bottom | Float).
2. **UserDashboard**: Fixed accounts regression (todo #11) — authenticated user's 4 accounts no longer revert to 2-account DEMO_ACCOUNTS on layout switch.

### AgentUiModeToggle.js changes

- `handlePlacement` extended: `left-dock` and `right-dock` branch sets layout to `'classic'` and calls `applyAndReload`
- **Left** button added before Middle (order: Left | Middle | Right | Bottom | Float)
- **Right** button added after Middle
- `showFabCheckbox` includes `left-dock` and `right-dock`
- `aria-label` updated to mention left/right dock options

### AgentUiModeToggle.css changes

- Default `.agent-ui-mode-toggle__segmented` changed from `flex-wrap: nowrap` to `flex-wrap: wrap` — prevents overflow on narrow screens with 5 buttons

### UserDashboard.js fix (todo #11)

**Root cause:** `loadDemoFallback()` was called during page reload triggered by a layout switch. If the session check in `fetchUserData` returned no `sessionUser` briefly (e.g. Upstash cold start), `setAccounts(DEMO_ACCOUNTS)` overwrote real accounts.

**Fix:** Guard `setAccounts(DEMO_ACCOUNTS)` and `setTransactions(DEMO_TRANSACTIONS)` inside `loadDemoFallback` with `if (!user)`. When the component's `user` state is already set (either from `propUser` prop or a prior successful session check), demo data will never overwrite real data.

```js
// Before:
setAccounts(DEMO_ACCOUNTS);
setTransactions(DEMO_TRANSACTIONS);

// After:
if (!user) {
  setAccounts(DEMO_ACCOUNTS);
  setTransactions(DEMO_TRANSACTIONS);
}
```

---

## Build Result

`npm run build` → Compiled successfully (exit 0)

---

## Key Files

### key-files.created
- banking_api_ui/src/components/AgentUiModeToggle.js (modified)
- banking_api_ui/src/components/AgentUiModeToggle.css (modified)
- banking_api_ui/src/components/UserDashboard.js (modified)

---

## Self-Check: PASSED

- `grep -n "left-dock\|right-dock" AgentUiModeToggle.js` → 6+ matches
- `grep -n "setAccounts(DEMO_ACCOUNTS)" UserDashboard.js` → 1 guarded instance
- `npm run build` → exit 0
