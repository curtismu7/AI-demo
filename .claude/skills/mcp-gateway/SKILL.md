---
name: mcp-gateway
description: 'USE FOR anything touching demo_mcp_gateway — its auth pipeline, tool routing, API-key disposition, PingAuthorize vs simulated AS, token exchange, vault reads, adding/removing a tool route, configuring the gateway, debugging 403s or failed tool calls through the gateway. DO NOT USE FOR: BFF OAuth flows (use oauth-pingone); TypeScript MCP server tool registration (use mcp-server); MCP WebSocket client on the BFF (use mcp-server or bff-sessions).'
argument-hint: 'describe what you are trying to do, e.g. "add a new tool route", "debug a 403", "understand the auth pipeline", "configure vault"'
---

# MCP Gateway Skill

## Files to read before editing

| File | Role |
|------|------|
| `demo_mcp_gateway/src/index.ts` | Entry point, IIFE startup, WebSocket handler (`handleMessage`), admin HTTP endpoints |
| `demo_mcp_gateway/src/config.ts` | `loadConfig()`, `GatewayConfig` interface, all env var definitions, `assertProductionSecrets` |
| `demo_mcp_gateway/src/router.ts` | `routeTool()`, `backendWsUrl()`, `backendHttpUrl()`, `BackendTarget` type, all tool-set membership |
| `demo_mcp_gateway/src/proxy.ts` | `proxyJsonRpc()` — opens a fresh WS per request, does the MCP handshake, forwards the real call |
| `demo_mcp_gateway/src/auth/authorizeMcpRequestCore.ts` | Transport-agnostic pipeline: introspection → policy; returns tagged `AuthorizationResult` |
| `demo_mcp_gateway/src/auth/GatewayIntrospectionClient.ts` | RFC 7662 active-token check, 30s cache (5s in prod), fails closed |
| `demo_mcp_gateway/src/auth/GatewayTokenPolicy.ts` | `GatewayTokenPolicy.validate()` — sub, act.sub, D-05 anti-bypass check |
| `demo_mcp_gateway/src/auth/McpTokenExchangeClient.ts` | RFC 8693 exchange: inbound gateway-aud token → upstream MCP-server-aud token |
| `demo_mcp_gateway/src/auth/PingOneAuthorizeClient.ts` | PingOne Authorize decision client, `buildAuthorizeParameters()`, HITL/DENY/PERMIT outcomes |
| `demo_mcp_gateway/src/auth/toolScopes.ts` | `getScopesForGatewayTool()`, `missingScopesForTool()`, `evaluateScopeDecisionLocally()`, `getChallengeTypeForTool()` |
| `demo_mcp_gateway/src/auth/scopeTopology.ts` | Reads `scope-topology.json`; `toolRequiredScopes()`, `toolChallengeType()`, `gatewayToolNames()` |
| `demo_mcp_gateway/src/pingAuthorizeGuard.ts` | `guardToolsList()`, `guardToolCall()` — WS-path PingAuthorize calls |
| `demo_mcp_gateway/src/apiKeyDispatch.ts` | `buildApiKeyToolResult()` — shared api_key disposition for WS + HTTP |
| `demo_mcp_gateway/src/vault.ts` | `loadVaultIntoEnv()` — vault startup loader, allowlist regex, VAULT_PASSWORD lifecycle |
| `demo_mcp_gateway/src/tokenValidator.ts` | `validateInboundToken()`, `extractBearerToken()`, `DecodedGatewayToken` |
| `scope-topology.json` | SSOT for all tool→scope mappings and surface labels (`gateway` / `exchange-only` / `legacy-alias`) |
| `demo_api_server/services/mcpGatewayClient.js` | BFF HTTP client — how the BFF dials the gateway, configStore key, TLS settings |
| `demo_api_server/services/simulatedAuthorizeService.js` | Simulated AS — rules for PERMIT/DENY/step-up/HITL when PingAuthorize is not configured |

---

## Architecture: full request flow

