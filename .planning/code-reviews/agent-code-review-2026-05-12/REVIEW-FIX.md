# Agent Code Review — Fix Pass 2026-05-12

## Summary
- Fixed: 10 of 10 BLOCK findings
- Skipped: 0
- Commits (newest first, all local — not pushed):
  - `a2c9d5d9` docs: REGRESSION_PLAN §4 rolled-up entry
  - `a28ec20a` fix(gateway): BL-02 WS introspection + D-05 anti-bypass
  - `f480701d` fix(gateway): BL-01 /admin/config auth + prod devBypass refusal
  - `e5678b07` fix(bff): BL-04 TLS verification on gateway /health probe
  - `fedf0aac` fix(agent-service): BL-01 WS close handler + handshake timeout
  - `07323730` fix(langchain): BL-04 connection-bound session_id on auth_response
  - `232175b2` fix(langchain): BL-03 validate_state in handle_authorization_callback
  - `d93873b7` fix(langchain): BL-02 SensitiveDataFilter attached + JWT regex
  - `3537295d` fix(langchain): BL-01 mask raw bearer tokens at all log sites
  - `3a691964` fix(agent-service): BL-02 full SHA-256 token cache key
  - `7a0bc485` fix(gateway): BL-03 refuse default BFF_INTERNAL_SECRET in prod

HIGH/MED/LOW were out of scope for this pass per the user's directive.

## Per-finding

### BL-03 (Gateway) — production-shipped default `BFF_INTERNAL_SECRET`
**Status:** Fixed
**Commit:** `7a0bc485`
**Files:** `banking_mcp_gateway/src/config.ts`, `banking_mcp_gateway/src/index.ts`, `banking_api_server/routes/agentIdToken.js`
**Verify:** `cd banking_mcp_gateway && npx tsc --noEmit` clean; `node -c banking_api_server/routes/agentIdToken.js` exit 0.
**Notes:** Symmetric fail-hard on both processes. Gateway calls `assertProductionSecrets(config)` immediately after `loadConfig`, before binding any port. BFF exits at module load of `agentIdToken.js`. If the default literal is ever rotated, change it in BOTH files.

### BL-02 (agent-service) — token cache key truncated to 64 bits
**Status:** Fixed
**Commit:** `3a691964`
**Files:** `banking_agent_service/src/tokenResolver.ts`
**Verify:** `cd banking_agent_service && npx tsc --noEmit` clean.
**Notes:** One-line fix per the review's suggestion. No tests asserted the truncated form, so no test updates needed.

### BL-01 (LangChain) — raw bearer tokens debug-logged
**Status:** Fixed
**Commit:** `3537295d`
**Files:** `langchain_agent/src/models/auth.py`, `langchain_agent/src/mcp/tool_registry.py`, `langchain_agent/src/mcp/connection.py`, `langchain_agent/src/agent/mcp_tool_provider.py`
**Verify:** `python3 -c "import ast; [ast.parse(open(f).read()) for f in [...]]"` exit 0.
**Notes:** Added `__repr__`, `__str__`, and `masked_fingerprint()` to `AccessToken`. The fingerprint helper is the recommended form for log correlation (`sha256:<first 12 hex>`). In `connection.py:176-180` the `userAuthCode` field was actually the leakage path — `agentToken` had already been moved to the WebSocket `Authorization` header. The fix redacts a copy of the JSON-RPC envelope before logging it.

### BL-02 (LangChain) — `SensitiveDataFilter` never attached to root logger
**Status:** Fixed
**Commit:** `d93873b7`
**Files:** `langchain_agent/src/log_utils/structured_logger.py`, `langchain_agent/src/log_utils/secure_logger.py`
**Verify:** Manual sanitization test:
```python
from log_utils.secure_logger import SensitiveDataFilter
SensitiveDataFilter()._sanitize_message('session token is eyJhbG...SflKxwRJ here')
# -> 'session token is [REDACTED_JWT] here'
```
**Notes:** Filter attached to BOTH handlers — that's the reliable hook, because logger-level filters don't propagate to inherited handlers. JWT regex is anchored on the `eyJ` header prefix (every real JWT starts with that — base64 of `{"`) and length-bounded to limit backtracking. A generic three-segment regex would match many UUIDs, IPs, and version strings.

