# Debug: Agent on /marketing — Signed In But No OAuth Tokens

**Status:** ROOT CAUSE FOUND  
**Slug:** agent-cookie-stub-tokens  
**Date:** 2026-04-19  

## Symptoms

- **Expected:** User signed in via PingOne → Banking Agent on `/marketing` can use MCP tools and NL banking execution.
- **Actual:** Browser shows user as signed in (name/avatar visible), but agent returns `session_restore_required` or `oauth_session_required` on `/init` or `/message`.
- **Error codes:** `session_restore_required` (401) from `agentSessionMiddleware.js:64-76`
- **Timeline:** Happens after session expires in Redis while `_auth` cookie remains valid, or after a session save failure during OAuth callback.

## Root Cause

**Cookie-only session with stub tokens — not a Redis-down scenario.**

The `_auth` signed cookie persists user identity across serverless cold starts (Vercel/local restarts). When the Redis/Upstash session row is missing (TTL expired, evicted, or never saved), the `restoreSessionFromCookie` middleware (`authStateCookie.js:172`) rebuilds `req.session.user` from the cookie but sets:

```js
req.session.oauthTokens = { accessToken: '_cookie_session', tokenType: 'Bearer', ... }
```

This stub is intentional — it lets `/status` endpoints report "signed in" and lets NL routes provide role context, but it is **not a real OAuth token**. The `agentSessionMiddleware` correctly rejects it at line 64:

```js
if (req.session.oauthTokens.accessToken === '_cookie_session') { return res.status(401)... }
```

### Why `sessionStoreHealthy` can be `true` simultaneously

The Upstash health ping checks whether the REST endpoint responds (`PING` → `PONG`). It does **not** check whether a specific session ID has a row. So:

- `sessionStoreHealthy: true` → Upstash is reachable
- `accessTokenStub: true` → This session's row is missing or was never written
- `redisKeyPresent: false` (with `?deep=1`) → Confirms no row for this `connect.sid`

### Scenarios that produce this state

| # | Scenario | `_auth` cookie | Redis row | Stub? |
|---|----------|---------------|-----------|-------|
| 1 | Session TTL expired in Redis | Valid (24h+) | Gone | Yes |
| 2 | `session.save()` failed in OAuth callback | Set (before save) | Never written | Yes |
| 3 | Serverless cold start + circuit breaker open | Valid | Exists but unreadable | Yes (until circuit closes) |
| 4 | `session.regenerate()` changed sid | Valid (old sid baked in cookie) | Exists under new sid | Yes |

**Scenario 1** is the most common in local dev (server restart clears MemoryStore).  
**Scenario 2** is logged as `[oauth/user/callback] Session save FAILED`.  
**Scenario 4** should not happen — `setAuthCookie` is called AFTER `regenerate` + `save`.

## Diagnosis Steps

1. **Open session debug** — visit `/api/auth/debug?deep=1`
2. Check:
   - `accessTokenStub: true` → confirms stub
   - `sessionStoreHealthy: true` → Upstash is fine (not a Redis-down issue)
   - `redisPersist.redisKeyPresent: false` → no session row for this sid
   - `diagnosisHints` array — look for "Redis has no session row for this connect.sid"
3. **Compare** `sessionId` (first 8 chars) with server logs for `[oauth/user/callback] Session saved OK sid=`

## Fix (User Action)

1. **Sign out completely** (clears `_auth` cookie + `connect.sid`)
2. **Sign in again** via PingOne → writes fresh tokens into Redis session
3. If it recurs immediately after login, check server logs for:
   ```
   [oauth/user/callback] Session save FAILED
   ```
   which indicates Upstash write failure (check `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`).

## Potential Code Improvements (Not Yet Implemented)

1. **Agent UI: detect stub and prompt re-login** — When `/init` returns `session_restore_required`, show a "Sign in again" button instead of generic error. Currently the agent shows "You need an active server session" which doesn't distinguish from "never logged in".

2. **Auto-refresh from cookie → re-auth** — If cookie-restore detects stub AND the session has a refresh token in Redis (via deep probe), attempt a silent token refresh. Current Upstash re-fetch (`server.js:534-554`) already attempts this but only works if the Redis row exists under the same sid.

3. **_auth cookie TTL alignment** — Shorten `_auth` cookie maxAge to match Redis session TTL so cookie expiration ≈ session expiration. Currently the cookie can outlive the Redis row.

## Evidence

- `authStateCookie.js:172-213` — `restoreSessionFromCookie` creates stub
- `server.js:534-554` — Upstash re-fetch middleware (best-effort recovery)
- `agentSessionMiddleware.js:63-76` — Rejects `_cookie_session` stub
- `oauthUser.js:524-533` — Session save with error handling + abort
- `server.js:800-930` — `/api/auth/debug` endpoint with `?deep=1` probe
