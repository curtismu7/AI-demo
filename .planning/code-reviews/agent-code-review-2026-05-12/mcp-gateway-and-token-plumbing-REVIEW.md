---
phase: mcp-gateway-and-token-plumbing
reviewed: 2026-05-12T00:00:00Z
depth: deep
files_reviewed: 18
files_reviewed_list:
  - banking_mcp_gateway/src/index.ts
  - banking_mcp_gateway/src/config.ts
  - banking_mcp_gateway/src/router.ts
  - banking_mcp_gateway/src/credentialSwap.ts
  - banking_mcp_gateway/src/tokenExchange.ts
  - banking_mcp_gateway/src/tokenValidator.ts
  - banking_mcp_gateway/src/proxy.ts
  - banking_mcp_gateway/src/hitlClient.ts
  - banking_mcp_gateway/src/pingAuthorizeGuard.ts
  - banking_mcp_gateway/src/middleware/authorizeMcpRequest.ts
  - banking_mcp_gateway/src/auth/PingOneAuthorizeClient.ts
  - banking_mcp_gateway/src/auth/GatewayTokenPolicy.ts
  - banking_mcp_gateway/src/auth/GatewayIntrospectionClient.ts
  - banking_mcp_gateway/src/auth/toolScopes.ts
  - banking_mcp_gateway/src/auth/McpTokenExchangeClient.ts
  - banking_mcp_gateway/src/server/GatewayServer.ts
  - banking_api_server/services/agentMcpTokenService.js
  - banking_api_server/services/mcpWebSocketClient.js
findings:
  critical: 4
  warning: 9
  info: 5
  total: 18
status: issues_found
---

# MCP Gateway and BFF Token Plumbing — Code Review

**Reviewed:** 2026-05-12
**Depth:** deep (cross-file analysis of the token-custody perimeter)
**Status:** issues_found

## Summary

The 3-disposition routing, RFC 8693 exchange, and audience-narrowing logic are sound at the spec level. The introspection cache, fail-closed PingAuthorize default, JWE-aware scrubber, and timing-safe `BFF_INTERNAL_SECRET` comparison are well executed.

The serious problems cluster around **transport inconsistency**: the HTTP `POST /mcp` path runs the full pipeline (introspection → token-policy → Authorize → exchange) via `authorizeMcpRequest`, but the WebSocket path in `index.ts` runs a leaner pipeline (`validateInboundToken` + `guardToolCall` only) that *skips* RFC 7662 introspection and the D-05 anti-bypass invariant in `GatewayTokenPolicy`. The same `bearerToken` reaches different policy depth depending on which transport an attacker picks — and the WebSocket port is the same `httpServer`, so both are exposed simultaneously.

Other BLOCK-tier issues: shared-secret default that ships in production builds, an explicit `rejectUnauthorized: false` on the BFF→gateway health probe path that determines audience selection, and a `/admin/config` endpoint with no authentication that can flip `devBypass: true` at runtime (and `devBypass` causes the middleware to forward the inbound bearer to the upstream MCP server unexchanged).

## BLOCK

### BL-01: `/admin/config` is unauthenticated and can flip `devBypass: true` at runtime

**File:** `banking_mcp_gateway/src/index.ts:110-150`

**Issue:** `POST /admin/config` accepts an unauthenticated JSON body and mutates the live `config` object in place, including `devBypass`. When `devBypass: true` is in effect, `authorizeMcpRequest` (line 82) **forwards the inbound bearer token to the upstream MCP server with zero policy evaluation, zero exchange, and zero audience check** — log line: `[GW] Dev bypass: forwarding request without auth pipeline`.

The comment claims "Localhost-only in practice (gateway binds to 0.0.0.0 but BFF proxies)" but the server actually binds to `0.0.0.0` (config.ts:85) — i.e., listens on every interface. There is no IP allowlist, no shared-secret check, no origin check on this HTTP route. Anyone who can reach `:3005` can disable the auth pipeline. In a containerized or shared-VPC deployment, that is reachable.

Equally problematic: the same body can swap `mcpOlbWsUrl` / `mcpInvestWsUrl` to an attacker-controlled WebSocket, causing the gateway to forward exchanged PingOne tokens to that endpoint.

