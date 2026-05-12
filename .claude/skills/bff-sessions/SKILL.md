---
name: bff-sessions
description: 'Session, cookie, and token-custody patterns for the Super Banking BFF (banking_api_server). USE FOR: express-session middleware, connect.sid cookie, sessionStore registration order, app.set("sessionStore"), req.session.save() before redirect, SQLite-then-memory store priority, session persistence after OAuth callback, 401 loops, REAUTH_KEY guard, status endpoint expiresAt check, bffSessionGating, /internal/id-token session lookup by sub, demoScenarioStore, faultTolerantStore patterns, scrubbing tokens from logs, bffAxios cookie-only calls from the SPA, trust proxy = 1, secure/sameSite cookie attributes by environment, SKIP_TOKEN_SIGNATURE_VALIDATION fatal-in-prod, security headers + CSP, PKCE state cookie fallback (pkceStateCookie.js, authStateCookie.js). DO NOT USE FOR: PingOne OAuth flow itself (use oauth-pingone); HITL/consent challenge state (use hitl-consent); MCP token exchange (use oauth-pingone for the RFC 8693 details).'
argument-hint: 'Describe the session, cookie, or BFF token-custody question'
---

# BFF Sessions & Token Custody — Super Banking demo

> **Emoji rule:** only `⚠️`, `✅`, `❌` allowed anywhere in this repo (skills, code, UI, docs). No other emojis. See `regression-guard` skill for the project-wide rule.
>
> **Default host:** `api.ping.demo` is the canonical local development host — BFF on `https://api.ping.demo:3001`, UI on `https://api.ping.demo:4000`, HTTPS via `mkcert`. Users can override via the `/setup` page (which writes the configStore) or by setting `CORS_ORIGIN` / `PUBLIC_APP_URL` / `REACT_APP_CLIENT_URL` in their `.env`. Skills, docs, and code examples use `api.ping.demo` unless they're explaining the override mechanism. Don't hardcode `localhost:3001` / `localhost:4000` in routes or callbacks — read the configured host (REGRESSION_PLAN §1 "OAuth redirect origin").

## The custody rule (read first)

**Tokens never reach the browser.** The BFF (`banking_api_server`) is the sole custodian of OAuth access tokens, refresh tokens, and id tokens. The React SPA holds **only** an httpOnly `connect.sid` cookie. Every BFF call from the SPA goes through `banking_api_ui/src/services/bffAxios.js` (cookie-based, no `Authorization` header from the browser).

If you find yourself about to:
- Send a token to the SPA in a JSON response → **stop**. Store it on `req.session.*` and return only what the UI needs.
- Read a token from `localStorage` / `sessionStorage` in the SPA → **stop**. The SPA should never see one.
- Import plain `axios` in a component → use `bffAxios` instead.

REGRESSION_PLAN §1 has multiple entries on what happens when this is violated.

---

## Session store priority

From `banking_api_server/server.js` (the session-store block at lines 43–62). The store is selected at startup, once, in this order:

1. **SQLite** — primary. `data/sessions.db`. `services/sqliteSessionStore.js`. Driver priority: `better-sqlite3` → `node:sqlite`. Sessions persist across server restarts.
2. **Memory** — last-resort fallback if SQLite init fails. Process-local; never acceptable in production. Server still starts but logs `[session-store] SQLite store init failed, falling back to memory store: <reason>`.

On a healthy boot, the startup log shows `[session-store] Using SQLite store for local development — sessions persist across restarts`. Grep `/tmp/bank-api-server.log` for `[session-store]` to confirm which tier is actually running.

> Earlier deployments to Vercel used Upstash REST KV / TCP Redis tiers. Vercel was removed in 2026; the Redis-tier code and `services/upstashSessionStore.js` no longer exist. If you need a multi-process/cross-host session store later (e.g., for HA), reintroduce a tier above SQLite — don't try to make SQLite work across hosts.

### Things to keep right

