# Phase 22-01 Summary — Agent Chip Audit + Account/Transaction Field Verification

**Date:** 2026-04-02  
**Commit:** bd866c6  
**Status:** ✅ Complete

---

## What Was Done

### Task 1: agentToolSteps.js — new chips for query_user and web_search

Added two new cases to `banking_api_ui/src/utils/agentToolSteps.js`:
- `case 'query_user':` → `[{name: 'query_user_by_email'}]`
- `case 'web_search':` → `[{name: 'brave_search'}]`
- Updated `case 'mcp_tools':` with explanatory comment

The switch now covers 9 cases: accounts, transactions, balance, deposit, withdraw, transfer, query_user, web_search, mcp_tools. All 7 tools in BankingToolRegistry now have a corresponding chip entry.

### Task 2: Transactions route — add accountId convenience field

`banking_api_server/routes/transactions.js` `GET /my` mapping now includes:
```js
accountId: transaction.fromAccountId || transaction.toAccountId || null,
```

This gives clients a single `accountId` field for account association without changing the existing `fromAccountId`/`toAccountId` fields.

**Accounts audit result:** No changes needed — `GET /api/accounts/my` already returns `id`, `accountType`, `name`, `balance`, `currency: 'USD'` on every account.

---

## Files Changed

| File | Change |
|------|--------|
| `banking_api_ui/src/utils/agentToolSteps.js` | +3 cases (query_user, web_search, mcp_tools comment) |
| `banking_api_server/routes/transactions.js` | +1 derived `accountId` field in /my response |

---

## Verification

- `grep -n "query_user\|web_search\|brave_search" banking_api_ui/src/utils/agentToolSteps.js` → lines 26-29 ✅
- `node -e "require('./banking_api_server/routes/transactions.js')"` → no syntax errors ✅  
- `cd banking_api_ui && npm run build` → exit 0 ✅

---

## Must-Haves Status

- [x] `agentToolSteps.js` returns a chip for every tool in BankingToolRegistry
- [x] `query_user_by_email` tool has a chip (action type `query_user`)
- [x] `web_search` action has a chip (pre-wired for plan-02)
- [x] Accounts route returns `id`, `accountType`, `name`, `balance`, `currency`
- [x] Transactions route returns `id`, `type`, `amount`, `description`, `status`, `createdAt`, `accountId`
