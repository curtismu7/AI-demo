---
plan: 141-01
phase: 141-local-setup-wizard-guided-pingone-configuration-app-resource
status: complete
completed: 2026-04-13
---

## What Was Built

Extended `pingoneProvisionService.js` `provisionEnvironment()` with 3 new pipeline steps inserted between `worker-grants` and `config`:

1. **`schema-attr`** — Creates `bankingPrincipalUserId` STRING attribute on PingOne User schema (non-required, non-unique)
2. **`mcp-exchanger-app`** — Creates `Super Banking MCP Exchanger` WORKER app with `client_credentials` + `token_exchange` grants
3. **`spel-claim`** — Enables token customization on the user app and adds `bankingPrincipalUserId` EXPRESSION claim mapping `${user.bankingPrincipalUserId}`

Also updated:
- `generateEnvContent()` — includes `PINGONE_MCP_EXCHANGER_CLIENT_ID` in .env output
- `generateVercelEnvVars()` — includes `PINGONE_MCP_EXCHANGER_CLIENT_ID` in Vercel vars

Both new steps are wrapped in try/catch so they degrade gracefully (attribute already exists, schema not found, etc.) without failing the overall provision run.

## Key Files

- `banking_api_server/services/pingoneProvisionService.js` — extended with 3 steps + env generators updated

## Commit

d82f1d4 — feat(141-01): extend provisionEnvironment with mcp-exchanger, schema-attr, spel-claim steps

## Self-Check: PASSED

- `grep -c "mcp-exchanger-app\|schema-attr\|spel-claim"` → 17
- `grep -c "PINGONE_MCP_EXCHANGER_CLIENT_ID"` → 3 (pipeline, generateEnvContent, generateVercelEnvVars)
- `provisioned.mcpExchangerApp` assigned after createApplication()
