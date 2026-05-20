# Sub-Plan: Helix keyfile → vault+SQLite migration, degraded-mode banner, setup:fresh wiring

> **Review gate.** This sub-plan touches REGRESSION_PLAN §1 protected files. It must be approved before any edit. Execute BEFORE the 6-task all-chips test plan.

**Goal:** (1) Make the downloaded `<agentname>.json` Helix keyfile auto-migrate into the encrypted vault AND SQLite configStore once, keeping `helixAgentKeyLoader` as the runtime fallback; (2) show a persistent banner in the agent panel when a real Helix→heuristic fallback occurs; (3) wire the migration into `setup:fresh`.

**Architecture:** A new pure module `helixKeyMigration.js` owns the keyfile→vault+SQLite logic (testable, no side effects on import). It is invoked from (a) BFF startup after vault load, and (b) `setupFresh.js configureHelix()`. The banner is a presentational addition to `BankingAgent.js` driven by existing `source` already read from `/api/banking-agent/nl`. No vault library/format/loader internals change.

---

## REGRESSION_PLAN §1 — what I will NOT break (stated per protected row)

- **Row 47 — configStore / adminConfig ("All PingOne settings lost"):** I will not change `getEffective`/`get` resolution order or FIELD_DEFS. `helix_api_key`/`helix_base_url` already exist in FIELD_DEFS + SECRET_KEYS. Migration uses the existing public `configStore.setConfig()` only.
- **Row 72 — Vault library (AEAD/KDF/HMAC/on-disk format):** ZERO changes to `lib/vault/{crypto,format,audit,index}.js`. No format-version bump. Migration calls only the existing public `vault` API (`openVault`/`set`/`save`/`close`) — same surface `scripts/vault.js` already uses.
- **Row 73 — Vault BFF startup (vaultLoader/server.js):** I will NOT alter `loadVaultIntoConfigStore`'s `setRaw({persist:false})`, its `vault.close()`-in-`finally`, or the `delete process.env.VAULT_PASSWORD`. The migration runs as a SEPARATE step AFTER `loadVaultIntoConfigStore` returns, opening the vault with its own short-lived password handle and closing it in its own `finally`. It captures `VAULT_PASSWORD` BEFORE the loader deletes it (loader deletes from `process.env`; migration must receive the password explicitly from the startup sequence, not re-read env afterwards).
- **§0 — emoji rule:** banner text uses only words + permitted `⚠️` if any icon. No other emoji. After UI edit: `cd banking_api_ui && npm run build` must exit 0.
- **BankingAgent.js §1 rows (41/50/51/58/60/63):** the banner is additive JSX in the header region; I will not touch `liveAccounts`, the consent gate, `hitlPendingIntent`, FAB visibility, resize caps, or the `mcp_hitl_required`/`consent_challenge_required` handlers.

## Key facts driving the design (verified)

- Vault values load with `{persist:false}` (in-memory only) — `vaultLoader.js:102`. So vault and SQLite are INDEPENDENT persistence targets; the migration must write BOTH explicitly. They do not derive from each other.
- `configStore.setConfig()` writes FIELD_DEFS keys to SQLite (`config.db`), encrypting SECRET_KEYS via `_encrypt` — `configStore.js:522-568`. `helix_api_key` is in FIELD_DEFS + SECRET_KEYS.
- Vault CLI surface: `create|get|set|list|delete|rotate` (`scripts/vault.js:52`). `vault.set(name,value)` requires name `^[A-Z_][A-Z0-9_]*$` (`lib/vault/index.js`). Canonical name: `HELIX_API_KEY` (matches `configStore.js:760` env mapping `helix_api_key ← HELIX_API_KEY`).
- `helixAgentKeyLoader.loadAgentKey(agentName)` already discovers `<agentname>.json` in repo root, `~/Documents`, `~/Downloads`, first match wins, memoized (`helixAgentKeyLoader.js:52-79`). Reuse it — do not re-implement discovery.
- `setupFresh.js configureHelix()` already collects 5 Helix fields and persists via `configStore.setConfig({...values, provider:'helix'})` at line 810. Integration point for keyfile pre-fill + vault write is here.
- `/api/banking-agent/nl` returns `{ source, result }`; `BankingAgent.js:~5350` reads `source` and passes it to `dispatchNlResult`. `source==='heuristic'` while the selected provider was Helix == a real fallback. `selectedLlmProvider` is in component scope.

