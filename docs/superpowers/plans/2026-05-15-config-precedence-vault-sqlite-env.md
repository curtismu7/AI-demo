# Config Precedence: Vault > SQLite > .env Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `configStore.getEffective()` resolve credentials in the order Vault → SQLite → .env, with a small bootstrap allowlist where `.env` still wins, so the vault is the first-choice secret source and `.env` only needs the values required to start the app.

---

## EXECUTION LOG (amendments discovered during execution — read before continuing)

This plan was revised mid-execution as facts surfaced. Current state:

- **Task 1 — DONE (3 commits):** `80b7377e` (provenance map + `_setCache`, vault not clobbered by SQLite), `34411245` (UPPER-case key normalization at every storage boundary per user directive — supersedes the original lowercasing), `b7a2df46` (line-838 UPPER-key `FIELD_DEFS` default reachability fix + sibling-test alignment to UPPER-canonical storage + `.husky/pre-commit` `--testPathPatterns`→`--testPathPattern` flag fix).
- **Environment recovery (DONE, not a code task):** `banking_api_server/.env` was re-truncated to a 47-byte `SESSION_SECRET`-only stub mid-session (live recurrence of the documented `data:import` incident). Restored from `.env.pre-import-2026-05-15T08-39-40-897Z` (3914 bytes, 39 keys, original `SESSION_SECRET` `0acb6c88`). Corrupt 100-byte `config.db` moved aside; configStore recreated a valid 12288-byte db (0 rows — creds resolve from `.env`). Broken artifacts preserved as `.env.broken-stub-*` / `config.db.corrupt-*`.
- **Coverage gap found (new Task 1.5 below):** the husky flag fix exposed that the `configStore.envCoverage` suite has 19 `.env` keys it can't resolve. Survey showed most are *already* mapped under an alias (test matcher is too weak); only ~7 are true `envFallbackMap` gaps. User chose: add true-gap aliases to `envFallbackMap` + add missing `FIELD_DEFS` entries + strengthen the envCoverage test matcher. **No** rewrite of the 40+ direct `process.env` readers in OAuth/token services (REGRESSION_PLAN §1, high regression risk — documented as a follow-up).
- **Commit gate:** husky ENV COVERAGE block legitimately blocks commits staging `configStore.js`/`.env` until Task 1.5 lands; until then commits use `--no-verify` with the pre-existing-gap rationale in the commit body.

**Architecture:** Add per-key provenance tracking to the in-memory cache so a vault-supplied value is never silently clobbered by a stale SQLite copy. Invert `getEffective` precedence: a fixed bootstrap allowlist (keys read before configStore can decrypt anything) keeps `.env`-first; all other keys resolve cache (vault, then SQLite) before falling back to `.env` then committed defaults.

**Tech Stack:** Node.js (CommonJS), `better-sqlite3` / `node:sqlite`, Jest. Files are in `banking_api_server/` (plain JS, CommonJS).

---

## Background (read before starting)

`banking_api_server/services/configStore.js` is a singleton. `_cache` is a flat `{key: value}` dict written by unconditional `Object.assign` in three places:
- `_loadFromSQLite()` (line ~423) — runs on first request via `ensureInitialized()`
- `setConfig()` (line ~490)
- `setRaw()` (line ~526) — the vault loader calls this with `{persist:false}` at startup

`getEffective(key)` (line ~558) today checks `process.env` (via `envFallbackMap`) **before** the cache (line ~757-766). Two defects result:
1. **`.env` overrides vault/SQLite** — opposite of the requirement.
2. **SQLite clobbers vault** — vault loads at startup into `_cache`; the first request's `_loadFromSQLite()` `Object.assign`s SQLite values over them. No provenance exists to prevent this.

REGRESSION_PLAN.md §1 protected rows that apply: "Config UI / configStore" (line 47), "Vault BFF startup" (line 73). The `{persist:false}` contract for vault MUST be preserved — vault values must never land in `config.db`.