**Fix:**
```typescript
// Require BFF_INTERNAL_SECRET (or a dedicated GW_ADMIN_SECRET) on /admin/config,
// using timingSafeEqual — same pattern as banking_api_server/routes/agentIdToken.js.
import crypto from 'crypto';

if (url === '/admin/config' && (req.method === 'POST' || req.method === 'GET')) {
  const presented = req.headers['x-internal-gateway-secret'];
  const expected = config.bffInternalSecret;
  const aBuf = typeof presented === 'string' ? Buffer.from(presented) : null;
  const bBuf = Buffer.from(expected);
  if (!aBuf || aBuf.length !== bBuf.length || !crypto.timingSafeEqual(aBuf, bBuf)) {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'forbidden' }));
    return;
  }
  // ... existing handler
}
```
Additionally, refuse `devBypass`/`mcpOlbWsUrl`/`mcpInvestWsUrl`/`pingAuthorizeEndpoint` mutations entirely in non-development builds (gate on `NODE_ENV === 'production'`).

---

### BL-02: WebSocket transport bypasses introspection + anti-bypass invariant that HTTP transport enforces

**Files:** `banking_mcp_gateway/src/index.ts:204-275` (WS handler) vs `banking_mcp_gateway/src/middleware/authorizeMcpRequest.ts:103-147` (HTTP middleware)

**Issue:** `GatewayServer` (HTTP `POST /mcp`) calls `authorizeMcpRequest` which runs:
1. `GatewayIntrospectionClient.introspect()` — RFC 7662 active-token check
2. `GatewayTokenPolicy.validate()` — sub/act non-empty + **D-05 anti-bypass** (rejects tokens whose `aud` includes `mcpOlbResourceUri` or `mcpInvestResourceUri`)
3. `PingOneAuthorizeClient.evaluate()` — Authorize policy
4. `McpTokenExchangeClient.exchange()` — RFC 8693

The WebSocket handler in `index.ts:204-275` calls:
1. `validateInboundToken()` — aud + exp only
2. `guardToolCall()` (PingAuthorize) — same policy call
3. `exchangeTokenForBackend()` — exchange

Missing on WS: RFC 7662 introspection (a revoked token still works for 30 s + the JWT exp, regardless of revocation), and **`GatewayTokenPolicy.validate`** (the D-05 anti-bypass check that explicitly rejects tokens whose `aud` already targets an upstream MCP audience).

Concrete attack: an attacker who obtains a token already minted for `mcpOlbResourceUri` (e.g., from a leaked credential or misconfigured client app) is rejected at `POST /mcp` but **accepted at `ws://:3005`**, where the gateway happily re-exchanges and forwards. The two transports share the same `httpServer` (index.ts:643), so both are simultaneously exposed.

**Fix:** Pull the same pipeline into the WS handler. Easiest is to extract the steps from `authorizeMcpRequest` into a transport-agnostic helper and call it from both code paths:
```typescript
// banking_mcp_gateway/src/middleware/authorizeMcpRequest.ts
export async function runPolicyPipeline(
  bearerToken: string,
  toolName: string | undefined,
  toolArgs: Record<string, unknown> | undefined,
  config: GatewayConfig,
): Promise<{ ok: true; exchangedToken: string; targetAud: string } | { ok: false; status: number; error: string; code: string }> {
  // introspect → policy.validate → authorize.evaluate → exchange.exchange
}
```
Then call it from `index.ts handleMessage` for both `tools/list` and `tools/call`. **This is the single biggest correctness win available in this subsystem.**

---

### BL-03: Production-shipped default secret for `BFF_INTERNAL_SECRET`

**Files:** `banking_mcp_gateway/src/config.ts:109`, `banking_api_server/routes/agentIdToken.js:25`

**Issue:** Both sides fall back to the literal string `'dev-shared-secret-change-me'` when `BFF_INTERNAL_SECRET` is unset. The gateway uses this secret to authenticate to the BFF's `/internal/id-token` endpoint, which returns the user's raw `id_token`. If a deployment forgets to set the env var on either side, **anyone who can reach `:3001/internal/id-token` can fetch any user's raw `id_token` by sending the literal default secret + a guessed `sub`**.

The endpoint binds wherever the BFF binds (in this repo, `0.0.0.0`). On Vercel this is internal-only, but `setup:fresh` writes `.env` files without ever requiring this var, so a local-prod gap exists. There is no startup assertion.