---

## Task A: `helixKeyMigration.js` — pure migration module (TDD)

**Files:**
- Create: `banking_api_server/services/helixKeyMigration.js`
- Test: `banking_api_server/src/__tests__/helixKeyMigration.test.js`

Behavior: `migrateHelixKey({ agentName, vaultPath, vaultPassword, configStore, vaultLib, keyLoader, logger })` →
1. If `configStore.get('helix_api_key')` already truthy (vault-loaded or SQLite) AND not from the keyfile loader → `{ migrated:false, reason:'already_present' }` (idempotent; never overwrite an operator-set key).
2. Else `key = keyLoader.loadAgentKey(agentName)`. If null → `{ migrated:false, reason:'no_keyfile' }`.
3. If `vaultPassword` + `vaultPath` exist: open vault, `vault.set('HELIX_API_KEY', key)`, `vault.save()`, `vault.close()` in `finally`. Record `vaultWritten:true`.
4. Always also `await configStore.setConfig({ helix_api_key: key })` (SQLite, encrypted). Record `sqliteWritten:true`.
5. Return `{ migrated:true, vaultWritten, sqliteWritten, reason:'migrated_from_keyfile' }`. All deps injectable; no work on import.

- [ ] **Step 1: Write the failing test**

```js
// banking_api_server/src/__tests__/helixKeyMigration.test.js
'use strict';
const { migrateHelixKey } = require('../../services/helixKeyMigration');

function mkVault() {
  const store = {};
  const vault = {
    set: jest.fn((n, v) => { store[n] = v; }),
    save: jest.fn(() => Promise.resolve()),
    close: jest.fn(),
    list: () => Object.keys(store),
    read: (n) => store[n],
    _store: store,
  };
  return { vault, vaultLib: { openVault: jest.fn(() => Promise.resolve(vault)) } };
}

describe('migrateHelixKey', () => {
  test('no keyfile → migrated:false reason no_keyfile', async () => {
    const cfg = { get: () => '', setConfig: jest.fn() };
    const r = await migrateHelixKey({
      agentName: 'LLM2', vaultPath: '/x/secrets.vault', vaultPassword: 'pw',
      configStore: cfg, vaultLib: mkVault().vaultLib,
      keyLoader: { loadAgentKey: () => null }, logger: { log() {}, error() {} },
    });
    expect(r).toEqual({ migrated: false, reason: 'no_keyfile' });
    expect(cfg.setConfig).not.toHaveBeenCalled();
  });

  test('existing key in configStore → idempotent no-op', async () => {
    const cfg = { get: () => 'already-set-key', setConfig: jest.fn() };
    const r = await migrateHelixKey({
      agentName: 'LLM2', vaultPath: '/x/secrets.vault', vaultPassword: 'pw',
      configStore: cfg, vaultLib: mkVault().vaultLib,
      keyLoader: { loadAgentKey: () => 'KEYFILE' }, logger: { log() {}, error() {} },
    });
    expect(r).toEqual({ migrated: false, reason: 'already_present' });
    expect(cfg.setConfig).not.toHaveBeenCalled();
  });

  test('keyfile present + vault password → writes vault AND sqlite', async () => {
    const cfg = { get: () => '', setConfig: jest.fn(() => Promise.resolve()) };
    const { vault, vaultLib } = mkVault();
    const r = await migrateHelixKey({
      agentName: 'LLM2', vaultPath: '/x/secrets.vault', vaultPassword: 'pw',
      configStore: cfg, vaultLib,
      keyLoader: { loadAgentKey: () => 'KEYFILE_SECRET' }, logger: { log() {}, error() {} },
    });
    expect(r.migrated).toBe(true);
    expect(r.vaultWritten).toBe(true);
    expect(r.sqliteWritten).toBe(true);
    expect(vault.set).toHaveBeenCalledWith('HELIX_API_KEY', 'KEYFILE_SECRET');
    expect(vault.save).toHaveBeenCalled();
    expect(vault.close).toHaveBeenCalled();
    expect(cfg.setConfig).toHaveBeenCalledWith({ helix_api_key: 'KEYFILE_SECRET' });
  });

  test('no vault password → sqlite only, vault skipped', async () => {
    const cfg = { get: () => '', setConfig: jest.fn(() => Promise.resolve()) };
    const { vaultLib } = mkVault();
    const r = await migrateHelixKey({
      agentName: 'LLM2', vaultPath: '/x/secrets.vault', vaultPassword: '',
      configStore: cfg, vaultLib,
      keyLoader: { loadAgentKey: () => 'KEYFILE_SECRET' }, logger: { log() {}, error() {} },
    });
    expect(r.migrated).toBe(true);
    expect(r.vaultWritten).toBe(false);
    expect(r.sqliteWritten).toBe(true);
    expect(vaultLib.openVault).not.toHaveBeenCalled();
  });

  test('vault.close() runs even if vault.set throws', async () => {
    const cfg = { get: () => '', setConfig: jest.fn(() => Promise.resolve()) };
    const { vault, vaultLib } = mkVault();
    vault.set = jest.fn(() => { throw new Error('boom'); });
    await expect(migrateHelixKey({
      agentName: 'LLM2', vaultPath: '/x/secrets.vault', vaultPassword: 'pw',
      configStore: cfg, vaultLib,
      keyLoader: { loadAgentKey: () => 'K' }, logger: { log() {}, error() {} },
    })).rejects.toThrow('boom');
    expect(vault.close).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run — expect FAIL** `cd banking_api_server && npx jest helixKeyMigration` → `Cannot find module`.

- [ ] **Step 3: Implement**

```js
// banking_api_server/services/helixKeyMigration.js
'use strict';
/**
 * One-time migration: lift the Helix key from the downloaded <agentName>.json
 * keyfile into BOTH the encrypted vault (at rest) and SQLite configStore
 * (survives restart). helixAgentKeyLoader stays as the runtime fallback.
 *
 * Vault and SQLite are INDEPENDENT targets — vaultLoader loads with
 * persist:false, so a vault entry never reaches SQLite on its own.
 *
 * Idempotent: if configStore already resolves a helix_api_key (operator set
 * it via /setup, env, or a prior migration into SQLite/vault), do nothing.
 * Never overwrite an operator-provided key.
 *
 * All collaborators injected — no side effects on import.
 */