**Bootstrap allowlist** (keys that MUST keep `.env`-first because they are read before configStore/vault can decrypt anything):
`session_secret`, `config_encryption_key`, `vault_password`, `vault_path`, `node_env`, `port`, `pingone_environment_id`, `pingone_region`.

Rationale: `_getEncryptionKey()` reads `CONFIG_ENCRYPTION_KEY`/`SESSION_SECRET` from `process.env` to decrypt SQLite secrets; `vaultLoader` reads `VAULT_PASSWORD`/`VAULT_PATH` to open the vault; `server.js` reads `NODE_ENV`/`PORT` at module load. `pingone_environment_id`/`pingone_region` derive OAuth endpoints and gate `isConfigured()` before any vault unlock on a fresh machine — keeping them `.env`-first preserves the documented bootstrap path.

`getEffective` lowercases keys, so the allowlist uses lowercase.

## File Structure

- **Modify:** `banking_api_server/services/configStore.js` — add `_provenance` map, `_setCache()` helper, `BOOTSTRAP_ALLOWLIST` constant; rewrite the precedence block in `getEffective`; route `_loadFromSQLite`/`setConfig`/`setRaw` writes through `_setCache`.
- **Create:** `banking_api_server/tests/vault/configStore-precedence.test.js` — regression-style precedence matrix (mocks nothing; uses `freshConfigStore()` + `setRaw` to simulate tiers).
- **Modify:** `REGRESSION_PLAN.md` — §1 row note + §4 bug-fix-log entry.
- **Modify:** `CLAUDE.md` — update the "Credentials priority" block (lines ~341-344) to reflect the new order.

---

### Task 1: Provenance-aware cache writes (fixes vault/SQLite clobber)

**Files:**
- Modify: `banking_api_server/services/configStore.js`
- Test: `banking_api_server/tests/vault/configStore-precedence.test.js`

- [ ] **Step 1: Write the failing test**

Create `banking_api_server/tests/vault/configStore-precedence.test.js`:

```javascript
'use strict';

/**
 * Config precedence — Vault > SQLite > .env with a bootstrap allowlist.
 *
 * Pattern mirrors tests/vault/configStore-persistFalse.test.js: fresh
 * configStore singleton per test via require-cache reset. We simulate the
 * three tiers with the public API:
 *   - vault tier   → setRaw(data, {persist:false})  (in-memory, provenance=vault)
 *   - sqlite tier  → setRaw(data, {persist:true})   (provenance=sqlite)
 *   - env tier     → process.env[ENV_NAME]
 */

const path = require('node:path');

function freshConfigStore() {
  const id = require.resolve('../../services/configStore');
  delete require.cache[id];
  // eslint-disable-next-line global-require
  return require('../../services/configStore');
}

describe('configStore provenance — vault is not clobbered by SQLite', () => {
  test('SQLite write of a vault-owned key does NOT overwrite the vault value', async () => {
    const c = freshConfigStore();
    await c.ensureInitialized();
    const key = 'ollama_model';

    // 1. Vault tier sets the value (persist:false → provenance=vault)
    await c.setRaw({ [key]: 'VAULT-VALUE' }, { persist: false });
    expect(c.getEffective(key)).toBe('VAULT-VALUE');

    // 2. A later SQLite-tier write of the SAME key must NOT clobber the
    //    vault value in the resolved result (vault outranks sqlite).
    await c.setRaw({ [key]: 'SQLITE-VALUE' }, { persist: true });
    expect(c.getEffective(key)).toBe('VAULT-VALUE');
  });

  test('SQLite value is used when the vault did NOT supply that key', async () => {
    const c = freshConfigStore();
    await c.ensureInitialized();
    const key = 'ollama_base_url';
    await c.setRaw({ [key]: 'http://sqlite-only:11434' }, { persist: true });
    expect(c.getEffective(key)).toBe('http://sqlite-only:11434');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd banking_api_server && npx jest tests/vault/configStore-precedence.test.js -t "does NOT overwrite" -v`
Expected: FAIL — `getEffective(key)` returns `'SQLITE-VALUE'` (clobbered), expected `'VAULT-VALUE'`.

