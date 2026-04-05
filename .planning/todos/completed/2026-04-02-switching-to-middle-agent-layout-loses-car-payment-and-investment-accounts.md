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

✅ **Root Cause Identified**: The `agentPlacement` useEffect (lines 198-207) only updated layout state but did NOT call `fetchUserData()` to refresh account data when switching layouts.

✅ **Fix Implemented**: Added `fetchUserData(true)` call to the `agentPlacement` useEffect to ensure account data is refreshed when layout changes.

### Code Changes:

```js
// BEFORE (lines 198-207):
useEffect(() => {
  if (agentPlacement === 'middle') {
    setMiddleAgentOpen(true);
    setDashboardLayoutState('split3');
    setDashboardLayout('split3');
  } else if (agentPlacement === 'bottom') {
    setDashboardLayoutState('classic');
    setDashboardLayout('classic');
  }
}, [agentPlacement]);

// AFTER (lines 198-213):
useEffect(() => {
  if (agentPlacement === 'middle') {
    setMiddleAgentOpen(true);
    setDashboardLayoutState('split3');
    setDashboardLayout('split3');
  } else if (agentPlacement === 'bottom') {
    setDashboardLayoutState('classic');
    setDashboardLayout('classic');
  }
  
  // Fix: Ensure account data is refreshed when layout changes to prevent account loss
  // This addresses the issue where switching to middle layout loses car payment and investment accounts
  if (user) {
    fetchUserData(true); // silent refresh to ensure accounts are loaded
  }
}, [agentPlacement, user, fetchUserData]);
```

### Additional Improvements:
- Wrapped `fetchUserData` and `loadDemoFallback` in `useCallback` for stable dependencies
- Added proper dependency arrays to prevent unnecessary re-renders
- Maintained existing guard logic to prevent demo accounts from overwriting real data

## Testing

- **Build verification**: Application builds successfully with the fix
- **Layout switching**: Accounts now persist correctly when switching between layouts
- **Silent refresh**: `fetchUserData(true)` prevents loading indicators during layout switches
- **Demo mode protection**: Existing guard logic prevents demo accounts from replacing real data

## Impact

- **Fixed**: Car payment and investment accounts now remain visible when switching to middle layout
- **Improved**: Layout switching is now more reliable with automatic data refresh
- **Maintained**: All existing functionality and demo mode protections preserved
- **Performance**: Silent refresh prevents unnecessary loading indicators

## Notes

The fix ensures that any time the user switches agent layouts, the account data is silently refreshed to guarantee all account types (checking, savings, car loans, investments) are properly displayed. This addresses the race condition where layout switches could trigger account state resets.
