---
service: banking_agent_service
reviewed: 2026-05-12T00:00:00Z
depth: standard
files_reviewed: 7
files_reviewed_list:
  - banking_agent_service/src/index.ts
  - banking_agent_service/src/config.ts
  - banking_agent_service/src/agentOrchestrator.ts
  - banking_agent_service/src/agentIdentity.ts
  - banking_agent_service/src/tokenResolver.ts
  - banking_agent_service/src/mcpGatewayClient.ts
  - banking_agent_service/src/promptStore.ts
findings:
  block: 2
  high: 5
  medium: 6
  low: 5
  total: 18
status: issues_found
---

# banking_agent_service — Code Review

**Reviewed:** 2026-05-12
**Depth:** standard (per-file)
**Status:** issues_found

## Summary

The service is small and reasonably structured, but several token-handling and lifecycle issues need attention before this can sit on the user-token path. The most serious are (a) the MCP gateway client never surfaces socket-level errors after `connect()` resolves, so pending requests hang until the 30s timeout, and (b) the token-exchange cache key uses a truncated SHA-256 prefix of the user token, which is collision-prone and weakens cache isolation across users. Several `any` casts erase MCP typing, and the actor-token cache races on parallel cold-start calls.

---

## BLOCK

### BL-01: MCP WebSocket errors after `open` are swallowed; pending requests hang

**File:** `banking_agent_service/src/mcpGatewayClient.ts:55, 69-85, 121-135`
**Issue:** `this.ws.on('error', reject)` is only meaningful before `resolve()` fires. After initialization, socket-level errors and `close` events are not handled. If the gateway drops the WS (auth failure post-handshake, network blip, server restart), every pending `_request()` waits the full 30 s timeout, and the orchestrator's tool loop pegs for `MAX_TOOL_ITERATIONS × 30 s` before reporting failure. Worse, `requireBearerToken` already accepted the request, so the user sees a hung response.
**Fix:**
```ts
this.ws.on('close', () => this._failAllPending(new Error('mcp_ws_closed')));
this.ws.on('error', (err) => {
  if (!this.initialized) return reject(err);
  this._failAllPending(err);
});
// where:
private _failAllPending(err: Error) {
  for (const [, cb] of this.pending) cb({ error: { code: -32099, message: err.message } });
  this.pending.clear();
}
```
Also reject `_request` immediately when `this.ws.readyState !== OPEN`.

### BL-02: Token-exchange cache key truncates SHA-256 to 16 hex chars (64 bits)

**File:** `banking_agent_service/src/tokenResolver.ts:82-93`
**Issue:** `tokenHash()` returns the first 16 hex chars (64 bits) of SHA-256(userAccessToken). Two distinct user access tokens whose hashes collide in those 64 bits will share a cached GW-scoped token — one user could receive another user's delegated token from the cache. While 64-bit collisions are statistically rare at this scale, this is a token-isolation primitive and must not be probabilistic. Additionally, the truncation provides no security benefit (the hash already isn't reversible at full length).
**Fix:** Use the full hex digest as the key prefix:
```ts
function tokenHash(t: string): string {
  return createHash('sha256').update(t).digest('hex'); // full 64 chars
}
```
Memory cost is negligible (a few hundred bytes per cache entry).

---

## HIGH

### HI-01: Actor-token cache has a race on cold start

**File:** `banking_agent_service/src/agentIdentity.ts:21-32`
**Issue:** `getActorToken` is not guarded against concurrent callers. On cold start, N concurrent `/api/agent/task` calls all observe `_cachedActorToken === null`, each fires a `client_credentials` request to PingOne, and the last writer wins. PingOne will throttle / rate-limit, and demos will see intermittent 429s under load.
**Fix:** Memoize the in-flight promise:
```ts
let _inflight: Promise<string> | null = null;
export async function getActorToken(config: AgentConfig): Promise<string> {
  if (_cachedActorToken && _cachedActorToken.expiresAt > Date.now() + 10_000) return _cachedActorToken.token;
  if (_inflight) return _inflight;
  _inflight = (config.usePkiCreds ? _acquireViaPrivateKeyJwt(config) : _acquireViaClientSecret(config))
    .finally(() => { _inflight = null; });
  return _inflight;
}
```
Same fix applies to `resolveGatewayToken` for the per-user key.

### HI-02: `connect()` Promise can resolve twice / leaks on error after open

**File:** `banking_agent_service/src/mcpGatewayClient.ts:49-87`
**Issue:** If the WebSocket emits `error` *before* the `init` response arrives but *after* `open`, `reject` may be called after `resolve` (the listener stays attached). Conversely, if the server never responds to `initialize`, the promise never settles — no connect timeout exists. Combined with BL-01, `mcpClient.connect()` in `index.ts:78` can hang indefinitely.
**Fix:** Add a connect-timeout (e.g., 10 s) and use a `settled` flag:
```ts
let settled = false;
const safeResolve = () => { if (!settled) { settled = true; resolve(); } };
const safeReject = (e: Error) => { if (!settled) { settled = true; reject(e); } };
const connectTimer = setTimeout(() => safeReject(new Error('mcp_connect_timeout')), 10_000);
// clear in safeResolve/safeReject
```