**Fix:** Fail hard in both processes when `BFF_INTERNAL_SECRET` is unset *and* `NODE_ENV === 'production'` (or a `STRICT_SECRETS=true` toggle):
```typescript
// banking_mcp_gateway/src/config.ts
bffInternalSecret: (() => {
  const v = process.env.BFF_INTERNAL_SECRET;
  if (!v || v === 'dev-shared-secret-change-me') {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('BFF_INTERNAL_SECRET must be set (no default in production)');
    }
    console.warn('[GW] WARNING: BFF_INTERNAL_SECRET using dev default — never deploy this');
    return 'dev-shared-secret-change-me';
  }
  return v;
})(),
```
Mirror in `banking_api_server/routes/agentIdToken.js`.

Additionally: `agentIdToken.js:25` reads the secret at module-load and never re-reads — if configStore-driven hot-reload is ever introduced, this stale-secret pattern needs to migrate to `configStore.getEffective`.

---

### BL-04: `rejectUnauthorized: false` on the BFF→gateway health probe that determines audience selection

**File:** `banking_api_server/services/agentMcpTokenService.js:1519`

**Issue:** `_resolveFinalMcpAudience` probes `${MCP_GATEWAY_HTTP_URL}/health` with `rejectUnauthorized: false`. The probe response (`devBypass: true/false`) **directly controls** which audience is requested in Exchange #2 (`mcpServerAud` vs `gatewayAud` — line 1533). An on-path attacker who can intercept this TLS connection can flip the audience selection by returning `{devBypass: true}` and cause the BFF to mint an MCP-server-audience token even when the gateway is in production mode. That token can then be replayed against the MCP server directly.

This is the *opposite* of fail-closed: a TLS MITM unilaterally downgrades the deployment from gateway-fronted to direct-to-MCP.

**Fix:** Honor TLS verification:
```javascript
const req = httpModule.get(`${baseUrl}/health`, { /* no rejectUnauthorized */ }, (res) => {
  // ...
});
```
If self-signed certs are needed for local dev, gate the relaxation on `NODE_ENV !== 'production'`:
```javascript
const isLocal = baseUrl.includes('localhost') || baseUrl.includes('api.ping.demo');
const opts = isLocal && process.env.NODE_ENV !== 'production'
  ? { rejectUnauthorized: false }
  : {};
const req = httpModule.get(`${baseUrl}/health`, opts, (res) => { ... });
```
Better: ship the gateway's `mkcert` CA to the BFF process or use the system trust store.

---

## HIGH

### HI-01: Introspection cache is hashed over the raw token but failure-mode cache TTL is 5 s for negative results — positive results are cached 30 s with no revocation hook

**File:** `banking_mcp_gateway/src/auth/GatewayIntrospectionClient.ts:30-93`

**Issue:** 30-second positive cache means a revoked token continues to work for up to 30 s after the AS marks it inactive. For a banking demo this is acceptable; for a real deployment that supports administrative session termination, this is a 30-second compromise window. There is no listener for PingOne back-channel logout or revocation events.

**Fix (minimum):** Reduce positive TTL to 5 s for production and document the trade-off, OR add a no-cache code path for write-scoped tool calls (`banking:write`, `banking:transfer`).
```typescript
const CACHE_TTL_MS = process.env.NODE_ENV === 'production' ? 5_000 : 30_000;
```
Document in `bff-sessions` skill that the gateway's introspection cache is the residual revocation window.

---

### HI-02: `validateInboundToken` decodes JWT without signature verification — the gateway trusts unsigned tokens

**File:** `banking_mcp_gateway/src/tokenValidator.ts:41-47`

**Issue:** The comment says "Signature verification is done by PingOne at token-exchange time; the GW trusts the act chain already established." This is only sound if the **caller** has been authenticated some other way. For HTTP `POST /mcp`, introspection (HI-01 caveat aside) is the substitute. For the **WebSocket transport** (BL-02), introspection is skipped, so an attacker who forges a JWT with the right `aud` and a far-future `exp` is accepted with no signature check at all.

The README comment hints at an env var `PINGONE_JWKS_ENDPOINT` for local verification but there's no code path that wires it up.

