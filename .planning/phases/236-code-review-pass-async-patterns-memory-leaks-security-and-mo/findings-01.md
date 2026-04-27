# Findings — Batch 01: High-Priority Services

## Batch 01 — Part 1: appEventService.js and tokenIntrospectionService.js

| Severity | Category | File:Line | Issue | Fix Snippet |
|----------|----------|-----------|-------|-------------|
| Major | Memory | `services/tokenIntrospectionService.js:108` | `introspectionCache` Map grows unbounded. Expired entries are never pruned: `getCacheStats()` reads stale entry counts but nothing calls `introspectionCache.delete()`. Under high traffic with many unique tokens the Map fills for the process lifetime. The middleware's separate `introspectionCache` instance does prune at size > 1000 — but this service's cache has no pruning at all. | After each `introspectionCache.set(...)` sweep stale entries: `for (const [k,v] of introspectionCache) { if (Date.now() >= v.expiresAt) introspectionCache.delete(k); }` |
| Major | Security | `services/tokenIntrospectionService.js:39` | Guard `if (!token)` catches falsy values but not a non-string (object, array) passed as `token`. `hashToken` would call `crypto.createHash(...).update(token)` with a non-string, throwing a runtime TypeError rather than returning `{ valid: false }`. | Replace with `if (typeof token !== 'string' \|\| !token.trim()) return { valid: false };` |
| Minor | Maintainability | `services/tokenIntrospectionService.js:120` | `logAppEvent` is called with a raw string category `'introspection'` rather than the `EVENT_CATEGORIES.INTROSPECTION` constant. `EVENT_CATEGORIES` is not imported here. A typo silently produces uncategorised events. | Import `{ EVENT_CATEGORIES }` from `appEventService` and use `EVENT_CATEGORIES.INTROSPECTION`. |
| Minor | Async | `services/tokenIntrospectionService.js:120` | `logAppEvent(...)` return value is discarded and called without `await`. Currently acceptable because `logEvent` is synchronous. If it ever becomes async this silently becomes a floating promise. | Annotate: `/* synchronous — no await needed */` to make intent explicit. |
| Minor | Modern JS | `services/tokenIntrospectionService.js:100-105` | The cache duration if/if block can be simplified to a single `Math.min` expression. | `const cacheDuration = result.exp ? Math.min(CACHE_TTL_MS, Math.max(0, result.exp * 1000 - Date.now())) : CACHE_TTL_MS;` |

### Acceptance criteria — Part 1

- **appEventService.js — Memory (ring buffer):** CLEAN. Eviction confirmed at lines 91–93: `if (events.length > MAX_EVENTS) { events.shift(); }` runs synchronously after every push, capping the buffer at MAX_EVENTS.
- **appEventService.js — Async:** CLEAN. No async calls; `fs.appendFileSync` is intentional. No floating promises.
- **appEventService.js — Security:** CLEAN. No token values or secrets in log output. The `metadata` JSDoc comment explicitly notes `(no secrets)`.
- **appEventService.js — Modern JS:** CLEAN. Consistent `const`/`let`, no `var`.
- **appEventService.js — Maintainability:** CLEAN. `logEvent` is 28 lines and single-purpose; `MAX_EVENTS = 200` is a named constant.
- **tokenIntrospectionService.js — Cache unbounded growth:** FLAGGED as Major. No pruning sweep exists on write or on any timer.

---

## Batch 01 — Part 2: Middleware and Authorization Services

