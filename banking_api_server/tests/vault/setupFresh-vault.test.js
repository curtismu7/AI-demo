/**
 * Phase 269 Plan 05 Task 3 — configureVault unit tests with DI.
 *
 * Strategy (Option B from the plan): direct unit testing of configureVault
 * via the DI options bag. No spawnSync. No SUPER_BANKING_TEST_MODE. The
 * fakes record collaborator invocations so each branch is verified in
 * isolation; one test (`POSITIVE-PATH`) skips the fakes and uses the
 * REAL runChild to prove env passthrough end-to-end by opening the
 * spawned-child-created vault with the supplied password.
 */

const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const { configureVault } = require('../../scripts/setupFresh');
const { openVault, createVault } = require('../../lib/vault');

function uniqPaths() {
  const ts = Date.now() + '-' + Math.random().toString(36).slice(2, 8);
  return {
    vaultPath: path.join(os.tmpdir(), `sf-vault-${ts}.vault`),
    envFile: path.join(os.tmpdir(), `sf-env-${ts}`),
  };
}

function cleanup({ vaultPath, envFile }) {
  for (const p of [vaultPath, vaultPath + '.tmp', vaultPath + '.audit.log', envFile]) {
    try { fs.unlinkSync(p); } catch (_e) { /* ignore */ }
  }
}

function fakes() {
  const calls = { runChild: [], ok: [], skip: [], fail: [], readQuestion: [] };
  return {
    calls,
    runChild: async (label, args, opts) => {
      calls.runChild.push({ label, args, opts });
      return 0;
    },
    ok: (m) => calls.ok.push(m),
    skip: (m) => calls.skip.push(m),
    fail: (m) => calls.fail.push(m),
    readQuestion: async () => {
      calls.readQuestion.push(true);
      return true;
    },
  };
}