### HI-03: Bearer token logged via stack trace on axios error

**File:** `banking_agent_service/src/tokenResolver.ts:109-115`, `agentIdentity.ts:41-47, 88-91`
**Issue:** Neither call wraps the `axios.post` in a try/catch that scrubs the request body. When PingOne returns 4xx/5xx, axios's `Error` includes `err.config.data` (the URL-encoded body containing `subject_token=<full JWT>` and `actor_token=<full JWT>`). The error then bubbles to `index.ts:71, 83` where `console.error('[Agent] Token exchange failed:', msg)` prints `err.message` — which is fine for `Error` objects, but if anyone later changes that to `err` or `err.stack`, raw JWTs hit stdout. There is no defensive scrubber.
**Fix:** Catch axios errors and re-throw a sanitized error:
```ts
try {
  const response = await axios.post(...);
  ...
} catch (e: any) {
  const status = e?.response?.status;
  const detail = e?.response?.data?.error || e?.message;
  throw new Error(`token_exchange_failed status=${status} ${detail}`);
}
```
Also: at minimum add an explicit comment that future logging changes must redact `err.config?.data`.

### HI-04: `subject_token` is accepted as an opaque string with no shape validation

**File:** `banking_agent_service/src/index.ts:43-52, 58-74`; `tokenResolver.ts:86-122`
**Issue:** `requireBearerToken` only checks the header shape, then forwards `parts[1]` verbatim to PingOne as `subject_token`. There is no JWT structural check (three base64 segments), no expiry pre-check, and no audience verification. A caller can submit any string — including a malformed value or a token issued for an unrelated resource — and trigger a PingOne token-exchange request. This is both a DoS vector (free RFC 8693 calls against your tenant) and a latent debug-leak risk (long random strings end up in PingOne audit logs).
**Fix:** Before calling `resolveGatewayToken`, verify the JWT is well-formed (`split('.').length === 3`), base64-decode the payload, check `exp > now`, and optionally verify `iss` matches `PINGONE_ENVIRONMENT_ID`. Reject with 401 otherwise. This is a cheap local check and avoids one PingOne round trip on bad input.

### HI-05: No scope/audience validation on the returned gateway token

**File:** `banking_agent_service/src/tokenResolver.ts:117-121`
**Issue:** After the RFC 8693 exchange the code accepts whatever `access_token` PingOne returns and forwards it to the gateway. It does not decode the JWT and verify that `aud` equals `config.mcpGatewayResourceUri`, nor that the `act.sub` matches `config.clientId`. If PingOne policy is misconfigured and returns a token with a broader audience or no `act` claim, the agent will happily forward it. Per the project's `oauth-pingone` skill and REGRESSION_PLAN §1, "MCP token must be aud-narrowed."
**Fix:** Decode `access_token` (no signature verify needed — PingOne issued it to us seconds ago) and assert:
```ts
const payload = JSON.parse(Buffer.from(access_token.split('.')[1], 'base64url').toString());
if (payload.aud !== config.mcpGatewayResourceUri && !payload.aud?.includes(config.mcpGatewayResourceUri)) {
  throw new Error(`token_exchange returned wrong aud: ${payload.aud}`);
}
if (payload.act?.sub !== config.clientId) {
  console.warn('[Agent] Gateway token missing expected act.sub — delegation chain broken');
}
```

---

## MEDIUM

### ME-01: `config` declared without a type and used with `!` non-null assertion eight times

**File:** `banking_agent_service/src/index.ts:28-34, 68, 76, 79, 102-107`
**Issue:** `let config;` (no type, implicit `any`) defeats `tsconfig.strict`. Then every use is `config!.xxx`, which is a code smell admitting the type system can't prove non-null.
**Fix:** `let config: AgentConfig | undefined;` then narrow once and use a typed local: `const cfg = config; if (!cfg) process.exit(1);`. Or move the `loadConfig()` call into a top-level `function main()` so `config` is a `const AgentConfig` in scope.

### ME-02: WebSocket `wss://` not used; no TLS for MCP gateway

**File:** `banking_agent_service/src/config.ts:57`; `mcpGatewayClient.ts:51-53`
**Issue:** Default `MCP_GATEWAY_WS_URL=ws://localhost:3005` — fine for local dev, but the bearer token is sent in a header over plain WS. Nothing in `loadConfig()` warns if the URL is `ws://` in production (no `NODE_ENV` check, no scheme assertion).
**Fix:** In `loadConfig()`, when `process.env.NODE_ENV === 'production'` and `mcpGatewayWsUrl.startsWith('ws://')`, throw. Or at minimum `console.warn` at startup in `index.ts:105`.

