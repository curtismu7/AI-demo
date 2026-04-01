# Phase 02-01 Summary: Exchange Mode Session Toggle

**Commit:** `d0e4f90`
**Status:** Complete

## What was built

### BFF — `banking_api_server/routes/mcpExchangeMode.js` (new)
- `GET /api/mcp/exchange-mode` → `{ mode: 'single'|'double' }` — reads `req.session.mcpExchangeMode`, falls back to configStore flag
- `POST /api/mcp/exchange-mode { mode }` → saves to `req.session.mcpExchangeMode`
- Auth-gated: requires `req.session.user`

### BFF — `banking_api_server/server.js`
- Registered mcpExchangeMode router under `/api/mcp`

### BFF — `banking_api_server/services/agentMcpTokenService.js`
- `resolveMcpAccessTokenWithEvents()` now checks `req.session.mcpExchangeMode` FIRST
- Falls back to `configStore.getEffective('ff_two_exchange_delegation')` when no session override

### UI — `banking_api_ui/src/components/ExchangeModeToggle.js` (new)
- Pill toggle component: "1-Exchange" | "2-Exchange"
- Fetches mode from BFF on mount, POSTs change on click
- Shows description + RFC reference below pills

### UI — `banking_api_ui/src/components/ExchangeModeToggle.css` (new)
- CSS for `.emt-root`, `.emt-pills`, `.emt-pill`, `.emt-pill--active`, etc.

### UI — `banking_api_ui/src/components/UserDashboard.js`
- `<ExchangeModeToggle />` inserted before BOTH `<TokenChainDisplay />` occurrences

## Verification
- `npm run build` → `Compiled successfully`
- BFF tests: 49 passed, 847 tests pass