- `services/sqliteSessionStore.js` must call `cb(err)` on every operation. Forgetting it hangs the request; symptom is "all `/api/*` calls return 401 forever even right after a successful login." (REGRESSION_PLAN §1.)
- `SESSION_SECRET` must be set in production. `server.js:337` calls `process.exit(1)` when it's missing or set to the insecure dev default and `NODE_ENV=production` / `REPL_ID` / `REPLIT_DEPLOYMENT` is set.
- Rotating `SESSION_SECRET` invalidates every existing session and may break encrypted runtime config (`config.db`). Coordinate the rotation, don't do it casually.

---

## sessionStore registration order — Phase 266 contract

`server.js` has a specific ordering requirement around `app.set('sessionStore', sessionStore)`:

1. `app = express()` is created.
2. Session middleware is configured (with the store from the priority list above).
3. `app.set('sessionStore', sessionStore)` is called — **guarded** by `if (sessionStore)` so a memory-fallback install never registers a null.

This is registered so internal routes like `/internal/id-token` can look up sessions by subject `sub` (Phase 266). A null registration causes those routes to throw; a missing registration causes them to return 503 (which is the deliberate graceful degradation).

A recent regression (`452729ca fix(266): move sessionStore registration after app = express()`) was exactly this: the `app.set` line ran before `app` existed and the server crashed at boot. Watch for it.

---

## Session-write timing — `req.session.save()`

`express-session` writes asynchronously on response end. Two flows in this repo cannot wait for that default behavior and must call `req.session.save(cb)` explicitly:

- **OAuth callback** (`routes/oauth.js`, `routes/oauthUser.js`): after the token exchange completes, set `req.session.oauthTokens`, `req.session.user`, etc., then call `req.session.save()` **before** issuing the redirect to the SPA. Without it, the SPA loads with no session and immediately bounces back to login. REGRESSION_PLAN §1 "Session persistence."
- **Role switch / re-auth** (`POST /api/auth/switch` and similar): the redirect cannot lose the new session state.

If you see a "login works then immediately logs out" symptom, the `save()` callback is the first place to check.

---

## Status endpoints and the expiry trap

`/api/auth/oauth/status` and `/api/auth/oauth/user/status` are read by the SPA to decide whether to render the dashboard or redirect to login. Both must check `expiresAt` before answering `authenticated: true`. Returning `authenticated: true` for an expired token sends the dashboard into a loop: it tries to call `/api/accounts/my`, that returns 401, the dashboard refreshes, status still says authenticated, repeat forever.

REGRESSION_PLAN §1 "Status endpoint token expiry" — never remove the `expiresAt` check.

---

## REAUTH_KEY — the re-auth loop guard

`UserDashboard.js` uses a `REAUTH_KEY` in storage to prevent an infinite "401 → redirect to login → callback → 401" loop. The contract:

- Set the key when initiating a re-auth.
- Clear it **only** in the success path of `fetchUserData` — after data actually loaded.
- **Never** clear it on the `oauth=success` URL param. The URL param is set by the callback before the SPA has even hydrated; clearing on it re-arms the loop instantly.

REGRESSION_PLAN §1 "REAUTH_KEY re-auth guard."

---

## Session shape (what's actually stored)

These are the fields BFF code reads from `req.session`. Treat the list as canonical when adding state — if you can avoid adding a new field, do.

| Field | Set by | Purpose |
|---|---|---|
| `req.session.user` | OAuth callback | `{ id, username, role, oauthId, firstName, lastName }` — derived from id_token + profile |
| `req.session.oauthTokens` | OAuth callback | `{ accessToken, refreshToken, idToken, expiresAt }` — **never** echoed to the SPA |
| `req.session.clientType` / `oauthType` | OAuth callback | Distinguish admin vs customer flows |
| `req.session.txConsentChallenges` | `services/transactionConsentChallenge.js` | Pending/confirmed HITL challenges keyed by id — see hitl-consent skill |
| `req.session.mcpAgentToken` | `services/agentMcpTokenService.js` | RFC 8693 exchanged token + `tokenEvents` for the Token Chain UI |
| `req.session.cookie.*` | express-session | `httpOnly: true`, `sameSite: 'lax'`, `secure: isProduction` |