### BL-03 (LangChain) — `handle_authorization_callback` skipped state validation
**Status:** Fixed
**Commit:** `232175b2`
**Files:** `langchain_agent/src/authentication/oauth_manager.py`, `langchain_agent/src/authentication/interfaces.py`
**Verify:** `cd langchain_agent && python3 -m pytest tests/test_oauth_manager.py -k "authorization_callback or validate_state or UserAuthorizationFacilitator"` -> **8 passed, 23 deselected**.
**Notes:** Signature is now `handle_authorization_callback(auth_code, state, session_id=None)` — backward-compatible. The ABC in `interfaces.py` was updated to match. When `session_id` is provided, `validate_state(state, session_id)` runs BEFORE the existing existence/expiry checks; on mismatch the function raises `ValueError("Invalid, expired, or session-mismatched state parameter")`.

### BL-04 (LangChain) — `process_auth_response` trusted user-supplied `session_id`
**Status:** Fixed
**Commit:** `07323730`
**Files:** `langchain_agent/src/api/websocket_handler.py`, `langchain_agent/tests/test_websocket_handler.py`
**Verify:** `cd langchain_agent && python3 -m pytest tests/test_websocket_handler.py -k auth_response` -> **3 passed, 21 deselected**.
**Notes:** The actual trust boundary was the WebSocket handler, not `message_processor.process_auth_response` — the latter already cross-checked `session_id` against `_pending_auth_requests[state]`. Fix moved one level up: `_handle_auth_response` reads the connection-bound session from `_connection_metadata`, returns `error_code=session_id_mismatch` if the body carries a different value, and `error_code=invalid_session` if the connection has no bound session (i.e. session_init never ran). Added two regression tests for the tampering and unbound-connection paths; updated the existing happy-path test to seed `_connection_metadata` first.

### BL-01 (agent-service) — post-`open` WebSocket errors swallowed
**Status:** Fixed
**Commit:** `fedf0aac`
**Files:** `banking_agent_service/src/mcpGatewayClient.ts`
**Verify:** `cd banking_agent_service && npx tsc --noEmit` clean.
**Notes:** All four parts of the fix landed:
- `ws.on('close', ...)` walks `pending` and rejects each with `GatewayConnectionClosed`.
- `_request` checks `readyState === WebSocket.OPEN` before `ws.send`.
- `connect()` has a 10s handshake timeout (`CONNECT_TIMEOUT_MS`).
- `settled` guard prevents double resolve/reject of the connect promise.

The pending map's value shape changed from a bare callback to `{resolve, reject, timer}` so `_failAllPending` can cancel timers in one pass. No call sites needed to update — the public surface (`connect`, `listTools`, `callTool`, `close`) is unchanged.

### BL-04 (Gateway) — `rejectUnauthorized: false` on BFF→gateway health probe
**Status:** Fixed
**Commit:** `e5678b07`
**Files:** `banking_api_server/services/agentMcpTokenService.js`
**Verify:** `node -c banking_api_server/services/agentMcpTokenService.js` exit 0.
**Notes:** Dev escape hatch requires BOTH `GATEWAY_HEALTH_PROBE_INSECURE === 'true'` AND `NODE_ENV !== 'production'`. Production hard-ignores the flag. One-time WARN log via `_warnedInsecureProbe` flag so the operator can't miss that they're running insecure.