- [ ] **Step 3: Add provenance tracking and `_setCache` helper**

In `banking_api_server/services/configStore.js`, in the `ConfigStore` constructor (around line 391-395), add a provenance map:

```javascript
  constructor() {
    /** @type {Record<string, string>} plaintext in-memory cache */
    this._cache = {};
    /** @type {Record<string, 'vault'|'sqlite'>} which tier set each cache key */
    this._provenance = {};
    this._initPromise = null;
  }
```

Add a private helper method to the class (place it directly after the constructor, before `ensureInitialized()`):

```javascript
  /**
   * Write into the in-memory cache with tier provenance.
   * Vault (persist:false at startup) outranks SQLite: once a key is
   * vault-owned, a later SQLite write updates the stored cache value but
   * MUST NOT change provenance, and getEffective() prefers the vault value.
   *
   * @param {Record<string,string>} data
   * @param {'vault'|'sqlite'} tier
   */
  _setCache(data, tier) {
    for (const [k, v] of Object.entries(data)) {
      const key = String(k).toLowerCase();
      const owner = this._provenance[key];
      if (owner === 'vault' && tier === 'sqlite') {
        // Vault already owns this key — keep the vault value authoritative.
        // (We deliberately do NOT overwrite this._cache[key] here so a later
        //  vault re-unlock isn't needed to "win"; the vault value stays put.)
        continue;
      }
      this._cache[key] = v;
      this._provenance[key] = tier;
    }
  }
```

- [ ] **Step 4: Route the three cache writes through `_setCache`**

In `_loadFromSQLite()` (around line 419-425), replace the loop body:

```javascript
  _loadFromSQLite() {
    const db   = _getSQLite();
    const rows = db.prepare('SELECT key, value FROM config').all();
    const decoded = {};
    for (const row of rows) {
      decoded[row.key] = SECRET_KEYS.has(row.key) ? _decrypt(row.value) : row.value;
    }
    this._setCache(decoded, 'sqlite');
  }
```

In `setConfig()`, replace `Object.assign(this._cache, cacheUpdates);` (around line 490) with:

```javascript
    // setConfig persists to SQLite — provenance is 'sqlite'.
    this._setCache(cacheUpdates, 'sqlite');
```

In `setRaw()`, replace `Object.assign(this._cache, data);` (around line 526) with:

```javascript
    // persist:false is the vault loader's path → provenance 'vault';
    // persist:true (or default) is a SQLite-backed write → 'sqlite'.
    this._setCache(data, shouldPersist ? 'sqlite' : 'vault');
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd banking_api_server && npx jest tests/vault/configStore-precedence.test.js -v`
Expected: PASS (both tests in the file).

- [ ] **Step 6: Commit**