| Severity | Category | File:Line | Issue | Fix Snippet |
|----------|----------|-----------|-------|-------------|
| Critical | Security | `middleware/tokenIntrospection.js:24` | Cache key is `token.substring(0, 20)` — the first 20 characters of the raw bearer token. Two different tokens sharing a 20-char prefix collide on the same cache entry, returning another user's introspection result. This is a security boundary failure that could allow an active session to be falsely validated. | Replace with `require('crypto').createHash('sha256').update(token).digest('hex')` as used in `tokenIntrospectionService.js`. |
| Major | Security | `middleware/tokenIntrospection.js:34-35` | Client credentials fall back across two env var pairs: `PINGONE_CLIENT_ID \|\| ADMIN_CLIENT_ID` and `PINGONE_CLIENT_SECRET \|\| ADMIN_CLIENT_SECRET`. A lower-privilege `ADMIN_CLIENT_ID` may be silently substituted in environments where the primary var is absent. Also inconsistent with `tokenIntrospectionService.js` which uses `PINGONE_WORKER_CLIENT_ID` — the two caches may represent different principals and produce conflicting results if both are active. | Consolidate to `PINGONE_WORKER_CLIENT_ID` / `PINGONE_WORKER_CLIENT_SECRET` and remove the fallback. |
| Major | Memory | `middleware/tokenIntrospection.js:73-79` | Cache eviction sweep only triggers when `introspectionCache.size > 1000`. Below that threshold expired entries accumulate indefinitely. Above it, the full Map is iterated on every request — O(n) on the hot path. | Move eviction to a dedicated `setInterval` running every 60 s rather than inline on the request path. |
| Major | Security | `services/transactionAuthorizationService.js:65` | `amount` is passed from caller to policy engines without numeric validation in this service. Negative amounts, NaN, and Infinity all pass through. The `type` guard (line 93) is correct. | Add `if (!Number.isFinite(amount) \|\| amount < 0) return { ran: false, reason: 'invalid_amount' };` before the try block. |
| Minor | Maintainability | `middleware/tokenIntrospection.js:15-16` | Duplicate cache: this file has its own `introspectionCache` (60 s TTL) separate from `tokenIntrospectionService.js` (30 s TTL). Two caches mean a revoked token could be active in one and expired in the other, and `clearCache()` / `clearIntrospectionCache()` only clears one. | Consolidate: have this middleware delegate to `tokenIntrospectionService.validateToken()` and remove its local cache and `introspectToken()` function. |
| Minor | Maintainability | `middleware/tokenIntrospection.js:23-89` | `introspectToken()` is 67 lines mixing credential resolution, cache read, HTTP call, and eviction. Each concern should be its own small function. |  |
| Minor | Maintainability | `middleware/tokenIntrospection.js:84` | `logger.error(...)` / `logger.debug(...)` style (object with methods) conflicts with `tokenIntrospectionService.js` calling `logger(LOG_CATEGORIES.AUTH, ...)` as a plain function. Both import from `'../utils/logger'`. One shape is wrong — `logger.error` may be `undefined`. | Audit `utils/logger` exports and align all callers to the same invocation shape. |
| Minor | Async | `middleware/tokenIntrospection.js:153-157` | The fail-open path calls bare `next()` with no argument, silently allowing a request that failed introspection. Acceptable per the env-var design, but no marker is attached to `req` so downstream handlers cannot observe it. | Add `req.introspectionFailedOpen = true;` before `next()` so downstream middleware can log or audit the gap. |
| Minor | Maintainability | `services/transactionAuthorizationService.js:100-183` | Simulated and PingOne branches duplicate the step-up/deny/permit response construction logic. Identical patterns repeated for both engines (lines 109-141 and 152-182). | Extract `buildPolicyResult(r, { useSimulated, policyId, runtimeSettings })` factory. |
| Minor | Maintainability | `services/transactionAuthorizationService.js:73-83` | Magic config key strings (`'authorize_enabled'`, `'ff_authorize_deposits'`, etc.) used inline without local named constants. A typo returns `undefined` silently. | Extract to named `const` at top of function. |
| Minor | Async | `services/transactionAuthorizationService.js:184-189` | The catch block returns error objects to callers with no server-side trace log. An unexpected error in the policy engine leaves no observable signal. | Add a `logAppEvent(...)` or `logger(...)` call inside the catch block. |
| Minor | Security | `services/mcpToolAuthorizationService.js:67` | `tool` (tool name string) is forwarded to downstream policy engines and appears in `console.warn` log messages without allowlist validation at this service boundary. Callers may pass arbitrary strings. | Add `const KNOWN_TOOLS = [...]; if (!KNOWN_TOOLS.includes(tool)) return { ran: false, reason: 'unknown_tool' };` |
| Minor | Maintainability | `services/mcpToolAuthorizationService.js:185` | `console.warn(...)` used here (and at line 269 for the fail-open path) rather than the structured `logAppEvent` / `logger` pattern. These bypass the activity log ring buffer and are invisible to the admin UI. | Replace both `console.warn` calls with `logAppEvent(EVENT_CATEGORIES.MCP, EVENT_SEVERITIES.WARNING, '...', { tag: '...' })`. |
| Minor | Maintainability | `services/mcpToolAuthorizationService.js:67-274` | `evaluateMcpFirstToolGate` is 208 lines handling flag/session/role checks, JWT decoding, and three decision branches. | Extract `buildMcpBlockResponse(type, engine, decisionId)` factory and separate simulated vs live branches into sub-functions. |

### Acceptance criteria — Part 2

- **middleware/tokenIntrospection.js — all Express code paths call next() or send response:** CONFIRMED CLEAN. Full trace: (1) no auth header → `return next()` line 102; (2) inactive token → `return next(new Error(...))` line 119; (3) success → `next()` line 141; (4) catch with failOpen → `next()` line 157; (5) catch no failOpen → `next(error)` line 159. No hanging paths.
- **Raw token/secret in log output:** Raw token NOT logged anywhere in these files. Token prefix used as cache key in middleware (line 24) is not logged but IS a security flaw (flagged Critical above).
- **Unvalidated input as object key or external call:** `tool` name forwarded to policy engines without allowlist (Minor). `amount` forwarded without numeric validation (Major).
- **transactionAuthorizationService.js — amount validation:** FLAGGED Major.
- **mcpToolAuthorizationService.js — tool name allowlist:** FLAGGED Minor.
