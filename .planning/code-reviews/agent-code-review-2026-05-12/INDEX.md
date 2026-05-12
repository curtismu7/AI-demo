# Agent Code Review — 2026-05-12

Cross-subsystem audit of the four agent surfaces in Super Banking. Four
independent reviewer agents read source files in parallel and produced one
report per subsystem; this INDEX ranks the findings in one triage view.

## Reports

| Subsystem | Report | Files | BLOCK | HIGH | MED | LOW |
|---|---|---:|---:|---:|---:|---:|
| MCP Gateway + BFF Token Plumbing | [mcp-gateway-and-token-plumbing-REVIEW.md](mcp-gateway-and-token-plumbing-REVIEW.md) | 18 | **4** | 9 | 3 | 2 |
| LangChain Agent (Python) | [langchain-agent-REVIEW.md](langchain-agent-REVIEW.md) | ~40 | **4** | 8 | 10 | 5 |
| banking_agent_service (TS) | [banking-agent-service-REVIEW.md](banking-agent-service-REVIEW.md) | 7 | **2** | 5 | 6 | 5 |
| BankingAgent UI (React) | [BankingAgent-UI-REVIEW.md](BankingAgent-UI-REVIEW.md) | 1 | 0 | 3 | 6 | 7 |
| **Total** | | **66** | **10** | **25** | **25** | **19** |

## Top 10 BLOCK findings (must-fix before shipping)

Ranked by blast radius. Cite uses each report's own ID scheme.

