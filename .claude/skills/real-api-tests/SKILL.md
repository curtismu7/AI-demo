---
name: real-api-tests
description: >
  Guide for writing and debugging the real HTTP test suite in demo_api_server/tests/real/.
  USE THIS SKILL whenever: adding a new test file to tests/real/, a real-call test is failing
  (session expired, fixture missing, HITL threshold mismatch, vertical switch bleed), deciding
  which helpers to use (createBffClient vs adminClient, resetSuite vs resetDemo, setVertical),
  migrating a mocked src/__tests__ file to a real-call counterpart, or debugging why a suite
  is being skipped. Also use when someone asks "how do I write a real integration test" or
  "why is my real test failing" in this repo.
  DO NOT USE FOR: mocked unit tests in src/__tests__/, OAuth/MCP flows (use oauth-pingone /
  mcp-server skills), adding a new vertical (use add-vertical skill).
---

# Real API Test Suite

Tests in `tests/real/` drive live HTTP calls through the running BFF at `https://api.ping.demo:3001`.
They complement — not replace — the mocked `src/__tests__/` suite: both must stay green.

## Running the suite

```bash
# Requires: BFF running, valid session (login once in the browser first)
RUN_REAL_TESTS=true npx jest --config=jest.real.config.js           # full suite
npm run test:real                                                    # same via script
npm run test:real:smoke                                             # health only
npm run test:real:banking                                           # one vertical
```

Scripts defined in `demo_api_server/package.json`. The suite uses `runInBand: true` because
vertical switches (`PUT /api/config/vertical`) are server-wide state — parallel workers would
interleave vertical contexts.

---

## Architecture

```
Test process
  → axios (https://api.ping.demo:3001, mkcert self-signed TLS)
      → BFF Express (real auth, real configStore, real session)
          → PingOne (token validation, token exchange)
          → data/store (real in-memory store + SQLite)
          → demo_mcp_server (mcp.test.js only)
```

---

## Helper API

All helpers live in `tests/real/helpers/`. Import only what you need.

### `bffClient.js`

```js
const { createBffClient, setVertical, restoreVertical, loadFixtures } = require('../helpers/bffClient');

const client = createBffClient('enduser');   // default persona
const admin  = createBffClient('admin');
```

`createBffClient(persona)` reads `.test-session.json` (written by globalSetup) and returns an
axios instance with the correct `Cookie` header. `validateStatus: () => true` — all responses
come through, never throws on 4xx/5xx.

`setVertical(client, verticalId)` — `PUT /api/config/vertical`, pushes previous onto a stack.
`restoreVertical(client)` — pops the stack and restores. Always call in matched `afterAll`.

`loadFixtures()` — reads `.test-fixtures.json`, returns `VERTICAL_FIXTURES` keyed by vertical.

### `fixtures.js`

```js
const { VERTICAL_FIXTURES, CHECKING_BALANCE, SAVINGS_BALANCE } = require('../helpers/fixtures');
const FX = VERTICAL_FIXTURES['banking'];   // { chk, sav, userId }
```

`CHECKING_BALANCE = 10_000`, `SAVINGS_BALANCE = 5_000`. These are the known starting balances
after a `resetSuite`. Never hardcode these numbers in tests — reference the constants.

Account IDs follow the pattern `chk-test-real-{vertical}` / `sav-test-real-{vertical}`.
All accounts belong to `userId: 'test-real-suite'`, isolated from demo user data.

### `reset.js`

```js
const { resetDemo, resetSuite } = require('../helpers/reset');

await resetSuite(adminClient, 'banking');   // POST /api/admin/reset-demo + restoreBalances
await resetDemo(adminClient);               // POST /api/admin/reset-demo only
```

`resetSuite` is the right call for write suites (transfers, HITL). It resets the entire demo
store **and** restores fixture account balances to their starting values. Use it in `beforeAll`.

For suites that do per-test mutations (e.g., transfer tests where each test changes the balance),
also call `restoreBalances(adminClient, verticalId)` in `afterEach`.

