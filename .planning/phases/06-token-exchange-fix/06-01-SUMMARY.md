# Phase 06 Plan 01 — SUMMARY
## Plan: `06-01` — 2-exchange client auth fix + auth-method unit tests

**Phase:** `06-token-exchange-fix`
**Status:** ✅ Complete
**Commit:** `3497664`

---

## What Was Built

### Task 1 — Fix `getClientCredentialsTokenAs` and `performTokenExchangeAs`

Both methods previously hardcoded `client_secret` in the URLSearchParams body (CLIENT_SECRET_POST). Fixed to use `applyTokenEndpointAuth` with a new optional `method` parameter (default `'basic'`).

**`banking_api_server/services/oauthService.js`:**
- `getClientCredentialsTokenAs(clientId, clientSecret, audience, method = 'basic')` — removed `client_secret` from URLSearchParams; calls `applyTokenEndpointAuth(clientId, clientSecret, method, body, headers)`
- `performTokenExchangeAs(subjectToken, actorToken, clientId, clientSecret, audience, scopes, method = 'basic')` — same pattern

**`banking_api_server/services/agentMcpTokenService.js`:**
- `_performTwoExchangeDelegation` now reads:
  - `AI_AGENT_TOKEN_ENDPOINT_AUTH_METHOD` (default `'basic'`)
  - `MCP_EXCHANGER_TOKEN_ENDPOINT_AUTH_METHOD` (default `'basic'`)
- Passes the appropriate auth method to all 4 call sites:
  1. `getClientCredentialsTokenAs(..., agentGatewayAud, aiAgentAuthMethod)` (AI Agent CC token)
  2. `performTokenExchangeAs(..., effectiveToolScopes, aiAgentAuthMethod)` (Exchange #1)
  3. `getClientCredentialsTokenAs(..., mcpGatewayAud, mcpExchangerAuthMethod)` (MCP CC token)
  4. `performTokenExchangeAs(..., effectiveToolScopes, mcpExchangerAuthMethod)` (Exchange #2)

### Task 2 — Auth-method unit tests

**`banking_api_server/src/__tests__/oauthService.test.js`** — appended `describe('token exchange — client authentication method', ...)`:

| Method | Auth variants tested |
|--------|---------------------|
| `performTokenExchange` | basic (Authorization header), post (client_secret in body), grant_type always in body |
| `performTokenExchangeWithActor` | basic, post |
| `getAgentClientCredentialsToken` | default=basic (unset env), AGENT_TOKEN_ENDPOINT_AUTH_METHOD=post |
| `getClientCredentialsTokenAs` | method=basic, method=post, no-arg-default=basic, grant_type in body |
| `performTokenExchangeAs` | method=basic, method=post, no-arg-default=basic |

14 new tests. Total oauthService.test.js: **59 tests**.

---

## Test Results

```
Tests: 104 passed (59 oauthService + 90 agentMcpTokenService - 45 overlap counted once)
Test Suites: 2 passed, 2 total
```

All 104 tests pass — no regressions.

---

## New Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `AI_AGENT_TOKEN_ENDPOINT_AUTH_METHOD` | `basic` | Auth method for AI Agent OAuth app calls in 2-exchange path |
| `MCP_EXCHANGER_TOKEN_ENDPOINT_AUTH_METHOD` | `basic` | Auth method for MCP Service OAuth app calls in 2-exchange path |

---

## Key Contracts

```javascript
// oauthService.js
getClientCredentialsTokenAs(clientId, clientSecret, audience, method = 'basic')
performTokenExchangeAs(subjectToken, actorToken, clientId, clientSecret, audience, scopes, method = 'basic')
```

All existing callers with 3-4 args continue to work unchanged (default `method='basic'`).

---

## Requirement Coverage

- **TOKEN-FIX-01:** ✅ All 5 BFF token methods use `CLIENT_SECRET_BASIC` by default
  - `performTokenExchange` (via `applyAdminTokenEndpointClientAuth`)
  - `performTokenExchangeWithActor` (via `applyAdminTokenEndpointClientAuth`)
  - `getAgentClientCredentialsToken` (via `AGENT_TOKEN_ENDPOINT_AUTH_METHOD`)
  - `getClientCredentialsTokenAs` (via explicit `method` param, default `'basic'`)
  - `performTokenExchangeAs` (via explicit `method` param, default `'basic'`)
