---
phase: 269-portable-encrypted-credential-vault
reviewed: 2026-05-13T00:00:00Z
depth: standard
files_reviewed: 31
files_reviewed_list:
  - banking_api_server/.env.example
  - banking_api_server/lib/vault/audit.js
  - banking_api_server/lib/vault/crypto.js
  - banking_api_server/lib/vault/errors.js
  - banking_api_server/lib/vault/format.js
  - banking_api_server/lib/vault/index.js
  - banking_api_server/package.json
  - banking_api_server/scripts/setupFresh.js
  - banking_api_server/scripts/vault-migrate.js
  - banking_api_server/scripts/vault.js
  - banking_api_server/server.js
  - banking_api_server/services/configStore.js
  - banking_api_server/services/vaultLoader.js
  - banking_api_server/tests/vault/audit.test.js
  - banking_api_server/tests/vault/bff-startup.test.js
  - banking_api_server/tests/vault/cli.integration.test.js
  - banking_api_server/tests/vault/cli.regression.test.js
  - banking_api_server/tests/vault/configStore-persistFalse.test.js
  - banking_api_server/tests/vault/crypto.test.js
  - banking_api_server/tests/vault/format.test.js
  - banking_api_server/tests/vault/golden.test.js
  - banking_api_server/tests/vault/migrate.integration.test.js
  - banking_api_server/tests/vault/serverless.test.js
  - banking_api_server/tests/vault/setupFresh-vault.test.js
  - banking_api_server/tests/vault/vault.integration.test.js
  - banking_api_server/tests/vault/vault.regression.test.js
  - banking_mcp_gateway/.env.example
  - banking_mcp_gateway/src/index.ts
  - banking_mcp_gateway/src/vault.ts
  - banking_mcp_gateway/tests/vault.test.ts
  - docs/vault.md
findings:
  critical: 0
  warning: 5
  info: 8
  total: 13
status: issues_found
---

# Phase 269: Code Review Report

**Reviewed:** 2026-05-13
**Depth:** standard
**Files Reviewed:** 31
**Status:** issues_found

## Summary

Phase 269 delivers a well-engineered, defense-in-depth portable encrypted credential vault. The crypto core (`lib/vault/crypto.js`, `lib/vault/format.js`) is correct: Argon2id parameters are frozen via `Object.freeze`, AES-256-GCM uses a fresh random 12-byte IV per seal, per-entry DEKs prevent nonce reuse across saves, HMAC verification uses `crypto.timingSafeEqual`, and the opaque-error contract for wrong-password vs tampered-file is honored throughout the stack (BFF loader, gateway loader, CLI exit codes). The audit module is correctly isolated (no `require('./crypto')` or `require('./format')`), enforces a closed 4-field schema, and writes one synchronous appendFileSync per line. Test coverage is thorough: 14 spec files covering crypto primitives, format/HMAC, audit hygiene, CLI subcommands (regression + integration), BFF loader, serverless bypass, configStore extension, migration, setupFresh DI, and golden fixtures. The Vercel-bypass contract is symmetric between BFF (`vaultLoader.js`) and gateway (`vault.ts`), and the gateway's allowlist regex `/^(MCP_GW_|PROVIDER_|HELIX_|BFF_INTERNAL_)[A-Z0-9_]+$/` is properly anchored.

Five warnings are worth addressing before v1 release. The most consequential is that `lib/vault/index.js` reads `envelope.kdf.salt` (correctly) but does NOT validate `envelope.kdf.memCost / timeCost / parallelism / hashLen` against the frozen `KDF_PARAMS` — an attacker who can write the file (without knowing the password) could downgrade the on-disk KDF params to `m=1, t=1` and submit a tampered file to a victim. The HMAC defense covers this (any envelope edit invalidates the HMAC), but the trust chain depends on the HMAC firing before `deriveKek` runs; today, `deriveKek` is called BEFORE `verifyFileHmac`, which means a malicious file forces the victim's process to spend the configured memory budget regardless of correctness. See WR-01. The remaining warnings are around two `process.env` mutations that could race in concurrent tests, a non-atomic `setupFresh` .env append, a non-strict regex match in `envHas` that admits a curious edge case, and stdout discipline in `cmdSet` when stdin is empty. Info items cover documentation accuracy, dead-code references, and a few code-quality polish opportunities. No critical bugs or security holes were found. The implementation respects all CLAUDE.md emoji rules (only `⚠️ ✅ ❌` appear) and REGRESSION_PLAN.md §1 boundaries (server.js, configStore.js, setupFresh.js changes are surgical and append-only).