### BL-01 (Gateway) — unauthenticated `/admin/config` flipped `devBypass`
**Status:** Fixed
**Commit:** `f480701d`
**Files:** `banking_mcp_gateway/src/index.ts`
**Verify:** `cd banking_mcp_gateway && npx tsc --noEmit` clean; `npm test` -> **47 passed, 3 suites**.
**Notes:** Both `GET` and `POST /admin/config` now require `x-internal-gateway-secret`. The check uses `crypto.timingSafeEqual` on equal-length Buffers — the presented header is padded/truncated to the expected length so mismatched-length compares still take constant time. `POST` mutations carrying `devBypass: true` are 403'd when `NODE_ENV === 'production'`. No in-tree callers of the route, so the gate is purely additive.

### BL-02 (Gateway) — WS transport bypassed introspection + D-05 anti-bypass invariant
**Status:** Fixed
**Commit:** `a28ec20a`
**Files:** `banking_mcp_gateway/src/auth/authorizeMcpRequestCore.ts` (new), `banking_mcp_gateway/src/middleware/authorizeMcpRequest.ts`, `banking_mcp_gateway/src/index.ts`
**Verify:** `cd banking_mcp_gateway && npm test` -> **47 passed, 3 suites**; `npm run build` clean.
**Notes:** Extracted introspection + `GatewayTokenPolicy.validate` into `runMcpAuthorizationPipeline` (transport-agnostic, returns a tagged union). HTTP middleware delegates steps 0+1 to the core and renders failures as `writeHead + WWW-Authenticate + JSON body`. WS handler's new `runWsAuthorizationPipeline` helper renders the same decision as a JSON-RPC error envelope and is invoked from both `tools/list` and `tools/call`.

PingOne Authorize policy eval and the RFC 8693 re-exchange were NOT moved into the core, per the user's instruction that the refactor needs care: WS already runs them (via `guardToolCall` / `exchangeTokenForBackend`); HTTP runs them inline (via `PingOneAuthorizeClient` + `McpTokenExchangeClient`); merging them further would require unifying the HTTP-forward and WS-proxyJsonRpc downstream-call shapes. The D-05 invariant (the critical part of the finding) does now run on the WS path because it lives inside `GatewayTokenPolicy.validate`, which is invoked from the shared core.

## New findings discovered during fix pass

None — the BLOCK list was complete and accurate. Two minor observations worth a future pass:

1. **`banking_mcp_gateway/src/index.ts` WS branch — `validateInboundToken` runs twice.** The HTTP middleware's `GatewayServer.handleHttp` already calls `validateInboundToken` before the middleware fires; the BL-02 refactor only changed the steps after that. On WS, the same token now goes through `validateInboundToken` (line 222) AND the introspection + policy core inside `runWsAuthorizationPipeline`. The duplication is harmless (introspection ≠ JWT verify) but `jwt.decode` is called twice for the same token per request. Not a bug, but worth folding when revisiting the WS path.

2. **`banking_agent_service/src/mcpGatewayClient.ts` — no reconnect on close.** The BL-01 fix fails pending requests cleanly on `close`, but doesn't reconnect. Callers must construct a new `McpGatewayClient` on `GatewayConnectionClosed`. That's defensible (the gateway might have rotated tokens), but worth documenting in the JSDoc if not already.

## Recommended next pass

- **HIGH findings** (25 total across the four reports) are the natural next pass. They're not as severe as BLOCK but include the audit-trail completeness gaps, the per-tool rate-limit absence, and the LangChain agent's lack of per-session token storage. The triage in `INDEX.md` already orders them by blast radius.
- **Test-quality audit** of the LangChain tests. While running BL-04's regression tests I noticed at least one pre-existing test in `test_oauth_manager.py::TestTokenManager::test_get_valid_token_uses_cached_token` failing on `ClientConnectionError` (network-mock miss). That failure exists at HEAD — not introduced by this pass — but it's a signal that the LangChain test suite has rot. Worth a separate test-confidence pass before relying on it as a regression gate.
- **`banking_mcp_server` and `banking_mcp_invest`** themselves were explicitly out of scope of this review (per INDEX.md "Out of scope"). Now that the gateway↔server boundary is harder, an audit downstream of the gateway is the next logical surface.
