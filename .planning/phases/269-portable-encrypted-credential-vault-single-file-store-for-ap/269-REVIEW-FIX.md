---
phase: 269-portable-encrypted-credential-vault
fixed_at: 2026-05-13T21:48:00Z
review_path: .planning/phases/269-portable-encrypted-credential-vault-single-file-store-for-ap/269-REVIEW.md
iteration: 1
findings_in_scope: 5
fixed: 5
skipped: 0
status: all_fixed
---

# Phase 269: Code Review Fix Report

**Fixed at:** 2026-05-13T21:48:00Z
**Source review:** `.planning/phases/269-portable-encrypted-credential-vault-single-file-store-for-ap/269-REVIEW.md`
**Iteration:** 1

**Summary:**
- Findings in scope: 5 (WR-01 through WR-05; INFO findings deferred)
- Fixed: 5
- Skipped: 0

**Final test verification** (`tests/vault/ oauthStatus.regression oauthStatus.integration hitlRoute.regression hitlRoute.integration --bail`):
- Test Suites: 17 passed, 17 total
- Tests: 204 passed, 204 total

## Fixed Issues

### WR-01: KDF parameters are not validated against frozen KDF_PARAMS on open

**Files modified:** `banking_api_server/lib/vault/format.js`, `banking_api_server/tests/vault/format.test.js`, `banking_api_server/tests/vault/vault.regression.test.js`
**Commit:** `65cfc91c`
**Applied fix:** Added a frozen `FROZEN_ENVELOPE_KDF` constant to `format.js` and extended `parseEnvelope` to reject any envelope whose advertised `kdf.alg / memCost / timeCost / parallelism / hashLen` disagrees with the frozen values, or that is missing the `kdf` block or `kdf.salt`. The check fires BEFORE `openVault` runs the expensive Argon2id `deriveKek`, closing a DoS amplifier on hot-startup paths and making the trust chain self-documenting. Added 5 new tests in `format.test.js` (missing kdf, downgraded memCost, downgraded timeCost, alg mismatch, missing salt) plus a `vault.regression.test.js` regression that proves a downgraded `memCost` errors in under 200ms — well below a single Argon2id derive.

### WR-02: `delete process.env.VAULT_PASSWORD` is not synchronized with concurrent tests

**Files modified:** `banking_api_server/tests/vault/bff-startup.test.js`, `banking_api_server/tests/vault/serverless.test.js`, `banking_api_server/tests/vault/cli.regression.test.js`
**Commit:** `d0b14c1c`
**Applied fix:** Added explicit `beforeEach(() => delete process.env.VAULT_PASSWORD)` (and `VAULT_NEW_PASSWORD`) guards to the three vault test files that mutate the env var. The existing `process.env = {...ORIG_ENV}` afterEach restoration was correct in isolation but order-sensitive when other suites in the same Jest worker leak the var in. Explicit pre-test cleanup makes isolation independent of test ordering.

### WR-03: `setupFresh.js` .env append is non-atomic; partial-write leaves a corrupt .env

**Files modified:** `banking_api_server/scripts/setupFresh.js`, `banking_api_server/tests/vault/setupFresh-vault.test.js`
**Commit:** `7e6d1777`
**Applied fix:** Added `vaultPath` validation in `configureVault` (rejects `\r`, `\n`, `=`, `#`) before any .env write, returning `{ok:false, reason:'invalid-vault-path'}` and calling `_fail()` on rejection. Replaced `fs.appendFileSync` with the atomic `tmp + rename` pattern (consistent with `data/store.js`) so a SIGKILL between `open(O_APPEND)` and `write(...)` cannot corrupt the .env. Added 4 new tests: newline rejection, `=` rejection, `#` rejection, and a check that no `.tmp` file is left after a successful write.

### WR-04: `envHas` regex matches with no metacharacter escaping

**Files modified:** `banking_api_server/scripts/setupFresh.js`, `banking_api_server/tests/vault/setupFresh-vault.test.js`
**Commit:** `ddb5a9df`
**Applied fix:** Escaped regex metacharacters in `key` before constructing the RegExp (standard `.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')` pattern). Preserved the `\\S` value-presence semantic to avoid breaking `ensureEnvForFreshInstall`'s `envHas(existing, 'SESSION_SECRET')` check (which intentionally treats a bare `KEY=` as "missing"). Exported `envHas` from `scripts/setupFresh.js` for testability. Added 7 new unit tests covering escape behavior for `.`, `$`, the empty-value semantic preservation, absent-key, and a regression case for the normal uppercase path.

### WR-05: `cmdSet` with empty stdin silently writes an empty value

**Files modified:** `banking_api_server/scripts/vault.js`, `banking_api_server/tests/vault/cli.regression.test.js`
**Commit:** `707ec0f5`
**Applied fix:** Added a fail-fast guard in `cmdSet`'s non-TTY branch: after reading stdin and trimming the trailing newline, if the resulting value is `''`, print a clear stderr message (`vault: refusing to set NAME to empty value (stdin was empty)`), set `process.exitCode = 1`, and return BEFORE `vault.set` or `vault.save` are called. This catches the `vault:set FOO < /dev/null` pitfall without breaking the legitimate `echo 'value' | vault:set FOO` flow. Added 2 regression tests in `cli.regression.test.js`: zero-data stdin (immediate `end`) and whitespace-only `\n` stdin.

---

_Fixed: 2026-05-13T21:48:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