## Warnings

### WR-01: KDF parameters are not validated against frozen KDF_PARAMS on open

**File:** `banking_api_server/lib/vault/index.js:119-120` (and `format.js:68-86`)
**Issue:** `parseEnvelope()` validates `magic` and `version`, but does NOT validate `kdf.memCost / timeCost / parallelism / hashLen`. `openVault` then calls `deriveKek(password, envelope.kdf.salt)` which silently uses the FROZEN `KDF_PARAMS` from `crypto.js` (because `deriveKek` ignores any params on the envelope and uses the spread of `KDF_PARAMS` directly).

This is actually safe — the constants in `crypto.js` win — but the design is fragile:

1. The envelope advertises `memCost: 65536` etc. but those values are discarded. A future maintainer who reads `format.js` and assumes the envelope's `kdf` block is honored will introduce a real downgrade bug.
2. Even today, the order in `openVault` is: parse → `deriveKek` (~100ms with 64MiB allocated) → `verifyFileHmac`. A `parseEnvelope` that accepted a tampered file with `magic=BNKV, version=1` but garbage `kdf.salt` forces the victim to spend the full Argon2id cost before the HMAC mismatch is detected. This is a tiny DoS amplifier on hot-startup paths.

The whole-file HMAC catches the tamper, so confidentiality is intact. But the trust chain depends on operators reading the comment in `crypto.js` and not the envelope shape in `format.js`.

**Fix:** Add an explicit check in `parseEnvelope` (or in `openVault` right after parse) that the envelope's advertised KDF params match the frozen ones. Throw `VaultIntegrityError` with the generic message on mismatch:

```javascript
// In format.js parseEnvelope, after version check:
const FROZEN_KDF = { alg: 'argon2id', memCost: 65536, timeCost: 3, parallelism: 4, hashLen: 32 };
if (!obj.kdf || typeof obj.kdf !== 'object') {
  throw new VaultIntegrityError('vault: missing kdf block');
}
for (const [k, v] of Object.entries(FROZEN_KDF)) {
  if (obj.kdf[k] !== v) {
    throw new VaultIntegrityError('vault: unsupported kdf parameters');
  }
}
if (typeof obj.kdf.salt !== 'string' || obj.kdf.salt.length === 0) {
  throw new VaultIntegrityError('vault: missing kdf salt');
}
```

This also produces a cleaner error if a future format version downgrades a vault (today the failure would surface as a confusing HMAC mismatch).

### WR-02: `delete process.env.VAULT_PASSWORD` is not synchronized with concurrent tests

**File:** `banking_api_server/services/vaultLoader.js:104`, `banking_api_server/scripts/vault.js:94`, `banking_mcp_gateway/src/vault.ts:119`
**Issue:** All three vault consumers use the same pattern: read `process.env.VAULT_PASSWORD` at function start, then `delete process.env.VAULT_PASSWORD` in the `finally` block. This is correct at runtime (single-process startup) but creates a TOCTOU race during parallel jest runs:

- Test A imports `vaultLoader` and reads `process.env.VAULT_PASSWORD = 'pw-A'`
- Test B (running in parallel in the same node test process if `--maxWorkers` is misconfigured) sets `process.env.VAULT_PASSWORD = 'pw-B'`
- Test A finishes; its `finally` block deletes `pw-B` — test B's vault load now fails with `VAULT_PASSWORD_MISSING`

