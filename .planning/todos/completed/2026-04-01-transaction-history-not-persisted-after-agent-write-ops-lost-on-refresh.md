---
created: 2026-04-01T00:00:00Z
title: Transaction history not persisted after agent write ops — lost until manual refresh
area: ui
files:
  - banking_api_ui/src/components/UserDashboard.js
  - banking_api_ui/src/components/BankingAgent.js
  - banking_api_ui/src/services/bankingAgentService.js
---

## Problem

After the agent completes a write operation (transfer, deposit, withdrawal), the Recent
Transactions list on the dashboard does not update inline. The transaction is missing from
the history panel until the user manually refreshes the page.

Observed during UAT Phase 08:
- Agent transfer completed successfully (balance tiles updated after fix)
- Recent Transactions panel showed stale data (missing the just-completed transfer)
- Only after a full page reload did the new transaction appear

This means:
1. The fetchUserData(true) balance refresh triggered by the banking-agent-result event
   may not be including the transaction list refresh, OR
2. The transactions state is being updated separately and the agent write path is
   not triggering a re-fetch of transaction history.

## Impact

- Breaks the "zero reload" UX promise — user cannot confirm their transaction was recorded
- Creates confusion: did the transfer actually go through?
- Cannot rely on transaction panel to verify completed operations

## Solution

Investigate and fix the transaction history refresh path:

1. Trace fetchUserData() — confirm it fetches both /api/accounts/my AND
   /api/transactions/my and updates both accounts + transactions state.
2. Check the banking-agent-result event handler in UserDashboard — ensure
   fetchUserData(true) is called and awaited correctly when type === 'confirm'.
3. Verify BankingAgent.js transaction fetch after write (getMyTransactions call at ~line
   1568) — this updates the agent's result panel but does NOT update UserDashboard state.
4. Consider dispatching a dedicated 'banking-transactions-updated' event from BankingAgent
   after the post-write getMyTransactions call so UserDashboard can merge new transactions.
5. Ensure fix covers all write paths: agent tools, consent modal (HITL), and direct form.
6. Add regression check: after any agent write, transactions panel shows new entry within
   1 second without page reload.