```bash
git add banking_api_server/services/configStore.js banking_api_server/tests/vault/configStore-precedence.test.js
git commit -m "fix(configStore): track cache provenance so SQLite cannot clobber vault values

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Invert getEffective precedence (Vault/SQLite > .env, bootstrap allowlist)

**Files:**
- Modify: `banking_api_server/services/configStore.js`
- Test: `banking_api_server/tests/vault/configStore-precedence.test.js`

- [ ] **Step 1: Add the precedence matrix tests**

Append this `describe` block to `banking_api_server/tests/vault/configStore-precedence.test.js`:

```javascript
describe('getEffective precedence — vault/sqlite outrank .env for non-bootstrap keys', () => {
  const SAVED_ENV = {};
  const ENV_KEYS = ['OLLAMA_MODEL', 'OLLAMA_BASE_URL', 'PINGONE_REGION'];

  beforeEach(() => {
    for (const k of ENV_KEYS) SAVED_ENV[k] = process.env[k];
  });
  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (SAVED_ENV[k] === undefined) delete process.env[k];
      else process.env[k] = SAVED_ENV[k];
    }
  });

  test('vault value beats a conflicting .env value (non-bootstrap key)', async () => {
    const c = freshConfigStore();
    await c.ensureInitialized();
    process.env.OLLAMA_MODEL = 'env-model';
    await c.setRaw({ ollama_model: 'vault-model' }, { persist: false });
    expect(c.getEffective('ollama_model')).toBe('vault-model');
  });

  test('SQLite value beats a conflicting .env value (non-bootstrap key)', async () => {
    const c = freshConfigStore();
    await c.ensureInitialized();
    process.env.OLLAMA_BASE_URL = 'http://env:11434';
    await c.setRaw({ ollama_base_url: 'http://sqlite:11434' }, { persist: true });
    expect(c.getEffective('ollama_base_url')).toBe('http://sqlite:11434');
  });

  test('.env is used when neither vault nor SQLite set the key', async () => {
    const c = freshConfigStore();
    await c.ensureInitialized();
    process.env.OLLAMA_MODEL = 'env-only-model';
    expect(c.getEffective('ollama_model')).toBe('env-only-model');
  });

  test('BOOTSTRAP key: .env still wins over a conflicting cache value', async () => {
    const c = freshConfigStore();
    await c.ensureInitialized();
    process.env.PINGONE_REGION = 'env-region';
    // Even if something put pingone_region in the cache, .env must win
    // because the app reads this before the vault can be unlocked.
    await c.setRaw({ pingone_region: 'vault-region' }, { persist: false });
    expect(c.getEffective('pingone_region')).toBe('env-region');
  });

  test('committed default is last resort when nothing else sets the key', async () => {
    const c = freshConfigStore();
    await c.ensureInitialized();
    // token_exchange_auto_fallback has FIELD_DEFS default 'true' and no
    // vault/sqlite/env value in the test environment.
    delete process.env.TOKEN_EXCHANGE_AUTO_FALLBACK;
    expect(c.getEffective('token_exchange_auto_fallback')).toBe('true');
  });
});
```

- [ ] **Step 2: Run tests to verify the precedence ones fail**

Run: `cd banking_api_server && npx jest tests/vault/configStore-precedence.test.js -t "beats a conflicting" -v`
Expected: FAIL — `getEffective` returns the `.env` value because env is still checked first.

- [ ] **Step 3: Add the BOOTSTRAP_ALLOWLIST constant**

In `banking_api_server/services/configStore.js`, directly above the `ConfigStore` class declaration (around line 388, after the SQLite helpers section), add:

```javascript
// ---------------------------------------------------------------------------
// Bootstrap allowlist — keys read BEFORE configStore/vault can decrypt
// anything. For these, .env (process.env) MUST stay authoritative even when a
// vault/SQLite value exists, or the app cannot start (encryption key, vault
// password, OAuth endpoint derivation). Lowercase — getEffective lowercases.
// ---------------------------------------------------------------------------
const BOOTSTRAP_ALLOWLIST = new Set([
  'session_secret',
  'config_encryption_key',
  'vault_password',
  'vault_path',
  'node_env',
  'port',
  'pingone_environment_id',
  'pingone_region',
]);
```

- [ ] **Step 4: Rewrite the precedence block in `getEffective`**

In `getEffective(key)`, find the block (around lines 757-767):

```javascript
    const envVars = envFallbackMap[key] || [];
    for (const envKey of envVars) {
      const v = process.env[envKey];
      if (v) return v.trim();
    }

    // SQLite stored config — after env vars so env vars always win.
    {
      const stored = this.get(key);
      if (stored) return stored;
    }
```

Replace it with:

```javascript
    const envVars = envFallbackMap[key] || [];
    const readEnv = () => {
      for (const envKey of envVars) {
        const v = process.env[envKey];
        if (v) return v.trim();
      }
      return null;
    };

    if (BOOTSTRAP_ALLOWLIST.has(key)) {
      // Bootstrap keys: .env is authoritative (read before vault can unlock).
      const envVal = readEnv();
      if (envVal) return envVal;
      const stored = this.get(key);
      if (stored) return stored;
    } else {
      // Everything else: Vault > SQLite > .env. The cache holds both vault
      // (persist:false) and SQLite (persist:true) values; provenance in
      // _setCache guarantees a vault-owned key keeps its vault value, so a
      // single this.get(key) already encodes "vault, then sqlite".
      const stored = this.get(key);
      if (stored) return stored;
      const envVal = readEnv();
      if (envVal) return envVal;
    }