This isn't hypothetical — `bff-startup.test.js:155-194` and `serverless.test.js:67-85` mutate `process.env.VAULT_PASSWORD` and rely on `afterEach` to restore it, but a third concurrent test in the same worker would race. Jest's default `testEnvironment: 'node'` shares process.env across test files in the same worker. Test isolation today is by-luck (each `describe` block uses unique tmpdirs).

**Fix:** Either (a) document in `vaultLoader.js` that `process.env.VAULT_PASSWORD` MUST be set in the caller's frame and deleted by the loader (current behavior; document the contract), OR (b) prefer the `opts.password` DI path in tests and stop relying on the env path. Recommend (b): add a test-suite guard

```javascript
// In bff-startup.test.js beforeEach / afterEach:
beforeEach(() => {
  delete process.env.VAULT_PASSWORD; // defense vs leak from prior test
});
```

The current tests do `process.env = { ...ORIG_ENV }` in `afterEach`, which works only if the snapshot was taken before any test mutated VAULT_PASSWORD. Make this explicit.

### WR-03: `setupFresh.js` .env append is non-atomic; partial-write leaves a corrupt .env

**File:** `banking_api_server/scripts/setupFresh.js:935-937`
**Issue:**

```javascript
if (!envHas(envText, 'VAULT_PATH')) {
  fs.appendFileSync(envFile, `\nVAULT_PATH=${vaultPath}\n`);
}
```

`appendFileSync` is not atomic on macOS/Linux. A SIGKILL or `kill -9` of `setup:fresh` between the OS's `open(O_APPEND)` and `write(...)` is rare but possible; more importantly, if `vaultPath` ever contains a newline (e.g. `--vault-path "/tmp/foo\nKEY=evil"`), this writes `KEY=evil` as a separate `.env` line. setupFresh trusts CLI args (T-269-27 documented), but the `.env` write doesn't sanitize.

**Fix:** Validate `vaultPath` (no newlines, no `=`, no `#`) before writing:

```javascript
if (/[\r\n=#]/.test(vaultPath)) {
  _fail(`Invalid vault path (cannot contain newline, =, or #): ${vaultPath}`);
  return { ok: false, reason: 'invalid-vault-path' };
}
```

And/or use the same atomic-write pattern as `data/store.js`:

```javascript
const tmp = envFile + '.tmp';
fs.writeFileSync(tmp, envText + `\nVAULT_PATH=${vaultPath}\n`);
fs.renameSync(tmp, envFile);
```

This is a hardening-grade fix; the realistic attack vector is low (operator must already trust their own `--vault-path` arg).

### WR-04: `envHas` regex matches the start of the key with no anchor on the equals position

**File:** `banking_api_server/scripts/setupFresh.js:540-542`
**Issue:**

```javascript
function envHas(envText, key) {
  return new RegExp(`^${key}=\\S`, 'm').test(envText);
}
```

This regex matches `^VAULT_PATH=…` correctly but ALSO matches `^VAULT_PATH_LONGER=…` if `key === 'VAULT_PATH'` and the file already contains `VAULT_PATH_LONGER=foo`. It checks for a key prefix at the start of a line, then literal `=`, but does NOT escape regex metacharacters in `key` AND does not detect partial-name collisions because the next regex token (`=`) is literal — wait, that's actually fine because of the literal `=` requirement. The collision concern only exists if `key` itself ends with a regex-special character; with our allowlist (uppercase letters + underscores) it's safe today. But:

1. No `key` escaping — fragile if anyone ever passes a key with `.` or `$`
2. The whole-line approach is unusual; most `.env` libraries use `keys()` style parsing

**Fix:** Either escape `key` or do real `.env` parsing:

```javascript
function envHas(envText, key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${escaped}=`, 'm').test(envText);
}
```

Note: also removed the `\\S` (requires non-whitespace after `=`); an empty `VAULT_PATH=` line should still count as "has key" for this purpose to avoid double-writing.

### WR-05: `cmdSet` with empty stdin silently writes an empty value; no validation

**File:** `banking_api_server/scripts/vault.js:175-185`
**Issue:** When `process.stdin.isTTY` is false (the setupFresh.js child-process case OR `echo "" | npm run vault:set FOO`), `cmdSet` calls `readAllStdin()`. If stdin is `/dev/null` or empty, `value` becomes `''` and `vault.set('FOO', '')` succeeds silently. The vault library's `set()` allows empty values (no min-size guard) and the migration script's `if (!value || value.trim() === '')` skip logic would then skip-on-next-migrate. But `cmdSet` itself does NOT warn.

This is a minor pitfall: a user running `npm run vault:set HELIX_API_KEY` while stdin is closed (e.g. piped from `sh -c`) silently writes an empty key, then `npm run vault:get HELIX_API_KEY` returns `''`. The audit log will show `op:set, result:ok` with no signal anything went wrong.

Note: setupFresh.js's `runChild` uses `stdio:['ignore', ...]` for `vault-create` (correct — vault-create doesn't read stdin), but it does NOT call `vault:set` directly from setupFresh, so this path isn't hit during setup:fresh. It only matters for ad-hoc operator use.

