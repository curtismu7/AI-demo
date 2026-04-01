---
phase: "08"
plan: "01"
subsystem: "banking-ui"
tags: ["bug-fix", "balance", "transactions", "dashboard"]
requires: []
provides: ["balance-refresh-after-agent-write"]
affects: ["UserDashboard.js"]
tech-stack:
  added: []
  patterns: ["custom-event-bus", "silent-data-refresh"]
key-files:
  created: []
  modified:
    - banking_api_ui/src/components/UserDashboard.js
decisions:
  - "Listen for 'banking-agent-result' rather than adding a prop/callback chain — keeps BankingAgent and UserDashboard decoupled"
  - "Only refresh on type='confirm' (write actions); skip 'accounts'/'transactions'/'balance' (read-only, no state change)"
  - "DEBT_TYPES=['car_loan','mortgage','credit'] confirmed correct — investment and money_market are assets and correctly included"
metrics:
  duration_minutes: 2
  completed: "2026-04-01T16:47:01Z"
  tasks_completed: 5
  files_modified: 1
---

# Phase 08 Plan 01: Fix balance refresh after agent transactions

Dashboard balances now update within 1 second after any agent write action (deposit/withdraw/transfer) without a page reload.

## What Changed

**`UserDashboard.js`** — added a `useEffect` with a `banking-agent-result` event listener. When the event fires with `detail.type === 'confirm'`, calls `fetchUserData(true)` for a silent (no-spinner) account refresh.

```js
useEffect(() => {
  const onAgentResult = (e) => {
    if (e?.detail?.type === 'confirm') fetchUserData(true);
  };
  window.addEventListener('banking-agent-result', onAgentResult);
  return () => window.removeEventListener('banking-agent-result', onAgentResult);
}, []);
```

## Root Cause Confirmed

`BankingAgent.js` already dispatched `banking-agent-result` with `type='confirm'` for deposit/withdraw/transfer on every success (line 1585). `UserDashboard.js` had no listener for this event — balances only refreshed every 30 seconds via the existing polling interval.

## Task Audit Results

| Task | Status | Notes |
|------|--------|-------|
| Task 1: Add listener | ✅ Done | 15 lines, UserDashboard.js |
| Task 2: Verify BankingAgent event dispatch | ✅ Confirmed | No change needed — already correct |
| Task 3: All 6 action buttons | ✅ Verified | All paths return correct types for `inferAgentResultTypeAndData` |
| Task 4: DEBT_TYPES verification | ✅ Confirmed | `car_loan`, `mortgage`, `credit` are all liability types. `investment` + `money_market` correctly included as assets |
| Task 5: Build | ✅ Pass | `npm run build` → exit 0 |

## Action Button Coverage

| Action | Result Type | Balance Refresh? |
|--------|-------------|-----------------|
| My Accounts | `accounts` | No (read-only) |
| Recent Transactions | `transactions` | No (read-only) |
| Check Balance | `balance` | No (read-only) |
| Deposit | `confirm` | ✅ Yes |
| Withdraw | `confirm` | ✅ Yes |
| Transfer | `confirm` | ✅ Yes |

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- [x] `UserDashboard.js` modified — listener added
- [x] `062fd23` commit exists
- [x] Build passes