const VAULT_KEY_NAME = 'HELIX_API_KEY'; // matches configStore env mapping helix_api_key ← HELIX_API_KEY

async function migrateHelixKey(opts = {}) {
  const agentName    = opts.agentName    || 'LLM2';
  const vaultPath    = opts.vaultPath;
  const vaultPassword = opts.vaultPassword;
  const configStore  = opts.configStore  || require('./configStore');
  const vaultLib     = opts.vaultLib     || require('../lib/vault');
  const keyLoader    = opts.keyLoader    || require('./helixAgentKeyLoader');
  const logger       = opts.logger       || console;

  // 1. Idempotent guard — anything already resolvable wins (operator intent).
  let existing = '';
  try { existing = configStore.get('helix_api_key') || ''; } catch (_) { existing = ''; }
  if (existing && String(existing).trim()) {
    return { migrated: false, reason: 'already_present' };
  }

  // 2. Discover the keyfile via the existing loader (repo root/~/Documents/~/Downloads).
  const key = keyLoader.loadAgentKey(agentName);
  if (!key) {
    return { migrated: false, reason: 'no_keyfile' };
  }

  // 3. Vault write (only when a password + path are available).
  let vaultWritten = false;
  if (vaultPassword && vaultPath) {
    let vault;
    try {
      vault = await vaultLib.openVault(vaultPath, vaultPassword);
      vault.set(VAULT_KEY_NAME, key);
      await vault.save();
      vaultWritten = true;
    } finally {
      try { if (vault) vault.close(); } catch (_) { /* ignore */ }
    }
  } else {
    logger.log('[helixKeyMigration] no vault password/path — SQLite only');
  }

  // 4. SQLite write (always — survives restart without VAULT_PASSWORD).
  await configStore.setConfig({ helix_api_key: key });
  const sqliteWritten = true;

  logger.log(
    `[helixKeyMigration] migrated Helix key from ${agentName}.json ` +
    `(vault=${vaultWritten}, sqlite=${sqliteWritten})`,
  );
  return { migrated: true, vaultWritten, sqliteWritten, reason: 'migrated_from_keyfile' };
}

