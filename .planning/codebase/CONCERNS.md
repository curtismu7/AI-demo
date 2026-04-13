# Concerns — BX Finance Banking Demo

*Last updated: April 2026 (Phase 140)*

Known technical debt, architectural gotchas, and things to be careful about.

---

## 1. `_cookie_session` Stub Pattern (HIGH PRIORITY)

**File**: `banking_api_server/middleware/auth.js` (~lines 572–596), `server.js` (~lines 646–696)

**What it is**: When Upstash KV is down or a Vercel cold-start serves a request before the session is hydrated, `req.session.userTokens.accessToken` is set to the literal string `'_cookie_session'` as a stub, derived from the `_auth` httpOnly cookie.

**Why it matters**: This stub allows the UI to show as "logged in" without a real access token. Any route that calls PingOne APIs with a `_cookie_session` stub will fail or — worse — proceed with stale identity.

**Mitigation in place**: `bffSessionGating.js` checks for `_cookie_session` and blocks sensitive endpoints (transactions, transfers, MFA) returning `403 Session degraded`.

**Watch for**: New routes that call PingOne APIs must also check `bffSessionGating` or explicitly handle `_cookie_session`.

---

## 2. Placeholder IDs in `agentTokenService.js`

**File**: `banking_api_server/services/agentTokenService.js` (lines 55–56)

**What it is**:
```js
actorId: 'placeholder-actor-id',
subject: 'placeholder-user-id',
```

**Why it matters**: RFC 8693 Token Exchange requires real actor + subject IDs. These placeholders are used in development when the full CIBA/on-behalf flow is not available. In production, these should be derived from the actual session.

**Action needed**: Replace with real values sourced from `req.session.userTokens` before enabling agent token exchange in production.

---

## 3. In-Memory API Call Tracker

**File**: `banking_api_server/services/apiCallTrackerService.js`

**What it is**: Tracks PingOne API calls per `sessionId` in an in-memory Map. Powers the `ApiCallDisplay` panel in the UI.

**Why it matters**: Lost on every restart or Vercel cold-start. Multi-instance Vercel deployments have separate memory — request to instance A won't see calls tracked on instance B.

**Current behavior**: Expected data loss on restart; the tracker resets silently. Not persisted to Upstash or SQLite.

**If persistence needed**: Migrate `apiCallTrackerService.js` to use Upstash (similar pattern to `upstashSessionStore.js`).

---

## 4. Very Large Files

| File | ~Lines | Concern |
|------|--------|---------|
| `banking_api_ui/src/components/PingOneTestPage.jsx` | ~1,700 | Monolithic component with inline sub-sections and local state. Hard to test individual sections. |
| `banking_api_server/server.js` | ~1,500 | All middleware and route mounts in one file. Works fine; hard to navigate. |
| `banking_api_ui/src/components/MFATestPage.jsx` | ~1,200+ | Similar to PingOneTestPage — inline test sections. |

**Action**: No immediate refactor needed for demo purposes. If adding more sections, consider splitting page components into a directory with sub-files.

---

## 5. Mixed JS/TypeScript

**What it is**: Frontend is ~95% `.js`/`.jsx` but 4+ `.tsx` components (compiled by CRA). MCP server is fully TypeScript. Server is fully JS.

**Why it matters**: No strict TypeScript checking enforced across the codebase. The `.tsx` files use `any` in some places. Type errors in `.tsx` files might be warnings only, not blockers on `npm run build` (depends on `tsconfig.json` strictness).

**Convention**: New React components should prefer `.js` unless you need TypeScript-specific features (generics, complex interfaces). Don't mix paradigms within a single feature.

---

## 6. configStore Drift

**File**: `banking_api_server/services/configStore.js`

**What it is**: `configStore` uses SQLite (`banking_config.db`) as a writable config store layered over environment variables. `getEffective()` merges env vars + DB config (DB wins).

**Drift risk**: If the Vercel `DATABASE_URL` is absent, configStore falls back to a local file. In multi-instance Vercel, each instance has its own SQLite file — config changes on one instance don't propagate to others.

**Mitigation**: Critical config (PingOne IDs, client secrets) should be in env vars (Vercel project settings), not only in configStore DB. SQLite is for runtime-adjustable non-secret settings.

---

## 7. Vercel Multi-Instance Session Consistency

**Relevant files**: `upstashSessionStore.js`, `authStateCookie.js`, `pkceStateCookie.js`

**What it is**: Vercel serverless can spin multiple instances. Express-session needs a shared store — Upstash REST is the primary. If Upstash is unavailable, there is no fallback shared store (Redis TCP requires a persistent connection).

**Failure chain**:
1. Upstash down → session falls back to memory store (per-instance, not shared)
2. Next request hits different Vercel instance → session not found
3. `auth.js` reads `_auth` cookie → restores stub session (`_cookie_session`)
4. Sensitive calls blocked by `bffSessionGating`

**Action**: Monitor Upstash availability. For production, ensure `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are set.

---

## 8. PKCE State Cookie vs Upstash Race

**File**: `banking_api_server/services/pkceStateCookie.js`

**What it is**: PKCE state (`code_verifier`, `state`, `nonce`) is stored in both an httpOnly cookie AND Upstash (for cross-instance recovery). The callback tries cookie first, then Upstash.

**Concern**: If neither is available, `invalid_state` error is returned. This is handled gracefully, but users will be forced to re-login.

---

## 9. Demo Data is Non-Persistent

**File**: `banking_api_server/data/store.js`

**What it is**: All accounts, transactions, and user data is in-memory, seeded at startup from a JSON fixture or the `DemoDataPage` reset endpoint.

**Concern**: Every restart resets demo data. Not an issue for demos; would be a serious issue if treated as a real banking backend.

---

## 10. Jest CI Flakiness with Socket Tests

**Config**: `jest.config.js` sets `maxWorkers: 2` when `CI=true`.

**Root cause**: Supertest opens real TCP sockets; parallel Jest workers can exhaust ports or interfere with each other.

**Mitigation**: `maxWorkers: 2` reduces concurrency. If flakiness persists, run with `--runInBand` (single-threaded) for auth/socket suites.