**Fix:** When `PINGONE_JWKS_ENDPOINT` is set, run `jsonwebtoken.verify()` against PingOne JWKS in `validateInboundToken`. Cache JWKS keys for 1 h. Even with introspection in place, signature verification at the gateway is a cheap second line of defense against a token leak from PingOne's introspection cache (in case PingOne ever returns active=true erroneously for a malformed token). Required if BL-02 is not fixed.

---

### HI-03: `agentIdToken.js` enumerates every session per gateway call (algorithmic concern with security impact)

**File:** `banking_api_server/routes/agentIdToken.js:62-74`

**Issue:** The route calls `sessionStore.all(...)` and linearly scans every session looking for `oauthTokens.subjectSub === sub`. The code itself acknowledges this is O(n_sessions) and "deferred — out of scope for Phase 266." Two problems beyond performance:

1. The gateway controls `x-subject-sub` — i.e., the gateway tells the BFF *which user's id_token to return*. The validation comment says this is identified "via x-subject-sub from the validated MCP token," but the BFF blindly trusts whatever sub the gateway puts in the header. A compromised gateway can pull any user's id_token by iterating sub values.
2. With many sessions and a small set of valid subs, an attacker who has obtained the shared secret can scrape every id_token in the store by enumerating subs (subs are PingOne UUIDs but commonly leak via other channels — JWT claims in upstream logs, error messages, etc.).

Defense in depth: the shared secret IS the trust boundary. But "the gateway can fetch any user's id_token" is a meaningful escalation path.

**Fix:**
- Add a freshness check: only return an `idToken` if the matched session was last-touched within N minutes (5 mins for write flows, 1 hour for read).
- Log every id_token retrieval to app events with `{ requesterIp, sub, sessionId, toolName? }`. The gateway should pass the tool name via header so the BFF can correlate.
- Long-term: replace session scan with a sub-indexed lookup.

---

### HI-04: Gateway `index.ts` `tools/list` aggregator can hide upstream failures and inject demo tools after a partial backend outage

**File:** `banking_mcp_gateway/src/index.ts:240-273`

**Issue:** `Promise.allSettled` followed by ignoring `rejected` results means a customer sees a partial tools list when one backend is down — without any signal. Worse, the `gatewayTools` array (`special_offers`, `user_profile_card`) is appended **unconditionally**, even when both backends are unreachable. A caller could see *only* the gateway-owned demo tools and conclude that's the full menu, leading to inadvertent actions.

Also a correctness drift risk: `gatewayTools` lives inline in `index.ts` while `toolScopes.ts` is the canonical scope/disposition source. If a new gateway-terminating tool is added, the two files can diverge silently.

**Fix:**
- Return a `_meta` warning when any backend `proxyToolsList` rejected: `_meta: { partialResults: true, failedBackends: ['invest'] }`.
- Move the gateway-tool descriptors into `toolScopes.ts` (or a dedicated `gatewayTools.ts`) alongside their scope/disposition declaration so route + scope + tool def live together.

---

### HI-05: `index.ts` dual_token flow logs handshake-phase token events with hard-coded "ok" status before the upstream call resolves

**File:** `banking_mcp_gateway/src/index.ts:481-530`

**Issue:** The `tokenEvents` array embedded into the `_meta` of the dual_token response declares every event `status: 'ok'` **statically, before** the upstream call (`identityResp`) returns. If the resource server returns 401 or 412, the response handler short-circuits with `jsonRpcError` (lines 458-468), but a parallel happy-path response — were the upstream to fail mid-stream or the body to be partial — would still claim each prior step succeeded. This is observability fraud at the UI layer (Token Chain).

Lower-stakes than the BLOCK items, but the Token Chain is what users *trust* to understand what happened. Mis-reporting `status: ok` for "RFC 8693 token exchange" when the upstream subsequently rejected the token undermines the demo's pedagogical purpose.

**Fix:** Build `tokenEvents` incrementally as each step completes, not statically as a closing flourish. Mirror the BFF-side pattern in `agentMcpTokenService.js` where each event is `acquiring` → `active`/`failed`.

---

### HI-06: Token-exchange caches in `tokenExchange.ts` and `McpTokenExchangeClient.ts` are unbounded in-memory `Map`s

**Files:** `banking_mcp_gateway/src/tokenExchange.ts:15-21`, `banking_mcp_gateway/src/auth/McpTokenExchangeClient.ts:27-31`