describe('configureVault (Phase 269 Plan 05 Task 3)', () => {
  let paths;

  beforeEach(() => {
    paths = uniqPaths();
    fs.writeFileSync(paths.envFile, '');
  });

  afterEach(() => {
    cleanup(paths);
  });

  test('happy path: runs vault-create + vault-migrate with env containing password + path', async () => {
    const f = fakes();
    const result = await configureVault({
      password: 'pw-happy',
      vaultPath: paths.vaultPath,
      envFile: paths.envFile,
      interactive: false,
      runChild: f.runChild,
      ok: f.ok,
      skip: f.skip,
      fail: f.fail,
    });
    expect(result.ok).toBe(true);
    expect(f.calls.runChild).toHaveLength(2);
    // BOTH children received env with VAULT_PASSWORD + VAULT_PATH
    for (const c of f.calls.runChild) {
      expect(c.opts.env.VAULT_PASSWORD).toBe('pw-happy');
      expect(c.opts.env.VAULT_PATH).toBe(paths.vaultPath);
    }
    // Order: vault-create first, vault-migrate second.
    expect(f.calls.runChild[0].args).toContain('create');
    expect(f.calls.runChild[0].args.some((a) => /vault\.js/.test(a))).toBe(true);
    expect(f.calls.runChild[1].args.some((a) => /vault-migrate/.test(a))).toBe(true);
    // .env was appended with VAULT_PATH
    const envText = fs.readFileSync(paths.envFile, 'utf8');
    expect(envText).toContain(`VAULT_PATH=${paths.vaultPath}`);
    // ok() was called with success summary.
    expect(f.calls.ok.join(' ')).toMatch(/Vault created at/);
  });

  test('POSITIVE-PATH: env reaches REAL spawned child (Step 0 regression guard)', async () => {
    // This test uses the REAL runChild (no fake) — proves opts.env propagates
    // through spawn(). If Step 0's `env: opts.env || process.env` line is
    // missing, vault:create can't read VAULT_PASSWORD, the file isn't
    // created, openVault throws, and this test fails. This is the single
    // most important regression check for the env-passthrough fix.
    const f = fakes();
    const result = await configureVault({
      password: 'sentinel-pw-12345',
      vaultPath: paths.vaultPath,
      envFile: paths.envFile,
      interactive: false,
      // runChild: undefined → uses REAL runChild from setupFresh.js
      ok: f.ok,
      skip: f.skip,
      fail: f.fail,
    });
    expect(result.ok).toBe(true);
    expect(fs.existsSync(paths.vaultPath)).toBe(true);
    // Definitive proof of env propagation: open with the supplied password.
    // If env didn't reach the child, vault:create would have failed (or
    // used a different password) and openVault throws here.
    const v = await openVault(paths.vaultPath, 'sentinel-pw-12345');
    expect(v).toBeDefined();
    v.close();
  }, 60000); // 60s timeout — spawns two child node processes + 2× argon2 derive

  test('existing vault file: skip creation, no runChild call, .env untouched', async () => {
    const v = await createVault(paths.vaultPath, 'pre-existing-pw');
    await v.save();
    v.close();
    const envBefore = fs.readFileSync(paths.envFile, 'utf8');
    const f = fakes();
    const result = await configureVault({
      password: 'pw-ignored',
      vaultPath: paths.vaultPath,
      envFile: paths.envFile,
      interactive: false,
      runChild: f.runChild,
      ok: f.ok,
      skip: f.skip,
      fail: f.fail,
    });
    expect(result.ok).toBe(true);
    expect(f.calls.runChild).toHaveLength(0);
    expect(f.calls.skip.join(' ')).toMatch(/vault present at/);
    expect(fs.readFileSync(paths.envFile, 'utf8')).toBe(envBefore);
  });

  test('fail-fast: interactive + no password → ok:false, fail() called, no runChild', async () => {
    const f = fakes();
    const result = await configureVault({
      password: undefined,
      vaultPath: paths.vaultPath,
      envFile: paths.envFile,
      interactive: true,
      runChild: f.runChild,
      ok: f.ok,
      skip: f.skip,
      fail: f.fail,
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('no-password');
    expect(f.calls.fail.join(' ')).toMatch(/No vault password supplied/);
    expect(f.calls.runChild).toHaveLength(0);
    // .env untouched
    expect(fs.readFileSync(paths.envFile, 'utf8')).toBe('');
  });

  test('non-interactive + no password: silent skip, no fail, no runChild', async () => {
    const f = fakes();
    const result = await configureVault({
      password: undefined,
      vaultPath: paths.vaultPath,
      envFile: paths.envFile,
      interactive: false,
      runChild: f.runChild,
      ok: f.ok,
      skip: f.skip,
      fail: f.fail,
    });
    expect(result.ok).toBe(true);
    expect(f.calls.fail).toHaveLength(0);
    expect(f.calls.skip.join(' ')).toMatch(/no --vault-password and no VAULT_PASSWORD env/);
    expect(f.calls.runChild).toHaveLength(0);
  });

  test('runChild failure on vault-create: ok:false, no migrate call, no .env append', async () => {
    const f = fakes();
    let callCount = 0;
    const failingRunChild = async (label, args, opts) => {
      f.calls.runChild.push({ label, args, opts });
      callCount++;
      return callCount === 1 ? 1 : 0;
    };
    const result = await configureVault({
      password: 'pw-fail',
      vaultPath: paths.vaultPath,
      envFile: paths.envFile,
      interactive: false,
      runChild: failingRunChild,
      ok: f.ok,
      skip: f.skip,
      fail: f.fail,
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('create-failed');
    expect(f.calls.runChild).toHaveLength(1); // ONLY vault-create attempted
    expect(f.calls.fail.join(' ')).toMatch(/vault creation failed/);
    expect(fs.readFileSync(paths.envFile, 'utf8')).toBe('');
  });

  test('runChild failure on vault-migrate: ok:false, no .env append', async () => {
    const f = fakes();
    let callCount = 0;
    const failingRunChild = async (label, args, opts) => {
      f.calls.runChild.push({ label, args, opts });
      callCount++;
      return callCount === 2 ? 1 : 0;
    };
    const result = await configureVault({
      password: 'pw-migrate-fail',
      vaultPath: paths.vaultPath,
      envFile: paths.envFile,
      interactive: false,
      runChild: failingRunChild,
      ok: f.ok,
      skip: f.skip,
      fail: f.fail,
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('migrate-failed');
    expect(f.calls.runChild).toHaveLength(2);
    expect(f.calls.fail.join(' ')).toMatch(/vault migration failed/);
    expect(fs.readFileSync(paths.envFile, 'utf8')).toBe('');
  });

  test('T-269-26 password-leak: no log call contains the password bytes', async () => {
    const SENTINEL = 'XYZ-LEAK-SENTINEL-' + Date.now();
    const f = fakes();
    await configureVault({
      password: SENTINEL,
      vaultPath: paths.vaultPath,
      envFile: paths.envFile,
      interactive: false,
      runChild: f.runChild,
      ok: f.ok,
      skip: f.skip,
      fail: f.fail,
    });
    const allLogs = [
      ...f.calls.ok,
      ...f.calls.skip,
      ...f.calls.fail,
    ].join('\n');
    expect(allLogs).not.toContain(SENTINEL);
  });

  test('default vault path is REPO_ROOT/secrets.vault when not overridden', async () => {
    const f = fakes();
    // Force the "vault file doesn't exist" branch regardless of the operator's
    // real repo-root state (the developer may have an actual secrets.vault).
    const fsExistsSpy = jest.spyOn(fs, 'existsSync').mockImplementation(() => false);
    try {
      const result = await configureVault({
        password: 'pw-default',
        envFile: paths.envFile,
        interactive: false,
        runChild: f.runChild,
        ok: f.ok,
        skip: f.skip,
        fail: f.fail,
      });
      expect(result.ok).toBe(true);
      expect(f.calls.runChild.length).toBeGreaterThan(0);
      expect(f.calls.runChild[0].opts.env.VAULT_PATH).toMatch(/secrets\.vault$/);
    } finally {
      fsExistsSpy.mockRestore();
    }
  });
});
