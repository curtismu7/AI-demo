---
phase: 193-allow-unauthenticated-dashboard-access
plan: 02
status: complete
---

## Summary

Gated all write-action buttons behind lazy login triggers for unauthenticated dashboard visitors.

## Changes

- **UserDashboard.js**: 
  - Quick action buttons (Move money, Add funds, Ask assistant) now check `user` and redirect to login if unauthenticated
  - Manage Delegates renders as `<button>` with login trigger when `!user`, `<Link>` when authenticated
  - Account card buttons (Select for Transfer, Deposit, Withdraw) redirect to login when `!user`
  - Removed `disabled={!user}` and `title` attributes from Deposit/Withdraw (login redirect replaces disabled state)

## Key Files

- `banking_api_ui/src/components/UserDashboard.js`

## Verification

- `npm run build` exit 0
- All action buttons trigger login for unauthenticated users (no disabled buttons)
- Authenticated dashboard behavior unchanged