**Issue:** Both caches grow without bound — there's no eviction beyond TTL-on-read. Under load (many distinct user tokens × many distinct audiences) memory grows monotonically until the next process restart. A motivated attacker could DOS the gateway by issuing many distinct tokens (or by pushing through one-token-per-request after a key rotation). Also: there are *two parallel cache implementations* (one in each file) with subtly different hash slicing (16 chars in both — fine — but the duplication invites drift).

**Fix:**
- Consolidate to one cache module (`banking_mcp_gateway/src/auth/tokenExchangeCache.ts`) used by both files.
- Add max-size bound with LRU eviction (e.g., 1000 entries).
- Add periodic sweep for expired entries (every 60 s).

---

### HI-07: WebSocket connection has no origin / authentication beyond bearer; no message-size limit

**File:** `banking_mcp_gateway/src/index.ts:645-666`

**Issue:** `wss.on('connection')` accepts a bearer token from the `Authorization` header on the upgrade request, but:
1. There's no Origin check at upgrade time (the HTTP path validates Origin against `MCP_ACCEPTED_ORIGINS` but the WS upgrade doesn't go through `validateCors`).
2. `ws.on('message', (raw) => handleMessage(raw.toString()))` accepts unbounded message size. A 100 MB JSON-RPC payload will hang Node parsing it.
3. Reconnect-with-stale-token: the `token` is captured in the upgrade closure and reused for every subsequent message on the connection. If the underlying access token is revoked mid-connection (introspection cache aside), the WS keeps working until the connection drops or `exp` is hit. (BL-02 / HI-01 also touch this.)

**Fix:**
```typescript
const wss = new WebSocket.Server({
  server: httpServer,
  maxPayload: 1024 * 1024, // 1 MB cap
  verifyClient: ({ origin, req }, cb) => {
    if (origin && !acceptedOriginsRe.test(origin)) return cb(false, 403, 'Origin not permitted');
    cb(true);
  },
});
```
Plus: re-introspect on every `tools/call` (matches what the HTTP middleware does) so revocation propagates.

---

### HI-08: Gateway dev bypass: inbound bearer forwarded unchanged to upstream — only acceptable in non-production

**File:** `banking_mcp_gateway/src/middleware/authorizeMcpRequest.ts:82-86`

**Issue:** When `MCP_GW_DEV_BYPASS=true` (set via `config.devBypass`), the middleware logs and forwards the **inbound user token** as the upstream token. If this token's `aud` does not include the upstream MCP server's audience, the upstream will reject it. But if the upstream is *also* in a permissive mode (e.g., dev RS skipping aud check), this bypass leaks the user token to the MCP server unchanged — a violation of CLAUDE.md's "Token custody rule" and D-04.

Combined with BL-01 (`/admin/config` lets anyone set `devBypass: true`), this is the BLOCK-level escalation: unauthenticated `/admin/config` POST → `devBypass=true` → user tokens flow unexchanged to wherever `mcpOlbWsUrl` points. Treating this as HIGH because BL-01 is the active vector; HI-08 is the consequence.

**Fix:**
- Refuse to start with `devBypass=true` when `NODE_ENV === 'production'` (in `loadConfig`).
- Even in dev, replace the inbound bearer with a synthetic dummy token, never forward the real one — bypass should mean "no policy", not "no token swap."

---

### HI-09: PingAuthorize policy decisions don't carry policy version / decision ID — replay potential

**File:** `banking_mcp_gateway/src/auth/PingOneAuthorizeClient.ts:76-94`

**Issue:** A `PERMIT` outcome is taken at face value with no `policy_version`, `decision_id`, or signed envelope. If the decision endpoint is ever proxied or cached, a stale `PERMIT` could be replayed. Less concerning since `axios.post` with `timeout: 5000` and no client-side cache means the BFF asks PingAuthorize fresh on every call — but the PingAuthorize **server** may have its own caching that's not visible here.

**Fix:** Log `response.data.decision_id` + `policy_version` (if present) into `auditTrail.authorize` for forensics. Pull `traceId` from PingAuthorize response and propagate to upstream so end-to-end correlation works.

---

## MEDIUM

### ME-01: `index.ts` is 678 lines of monolith — split

**File:** `banking_mcp_gateway/src/index.ts`