module.exports = { migrateHelixKey, VAULT_KEY_NAME };
```

- [ ] **Step 4: Run — expect PASS** `cd banking_api_server && npx jest helixKeyMigration` (5 tests).
- [ ] **Step 5: Commit** `feat(helix): one-time keyfile→vault+SQLite migration module`.

## Task B: Invoke migration at BFF startup (after vault load, password captured)

**Files:**
- Modify: `banking_api_server/server.js` — the existing vault-load IIFE (the one calling `loadVaultIntoConfigStore`).

Constraint (Row 73): the loader deletes `process.env.VAULT_PASSWORD`. The migration needs the password, so it must be captured BEFORE the loader runs and passed explicitly.

- [ ] **Step 1:** Read the exact server.js vault IIFE block (around the `loadVaultIntoConfigStore` call) and quote it in the execution PR. Locate the line capturing/using `VAULT_PASSWORD`.
- [ ] **Step 2:** Capture `const _vaultPwForMigration = process.env.VAULT_PASSWORD;` immediately BEFORE `await loadVaultIntoConfigStore(...)`. After it resolves (and only when not Vercel), call:

```js
try {
  const { migrateHelixKey } = require('./services/helixKeyMigration');
  const { DEFAULT_VAULT_PATH } = require('./services/vaultLoader');
  const configStore = require('./services/configStore');
  const agentName = process.env.HELIX_AGENT_ID || configStore.get('helix_agent_id') || 'LLM2';
  const r = await migrateHelixKey({
    agentName,
    vaultPath: process.env.VAULT_PATH || DEFAULT_VAULT_PATH,
    vaultPassword: _vaultPwForMigration,
  });
  if (r.migrated) console.log(`[startup] Helix key migrated (vault=${r.vaultWritten}, sqlite=${r.sqliteWritten})`);
} catch (e) {
  console.warn('[startup] Helix key migration skipped:', e.message);
}
```

- [ ] **Step 3:** Verify startup is unaffected when no keyfile / no vault: `./run-demo.sh stop && ./run-demo.sh && ./run-demo.sh status` (all healthy); log shows the migration line or a benign skip; NO change to the vault loader's own log lines. NEVER hold `_vaultPwForMigration` beyond this block (it goes out of scope; do not assign to module scope).
- [ ] **Step 4: Commit** `feat(startup): migrate Helix keyfile into vault+SQLite after vault load`.

## Task C: Wire migration into `setup:fresh`

**Files:**
- Modify: `banking_api_server/scripts/setupFresh.js` — `configureHelix()` (line 725) and where vault password is known (`configureVault`, line 854 / `VAULT_PASSWORD` resolution).

- [ ] **Step 1:** In `configureHelix()`, BEFORE the interactive 5-field collection, attempt keyfile migration: if `helixAgentKeyLoader.loadAgentKey(agentName)` finds a key, call `migrateHelixKey({...})` (passing the setup-resolved vault password if vault phase is enabled, else SQLite-only) and `skip()`/`ok()` accordingly, then `return` (no prompts needed). If no keyfile, fall through to the EXISTING prompt flow unchanged.
- [ ] **Step 2:** Preserve all existing flags: `--skip-helix` still skips entirely; `--helix`/env still works; non-interactive path unchanged when no keyfile.
- [ ] **Step 3:** Verify: `npm run setup:fresh -- --non-interactive --skip-vault` with `LLM2.json` in repo root → log shows "Helix key migrated from LLM2.json (sqlite)"; `configStore.get('helix_api_key')` resolves after restart. Re-run → idempotent (`already_present`).
- [ ] **Step 4: Commit** `feat(setup:fresh): auto-migrate Helix keyfile before prompting`.

## Task D: Degraded-mode banner in the agent panel

**Files:**
- Modify: `banking_api_ui/src/components/BankingAgent.js` (state + header JSX near `.ba-header-top`)
- Modify: `banking_api_ui/src/components/BankingAgent.css` (or the agent panel's CSS) — one banner class

- [ ] **Step 1:** Add state `const [helixDegraded, setHelixDegraded] = useState(false);`. In the `/api/banking-agent/nl` `.then(({result, source}) => ...)` handler: `setHelixDegraded(selectedLlmProvider === 'helix' && source === 'heuristic');` (a real fallback: Helix was requested but heuristic answered). Reset to `false` when `source==='helix'||source==='helix_fallback'`.
- [ ] **Step 2:** Mount a persistent banner at the documented point (immediately after `.ba-header-top`, before `.ba-header-session`):

```jsx
{helixDegraded && (
  <div className="ba-degraded-banner" role="status">
    ⚠️ AI reasoning offline — running rule-based responses. Some questions may not be understood.
  </div>
)}
```

- [ ] **Step 3:** CSS — a subtle warning bar (mirror existing notice colors; no new emoji beyond `⚠️`):

```css
.ba-degraded-banner {
  font-size: 12px;
  padding: 6px 12px;
  background: #fff4e5;
  color: #8a5300;
  border-top: 1px solid #f0d9b5;
}
```

- [ ] **Step 4:** `cd banking_api_ui && npm run build` → exit 0 (mandatory, §0/Row).
- [ ] **Step 5:** Manual: with dead Helix (configStore `helix_base_url=https://127.0.0.1:9`, provider helix), send a chip → banner appears; restore Helix, send again → banner clears.
- [ ] **Step 6: Commit** `feat(agent-ui): persistent degraded-mode banner on Helix→heuristic fallback`.

