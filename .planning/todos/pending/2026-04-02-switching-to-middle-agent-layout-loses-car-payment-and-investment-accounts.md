---
created: 2026-04-02T00:52:22.153Z
title: Switching to middle agent layout loses car payment and investment accounts
area: ui
files:
  - banking_api_ui/src/components/UserDashboard.js:31-55
  - banking_api_ui/src/components/UserDashboard.js:155-165
  - banking_api_ui/src/components/UserDashboard.js:281-320
---

## Problem

When switching from the floating agent layout ("float") to the middle agent layout ("middle" / `split3`),
some accounts disappear from the dashboard. Specifically, the car payment and investment accounts are no
longer shown — only the checking and savings accounts remain visible.

**Observed:** Float mode → all accounts visible (checking, savings, car loan, investment).  
**After switch:** Middle / split3 mode → only checking and savings visible.

### Likely causes to investigate

1. **DEMO_ACCOUNTS fallback triggered:** `DEMO_ACCOUNTS` at line 33 only contains checking + savings.
   If switching layout causes a state reset that flips `isDemoMode` to true, or if `setAccounts(DEMO_ACCOUNTS)`
   is called (line 272), non-demo accounts would be wiped.

2. **`fetchUserData` not re-called after layout switch:** The `useEffect` at lines 155–165 calls
   `setDashboardLayoutState('split3')` and `setDashboardLayout('split3')` when `agentPlacement === 'middle'`,
   but does NOT call `fetchUserData()`. If the accounts state was reset for any reason, it won't be
   repopulated until the next refresh cycle.

3. **`useAgentUiMode` + `agentPlacement` change triggers component re-mount:** If the parent that hosts
   `UserDashboard` conditionally re-renders when `agentPlacement` changes, state (including `accounts`)
   would reset to `[]` or `DEMO_ACCOUNTS`.

4. **API response contains all account types but split3 CSS clips the grid:** Less likely since the accounts
   grid is inside `renderBankingMain()` which is shared across layouts. Check whether the `accounts-grid`
   CSS limits visible items in `split3` column width.

### Key files

- `UserDashboard.js` line 31: `DEBT_TYPES` set includes `car_loan` — confirms car loans are supported type
- `UserDashboard.js` line 33: `DEMO_ACCOUNTS` — only checking + savings; used as fallback in demo mode
- `UserDashboard.js` line 272: `setAccounts(DEMO_ACCOUNTS)` — called in demo/unauthenticated path
- `UserDashboard.js` line 318: `setAccounts(acctRes.data.accounts || [])` — real data path
- `UserDashboard.js` line 155–165: `agentPlacement` effect that triggers layout switch

## Solution

1. Add `console.log` or breakpoint on `setAccounts` calls (lines 272, 318, 568) to see which path fires on layout switch.
2. Confirm `isDemoMode` is `false` after layout switch — if it flips true, trace why.
3. If it's a missing `fetchUserData()` call: add it to the `agentPlacement` useEffect (line 165) after setting layout.
4. If it's a CSS column-width issue: inspect the `accounts-grid` in split3 mode — ensure `overflow: visible` and no `max-height` clipping.
5. Ensure `UserDashboard` is NOT re-mounted when switching layouts — check the parent component conditionals.