The `handleMessage` function is ~417 lines (lines 204-620) and handles parsing, validation, HITL, three different credential dispositions, and two transport modes (HTTP vs WebSocket-proxy). Hard to reason about which exit path matches which input, and the WebSocket handler in this file duplicates HTTP-middleware logic (BL-02).

**Fix:** Extract:
- `dispatchToolsCall.ts` — owns the disposition-router + per-disposition handlers
- `dispatchToolsList.ts` — backend aggregation
- The WS-specific glue stays in `index.ts` but should call into the same shared pipeline as `authorizeMcpRequest`

---

### ME-02: `agentMcpTokenService.js` is 1916 lines with multiple co-located concerns

**File:** `banking_api_server/services/agentMcpTokenService.js`

The file owns: scope policy, mayAct describe, token-event building, JWKS verify, exchange logic (single + dual mode + 2-exchange delegation), refresh flow, gateway-health probe, error mapping. The 2-exchange code (lines 1550-1845) is its own coherent flow that could live in `twoExchangeDelegation.js`. The `mapErrorToStructuredResponse` (1878-1914) does keyword-matching on free-text error messages — brittle (e.g., the substring `scope` matches both `invalid_scope` and benign error messages mentioning "scope").

**Fix:** Extract `services/twoExchangeDelegation.js`, `utils/tokenEventBuilder.js`, and `utils/oauthErrorMapper.js`. The error mapping should switch on `err.pingoneError` (the structured field) rather than substring-match `err.message`.

---

### ME-03: `index.ts` debug logging is excessive at INFO level

**File:** `banking_api_server/services/agentMcpTokenService.js:615-640`, multiple `console.log` statements

11+ `console.log('[AGENT_MCP] ...')` statements that fire on every MCP tool call. None of them leak tokens (good — they log "PRESENT"/"MISSING" booleans), but they're noisy and indistinguishable from intentional audit logs. The file has `errorLog`/`warnLog`/`debugLog` helpers but bypasses them for these chatty logs.

**Fix:** Replace all `[AGENT_MCP]` `console.log` calls with `debugLog(...)` so they respect `DEBUG_AGENT_MCP=true`.

---

### ME-04: `dispositionForBackend` decision derives from tool name alone — no signature integrity

**File:** `banking_mcp_gateway/src/router.ts:62-69`, called from `index.ts:352`

The disposition (oauth_bearer vs api_key vs dual_token) is selected purely by tool name from the inbound JSON-RPC body. The bearer's `scope` claim is verified separately, but if a user holds `banking:read` and `banking:mortgage:read`, they can name-spoof — i.e., send `tools/call` with `name: 'special_offers'` even if they meant to call `get_my_accounts`, and the gateway swaps to the API key path. Probably benign (the agent picked the tool intentionally), but the disposition decision is not signed/sealed anywhere.

For the demo this is fine. Production: the agent's calling client should be allowed to call a specific *set* of dispositions, not all of them.

**Fix (defer):** Tie dispositions to scopes in `toolScopes.ts` so the gateway can refuse `tools/call name=special_offers` from a client that doesn't hold `banking:mortgage:read`. Already partly done — extend.

---

### ME-05: `_bypassCache` is process-global state with no invalidation hook

**File:** `banking_api_server/services/agentMcpTokenService.js:1486-1547`

Module-level `let _bypassCache = null` caches the gateway's devBypass state for 30 s. If the gateway flips `devBypass` via `/admin/config` (BL-01), the BFF won't notice for up to 30 s and will continue requesting the wrong audience.

**Fix:** Either accept the 30-s window as documented, or expose an admin route on the BFF that lets ops invalidate `_bypassCache` immediately.

---

## LOW

### LO-01: `as any` cast in `index.ts:127,157,249`

`(config as any)[key] = updates[key as string]` (line 127), `authzDecision = await authorizeClient.evaluate(decoded, method, toolName, toolArgs as any)` (line 157), `(r.value as any)?.result?.tools` (line 249). All three drop type safety at security-sensitive boundaries. Replace with proper types or runtime validation.

### LO-02: Magic numbers scattered through gateway

- `BYPASS_CACHE_TTL_MS = 30_000` (agentMcpTokenService.js:1487)
- `CACHE_TTL_MS = 30_000` (GatewayIntrospectionClient.ts:31)
- `expires_in ?? 300` (McpTokenExchangeClient.ts:91, tokenExchange.ts:58)
- `HANDSHAKE_TIMEOUT_MS = 10_000` (proxy.ts:15)

