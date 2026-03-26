# Session regression — how to test and what to check

This runbook complements automated tests (`npm run test:session` in `banking_api_server`) and Playwright API smoke (`session-regression.spec.js`).

## Automated (run locally or in CI)

From the repo root (or `cd banking_api_server` first):

```bash
npm run test:session
```

Covers: `authSession` (including BFF store ping contract), `authStateCookie`, `bffSessionGating`, `upstashSessionStore`, `session-store-resilience`, `oauth-e2e-integration`.

Full API suite:

```bash
cd banking_api_server && npm test -- --forceExit
```

## API smoke (server must be running)

Session-only (faster than full API Playwright suite):

```bash
cd banking_api_ui && BANKING_API_BASE=http://127.0.0.1:3001 npm run test:e2e:session
```

Full Playwright API config (includes `session-regression.spec.js` and other API specs):

```bash
cd banking_api_ui && BANKING_API_BASE=http://127.0.0.1:3001 npm run test:e2e:api
```

Adjust `BANKING_API_BASE` to your API port.

## After production or preview deploy (manual)

1. Sign in with PingOne (customer or admin).
2. Open **`/api/auth/debug?deep=1`** in a new tab (same origin as the app).
3. Confirm:
   - **`accessTokenStub: false`** when you expect a real OAuth session (if `true`, MCP/NL will not work; see `REGRESSION_LOG.md`).
   - **`sessionStoreHealthy: true`** when using Upstash (if `false`, check `sessionStoreError` and Vercel env for `KV_REST_*`).
   - With **`?deep=1`**, **`redisPersist.redisKeyPresent`** should be **`true`** after a successful login that persisted the session (if `false`, the `connect.sid` row is missing in Redis — sign out and sign in again).

## What tests cannot catch

- Redis `SET` failures that still call `session.save` success (store swallows errors) — rely on logs (`[session-store] Upstash SET error`) and the debug endpoint.
