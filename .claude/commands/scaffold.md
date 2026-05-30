---
description: Scaffold a new file in this monorepo following the conventions of the target package
allowed-tools: Read, Write, Bash(ls), Glob
argument-hint: [type] [name] [--tests]
---

# Scaffold

Arguments: $ARGUMENTS

Parse as: `[type] [name] [--tests]`

- `type`: one of `react-component`, `bff-route`, `bff-service`, `mcp-tool`, `hitl-flow`
- `name`: identifier for the new file/module
- `--tests`: if present, generate a regression + integration test pair (CLAUDE.md "Two-tier test pattern")

**Before generating any files**, read 2–3 existing files of the same type to match conventions exactly:

| Type | Read for conventions | Module system |
|---|---|---|
| `react-component` | `banking_api_ui/src/components/BankingAgent.js` + a smaller sibling | ES modules + JSX in `.js` |
| `bff-route` | `banking_api_server/routes/transactions.js` + `routes/oauthUser.js` | CommonJS |
| `bff-service` | `banking_api_server/services/configStore.js` + `services/transactionConsentChallenge.js` | CommonJS |
| `mcp-tool` | `banking_mcp_server/src/tools/BankingToolRegistry.ts` + `BankingToolProvider.ts` | TypeScript strict |
| `hitl-flow` | `banking_api_server/services/transactionConsentChallenge.js` + `routes/transactions.js:HITL block` | CommonJS |

Match: naming, import style, export pattern, folder structure, comment density.
**Do not invent patterns that don't exist in the codebase.** No emojis in UI text (REGRESSION_PLAN §0).

When `--tests` is passed:
- BFF/service: create both `*.regression.test.js` (mocked `configStore`) and `*.integration.test.js` (real `.env`) per CLAUDE.md "Test patterns" section.
- Component: create `*.test.js` under `banking_api_ui/src/components/__tests__/` matching the existing React Testing Library style.
- MCP tool: add a unit test under `banking_mcp_server/src/__tests__/` (Jest, ts-jest).

After scaffolding, run the smallest verification:
- React: `cd banking_api_ui && npm run build`
- BFF: `npx jest <new-test-file>` from `banking_api_server/`
- MCP: `cd banking_mcp_server && npm run build` then `npm test`
