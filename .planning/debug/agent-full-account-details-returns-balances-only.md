---
status: awaiting_human_verify
trigger: "When the user asks the banking AI agent 'show me full account details', the agent only returns balances instead of full account details (account number, routing number, account type, holder info, etc.)."
created: 2026-04-04T00:00:00Z
updated: 2026-04-04T00:10:00Z
symptoms_prefilled: true
---

## Current Focus

hypothesis: CONFIRMED — `executeGetMyAccounts` in BankingToolProvider.ts manually maps only 5 fields (id, type, number, balance, status) but the `/api/accounts/my` API returns 13+ fields. All "full details" (name, currency, holderName, swiftCode, iban, branchName, branchCode, openedDate, createdAt) are silently stripped in the MCP layer.
test: Read API route response shape vs BankingToolProvider map — DONE
expecting: Fix by expanding the map in executeGetMyAccounts and updating the Account interface
next_action: Apply fix — update Account interface, expand executeGetMyAccounts map, improve tool description

## Symptoms

expected: Asking the agent "show me full account details" should return complete account information — account number, routing number, account type, balance, holder name, status, and any other fields the banking API exposes.
actual: The agent only returns balances. Other fields are either missing, stripped, or the wrong MCP tool is being called.
errors: No visible error — just incomplete data returned to the user.
reproduction: On Vercel production (https://banking-demo-puce.vercel.app) or locally: log in as a bank user, open the banking agent, type "show me full account details" or "show me all my account details".
started: Reported during Phase 09 UAT testing on April 4, 2026.

## Eliminated

(none yet)

## Evidence

- timestamp: 2026-04-04T00:01:00Z
  checked: banking_api_server/routes/accounts.js — GET /api/accounts/my response map
  found: Returns id, accountType, name, balance, currency, status, accountNumber (masked), swiftCode, iban, branchName, branchCode, openedDate, accountHolderName, createdAt (15 fields)
  implication: Full non-sensitive data is available from the API

- timestamp: 2026-04-04T00:02:00Z
  checked: banking_mcp_server/src/tools/BankingToolProvider.ts — executeGetMyAccounts handler
  found: Manually maps only 5 fields: id (as "id"), accountType (as "type"), accountNumber (as "number"), balance, status — strips ALL other fields including name, currency, holderName, swiftCode, iban, branchName, openedDate
  implication: THIS IS THE ROOT CAUSE — the MCP tool discards 10+ fields before the LLM sees them

- timestamp: 2026-04-04T00:03:00Z
  checked: banking_mcp_server/src/interfaces/banking.ts — Account interface
  found: Interface only defines 8 fields (id, userId, accountType, accountNumber, balance, status, createdAt, updatedAt) — missing name, currency, swiftCode, iban, branchName, branchCode, openedDate, accountHolderName
  implication: TypeScript interface also needs updating to match the API response shape

- timestamp: 2026-04-04T00:04:00Z
  checked: BankingToolRegistry.ts — get_my_accounts description
  found: Description is "Retrieve user's bank accounts" — too vague; the LLM may not know this is the right tool for full account info vs get_account_balance
  implication: Secondary improvement — clarify description so agent picks right tool for "full details" queries

## Resolution

root_cause: executeGetMyAccounts in BankingToolProvider.ts manually mapped only 5 fields (id, type, number, balance, status) from the API response, dropping all other fields (name, currency, accountHolderName, swiftCode, iban, branchName, branchCode, openedDate, createdAt). The Account TypeScript interface was also under-specified (8 fields instead of 15+).
fix: 3-part fix — (1) Expanded Account interface in banking.ts to include all non-sensitive fields the API returns. (2) Updated executeGetMyAccounts response map to include all 15 fields. (3) Updated get_my_accounts tool description so the LLM correctly selects this tool for "full account details" queries.
verification: MCP server TypeScript built with exit code 0. Pending human UAT verification.
files_changed:
  - banking_mcp_server/src/interfaces/banking.ts
  - banking_mcp_server/src/tools/BankingToolProvider.ts
  - banking_mcp_server/src/tools/BankingToolRegistry.ts