Hoist to a shared `constants.ts` so operators don't need to grep five files.

### LO-03: Status code semantics mixed in authorizeMcpRequest.ts

Line 165: `const statusCode = authzDecision.decision === 'INDETERMINATE' ? 403 : 403;` — ternary with identical branches. Either intentional placeholder for future 428/451 distinction or dead. Resolve.

### LO-04: `extractBearerToken` accepts case-insensitive scheme but not multi-space

`tokenValidator.ts:65-70`: splits on single space. A header `Authorization: Bearer  <token>` (two spaces, common from broken clients) yields three parts and rejects. Use `authHeader.match(/^Bearer\s+(.+)$/i)`.

### LO-05: Commented "act expression on Super Banking MCP Server resource server" guidance in error messages

`agentMcpTokenService.js:1826-1827` embeds tutorial-style prose in production error messages ("Check that act.sub on the Agent Exchanged Token matches AGENT_OAUTH_CLIENT_ID and that the act expression on Super Banking MCP Server resource server is correct"). Fine for a demo, but trims belong in a separate `remediation` field rather than the user-facing `message`.

---

## Cross-file call-chain verification

I traced the path the prompt asked about:

1. **agent → BFF `bffAxios`** → BFF session has user `accessToken`.
2. **`agentMcpTokenService.resolveMcpAccessTokenWithEvents(req, tool)`** — runs introspection, runs scope policy, performs RFC 8693 exchange. Either single-exchange or 2-exchange depending on `req.session.mcpExchangeMode`. Outcome: an MCP-audience token with `act.client_id = exchanger`.
3. **Transport choice** by the BFF:
   - Direct WS path → `mcpWebSocketClient.mcpRpc` opens fresh WS to `MCP_SERVER_URL` (defaults `ws://localhost:8080`) — **bypasses gateway entirely** when `MCP_GATEWAY_HTTP_URL` is unset. The BFF must ensure the issued token's `aud` matches the MCP server.
   - Via gateway → BFF speaks HTTP `POST /mcp` to gateway → `GatewayServer.handleMcpPost` → `authorizeMcpRequest` → `forwardToUpstream`. The exchange happens *twice* (once in BFF, once in gateway), and the gateway's exchange uses **gateway client credentials** as the actor — which means the act chain at the upstream MCP server reads `act.client_id = mcp-gateway-client` (the *gateway's* client) with the BFF's exchange not preserved as a nested layer. This is correct per draft-ietf-oauth-identity-chaining but worth noting in skill docs because the Token Chain UI may need to reflect both hops.
4. **PingAuthorize evaluation** happens on the gateway side per `authorizeMcpRequest` (HTTP) or per `guardToolCall` (WS) — BL-02 is the inconsistency.
5. **HITL** is enforced in `index.ts:298-313` (WS path) and re-checked on retry via `_hitl_challenge_id`. The HTTP POST /mcp path does not have HITL today; `authorizeMcpRequest` only emits `hitl_required` when PingAuthorize returns INDETERMINATE but does **not** create a challenge in HITL service. This is a transport-asymmetry consequence of BL-02 — the WS path actively calls `createHitlChallenge`, HTTP path does not.

**Subject/actor swap risk:** verified clean. In every exchange call (`oauthService.performTokenExchangeAs` and `McpTokenExchangeClient.exchange`), `subject_token` is the user/inbound token and `actor_token` is the gateway/agent CC token. No swap.

**Audience binding:** verified correct. `credentialSwap.ts` uses `bankingResourceServerResourceUri` for Phase 266 paths; `McpTokenExchangeClient.exchange` uses `backendResourceUri(routeTool(toolName))`. Both narrow to the correct downstream audience.

**Token leak surface scan:** no raw JWTs are written to stdout, files, or response bodies in any reviewed file. `writeMcpTrafficEntry` payloads carry decoded claims (`jwtFullDecode`) but never the raw token string — confirmed by tracing every call site. `scrubRawJwts` is JWE-aware (commit 38167dab) and is the canonical fallback; gateway responses do NOT pass through it, but they also don't construct raw-JWT-bearing responses — the only place that could is the dual_token branch where `credential.idToken` is in the request body, not the response. Acceptable.

---

_Reviewed: 2026-05-12_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