### `suiteSetup.js` — `skipIfNoSession`

`suiteSetup.js` registers `skipIfNoSession` as a global. Call it at the top of every `beforeAll`:

```js
beforeAll(async () => {
  skipIfNoSession();          // skips the suite (not fail) if no session
  skipIfNoSession('admin');   // for suites that need admin persona
  client = createBffClient('enduser');
});
```

When there is no valid session the suite emits a `test.skip` and exits cleanly — CI won't show
a failure, just a skip. This is intentional: the real suite requires a live BFF and login.

---

## Writing a new test file

### Read-only vertical test (e.g., `retail/accounts.test.js`)

```js
'use strict';
const { createBffClient, setVertical, restoreVertical } = require('../helpers/bffClient');
const { VERTICAL_FIXTURES }                              = require('../helpers/fixtures');

const VERTICAL = 'retail';
const FX       = VERTICAL_FIXTURES[VERTICAL];

describe(`Accounts — ${VERTICAL} vertical (real)`, () => {
  let client;

  beforeAll(async () => {
    skipIfNoSession();
    client = createBffClient('enduser');
    await setVertical(client, VERTICAL);
  });

  afterAll(async () => {
    await restoreVertical(client);
  });

  it('returns 200 with accounts array', async () => {
    const r = await client.get('/api/accounts/my');
    expect(r.status).toBe(200);
    expect(Array.isArray(r.data)).toBe(true);
  });
});
```

**`banking/` is the default vertical** — skip the `setVertical`/`restoreVertical` pair there.
Every other vertical must switch in `beforeAll` and restore in `afterAll`.

### Write suite (transfers, HITL) — needs reset

```js
'use strict';
const { createBffClient, setVertical, restoreVertical } = require('../helpers/bffClient');
const { VERTICAL_FIXTURES, CHECKING_BALANCE }           = require('../helpers/fixtures');
const { restoreBalances }                               = require('../helpers/fixtures');
const { resetSuite }                                    = require('../helpers/reset');

const VERTICAL = 'banking';
const FX       = VERTICAL_FIXTURES[VERTICAL];

describe(`Transfers — ${VERTICAL} vertical (real)`, () => {
  let client;
  let adminClient;

  beforeAll(async () => {
    skipIfNoSession();
    client      = createBffClient('enduser');
    adminClient = createBffClient('admin');
    await resetSuite(adminClient, VERTICAL);
  });

  afterEach(async () => {
    // restore balances between tests so each test starts from a known state
    await restoreBalances(adminClient, VERTICAL);
  });

  it('transfer between accounts reduces source balance', async () => {
    const r = await client.post('/api/transactions', {
      type: 'transfer',
      fromAccountId: FX.chk,
      toAccountId:   FX.sav,
      amount:        100,
    });
    expect(r.status).toBe(200);
    const bal = await client.get(`/api/accounts/${FX.chk}/balance`);
    expect(bal.data.balance).toBe(CHECKING_BALANCE - 100);
  });
});
```

### Admin persona test

```js
beforeAll(async () => {
  skipIfNoSession('admin');
  adminClient = createBffClient('admin');
});
```

Admin routes require a session from a PingOne user with admin scope. The `admin` persona is
bootstrapped by `globalSetup` using `PINGONE_TEST_ADMIN_USER` / `PINGONE_TEST_ADMIN_PASSWORD`.

---

## Debugging failures

### Suite skipped unexpectedly

Symptom: `test.skip` fires, suite shows 0 tests run.

1. Check `.test-session.json` in `demo_api_server/`:
   ```bash
   cat demo_api_server/.test-session.json
   ```
   If it says `{ "enduser": "skip" }` or missing persona → no valid session was found.
2. Log in via the browser at `https://api.ping.demo:4000`, then rerun. The `sessions.db`
   fallback in `globalSetup` picks up any active session.
3. If you want headless login: set `PINGONE_TEST_USER` + `PINGONE_TEST_PASSWORD` in `.env`.

