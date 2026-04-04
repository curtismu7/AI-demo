---
created: 2026-04-04T12:40:50.037Z
title: Make account names display friendly instead of raw IDs in agent responses
area: ui
files:
  - banking_api_ui/src/components/BankingAgent.js:294
  - banking_api_server/data/persistent/accounts.json
  - banking_mcp_server/src/tools/BankingToolProvider.ts:289-290
---

## Problem

When the agent lists accounts (via `get_my_accounts`), it displays raw account identifiers
instead of friendly names:

```
Account: chk-6689a77446
Account: sav-6689a77446  
Account: e32768b0-df9a-49f8-9e23-43c0e7a88dac   ← raw UUID
```

The third account is a PingOne-provisioned account whose ID is a full UUID. None of these
are human-readable.

## Root Cause

`BankingAgent.js` line 294 formats accounts as:
```js
`${a.account_type || a.type || 'Account'}: ${a.account_number || a.id}`
```

This uses the raw `account_number` or `id` as the display name. A `name` field IS passed
through from `BankingToolProvider.ts` (`account.name || null`) but is ignored here.

The demo accounts in `accounts.json` also don't have a `name` field — they only have
`accountType` ("checking", "savings") and a numeric `id`.

## Solution

**1. Add friendly `name` to demo account data** (`banking_api_server/data/persistent/accounts.json`
and `banking_api_server/data/bootstrapData.json`):
```json
{ "id": "1", "accountType": "checking", "name": "Everyday Checking", ... }
{ "id": "2", "accountType": "savings",  "name": "High-Yield Savings",  ... }
```

**2. Update `BankingAgent.js` line 294** to use the friendly name:
```js
const label = a.name || (a.account_type || a.type)
  ? `${a.name || capitalize(a.account_type || a.type)} (${a.account_number || a.id?.slice(0,8)}...)`
  : a.account_number || a.id;
```

**3. For the MCP tool response** — `BankingToolProvider.ts` already passes `name`. The LLM
uses this to generate the response, so if `name` is populated in the data it will naturally
use it. No code change needed there.

**4. Account selector dropdowns** in the agent transfer modal (BankingAgent.js ~line 343)
should also show friendly names instead of raw IDs.

Expected output after fix:
```
Account: Everyday Checking (chk-6689...)
  Balance: $3,300.00

Account: High-Yield Savings (sav-6689...)
  Balance: $1,700.00
```
