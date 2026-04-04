---
plan: 37-01
phase: 37-public-facing-mcp-server-read-only-access-tiers
status: complete
completed: 2026-04-04
commit: e928f8d
---

## What Was Built

Added `readOnly: boolean` to the `BankingToolDefinition` interface and tagged all 9 tools. Threaded the field through the `tools/list` MCP response and updated both `/.well-known/mcp-server` manifest handlers to group tools into `publicAccess.readOnlyTools[]` and `restrictedAccess.authenticatedTools[]`.

## Key Files

### Created
_(none)_

### Modified
- `banking_mcp_server/src/tools/BankingToolRegistry.ts` — added `readOnly: boolean` to interface; tagged all 9 tools; added `getReadOnlyTools()` and `getAuthenticatedTools()` static helpers
- `banking_mcp_server/src/server/MCPMessageHandler.ts` — `tools/list` response now includes `readOnly` per tool
- `banking_mcp_server/src/server/BankingMCPServer.ts` — manifest now includes `publicAccess.readOnlyTools` and `restrictedAccess.authenticatedTools`
- `banking_mcp_server/src/server/HttpMCPTransport.ts` — identical manifest grouping added to secondary handler

## Tool read-only tags

| Tool | readOnly |
|------|----------|
| get_my_accounts | ✓ |
| get_account_balance | ✓ |
| get_my_transactions | ✓ |
| sequential_think | ✓ |
| get_sensitive_account_details | — (PII) |
| create_deposit | — |
| create_withdrawal | — |
| create_transfer | — |
| query_user_by_email | — (PII lookup) |

## Verification

- `npx tsc --noEmit` → 0 errors
- All 9 tools have `readOnly:` field
- Manifest includes `publicAccess.readOnlyTools: [4 tools]` and `restrictedAccess.authenticatedTools: [5 tools]`

## Self-Check: PASSED