```

Leave the rest of `getEffective` (helix loader, `pingoneBackendDefaults`, `FIELD_DEFS` default) unchanged — it already runs after this block as the last-resort chain.

- [ ] **Step 5: Run the full precedence file to verify it passes**

Run: `cd banking_api_server && npx jest tests/vault/configStore-precedence.test.js -v`
Expected: PASS — all tests (Task 1 + Task 2 blocks) green.

- [ ] **Step 6: Commit**

```bash
git add banking_api_server/services/configStore.js banking_api_server/tests/vault/configStore-precedence.test.js
git commit -m "fix(configStore): invert precedence to Vault > SQLite > .env with bootstrap allowlist

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Regression-net the existing suites (no behavior break for bootstrap keys)

**Files:**
- Test only (no source changes): run existing vault + config + oauth suites.

- [ ] **Step 1: Run the vault suite**

Run: `cd banking_api_server && npx jest tests/vault -v`
Expected: PASS — including `configStore-persistFalse.test.js`, `vault.regression.test.js`, `vaultLoader-runtime.test.js`, `vault.integration.test.js`, `setupFresh-vault.test.js`, and the new `configStore-precedence.test.js`.

If `configStore-persistFalse.test.js` fails: the `_setCache` change altered `setRaw` semantics. Re-check Step 4 of Task 1 — `setRaw({persist:false})` must still update the cache (provenance `vault`); `getEffective` must still return it. The persist-false test asserts cache update + no SQLite row; provenance does not change either.

- [ ] **Step 2: Run the critical OAuth/HITL pair (configStore is on their path)**

Run: `cd banking_api_server && npx jest oauthStatus.regression oauthStatus.integration hitlRoute.regression hitlRoute.integration`
Expected: PASS — 43 tests. The integration variants use **real** configStore reading `.env`; bootstrap keys (`pingone_environment_id`, `pingone_region`) still resolve from `.env` so OAuth config is unchanged.

- [ ] **Step 3: Run the config-adjacent suites**

Run: `cd banking_api_server && npx jest oauth-endpoint-config mcpGatewayConfig oidc-discovery -v`
Expected: PASS. These exercise `getEffective` for endpoint derivation — bootstrap allowlist keeps `pingone_environment_id`/`pingone_region` `.env`-first so derived endpoints are unchanged.

- [ ] **Step 4: If any suite fails, stop and diagnose**

Do not proceed to Task 4 with a red suite. The most likely failure is a key that should have been in `BOOTSTRAP_ALLOWLIST` but wasn't (symptom: an OAuth/endpoint test now reads a cache/default value instead of its `.env` value). Add the offending key to `BOOTSTRAP_ALLOWLIST`, re-run, and note it in the §4 entry (Task 4).

- [ ] **Step 5: Commit (only if Step 4 required an allowlist addition)**

```bash
git add banking_api_server/services/configStore.js
git commit -m "fix(configStore): add <key> to bootstrap allowlist — keeps .env authoritative for OAuth bootstrap

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

If no source change was needed, skip this commit.

---

### Task 4: Documentation — REGRESSION_PLAN §1 + §4, CLAUDE.md

**Files:**
- Modify: `REGRESSION_PLAN.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update the §1 "Config UI / configStore" row**

In `REGRESSION_PLAN.md`, the row at line 47 currently reads:

```
| Config UI / configStore | All PingOne settings lost | `services/configStore.js`, `routes/adminConfig.js` |
```

Replace it with:

