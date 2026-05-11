---
phase: 266
plan: 01
subsystem: banking_mcp_gateway, banking_api_server
tags: [mcp-gateway, credential-swap, oauth, rfc8693, id-token, bff-internal]
dependency_graph:
  requires: []
  provides:
    - credentialSwap.selectCredentialForBackend(target, subjectToken, idToken, config) -> OutboundCredential
    - router.routeTool() extended with apikey/dualtoken/bankingdata targets
    - router.backendHttpUrl() for HTTP route lookup
    - GET /internal/id-token (BFF-internal, shared-secret-gated)
  affects:
    - banking_mcp_gateway/src/index.ts (tools/call dispatch)
    - banking_api_server/server.js (sessionStore registration + /internal mount)
tech_stack:
  added:
    - axios (already in gateway deps, now used in index.ts for HTTP dispatch)
  patterns:
    - RFC 8693 token exchange audience-binding per RFC 8707 + RFC 9068
    - draft-ietf-oauth-identity-chaining act claim audit trail
    - BFF internal server-to-server endpoint (shared secret gate)
    - TDD: RED test → GREEN implementation → build verification
key_files:
  created:
    - banking_mcp_gateway/src/credentialSwap.ts
    - banking_mcp_gateway/tests/credentialSwap.test.ts
    - banking_api_server/routes/agentIdToken.js
    - banking_api_server/src/__tests__/agentIdToken.regression.test.js
    - banking_api_server/src/__tests__/agentIdToken.integration.test.js
  modified:
    - banking_mcp_gateway/src/router.ts
    - banking_mcp_gateway/src/config.ts
    - banking_mcp_gateway/src/index.ts
    - banking_mcp_gateway/tests/gateway-auth.test.ts
    - banking_mcp_gateway/tests/gateway-server.test.ts
    - banking_api_server/server.js
    - banking_api_server/routes/oauthUser.js
decisions:
  - "api_key disposition is Gateway-only — no backend call; SPA gets masked last4 only"
  - "dual_token performs RFC 8693 exchange before forwarding; inbound bearer aud mismatch would fail at backend"
  - "id_token travels in JSON-RPC body params (NOT Authorization header) per JSON-RPC 2.0 + MCP POST semantics"
  - "sessionStore registered via app.set() guarded by if (sessionStore) so memory-fallback installs return 503 gracefully"
  - "OLB tools (get_my_accounts, etc.) keep routing to 'olb' via WebSocket — unchanged (W1 guard tests 7-10)"
  - "New Phase 266 demo tools (demo_show_accounts, demo_show_transactions) route to 'bankingdata' → HTTP"
  - "Test files placed in banking_mcp_gateway/tests/ (matches actual testMatch pattern, not __tests__)"
metrics:
  duration: ~40 minutes
  completed: 2026-05-10
  tasks: 3
  files: 12
---

# Phase 266 Plan 01: credential-swap module + 3-disposition gateway + BFF /internal/id-token

Three credential dispositions wired through the MCP Gateway with RFC 8693 audience-bound token exchange, plus a BFF-internal server-to-server id_token retrieval endpoint.

## What Was Built

### Task 1: credentialSwap module + extended router + config schema

`banking_mcp_gateway/src/credentialSwap.ts` provides `selectCredentialForBackend(target, subjectToken, idToken, config)` returning an `OutboundCredential` with `kind: 'oauth_bearer' | 'api_key' | 'dual_token'` and `credentialPath` field.

`banking_mcp_gateway/src/router.ts` extended:
- `BackendTarget` union: `'olb' | 'invest' | 'apikey' | 'dualtoken' | 'bankingdata'`
- `backendWsUrl()` and `backendResourceUri()` return `''` for new Phase 266 targets (H4 guard)
- New `backendHttpUrl(target, toolName, config)` maps to `/api/resource-server/identity`, `/accounts`, or `/transactions`
- New `BANKING_DATA_ROUTE_FOR_TOOL` map for demo tool names

`banking_mcp_gateway/src/config.ts` extended with 5 new fields: `demoApiKeyServiceKey`, `bffInternalIdTokenUrl`, `bffInternalSecret`, `bankingResourceServerBaseUrl`, `bankingResourceServerResourceUri`.

10 unit tests pass including W1 regression guard asserting all existing OLB tool names still route to `'olb'`.

### Task 2: Wire dispatch into index.ts + tools/list

`banking_mcp_gateway/src/index.ts`:
- Added `fetchIdTokenFromBff()` helper (server-to-server GET to BFF `/internal/id-token`)
- `tools/call` branch: 3-disposition dispatch before existing olb/invest WebSocket path
  - `apikey` path: Gateway-only marker with 2 synthesized tokenEvents
  - `dualtoken` path: HTTP POST to `/api/resource-server/identity` with JSON-RPC body; 6 synthesized tokenEvents including `specRef` fields per RFC 8693, RFC 8707, OIDC Core
  - `bankingdata` path: HTTP GET to `/api/resource-server/accounts` or `/transactions`
  - `olb`/`invest` path: existing WebSocket proxy unchanged