### 1. Gateway BL-01 — Unauthenticated `/admin/config` flips `devBypass: true`
**File:** [banking_mcp_gateway/src/index.ts:110-150](../../banking_mcp_gateway/src/index.ts#L110-L150)
Anyone reachable on `:3005` can flip `devBypass: true` and redirect upstream
WebSocket URLs. Gateway binds `0.0.0.0`. Combined with BL-04, this is a full
auth-bypass primitive. **Fix:** require the same timing-safe internal-secret
header as `agentIdToken.js`, and refuse `devBypass` mutations in
`NODE_ENV=production`.

### 2. Gateway BL-02 — WebSocket transport bypasses introspection + D-05 anti-bypass invariant
**File:** [banking_mcp_gateway/src/index.ts:204-275](../../banking_mcp_gateway/src/index.ts#L204-L275) vs [authorizeMcpRequest.ts](../../banking_mcp_gateway/src/middleware/authorizeMcpRequest.ts)
HTTP `POST /mcp` runs the full policy pipeline; the `wss` listener on the
same server runs a lean pipeline that skips `GatewayTokenPolicy.validate`. A
token carrying `mcpOlbResourceUri` in `aud` (rejected on HTTP per D-05) is
accepted on WS. Concrete privilege-escalation vector. **Fix:** extract the
policy steps into a transport-agnostic function and call it from both
handlers. Eliminates HI-02 exposure and HITL asymmetry as a side effect.

### 3. Gateway BL-03 — Production-shipped default `BFF_INTERNAL_SECRET = 'dev-shared-secret-change-me'`
**Files:** [banking_mcp_gateway/src/config.ts:109](../../banking_mcp_gateway/src/config.ts#L109), [banking_api_server/routes/agentIdToken.js:25](../../banking_api_server/routes/agentIdToken.js#L25)
No startup assertion that the secret is overridden. With the default,
`/internal/id-token` returns any user's raw `id_token` to anyone who knows
the URL. **Fix:** fail-hard at startup when `NODE_ENV=production` and the
secret matches the default literal.

### 4. Gateway BL-04 — `rejectUnauthorized: false` on the BFF→gateway health probe that selects audience
**File:** [banking_api_server/services/agentMcpTokenService.js:1519](../../banking_api_server/services/agentMcpTokenService.js#L1519)
This is the request that decides which audience the BFF mints tokens for.
A TLS MITM can flip the BFF's perception of `devBypass` and downgrade the
deployment to direct-to-MCP audience minting. **Fix:** honor TLS
verification; gate `rejectUnauthorized: false` behind explicit dev-only env
var, never default-on.

### 5. LangChain BL-01 — Raw bearer tokens debug-logged via plain loggers
**Files:** [langchain_agent/src/mcp/tool_registry.py:219-220](../../langchain_agent/src/mcp/tool_registry.py#L219-L220), [src/mcp/connection.py:176-180](../../langchain_agent/src/mcp/connection.py#L176-L180), [src/agent/mcp_tool_provider.py:277](../../langchain_agent/src/agent/mcp_tool_provider.py#L277)
`AccessToken.__repr__` not overridden, so `logger.debug("token: %s", token)`
emits the full JWT. **Fix:** override `__repr__` on `AccessToken` to mask;
audit all `logger.debug` of token-carrying objects.

### 6. LangChain BL-02 — `SensitiveDataFilter` is never attached to root logger handlers
**File:** [langchain_agent/src/log_utils/structured_logger.py:setup_logging()](../../langchain_agent/src/log_utils/structured_logger.py)
The masking infrastructure is dead code in production — module-level
`logging.getLogger(__name__)` inherits no filter. Pairs with BL-01: the
intent-vs-reality gap means every "we mask tokens" claim is aspirational.
**Fix:** attach `SensitiveDataFilter` to the root handler in
`setup_logging()` and add a JWT-shape regex to the filter.

### 7. LangChain BL-03 — `handle_authorization_callback` doesn't validate `session_id` against state
**File:** [langchain_agent/src/authentication/oauth_manager.py:530](../../langchain_agent/src/authentication/oauth_manager.py#L530)
`validate_state()` exists but isn't called from the callback handler.
CSRF/replay window on the OAuth callback. **Fix:** call `validate_state()`
in the callback before exchanging the code, reject on mismatch.

### 8. LangChain BL-04 — `process_auth_response` trusts user-supplied `session_id` from WebSocket message
**File:** [langchain_agent/src/api/message_processor.py:127](../../langchain_agent/src/api/message_processor.py#L127)
Should bind to the connection-authenticated session, not the message body.
**Fix:** read `session_id` from the WebSocket connection context; reject if
the message-body value doesn't match.

### 9. banking_agent_service BL-01 — Post-`open` WebSocket errors are swallowed
**File:** [banking_agent_service/src/mcpGatewayClient.ts:55,69-85,121-135](../../banking_agent_service/src/mcpGatewayClient.ts)
A gateway restart pegs the agent for `MAX_TOOL_ITERATIONS × 30s` because
pending requests hang until per-request timeout. No `close` handler, no
`readyState` check before `_request`, no `_failAllPending`. **Fix:** add a
`close` handler that fails all pending requests with a typed error; check
`readyState === OPEN` before sending.

### 10. banking_agent_service BL-02 — Token cache key truncated to 64 bits
**File:** [banking_agent_service/src/tokenResolver.ts:82-84](../../banking_agent_service/src/tokenResolver.ts#L82-L84)
`tokenHash()` returns the first 16 hex chars of a SHA-256 digest. Two user
tokens that collide in 64 bits would share a cached GW-scoped delegated
token. Token-isolation primitives must not be probabilistic. **Fix:**
one-line — drop the `.slice(0, 16)`.

## What's verified clean (don't waste cycles re-checking)

From the gateway+token review, these were explicitly checked and found
correct:

- **No subject/actor swap** in any RFC 8693 call site
- **Audience binding correct** on all three dispositions (oauth_bearer / dual_token / api_key)
- **Timing-safe `BFF_INTERNAL_SECRET` comparison** present (commit `38167dab`)
- **JWE-aware scrubber regex** correct, applied where logging happens
- **No raw tokens** in stdout / log files / response bodies across 18 gateway+plumbing files
- **PingAuthorize fails closed** on unreachable PA endpoint (per REGRESSION_PLAN §1)
- **Subject preservation check (RFC 8693 §3)** present at agentMcpTokenService.js:1263
- **BankingAgent UI token custody is clean** — every banking call uses `bffAxios` or cookie `fetch`; no `Authorization` header construction; no tokens in `localStorage` / `sessionStorage`
- **HITL 428 flow has no auto-confirm path** in the SPA

## Recommended fix sequencing

The 10 BLOCKs are not equally cheap to fix. Suggested order:

1. **Gateway BL-03** — one-line guard: refuse default `BFF_INTERNAL_SECRET` in production. 30 minutes including test.
2. **agent_service BL-02** — one-line fix: drop the slice. 30 minutes including test.
3. **LangChain BL-01 + BL-02 together** — override `__repr__`, attach filter in `setup_logging`, add JWT-regex. 2-3 hours. Closes most of the token-leakage surface in one diff.
4. **Gateway BL-01** — auth `/admin/config` with the same timing-safe pattern, refuse `devBypass: true` in production. Half a day.
5. **agent_service BL-01** — add WebSocket `close` handler, fail pending requests, check `readyState`. Half a day.
6. **LangChain BL-03 + BL-04 together** — both are "validate the session/state on the callback / WS message" patches. Half a day.
7. **Gateway BL-04** — TLS verification on the BFF→gateway health probe; introduce explicit dev-only flag. 2 hours.
8. **Gateway BL-02** — extract policy pipeline into transport-agnostic function, call from both HTTP and WS handlers. **Biggest refactor**, 1-2 days. Eliminates the WS-bypass class entirely.

## Suggested next step

`/gsd-code-review-fix` against this directory would let the fixer agent
apply atomic commits per finding. The four reports follow the standard
BLOCK/HIGH/MED/LOW schema that the fixer expects. Recommend running it
once BLOCKs are triaged — HIGH and below can wait for a separate pass.

## Out of scope (deferred)

- Test files (LangChain has 30+ test files, BFF and gateway have their
  own suites). Spot-checking suggested some are pass-theater — would
  warrant a separate test-quality audit if test confidence becomes a
  blocker for shipping.
- `banking_mcp_server` and `banking_mcp_invest` themselves (downstream
  of the gateway — different audit scope).
- HITL service internals (`banking_hitl_service`) — only the gateway's
  `hitlClient.ts` consumer was in scope here.