When adding state, prefer the existing fields. New top-level keys multiply the session payload across every request.

---

## `connect.sid` cookie

Set by `express-session` with these attributes — they matter:

- `httpOnly: true` — SPA cannot read the cookie value (good, that's the whole point).
- `sameSite: 'lax'` — works for the OAuth redirect-back flow and same-site fetches.
- `secure: isProduction` — required for `sameSite=none` if you ever change it; required by browsers in cross-site contexts.
- Default `maxAge` / `expires` is unset → session cookie that dies on browser close. If the demo needs longer-lived sessions, that's an explicit decision, not a silent change.

Don't add `Authorization` headers in `bffAxios` to "make it work." If the cookie isn't reaching the BFF, fix the proxy (`setupProxy.js`) or CORS, not the auth header.

---

## Test patterns: regression vs integration

The repo has a deliberate two-tier convention for critical session/auth routes (see CLAUDE.md). When you add tests in this space:

- `*.regression.test.js` — mock `configStore`, `auth` middleware, and `store`. Fast, isolated, asserts logic.
- `*.integration.test.js` — **real** `configStore` (reads `.env`), mocks only data/external. Asserts route + service behavior under real flags like `ff_hitl_enabled`.

Critical pair to run after touching session/OAuth code:
```bash
npx jest oauthStatus.regression oauthStatus.integration hitlRoute.regression hitlRoute.integration
```
Should be 43 tests, all green.

---

## Scrubbing tokens from logs

The BFF logs requests via `morgan` plus targeted `console.log` calls. The repo has scrubbers (added during Phase 266 code review: `38167dab fix(266): code review — timing-safe secret, JWE-aware scrubber, scrub accounts/transactions, bffAxios`). When adding logs:

- Never log `req.session.oauthTokens.accessToken` directly. If you must log token shape for debugging, log only `expiresAt` and the issuer/aud claim — never the JWT itself.
- The scrubber is JWE-aware — encrypted tokens look distinct from JWS but they're still secrets.
- The same scrubber covers account numbers and transaction amounts; don't reintroduce raw bodies into stdout.

---

## bffAxios — the SPA side

`banking_api_ui/src/services/bffAxios.js` is the single axios instance the SPA uses. It is configured with `withCredentials: true` so the `connect.sid` cookie rides along. **Import this instead of plain `axios`** — every component that hits the BFF, every hook, every effect.

If you're tempted to `import axios from 'axios'` in a UI file, ask why. The exception is calling third-party endpoints directly from the SPA (which should be vanishingly rare in this repo — almost everything goes through the BFF).

---

## Failure modes you'll actually see

| Symptom | Most likely cause |
|---|---|
| "Login works, immediately logged out on redirect" | OAuth callback missing `req.session.save()` before redirect |
| "401 loop on dashboard load" | Status endpoint not checking `expiresAt` |
| "Infinite PingOne redirect" | `REAUTH_KEY` cleared on `oauth=success` URL param |
| "All API calls 401 after restart" | SQLite init failed and memory fallback engaged (sessions don't survive restart); or `SESSION_SECRET` rotated and old cookies can't decrypt |
| "/internal/id-token returns 503" | `sessionStore` not registered on `app` (Phase 266 guard) — usually because `app.set` ran before `app = express()` |
| "Session writes succeed but cookie not on next request" | `sameSite`/`secure` mismatch, or CORS_ORIGIN missing → cookie blocked by browser |
| "Secure cookie not set / always logged out behind nginx/Cloudflare" | `trust proxy` missing — `req.secure` is `false` without it, so `secure: true` cookies refuse to set |
| "Server exits immediately at startup" | `SKIP_TOKEN_SIGNATURE_VALIDATION=true` while `NODE_ENV=production` — `server.js:37` calls `process.exit(1)` deliberately |

---

## Production hardening — host-agnostic patterns

These apply on any production host. The **default canonical host** for local development is `api.ping.demo` (HTTPS via `mkcert`, ports 3001/4000) — users can override via the `/setup` page or by editing the relevant env vars, but skills/docs/examples should use `api.ping.demo` as the example unless explaining the override mechanism itself. Patterns below also apply to Replit and container deploys behind a reverse proxy.

### `trust proxy = 1`

Any TLS-terminating proxy (Cloudflare, nginx, Replit's edge) sets `x-forwarded-proto`. Without `app.set('trust proxy', 1)`, `req.secure` is `false` and `cookie.secure: true` refuses to set the session cookie. Already set in `server.js:233` — don't remove it.

### Cookie attributes by environment

```javascript
cookie: {
  secure:   isProduction,                       // true on HTTPS hosts
  httpOnly: true,                               // always
  sameSite: isProduction ? 'none' : 'lax',      // 'none' needed when PingOne redirects from a different origin
  maxAge:   24 * 60 * 60 * 1000,
}
```

`sameSite: 'none'` requires `secure: true` — modern browsers reject the combination otherwise. Don't lower `secure` to work around a development glitch; fix the dev environment instead.

### HTTPS 301 enforcement

```javascript
if (isReplit /* or similar TLS-terminated host */) {
  app.use((req, res, next) => {
    if (req.secure) return next();
    return res.redirect(301, `https://${req.headers.host}${req.originalUrl}`);
  });
}
```

Belt + suspenders — even with HSTS, a legacy `http://` link gets coerced to TLS before any session data is read. Local `api.ping.demo` runs HTTPS via `mkcert`, so this branch is mostly dormant locally.

