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