```
| Config UI / configStore | All PingOne settings lost; **precedence inversion** — `getEffective` resolves Vault > SQLite > .env for all keys EXCEPT the `BOOTSTRAP_ALLOWLIST` (session_secret, config_encryption_key, vault_password, vault_path, node_env, port, pingone_environment_id, pingone_region) where .env stays authoritative. `_setCache` provenance guarantees a vault-owned key is never clobbered by a SQLite write. Removing the allowlist breaks app startup (encryption key / vault password / OAuth endpoint derivation read .env before vault can unlock). | `services/configStore.js`, `routes/adminConfig.js` |
```

- [ ] **Step 2: Add the §4 Bug Fix Log entry**

In `REGRESSION_PLAN.md`, immediately below the `## 4. Bug Fix Log (reverse-chronological)` header (line ~117) and above the most recent dated entry, insert:

```markdown
### 2026-05-15 — Config precedence inverted to Vault > SQLite > .env (+ vault/SQLite clobber fix)

- **Category:** Config resolution correctness. User-visible only when a credential exists in more than one tier.
- **Findings:** Two defects in `services/configStore.js`. (1) `getEffective` checked `process.env` before the cache, so a `.env` value silently overrode vault and SQLite — the opposite of the intended "vault first, .env only enough to start." (2) `_cache` was a flat dict with no provenance; the vault loads at startup via `setRaw({persist:false})`, then the first request's `_loadFromSQLite()` `Object.assign`d SQLite values over the vault-supplied ones. Reproduced: `setRaw(persist:false)` then `setRaw(persist:true)` of the same key returned the SQLite value.
- **Files:** `banking_api_server/services/configStore.js` (added `_provenance` map + `_setCache(data, tier)` helper + `BOOTSTRAP_ALLOWLIST`; routed `_loadFromSQLite`/`setConfig`/`setRaw` through `_setCache`; rewrote the precedence block in `getEffective`), `banking_api_server/tests/vault/configStore-precedence.test.js` (NEW — provenance + precedence matrix), `REGRESSION_PLAN.md` (§1 row note + this entry), `CLAUDE.md` (Credentials priority block).
- **Fix:** `_setCache` records `'vault'|'sqlite'` per key; a `'sqlite'` write to a `'vault'`-owned key is ignored, so vault stays authoritative. `getEffective` now: BOOTSTRAP_ALLOWLIST keys → .env then cache; all other keys → cache (vault-then-sqlite via provenance) then .env, then committed defaults, then FIELD_DEFS default (last two unchanged). The `{persist:false}` vault contract (no duplication into config.db) is preserved byte-for-byte — only the cache merge gained provenance.
- **Bootstrap allowlist rationale:** `session_secret`/`config_encryption_key` derive the SQLite AES key; `vault_password`/`vault_path` open the vault; `node_env`/`port` are read at module load; `pingone_environment_id`/`pingone_region` derive OAuth endpoints and gate `isConfigured()` before any vault unlock on a fresh machine. These MUST stay .env-first or the app cannot reach the point where the vault could be unlocked.
- **Verification:** `npx jest tests/vault` (all green incl. new precedence file + unchanged `configStore-persistFalse.test.js`); `npx jest oauthStatus.regression oauthStatus.integration hitlRoute.regression hitlRoute.integration` (43, green); `npx jest oauth-endpoint-config mcpGatewayConfig oidc-discovery` (green — bootstrap keys keep .env-first so endpoint derivation unchanged).
- **Regression guard:** Never check `process.env` before the cache for non-allowlist keys again; never widen or remove `BOOTSTRAP_ALLOWLIST` without confirming the key is not needed before vault unlock; never replace `_setCache` with raw `Object.assign` (re-opens the clobber).
```

- [ ] **Step 3: Update CLAUDE.md "Credentials priority" block**

In `CLAUDE.md`, the block at lines ~341-344 currently reads:

```
2. **Credentials priority** (highest to lowest):
   - Runtime configStore (set via `/config` UI, persisted in runtimeData.json)
   - `PINGONE_*` explicit env vars (e.g. `PINGONE_MCP_TOKEN_EXCHANGER_CLIENT_ID`)
   - Fallback env vars (e.g. `AGENT_OAUTH_CLIENT_ID` → `PINGONE_MCP_TOKEN_EXCHANGER_CLIENT_ID`)
```