### `createBffClient` throws "No .test-session.json"

`globalSetup` did not run or failed silently. Run with `--verbose` to see setup output:
```bash
RUN_REAL_TESTS=true npx jest --config=jest.real.config.js --verbose 2>&1 | head -50
```

### Balance assertion fails (off by unexpected amount)

A previous test left the balance in a mutated state. The `afterEach` restoreBalances call
may be missing, or a test ran outside the normal cleanup path (e.g., test threw before
`afterEach` ran). Fix: add `restoreBalances(adminClient, VERTICAL)` to `afterEach` in
any suite that calls a write endpoint.

### HITL test fails with unexpected 200 (no consent dialog)

Real HITL enforcement depends on `ff_hitl_enabled=true` and `confirm_threshold_usd` in the
live configStore (read from `.env` or runtime config). Check:
```bash
curl -sk https://api.ping.demo:3001/api/health | jq .config
```
If `ff_hitl_enabled` is `false` or missing, HITL tests will get 200 instead of 428. Set it
in `.env` or via the `/config` admin page.

### Vertical bleed — tests from the wrong vertical are running

`setVertical`/`restoreVertical` are stack-based in `bffClient.js`. If a `beforeAll` calls
`setVertical` but the matching `afterAll` never calls `restoreVertical` (e.g., `beforeAll`
threw), the stack is out of sync. Force-reset by restarting the BFF or calling:
```bash
curl -sk -X PUT https://api.ping.demo:3001/api/config/vertical \
  -H 'Content-Type: application/json' -d '{"verticalId":"banking"}'
```
with a valid session cookie.

### Fixture account missing (404 on FX.chk or FX.sav)

`globalSetup` bootstraps all 6 verticals' fixture accounts. If it failed partway through,
some accounts may be missing. Rerun `globalSetup` by deleting the cache files and restarting:
```bash
rm demo_api_server/.test-session.json demo_api_server/.test-fixtures.json
RUN_REAL_TESTS=true npx jest --config=jest.real.config.js --verbose
```

### Token exchange failing (`agent.test.js` / MCP tests)

RFC 8693 errors surface as `403` or `{ error: 'token_exchange_failed' }` on `/api/agent/delegate`.
Check `/tmp/demo-api.log` for `[McpExchangerToken]` entries. Common causes:
- `PINGONE_MCP_TOKEN_EXCHANGER_CLIENT_ID` not set
- MCP resource server URI doesn't match `PINGONE_RESOURCE_MCP_SERVER_URI`
- Session token expired — log out and log back in

---

## Migration: replacing a mocked test

1. Write the `tests/real/{vertical}/foo.test.js` counterpart using the patterns above.
2. Run it: `npm run test:real:banking` (or the relevant vertical).
3. Confirm it's green. Then confirm the mocked suite still passes: `npm test`.
4. Delete `src/__tests__/foo.test.js`.
5. Add a `REGRESSION_PLAN.md §4` entry.

Do not delete the mocked file until step 3 is confirmed. Both suites must be green
simultaneously before deletion.

---

## File map

```
demo_api_server/tests/real/
  helpers/
    session.js        — headless PKCE login + sessions.db fallback
    bffClient.js      — createBffClient, setVertical, restoreVertical, loadFixtures
    fixtures.js       — VERTICAL_FIXTURES, bootstrapFixtures, restoreBalances, constants
    reset.js          — resetDemo, resetSuite
    globalSetup.js    — orchestrates session + fixture bootstrap (runs once)
    globalTeardown.js — restores banking vertical, cleans temp files
    suiteSetup.js     — registers global skipIfNoSession
  shared/             — bootstrap, health, oauth-status, admin, mcp, config
  banking/            — accounts, transactions, transfers, hitl, agent, vertical
  retail/             — same files, switches to retail in beforeAll
  sporting-goods/
  healthcare/
  workforce/
  admin/
jest.real.config.js
```