### `SKIP_TOKEN_SIGNATURE_VALIDATION` is fatal in production

`server.js:37` checks:

```javascript
if (process.env.SKIP_TOKEN_SIGNATURE_VALIDATION === 'true' && isProduction) {
  console.error('[FATAL] SKIP_TOKEN_SIGNATURE_VALIDATION=true is not allowed in production. Remove this env var before deploying.');
  process.exit(1);
}
```

Useful for local debugging only. **Never** ship with this set. If a deploy keeps exiting at startup, this is the first thing to check.

### Security headers + CSP

Helmet in Express sets:

```
X-Content-Type-Options:     nosniff
X-Frame-Options:            DENY
Referrer-Policy:            strict-origin-when-cross-origin
Permissions-Policy:         camera=(), microphone=(), geolocation=()
Strict-Transport-Security:  max-age=63072000; includeSubDomains; preload
Content-Security-Policy:    default-src 'self'; connect-src 'self' https://*.pingone.com wss:; ...
Cache-Control:              no-store  (on /api/* only)
```

Don't loosen the CSP without careful review. PingOne assets (fonts, styles) and `wss:` for the MCP socket are already explicitly allowed. Widening to `'unsafe-inline'` or `*` re-opens whole vulnerability classes.

### PKCE / state cookie fallback

Even with Redis, a signed PKCE cookie covers the rare case where the OAuth callback lands on a process that hasn't yet read the freshly-written session state. Source: `services/pkceStateCookie.js`, `services/authStateCookie.js`.

```javascript
// On login: write to BOTH session AND signed cookie
setPkceCookie(res, { state, codeVerifier, redirectUri, nonce }, isProd());

// On callback: prefer session, fall back to cookie
const pkceData = req.session.oauthState === state
  ? { codeVerifier: req.session.oauthCodeVerifier, ... }
  : readPkceCookie(req);   // validates HMAC signature automatically
```

If you add a new OAuth flow, copy the dual-write pattern. Session-only state is fragile across any process boundary.

---

## When to read which skill

- PingOne OAuth flow itself (PKCE, callback, scopes) → `oauth-pingone`
- RFC 8693 token exchange and `agentMcpTokenService` details → `oauth-pingone` plus `mcp-server`
- HITL transaction consent state in `req.session.txConsentChallenges` → `hitl-consent`
- TS/JS style → `typescript-banking`
- Pre-edit / §1 / §4 / pre-deploy discipline → `regression-guard`