```
Browser (httpOnly session cookie)
  |
  v
BFF (demo_api_server :3001)
  agentMcpTokenService.js — RFC 8693 exchange for gateway-audience token (aud=MCP_GW_RESOURCE_URI)
  mcpGatewayClient.js — POST /mcp to gateway, bearer = gateway-audience token
  |
  v (HTTPS, Authorization: Bearer <gateway-token>)
MCP Gateway (demo_mcp_gateway :3005)
  |
  +-- validateInboundToken()           aud + exp check (tokenValidator.ts)
  +-- GatewayIntrospectionClient       RFC 7662 active-token check (GatewayIntrospectionClient.ts)
  +-- GatewayTokenPolicy.validate()    sub, act.sub, D-05 anti-bypass (GatewayTokenPolicy.ts)
  +-- guardToolCall() / guardToolsList() PingAuthorize or local scope decision (pingAuthorizeGuard.ts)
  |
  +-- routeTool(toolName)  ->  BackendTarget  (router.ts)
  |
  +-- 'apikey'     -> buildApiKeyToolResult()  (apiKeyDispatch.ts)
  |                   drops OAuth bearer; calls backend with X-API-Key + X-User-Sub
  |
  +-- 'dualtoken'  -> fetchIdTokenFromBff() + POST /api/resource-server/identity
  |                   forwards original gateway token + id_token in JSON-RPC body
  |
  +-- 'bankingdata'-> GET /api/resource-server/accounts or /transactions
  |                   forwards original gateway token as bearer
  |
  +-- 'olb'/'invest' -> proxyJsonRpc()  (proxy.ts)
                        McpTokenExchangeClient.exchange()  RFC 8693 -> upstream MCP-server token
                        WebSocket to demo_mcp_server :8080 or demo_mcp_invest :8081
```

Token custody: the browser never receives the gateway-audience token. The BFF holds it server-side and the gateway never returns it upstream.

---

## Port and URL

- Gateway listens on **port 3005** (`PORT` env var, default `3005`).
- Canonical local URL: `https://api.ping.demo:3005`
- BFF reads the URL from configStore key **`mcp_gateway_http_url`** (stored in SQLite), with env var fallback `MCP_GATEWAY_HTTP_URL`, final default `https://api.ping.demo:3005`.
- Set `MCP_GATEWAY_REJECT_UNAUTHORIZED=0` locally to accept mkcert self-signed cert. This flag is hard-blocked in production.
- The gateway also accepts WebSocket connections on the same port; the BFF uses HTTP POST `/mcp` (not WebSocket).

---

## Auth Pipeline (step by step)

Every inbound request — both HTTP POST `/mcp` and WebSocket `tools/call` — runs this pipeline in order. Each step is fail-closed.

### Step 1 — Bearer extraction and aud/exp check
File: `demo_mcp_gateway/src/tokenValidator.ts`

`extractBearerToken()` pulls the token from `Authorization: Bearer ...`. `validateInboundToken(token, config.gatewayResourceUri)` decodes the JWT (no signature verification in dev; add JWKS-based verification for production) and checks:
- Token is present and parseable.
- `exp` is in the future.
- `aud` contains `config.gatewayResourceUri` (the value of `MCP_GW_RESOURCE_URI`).

Failure: `TokenValidationError` with code `missing_token`, `invalid_token`, `expired_token`, or `invalid_aud`.

### Step 2 — RFC 7662 introspection
File: `demo_mcp_gateway/src/auth/GatewayIntrospectionClient.ts`

`GatewayIntrospectionClient.introspect(token)` calls the PingOne introspection endpoint. Results are cached by SHA-256 token hash: 30 s in dev, 5 s in production.