**Fix:** Add a guard in `cmdSet` after reading stdin:

```javascript
if (!process.stdin.isTTY) {
  value = await readAllStdin();
  if (value.endsWith('\n')) value = value.slice(0, -1);
  if (value === '') {
    console.error('vault: refusing to set ' + name + ' to empty value (stdin was empty)');
    process.exitCode = 1;
    return;
  }
}
```

This catches the "piped from nothing" pitfall without breaking the legitimate `echo 'value' | vault:set` flow.

## Info

### IN-01: `parseArgsAndDispatch` builds a Commander program then discards it

**File:** `banking_api_server/scripts/vault.js:280-290`
**Issue:** The Commander `program` is built and then explicitly marked dead with `void program;` (line 290). The dispatch is hand-rolled. The comment says "It is intentionally NOT used to dispatch — we do that below from `argv` directly." This is fine but the commander code adds ~10 lines of code that contribute nothing at runtime (no `--help` is ever rendered through this program object).
**Fix:** Either wire `program.help()` for an unknown-subcommand → help-text experience, or drop the commander build entirely:

```javascript
function parseArgsAndDispatch(argv) {
  const subcommand = argv[0];
  const name = argv[1];
  if (!subcommand || !VALID_SUBCOMMANDS.includes(subcommand)) {
    const err = new Error('unknown subcommand: ' + (subcommand || '<missing>'));
    err.exitCode = 64;
    throw err;
  }
  return { subcommand, name };
}
```

This simplifies the module by ~12 lines without any behavior change.

### IN-02: `entries` map cleanup in DEK-unwrap-failure path is correct but easy to miss

**File:** `banking_api_server/lib/vault/index.js:158-169`
**Issue:** When DEK unwrap throws mid-loop, the catch handler zeros `kek` and then iterates `entries` (which only contains the successfully-unwrapped entries before the failure) and zeros their DEKs. This is correct. But a future maintainer adding a new field to the `entries.set(name, {...})` object (e.g. a fresh-allocated buffer field) won't necessarily know to extend the cleanup loop.
**Fix:** Consider extracting a `_zeroEntry(e)` helper that zeros every Buffer field on an entry, then call it from both the unwrap-fail path AND `close()`. This makes the cleanup contract self-documenting:

```javascript
function _zeroEntry(e) {
  if (!e) return;
  if (e.dek) e.dek.fill(0);
  // Future Buffer fields here.
}
```

### IN-03: `cmdRotate` `process.env.VAULT_NEW_PASSWORD` is not cleaned up

**File:** `banking_api_server/scripts/vault.js:242-251`
**Issue:** `getPassword` drops `VAULT_PASSWORD` from env after open, but the new-password env var `VAULT_NEW_PASSWORD` lives until process exit. If a long-running script ever called rotate (none do today), the new password remains in `/proc/<pid>/environ` until the process dies.
**Fix:** Symmetry — also delete `VAULT_NEW_PASSWORD` after the rotate call:

```javascript
await vault.rotate(newPw);
delete process.env.VAULT_NEW_PASSWORD;
await vault.save();
```

### IN-04: Audit log path is fixed at vault open time; rotation of `filePath` not possible