## Task E: REGRESSION_PLAN §4 entry + verification

- [ ] **Step 1:** Add a §4 Bug Fix Log entry (template per regression-guard): the keyfile→vault+SQLite migration + degraded banner, files touched, the §1 no-break statements above, how verified.
- [ ] **Step 2:** Full verification: `cd banking_api_server && npx jest helixKeyMigration vault` (migration + existing vault tests green — proves Row 72/73 intact); `cd banking_api_ui && npm run build` exit 0; `./run-demo.sh status` healthy; manual banner toggle.
- [ ] **Step 3: Commit** `docs(regression): §4 — Helix keyfile migration + degraded banner`.

## Definition of done (sub-plan)

- `helixKeyMigration` unit tests green; existing `vault` tests still green (Row 72/73 untouched).
- Fresh clone with `LLM2.json` in repo root or `~/Downloads`: after `setup:fresh` (or first BFF start), `helix_api_key` is in SQLite (and vault when password supplied); idempotent on re-run; operator-set keys never overwritten.
- Agent panel shows the degraded banner ONLY on a real Helix→heuristic fallback; clears on recovery; `npm run build` exit 0.
- REGRESSION_PLAN §4 entry added. No vault library/format/loader change. No configStore resolution-order change. No other emoji introduced.
- THEN proceed to the 6-task all-chips test plan (its Condition 2 Helix gate now has a configured key to find).
