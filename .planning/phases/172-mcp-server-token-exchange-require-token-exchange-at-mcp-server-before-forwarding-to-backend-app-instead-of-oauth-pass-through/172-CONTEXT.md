# Phase 172 — MCP Server Token Exchange

## Vision

Replace the current OAuth pass-through pattern in the MCP server's tool execution pipeline with proper RFC 8693 token exchange. Currently, `BankingToolProvider` passes the user's raw access token directly to `BankingAPIClient`, which forwards it as `Authorization: Bearer` to the banking API. This phase wires the existing (but unused) `TokenExchangeService` into the tool execution path so every banking API call uses a delegation token with `act` claims instead of the original user token.

## Decisions

- **D-01 — Lazy + cache exchange trigger**: Perform token exchange on first tool call (not at session init). Cache the exchanged token with TTL aligned to token expiry. Re-exchange automatically on expiry. This avoids unnecessary exchanges for sessions that never invoke tools, while keeping latency low for subsequent calls.

- **D-02 — Backend validates `act` required**: The banking API server must validate that agent-originated requests carry an `act` claim in the access token. Requests from the MCP server path without a proper delegation token (missing `act`) must be rejected. This enforces that the token exchange actually happened.

- **D-03 — Narrowed scopes per tool (least-privilege)**: Each MCP tool requests only the scopes it needs during token exchange, not the full set the user granted. For example, `get_accounts` requests only `banking:read`, while `create_deposit` requests `banking:write`. The tool-to-scope mapping lives in the MCP server.

- **D-04 — Hard fail on exchange error**: If token exchange fails (PingOne unavailable, invalid grant, scope denied), the tool call fails with a clear error message. No fallback to pass-through. No banking API call is made without a properly exchanged token. This is the most secure option and prevents any accidental bypass of the delegation model.

## Deferred Ideas

_None identified._

## Claude's Discretion

- Cache implementation details (in-memory Map vs. LRU, eviction strategy)
- Exact error message format returned to MCP clients on exchange failure
- Structured logging format for token exchange audit trail
- Whether to extract scope mapping as a config object or inline in BankingToolProvider

## Key Files

| File | Role |
|------|------|
| `banking_mcp_server/src/tools/BankingToolProvider.ts` | Tool execution — currently passes raw token (line 234) |
| `banking_mcp_server/src/banking/BankingAPIClient.ts` | HTTP client — sends `Bearer ${userToken}` directly |
| `banking_mcp_server/src/auth/TokenExchangeService.ts` | RFC 8693 exchange — exists but unwired from tool path |
| `banking_mcp_server/src/interfaces/tokenExchange.ts` | Full RFC 8693 types already defined |
| `banking_mcp_server/src/server/BankingMCPServer.ts` | Connection handler + handleTokenExchange endpoint |

## Current Flow (to be replaced)

```
User login → CIBA/OAuth → session.userTokens
  → BankingToolProvider.getUserTokenForScopes()
    → token = userToken.accessToken  ← pass-through
      → BankingAPIClient.makeAuthenticatedRequest(Bearer ${userToken})
        → banking API server
```

## Target Flow

```
User login → CIBA/OAuth → session.userTokens (has may_act claim)
  → BankingToolProvider executes tool
    → Check cache for exchanged token (per tool scope set)
      → Cache miss: TokenExchangeService.exchangeToken(userToken, toolScopes)
        → PingOne /as/token (grant_type=urn:ietf:params:oauth:grant-type:token-exchange)
        → Returns delegation token with act:{sub: agent_client_id}
      → Cache hit: use cached token (if not expired)
    → Exchange failure? → Hard fail, return error to MCP client
    → BankingAPIClient.makeAuthenticatedRequest(Bearer ${exchangedToken})
      → banking API server validates act claim present
```

## Dependencies

- Phase 171 (completed): foundational MCP server work this builds on
- PingOne environment must have token exchange enabled for the agent app
- User access tokens must include `may_act` claim (already confirmed in live tokens)
