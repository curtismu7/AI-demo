---
phase: 145
plan: 01
status: complete
completed: 2026-04-17
---

# Summary — 145-01: MCP tools/list Contract Audit + Server Test Alignment

## What Was Built

- Updated `handleListTools()` in `banking_mcp_server/src/server/MCPMessageHandler.ts` to include richer tool metadata in `tools/list` responses:
  - `title`
  - `icons`
  - `annotations`
  - existing compatibility fields (`requiresUserAuth`, `requiredScopes`, `readOnly`) preserved
- Added a regression assertion in `banking_mcp_server/tests/server/MCPMessageHandler.test.ts` that fails if `title/icons/annotations/readOnly` are dropped from the response contract.
- Replaced and refreshed `banking_mcp_server/tests/tools/BankingToolRegistry.test.ts` with current tool inventory and metadata-shape assertions.
- Created `docs/mcp/MCP_TOOL_METADATA_AUDIT.md` documenting the metadata contract and verification expectations.

## Verification

- `cd banking_mcp_server && npm run test -- tests/server/MCPMessageHandler.test.ts --runInBand` -> pass (33 tests)
- `cd banking_mcp_server && npm run test -- tests/tools/BankingToolRegistry.test.ts --runInBand` -> pass (14 tests)

## Notes

- Fixed pre-existing test fixture typing drift in `MCPMessageHandler.test.ts` by adding required `readOnly` fields to mocked `BankingToolDefinition` objects.
- Removed accidental temporary artifact `banking_mcp_server/src/server/MCPMessageHandler.ts.newfrag`.

## Self-Check: PASSED