**File:** `banking_api_server/lib/vault/index.js:56, 84-89`
**Issue:** `auditPath = (vaultPath) => vaultPath + '.audit.log'`. If an operator moves the vault file mid-process (rare), the audit log path doesn't follow. Today only one process opens the vault per process lifetime, so this is moot. Worth a comment.

### IN-05: README/docs claim "~50ms" startup leak window but actual is closer to ~200ms on Argon2id

**File:** `docs/vault.md:167, 483`
**Issue:** Multiple places state `VAULT_PASSWORD` is in env for ~50ms. The Argon2id derive (`m=64MiB, t=3, p=4`) measured at ~60-300ms in `tests/vault/golden.test.js`. The actual window is open-call-duration, which is dominated by Argon2id (~100-300ms). The 50ms figure undersells the realistic window.
**Fix:** Update docs to "~100-300ms" or "until the first Argon2id derive completes — typically 60-300ms" for accuracy. Minor; doesn't affect security posture.

### IN-06: `assertProductionSecrets` ordering vs vault load

**File:** `banking_mcp_gateway/src/index.ts:54-75`
**Issue:** The gateway IIFE order is correct: vault load → `loadConfig()` → `assertProductionSecrets(config)`. But `loadConfig()` reads `process.env` — if vault load fails partway (after some env vars were written but before throw), `process.env` has partial vault contents. The `process.exit(1)` after `[GW vault] open failed` prevents the gateway from continuing, but the partial mutation persists until process exit.
**Fix:** Document the post-throw env state in `loadVaultIntoEnv` comment — current behavior is safe because the throw triggers `process.exit(1)`, but it's worth noting:

```typescript
// NOTE: If the vault open succeeds but a per-entry copy throws, we may have
// written some allowlisted entries to process.env before the throw. The
// caller (banking_mcp_gateway/src/index.ts) MUST process.exit on rethrow —
// continuing with partial vault state is unsafe.
```

(Today, the per-entry copy loop doesn't throw in practice — `vault.read()` is in-memory once DEKs are unwrapped — but defense-in-depth.)

### IN-07: Repeated `vault.list()` call in `vaultLoader.js` is fine but redundant with read

**File:** `banking_api_server/services/vaultLoader.js:91-94`
**Issue:**

```javascript
for (const name of vault.list()) {
  data[name.toLowerCase()] = vault.read(name);
  entryCount++;
}
```

`vault.list()` returns `Array.from(entries.keys())`, and `vault.read(name)` does another `entries.get(name)` + `aeadOpen`. Each `read()` records an audit line. For a 9-entry vault that's 9 audit lines per BFF startup — not a problem in absolute terms (NDJSON is cheap), but it's noisier than necessary.
**Fix:** Optional: expose a bulk-read API in `lib/vault` that returns `Map<string,string>` in one audit line:

```javascript
// lib/vault/index.js — add to handle:
readAll() {
  ensureOpen();
  const out = new Map();
  for (const [name, e] of entries) {
    out.set(name, aeadOpen({ iv: e.valueIv, tag: e.valueTag, ct: e.valueCt }, e.dek).toString('utf8'));
  }
  recordAudit(auditPath(filePath), { op: 'read_all', key: null, caller: 'vault.js', result: 'ok' });
  return out;
}
```

This is API-level polish, not a bug.

### IN-08: Hardcoded magic number `64 * 1024` should be a named constant

**File:** `banking_api_server/lib/vault/index.js:53, 213-214`
**Issue:** `VALUE_MAX_BYTES = 64 * 1024` is defined. The error message says "64 KiB max" — both should reference the same source of truth. Today they're independent (constant + literal in message). If you bump the cap, you'd need to update two strings.
**Fix:** Build the message from the constant:

```javascript
const VALUE_MAX_BYTES = 64 * 1024;
const VALUE_MAX_KIB = VALUE_MAX_BYTES / 1024;
// ...
throw new Error(`vault: value too large (${VALUE_MAX_KIB} KiB max)`);
```

Trivial polish.

---

_Reviewed: 2026-05-13_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
