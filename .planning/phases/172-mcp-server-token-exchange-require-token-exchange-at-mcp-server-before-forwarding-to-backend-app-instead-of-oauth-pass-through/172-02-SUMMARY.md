---
phase: 172-mcp-server-token-exchange
plan: 02
status: complete
---

# Plan 172-02 Summary: Wire Token Exchange into BankingToolProvider

## What Was Done

### Task 1: Replace pass-through with lazy token exchange
- Modified `banking_mcp_server/src/tools/BankingToolProvider.ts`
- Replaced `token = userToken.accessToken` (line 239) with exchange logic:
  1. Get tool-specific scopes via `getScopesForTool(toolName)` (D-03)
  2. Check `tokenCache.get(sessionId, scopes)` first (D-01)
  3. On cache miss: build `TokenExchangeRequest`, call `exchangeToken()` 
  4. Cache result with TTL from `expires_in`
  5. Hard fail with thrown Error on exchange failure (D-04)
- Backward compat: falls back to direct `userToken.accessToken` when `tokenExchangeService` is not configured

### Task 2: Token flow verification
- Verified exchanged token flows unchanged through to `BankingAPIClient`
- Delegation token with `act` claim passes through Authorization header untouched

### Task 3: Logging
- Cache hit/miss logged with tool name and scopes
- Exchange success logged with expires_in
- Exchange failure logged before throwing

## Artifacts Modified
- `banking_mcp_server/src/tools/BankingToolProvider.ts` (+50 lines, -3 lines)

## Decisions Made
- Used `session.sessionId` as cache key userId (no JWT decode needed at MCP layer)
- Kept `agentToken` path unchanged (BFF-exchanged token still preferred when present)
- Token exchange service is optional — backward compatible with `ff_skip_token_exchange`