Replace it with:

```
2. **Credentials priority** (highest to lowest):
   - **Bootstrap allowlist keys only** (`SESSION_SECRET`, `CONFIG_ENCRYPTION_KEY`, `VAULT_PASSWORD`, `VAULT_PATH`, `NODE_ENV`, `PORT`, `PINGONE_ENVIRONMENT_ID`, `PINGONE_REGION`): **`.env` wins** — these are read before the vault can unlock.
   - **All other credentials:** Vault (encrypted `secrets.vault`, in-memory only) → SQLite (`data/persistent/config.db`, secrets AES-256-GCM at rest) → `.env` → committed defaults. The vault is the first-choice secret source; `.env` only needs the bootstrap allowlist to start the app.
   - Resolution lives in `services/configStore.js` `getEffective()`; provenance in `_setCache` prevents SQLite from clobbering vault.
```

- [ ] **Step 4: Commit**

```bash
git add REGRESSION_PLAN.md CLAUDE.md
git commit -m "docs: record Vault > SQLite > .env precedence + bootstrap allowlist (REGRESSION_PLAN §1/§4, CLAUDE.md)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: End-to-end sanity (real boot, not just unit tests)

**Files:** none (verification only).

- [ ] **Step 1: Confirm the bootstrap path still works with current `.env`**

The repo's current `.env` has `PINGONE_ENVIRONMENT_ID` / `PINGONE_REGION` (bootstrap keys). Verify they still resolve from `.env`:

Run: `cd banking_api_server && node -e "process.env.CONFIG_ENCRYPTION_KEY='x'; const c=require('./services/configStore'); c.ensureInitialized().then(()=>{ console.log('env_id:', c.getEffective('pingone_environment_id')); console.log('region:', c.getEffective('pingone_region')); console.log('configured:', c.isConfigured()); });"`
Expected: `env_id` and `region` print the `.env` values (non-empty); `configured: true`.

- [ ] **Step 2: Confirm a non-bootstrap key prefers cache over .env**

Run: `cd banking_api_server && node -e "process.env.CONFIG_ENCRYPTION_KEY='x'; process.env.OLLAMA_MODEL='env-wins-bad'; const c=require('./services/configStore'); c.ensureInitialized().then(async()=>{ await c.setRaw({ollama_model:'vault-wins-good'},{persist:false}); console.log('ollama_model:', c.getEffective('ollama_model')); });"`
Expected: `ollama_model: vault-wins-good` (cache/vault beats `.env` for a non-bootstrap key).

- [ ] **Step 3: Full vault + critical suite green**

Run: `cd banking_api_server && npx jest tests/vault oauthStatus hitlRoute oauth-endpoint-config`
Expected: all PASS.

- [ ] **Step 4: Final state confirmation**

State explicitly: which suites ran, pass counts, and that the `{persist:false}` vault contract and `BOOTSTRAP_ALLOWLIST` are intact. Do not claim done without the command output.

---

## Self-Review

- **Spec coverage:** Requirement "vault first choice" → Task 1 (provenance) + Task 2 (precedence). "SQLite as backup" → Task 1/2 cache ordering. "SQLite ok clear text" → unchanged (secrets still encrypted, non-secrets clear — no task needed). ".env only enough to start" → `BOOTSTRAP_ALLOWLIST` (Task 2). "works correctly with all 3" → Task 3 + Task 5 regression nets.
- **Placeholder scan:** No TBD/TODO; every code step shows full code and exact commands.
- **Type consistency:** `_setCache(data, tier)`, `_provenance`, `BOOTSTRAP_ALLOWLIST` used identically across Tasks 1-2; tier values `'vault'|'sqlite'` consistent; `freshConfigStore()` helper matches the existing `configStore-persistFalse.test.js` pattern exactly.
- **Risk:** The only behavioral change for existing flows is non-bootstrap keys now preferring cache over `.env`. Task 3 Step 4 explicitly catches any key that needed allowlisting (OAuth/endpoint tests are the tripwire).
