# 29-03 SUMMARY — MCP Tool Registration

## What was done
Registered the `get_sensitive_account_details` MCP tool end-to-end.

## Files modified
- `banking_mcp_server/src/tools/BankingToolRegistry.ts` — Added tool definition with `requiredScopes: ['banking:sensitive:read']` and `handler: 'executeGetSensitiveAccountDetails'`
- `banking_mcp_server/src/tools/BankingToolProvider.ts` — Added `case 'executeGetSensitiveAccountDetails':` switch case and `private async executeGetSensitiveAccountDetails()` handler that calls `apiClient.getSensitiveAccountDetails()` and propagates `consent_required: true` as a structured result
- `banking_mcp_server/src/banking/BankingAPIClient.ts` — Added `async getSensitiveAccountDetails(userToken)` method calling `GET /api/accounts/sensitive-details`
- `banking_api_ui/src/config/agentMcpScopes.js` — Added `{ scope: 'banking:sensitive:read', group: 'sensitive', ... }` entry
- `banking_api_server/services/mcpLocalTools.js` — Added `get_sensitive_account_details` function + registered in `TOOL_MAP` for local dispatch

## Key decisions
- Handler propagates `consent_required: true` as a success result (not error) so BankingAgent.js can detect it and show the consent banner
- Local tool fallback always returns `{ ok: false, consent_required: true }` — no session access in local mode

## Verification
- `npx tsc --noEmit` → exit 0 (TypeScript compiles clean)
- `node -e "require('./services/mcpLocalTools').callToolLocal('get_sensitive_account_details', {}, 'u1')"` → PASS: returns `{ ok: false, consent_required: true }`