### ME-03: Untyped `any[]` content blocks in Anthropic loop

**File:** `banking_agent_service/src/agentOrchestrator.ts:148, 158, 172, 182`
**Issue:** `(content as any[]).find((b: any) => …)` and `result.content.map((c: any) => …)` erase the Anthropic SDK and MCP `ToolResult` types. A type already exists for the MCP side (`ToolResult.content`).
**Fix:** Define `type AnthropicContentBlock = { type: 'text'; text: string } | { type: 'tool_use'; id: string; name: string; input: unknown };` and type the array.

### ME-04: `messages: unknown[]` then pushed without type discrimination

**File:** `banking_agent_service/src/agentOrchestrator.ts:121, 154, 177, 209, 228`
**Issue:** `unknown[]` is functionally the same as `any[]` here — every push is a different object shape with no discriminated union. Refactor pays for itself the next time the Anthropic/OpenAI message schema changes (and it has, repeatedly).
**Fix:** Define `type AnthropicMessage = { role: 'user' | 'assistant'; content: string | AnthropicContentBlock[] };` and use it.

### ME-05: `MAX_TOOL_ITERATIONS = 10` and tool-call timeout = 30 s are magic numbers

**File:** `banking_agent_service/src/agentOrchestrator.ts:46`; `mcpGatewayClient.ts:127`; `agentIdentity.ts:24, 52, 96`; `tokenResolver.ts:54, 120`
**Issue:** Hardcoded across multiple files. The 10 s "buffer before expiry" appears in two different forms (`+ 10_000` ms in `agentIdentity.ts:24`, `bufferMs = 5_000` in `tokenResolver.ts:52`) — they should agree.
**Fix:** Add a `constants.ts`:
```ts
export const MAX_TOOL_ITERATIONS = 10;
export const MCP_REQUEST_TIMEOUT_MS = 30_000;
export const MCP_CONNECT_TIMEOUT_MS = 10_000;
export const TOKEN_EXPIRY_BUFFER_MS = 10_000;
export const DEFAULT_TOKEN_TTL_S = 300;
```
Also align the two buffer values.

### ME-06: `promptStore` reads files synchronously at request time

**File:** `banking_agent_service/src/promptStore.ts:22-40`
**Issue:** `readFileSync` and `existsSync` block the event loop on every cache miss. For a "default" use case that exists, the cost is one-time, but a request with `useCase=foo` (no `foo.json`) does *two* synchronous file existence checks then falls back. Across many concurrent requests with novel use-case strings, this serializes the worker.
**Fix:** Either (a) eagerly load all `prompts/*.json` at startup in an init function and look up from the map only, or (b) move to `fs.promises.readFile` with async caching.

---

## LOW

### LO-01: `process.on('SIGINT'/'SIGTERM', () => process.exit(0))` skips graceful shutdown

**File:** `banking_agent_service/src/index.ts:109-110`
**Issue:** No `app.close()`, no `_cache.destroy()` (which `tokenResolver.ts:74` provides for exactly this reason). In-flight requests are dropped mid-flight.
**Fix:** `const server = app.listen(...); process.on('SIGTERM', () => server.close(() => process.exit(0)));` and call `_cache.destroy()` + `clearActorTokenCache()`.

### LO-02: `(req as any).userToken` instead of typed Express augmentation

**File:** `banking_agent_service/src/index.ts:50, 65`
**Issue:** `any` cast on `req` is a recurring antipattern. The project already uses ambient `declare module 'express-serve-static-core'` elsewhere.
**Fix:** `declare module 'express-serve-static-core' { interface Request { userToken?: string } }` in a `types/express.d.ts`.

### LO-03: Random JTI uses `Math.random()`, not crypto

**File:** `banking_agent_service/src/agentIdentity.ts:72`
**Issue:** `Math.random().toString(36).slice(2)` is not cryptographically random. JTI doesn't *strictly* need crypto randomness (it's a replay-protection nonce on a 5-minute window), but PingOne docs recommend it.
**Fix:** `import { randomUUID } from 'crypto'; jti: randomUUID()`.

### LO-04: `'claude-sonnet-4.6'` model literal in two places

**File:** `banking_agent_service/src/config.ts:61`; `agentOrchestrator.ts:129`
**Issue:** Default model name duplicated. If the config default is changed, the orchestrator fallback silently disagrees.
**Fix:** Drop the `|| 'claude-sonnet-4.6'` in `agentOrchestrator.ts:129` — `config.llmModel` is always set by `loadConfig()`.

### LO-05: `console.warn` for tool-arg parse failure has no correlation ID

**File:** `banking_agent_service/src/agentOrchestrator.ts:242`
**Issue:** When the LLM returns malformed JSON for `function.arguments`, the warn line gives no way to correlate to a request, user, or session. Not actionable in prod logs.
**Fix:** Plumb a `requestId` through `runAgentTask` (generate one in `index.ts` per request) and include it in every log line.

---

_Reviewed: 2026-05-12_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