- `tools/list` handler: appends `special_offers` (api_key) and `user_profile_card` (dual_token) descriptors (Strategy 1)

### Task 3: BFF /internal/id-token + sessionStore registration

`banking_api_server/routes/agentIdToken.js`: GET `/internal/id-token` route with:
- `x-internal-gateway-secret` header validation against `process.env.BFF_INTERNAL_SECRET`
- Reads sessionStore via `req.app.get('sessionStore')` — 503 if not registered
- Matches session by `oauthTokens.subjectSub` (or `.sub` fallback)
- Returns 412 when idToken absent, 404 when no session matches

`banking_api_server/server.js`:
- `app.set('sessionStore', sessionStore)` after SQLite init block (guarded)
- `app.use('/internal', require('./routes/agentIdToken'))` — NOT under `/api/*`

`banking_api_server/routes/oauthUser.js`: Added `oauthTokens.subjectSub = idTokenClaims.sub || null` for sub-keyed session lookup.

9 tests: 7 regression + 2 integration.

## H4 McpTokenExchangeClient Audit

`McpTokenExchangeClient.ts` at line 45 calls `routeTool(toolName)` then `backendResourceUri(backend, this.config)`. After the Phase 266 extension, if `routeTool` returns `'apikey'`, `'dualtoken'`, or `'bankingdata'`, then `backendResourceUri` returns `''`. However, `McpTokenExchangeClient` is invoked by `buildAuthorizeMcpRequest` middleware (HTTP MCP path), not by the WebSocket `handleMessage` path. The Phase 266 3-disposition dispatch in `handleMessage` calls `selectCredentialForBackend` directly — it does NOT call `McpTokenExchangeClient`. The existing WebSocket `handleMessage` for olb/invest tools calls `exchangeTokenForBackend` from `tokenExchange.ts` directly (not via `McpTokenExchangeClient`). Conclusion: **State (a) — `McpTokenExchangeClient` is only invoked for tools via the HTTP MCP middleware path (authorizeMcpRequest), which currently only reaches olb/invest tools. The Phase 266 tools (special_offers, user_profile_card, demo_show_*) arrive via the WebSocket path and are dispatched by the new 3-disposition block before any WebSocket exchange occurs.**

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed GatewayConfig stubs in existing tests**
- **Found during:** Task 1 post-build full test run
- **Issue:** `gateway-auth.test.ts` and `gateway-server.test.ts` used `GatewayConfig` stub objects that were missing the 5 new Phase 266 interface fields, producing TS2739 type errors that failed the test suites.
- **Fix:** Added `demoApiKeyServiceKey`, `bffInternalIdTokenUrl`, `bffInternalSecret`, `bankingResourceServerBaseUrl`, `bankingResourceServerResourceUri` with dev-default values to both stubs.
- **Files modified:** `banking_mcp_gateway/tests/gateway-auth.test.ts`, `banking_mcp_gateway/tests/gateway-server.test.ts`
- **Commit:** 14c2fa60

**2. [Rule 3 - Convention] Test files placed in `tests/` not `__tests__/`**
- **Found during:** Task 1 test setup
- **Issue:** Plan spec referenced `banking_mcp_gateway/src/__tests__/` but the actual project uses `banking_mcp_gateway/tests/` (verified by `testMatch: **/tests/**/*.test.ts` in package.json and two existing test files there).
- **Fix:** Created `credentialSwap.test.ts` in `banking_mcp_gateway/tests/` to match the actual test infrastructure.
- **Files modified:** Path change only — no code change.

## Known Stubs

None. All three dispositions wire through to real routes (or real Gateway-terminating logic for api_key). The `fetchIdTokenFromBff` function will return `null` for a 503/404/412 from BFF and the dual_token path then surfaces `id_token_missing` cleanly — this is correct graceful behavior, not a stub.

## Threat Flags

No new threat surface beyond what the plan's threat model already covers (T-266-01-01 through T-RS-IDENTITY-INTEGRITY). The `/internal/id-token` endpoint inherits T-266-01-02 mitigations: not under `/api/*`, requires shared secret, 503 for unregistered store.

## Self-Check: PASSED

- All 12 key files: FOUND
- Commits 6583558b, 4ccbb12b, 2f2e51b7, 14c2fa60: FOUND
- `cd banking_mcp_gateway && npm run build`: exit 0
- `cd banking_mcp_gateway && npm test`: 47 tests pass (10 credentialSwap + 27 gateway-auth + 10 gateway-server)
- agentIdToken regression: 7 tests pass
- agentIdToken integration: 2 tests pass