- If `GW_INTROSPECTION_ENDPOINT` (or `PINGONE_INTROSPECTION_ENDPOINT`) is not set, introspection is **skipped** and the result is `{ active: true, skipped: true }` — dev environments work without configuring this.
- Network errors → `active: false` (fail closed, cached for 5 s).
- Dedicated introspection credentials: `GW_INTROSPECTION_CLIENT_ID` + `GW_INTROSPECTION_CLIENT_SECRET` (falls back to the gateway's own `MCP_GW_CLIENT_ID` / `MCP_GW_CLIENT_SECRET`).
- Auth method: `MCP_GW_TOKEN_ENDPOINT_AUTH_METHOD=post` uses `client_secret_post`; default is `basic`.

`GatewayIntrospectionClient.clearCache()` is a static method called by `POST /admin/clear-token-cache` on user logout.

### Step 3 — GatewayTokenPolicy identity invariants
File: `demo_mcp_gateway/src/auth/GatewayTokenPolicy.ts`

`GatewayTokenPolicy.validate(decoded, config)` enforces:
- `sub` must be non-empty (caller identity required).
- If `act` is present, `act.sub` must be non-empty (valid delegation chain).
- **D-05 anti-bypass**: `aud` must NOT contain `mcpOlbResourceUri`, `mcpInvestResourceUri`, or `bankingResourceServerResourceUri`. A token pre-targeted at an upstream MCP server cannot bypass the gateway.

Failure throws `GatewayTokenPolicyError` with code `missing_sub`, `invalid_act`, or `bypass_attempt`.

The shared function `runMcpAuthorizationPipeline()` in `authorizeMcpRequestCore.ts` wraps steps 2 and 3 and returns a tagged union (`authorized` / `introspection_failed` / `policy_violation`). Both transports call it.

### Step 4 — PingAuthorize / simulated scope decision
Files: `demo_mcp_gateway/src/pingAuthorizeGuard.ts` (WS path) and `demo_mcp_gateway/src/auth/PingOneAuthorizeClient.ts` (HTTP path)

If `PINGAUTHORIZE_ENDPOINT` and `PINGAUTHORIZE_WORKER_ID` are set, the gateway calls:
```
POST {PINGAUTHORIZE_ENDPOINT}/governance/pap/alpha/policy/{PINGAUTHORIZE_WORKER_ID}/decision
```
with a `parameters` block built by `buildAuthorizeParameters()`.

Decision outcomes:
- `PERMIT` — proceed to dispatch.
- `DENY` — 403; JSON-RPC error code `-32403`.
- `INDETERMINATE` — treated as HITL required; gateway creates a challenge via `createHitlChallenge()` and returns code `-32002` with `{ hitl: true, challengeId, expiresAt }`.

If PingAuthorize is NOT configured, `evaluateScopeDecisionLocally()` in `toolScopes.ts` evaluates whether the token's `scope` claim contains all required scopes for the tool — same PERMIT/DENY semantics. This is the fallback for dev and for the simulated-AS path (the `ff_authorize_simulated` feature flag lives on the BFF side in `simulatedAuthorizeService.js`, not in the gateway itself).

`buildAuthorizeParameters()` sends these fields to PingAuthorize (both transports use the same builder — WR-02 parity):
```
DecisionContext, McpMethod, ToolName, ClientId (= sub), ActClientId (= act.sub),
TokenScopes, TokenAudience, TransactionAmount, TransactionType, ToAccountId,
TratPurp, TratAzdAct, TratSessionId, TratTool, TratSim (when X-TraT-Context is present)
```

---

## PingAuthorize vs Simulated AS

| | PingAuthorize | Simulated AS |
|---|---|---|
| Feature flag | `PINGAUTHORIZE_ENDPOINT` + `PINGAUTHORIZE_WORKER_ID` set | either var absent, or BFF `ff_authorize_simulated=true` |
| Who calls it | Gateway directly (both transports) | BFF `simulatedAuthorizeService.js` for BFF-layer decisions; gateway falls back to `evaluateScopeDecisionLocally()` |
| Possible outcomes | PERMIT / DENY / INDETERMINATE (→ HITL) | PERMIT / DENY (amount > threshold) / step-up (withdrawal >= threshold) / HITL_CONSENT (all transfers) |
| Where the BFF simulated rules live | — | `demo_api_server/services/simulatedAuthorizeService.js` |
| Gateway local fallback | n/a | `demo_mcp_gateway/src/auth/toolScopes.ts` `evaluateScopeDecisionLocally()` — scope-only check |
| Fails closed? | Yes — unavailable AS → DENY | n/a (local code, always available) |
| Simulated guard in production | n/a | `simulatedAuthorizeService.js` throws on import if `NODE_ENV=production` and `ALLOW_SIMULATED_AUTHORIZE` not set |

The `ff_authorize_simulated` flag is a configStore key read by the BFF's `pingOneAuthorizeService.js`. The gateway does not read it directly — it decides based on whether `pingAuthorizeEndpoint` is empty in `config.ts`.

---

## Token Exchange in the Gateway

File: `demo_mcp_gateway/src/auth/McpTokenExchangeClient.ts`

The gateway performs RFC 8693 token exchange to obtain a next-hop token for the upstream MCP server (`olb` or `invest`) before proxying over WebSocket.

- Input: inbound gateway-audience token (`aud=MCP_GW_RESOURCE_URI`)
- Exchange: `grant_type=urn:ietf:params:oauth:grant-type:token-exchange`, `audience=<target resource URI>`
- Output: upstream-audience token — **never returned to the caller, never logged**

```
caller → gateway (aud=gateway) → exchange → upstream (aud=mcp-olb or mcp-invest)
```

Cache key: `sha256(subjectToken + ":" + targetAud)`. Entries expire 5 s before the `expires_in` the AS returned (default 300 s). Max 1000 entries; FIFO eviction via `boundedTokenCache.ts`.

`McpTokenExchangeClient.clearCache()` is a static method called on user logout via `POST /admin/clear-token-cache`.

Auth method for the exchange request follows `MCP_GW_TOKEN_ENDPOINT_AUTH_METHOD` (same as introspection — `basic` or `post`).

The exchange is skipped for `apikey`, `dualtoken`, and `bankingdata` targets — those dispositions handle credentials differently (see Architecture).

`MCP_GW_PASSTHROUGH_TO_MCP_SERVER=true` skips the exchange entirely for `olb`/`invest` and forwards the inbound token unchanged. Only valid when `MCP_SERVER_RESOURCE_URI` equals `MCP_GW_RESOURCE_URI`.

---

## API-Key Disposition

File: `demo_mcp_gateway/src/apiKeyDispatch.ts`

When `routeTool()` returns `'apikey'`, the gateway dispatches through `buildApiKeyToolResult()`.

The dispatch drops the OAuth bearer entirely and calls the backend with:
- `X-API-Key: config.mortgageServiceApiKey` (from `DEMO_MORTGAGE_SERVICE_KEY`, default `demo-mortgage-key-0000`)
- `X-User-Sub: decoded.sub`

Phase 267: `show_mortgage` is the first apikey tool with a real backend — `banking_mortgage_service` at `config.mortgageServiceBaseUrl` (env `MORTGAGE_SERVICE_URL`, default `http://localhost:8082`). The route segment is determined by `backendHttpUrl('apikey', toolName, config)` in `router.ts`:

| Tool name | Backend route |
|---|---|
| `show_mortgage` | `{mortgageServiceBaseUrl}/mortgage` |
| `show_large_purchase` | `{mortgageServiceBaseUrl}/retail` |
| `show_health_record` | `{mortgageServiceBaseUrl}/healthcare` |
| `show_gear_order` | `{mortgageServiceBaseUrl}/gear` |
| `show_expense_report` | `{mortgageServiceBaseUrl}/expense` |

Tools with no mapped backend URL return a Gateway-only marker (`API_KEY_PATH_MARKER`) with no backend call (Phase 266 behavior).

The apikey dispatch is called identically from both the WebSocket handler (`index.ts`) and the HTTP middleware (`middleware/authorizeMcpRequest.ts`) — transport parity enforced by the shared module.

The masked last-4 of the API key appears in `_meta.apiKeyMaskedLast4` in the JSON-RPC result for the Token Chain UI; the full key never crosses the wire to the caller.

---

## Vault Reads

File: `demo_mcp_gateway/src/vault.ts`

The gateway calls `loadVaultIntoEnv()` at startup, before `loadConfig()`. It reads from `secrets.vault` at the repo root (same vault the BFF uses) and copies allowlisted entries into `process.env`.

Allowlist regex: `/^(MCP_GW_|PROVIDER_|HELIX_|BFF_INTERNAL_)[A-Z0-9_]+$/`

Entries the vault typically populates:
- `MCP_GW_CLIENT_SECRET` — gateway OAuth client secret
- `MCP_GW_CLIENT_ID` — gateway OAuth client ID
- `BFF_INTERNAL_SECRET` — shared secret for `POST /internal/id-token` (BFF ↔ gateway)
- `PROVIDER_*` — AI provider keys (future)
- `HELIX_*` — Helix platform keys

Behavior:
- No `secrets.vault` file → silent skip, uses `process.env` only.
- Vault file present but `VAULT_PASSWORD` not set → fatal error, gateway refuses to start.
- Non-allowlisted entry → logged via `console.warn` and skipped (no injection of arbitrary env vars).
- `VAULT_PASSWORD` is deleted from `process.env` immediately after `vault.close()` to minimize leak window.
- On Vercel (`VERCEL=1`) vault load is bypassed; use Vercel Encrypted Environment Variables instead.

The vault library is shared with the BFF: `require('../../demo_api_server/lib/vault')`. The gateway must be deployed alongside `demo_api_server`.

---

## Tool Scope Map

The authoritative scope map lives in **`scope-topology.json`** at the repo root. Do not hand-edit `toolScopes.ts` — edit the JSON manifest.

`scopeTopology.ts` imports the manifest and exposes `toolRequiredScopes(name)` and `toolChallengeType(name)`. `toolScopes.ts` derives `TOOL_SCOPES` from it at module load time.

Only tools with `"surface": "gateway"` appear in `TOOL_SCOPES`. `exchange-only` and `legacy-alias` tools are BFF-side concerns.

Current gateway-surface tools and their required scopes:

| Tool | Required scopes | challengeType |
|---|---|---|
| `get_my_accounts`, `get_account_balance`, `get_my_transactions`, `get_sensitive_account_details`, `sequential_think` | `read` | — |
| `get_investment_balance`, `get_investment_accounts`, `get_portfolio_summary` | `read` | — |
| `show_mortgage` | `mortgage:read` | — |
| `show_large_purchase` | `largepurchase:read` | — |
| `show_health_record` | `records:read` | — |
| `show_gear_order` | `gear:read` | — |
| `show_expense_report` | `expense:read` | — |
| `create_deposit`, `create_withdrawal` | `write` | `step_up` |
| `create_transfer` | `write`, `transfer` | `step_up` |

`getChallengeTypeForTool(toolName)` returns `'step_up'` for financial write tools and `'consent'` for all others. This drives the HITL challenge type in the JSON-RPC error body.

---

## Adding a New Tool Route

Follow this checklist in order:

1. **Add the tool to `scope-topology.json`** — set `surface: "gateway"`, `requiredScopes`, and optionally `challengeType`. This is the SSOT; `toolScopes.ts` is derived from it automatically.

2. **Choose a `BackendTarget`** in `demo_mcp_gateway/src/router.ts`:
   - New OLB WebSocket tool → add to `OLB_TOOLS` set.
   - New invest WebSocket tool → add to `INVEST_TOOLS` set.
   - New api_key tool → add to `APIKEY_TOOLS` set and add the backend route mapping in `backendHttpUrl()`.
   - New HTTP banking-data tool → add to `BANKINGDATA_TOOLS` set and add the route in `BANKING_DATA_ROUTE_FOR_TOOL`.
   - New dual-token tool → add to `DUALTOKEN_TOOLS` set.

3. **If api_key with a real backend**: add the tool→route mapping in `backendHttpUrl()`'s `APIKEY_BACKEND_ROUTES`. Ensure `MORTGAGE_SERVICE_URL` (or a new env var) is wired in `config.ts` and exposed in `GatewayConfig`.

4. **If a new credential scope is needed**: add the scope to `scope-topology.json` and to the `scopes_supported` list in the `/.well-known/oauth-protected-resource` handler in `index.ts`.

5. **Verify `scope-topology.test.ts`** passes — it guards against drift between the manifest and what the gateway enforces.

6. **If the tool exists on `demo_mcp_server`**: also register it in `demo_mcp_server/src/tools/BankingToolRegistry.ts` (see `mcp-server` skill).

---

## Debugging

### Log file
`/tmp/demo-mcp-gateway.log` — tail with `./run.sh tail mcp-gateway`.

### Log prefixes to search
| Prefix | Meaning |
|---|---|
| `[GW]` | General gateway events, startup, routing |
| `[GW vault]` | Vault startup load events |
| `[GatewayIntrospection]` | RFC 7662 introspection failures |
| `[PingOneAuthorizeClient]` | PingAuthorize endpoint unavailable |
| `[GW] PingAuthorize guard failed` | WS-path guard failure |
| `[GW] Proxy error for <toolName>` | WebSocket proxy error to backend MCP server |
| `[GW] WS upgrade rejected` | Origin not in `MCP_ACCEPTED_ORIGINS` |
| `[GW] token caches cleared` | Logout cache flush confirmed |

### Common failure patterns

**403 on tool call (gateway returns -32403):**
1. Check `TokenScopes` in the request — token may be missing the required scope. Query `getScopesForGatewayTool(toolName)` against the token's `scope` claim.
2. If PingAuthorize is configured, check whether the AS is reachable. Unavailable AS → DENY (fail closed).
3. If the token `aud` contains an upstream MCP-server URI (e.g. `mcpserver.ping.demo`), the D-05 anti-bypass check fires — the caller obtained the wrong token. The token must target `MCP_GW_RESOURCE_URI`.

**-32001 / introspection_failed:**
1. Token is revoked or expired at the AS. User must log out and log in again.
2. `GW_INTROSPECTION_ENDPOINT` is set but the introspecting client is wrong. PingOne only returns `active:true` when the introspecting client is the token's issuing client or the resource server that owns the audience. Set `GW_INTROSPECTION_CLIENT_ID` + `GW_INTROSPECTION_CLIENT_SECRET` to the exchanger client.

**Token exchange failure (tools/call never reaches backend):**
1. Check `/tmp/demo-mcp-gateway.log` for `Proxy error` or network errors.
2. Verify `MCP_GW_CLIENT_ID` and `MCP_GW_CLIENT_SECRET` are correct and the client has `token_exchange` grant type in PingOne.
3. Verify `MCP_OLB_RESOURCE_URI` / `MCP_INVEST_RESOURCE_URI` match the audiences configured in PingOne.

**tools/list returns partial results (`_meta.partialResults: true`):**
One backend (olb or invest) is unreachable. Check `_meta.failedBackends` in the response. Gateway-owned tools (`special_offers`, `user_profile_card`) are always returned.

**api_key tool returns "Mortgage backend unreachable":**
Check that `demo_mortgage_service` is running on `:8082`. The tool dispatches via `MORTGAGE_SERVICE_URL`.

**devBypass stuck on in production:**
Gateway refuses to start if `MCP_GW_DEV_BYPASS=true` and `NODE_ENV=production`. `/admin/config` also refuses to set `devBypass=true` in production.

**Admin endpoint returns 500 `{"error":"misconfigured"}`:**
`BFF_INTERNAL_SECRET` is empty or shorter than `MIN_INTERNAL_SECRET_LEN` (16 chars). Set a real secret in `.env` or vault.

### Quick health check
```
curl https://api.ping.demo:3005/health
curl https://api.ping.demo:3005/.well-known/oauth-protected-resource
```

---

## Key env vars

| Var | Purpose | Required |
|---|---|---|
| `MCP_GW_CLIENT_ID` | Gateway's OAuth client ID for token exchange + introspection | Yes |
| `MCP_GW_CLIENT_SECRET` | Gateway's OAuth client secret | Yes (or vault) |
| `MCP_GW_RESOURCE_URI` | Inbound audience — tokens must carry this aud | Yes |
| `PINGONE_TOKEN_ENDPOINT` | PingOne token endpoint (or derived from `PINGONE_ENVIRONMENT_ID` + `PINGONE_REGION`) | Yes |
| `MCP_GW_TOKEN_ENDPOINT_AUTH_METHOD` | `basic` (default) or `post` for token exchange + introspection | No |
| `MCP_OLB_WS_URL` | WebSocket URL for demo_mcp_server (default `ws://localhost:8080`) | No |
| `MCP_INVEST_WS_URL` | WebSocket URL for demo_mcp_invest (default `ws://localhost:8081`) | No |
| `MCP_OLB_RESOURCE_URI` | Audience for OLB backend token exchange | No |
| `MCP_INVEST_RESOURCE_URI` | Audience for invest backend token exchange | No |
| `PINGAUTHORIZE_ENDPOINT` | PingAuthorize base URL — enables real AS evaluation | No |
| `PINGAUTHORIZE_WORKER_ID` | PingAuthorize policy worker ID | No |
| `GW_INTROSPECTION_ENDPOINT` | RFC 7662 endpoint (falls back to `PINGONE_INTROSPECTION_ENDPOINT`) | No |
| `GW_INTROSPECTION_CLIENT_ID` | Dedicated introspection client (falls back to `MCP_GW_CLIENT_ID`) | No |
| `GW_INTROSPECTION_CLIENT_SECRET` | Dedicated introspection secret | No |
| `HITL_SERVICE_URL` | HITL service URL — enables challenge creation on INDETERMINATE decisions | No |
| `BFF_INTERNAL_SECRET` | Shared secret for BFF ↔ gateway `X-Internal-Gateway-Secret` header | Yes (min 16 chars) |
| `BFF_INTERNAL_ID_TOKEN_URL` | BFF endpoint for server-side id_token retrieval (default `http://localhost:3001/internal/id-token`) | No |
| `DEMO_APIKEY_SERVICE_KEY` | Demo API key for Phase 266 marker tools | No |
| `DEMO_MORTGAGE_SERVICE_KEY` | API key sent to banking_mortgage_service | No |
| `MORTGAGE_SERVICE_URL` | Base URL for banking_mortgage_service (default `http://localhost:8082`) | No |
| `MCP_GW_DEV_BYPASS` | Skip required-var guards + make auth passthrough (localhost only, blocked in prod) | No |
| `MCP_GW_PASSTHROUGH_TO_MCP_SERVER` | Skip RFC 8693 re-exchange on WS legs | No |
| `MCP_MTLS_ENABLED` | Enable mTLS client cert on upstream WS connections | No |
| `VAULT_PASSWORD` | Unlock `secrets.vault` at startup (deleted from env after vault close) | When vault present |

---

## Security invariants (never bypass)

1. **D-05 anti-bypass** — `GatewayTokenPolicy.validate()` rejects any token whose `aud` contains an upstream MCP-server URI. Callers must obtain a gateway-targeted token; only the gateway may exchange it for the next-hop audience.
2. **`BFF_INTERNAL_SECRET` timing-safe compare** — `requireInternalSecret()` in `index.ts` uses `crypto.timingSafeEqual` on equal-length buffers. Do not replace with `===`.
3. **`assertProductionSecrets()`** — called at startup; refuses the committed dev default secret and refuses `devBypass=true` in `NODE_ENV=production`. Never weaken this.
4. **Token never returned to caller** — the upstream MCP-server token from `McpTokenExchangeClient.exchange()` and the api_key from `DEMO_MORTGAGE_SERVICE_KEY` are used only in outbound requests and appear in responses only as masked last-4.
5. **Introspection fails closed** — network errors or a missing endpoint + vault → `active: false`. Do not change to fail-open without explicit design review.
