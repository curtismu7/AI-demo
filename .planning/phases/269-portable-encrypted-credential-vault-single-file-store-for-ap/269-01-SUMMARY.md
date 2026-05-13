---
phase: 269
plan: 01
subsystem: banking_api_server/lib/vault
tags: [vault, crypto, aes-gcm, argon2id, hmac, configStore, security]
dependency_graph:
  requires:
    - banking_api_server/services/configStore.js (existing — extended in Task 3)
    - banking_api_server/data/store.js (atomic write pattern reference)
    - node:crypto (built-in AEAD + HKDF)
  provides:
    - banking_api_server/lib/vault/index.js — openVault / createVault public API
    - banking_api_server/lib/vault/crypto.js — Argon2id KDF, AES-256-GCM seal/open, HKDF sub-key
    - banking_api_server/lib/vault/format.js — JSON envelope + canonical JSON + whole-file HMAC
    - banking_api_server/lib/vault/audit.js — NDJSON audit writer (no value channel)
    - banking_api_server/lib/vault/errors.js — 5 typed error classes
    - configStore.setRaw(data, {persist:false}) extension
    - REQ-VAULT-01..13 registered
    - .gitignore patterns for secrets.vault*
    - Golden vault fixtures (valid + corrupted variants)
  affects:
    - Plan 02 (CLI) — depends on openVault/createVault API
    - Plan 03 (BFF startup loader) — depends on configStore.setRaw({persist:false})
    - Plan 04 (docs + .env.example) — depends on REQUIREMENTS.md entries
    - Plan 05 (setup-fresh wiring) — depends on the public API shipped here
tech-stack:
  added:
    - argon2@^0.44.0 (npm; node-gyp native build; OWASP-recommended KDF)
  patterns:
    - KEK / per-entry DEK envelope (RESEARCH.md "Pattern 1")
    - Whole-file HMAC over canonical JSON (HKDF sub-key from KEK)
    - Atomic write (tmp file + rename, mode 0o600)
    - Opaque error for wrong-password vs tampered-file (no oracle)
    - KEK + DEK zeroing on close (kek.fill(0) / dek.fill(0))
key-files:
  created:
    - banking_api_server/lib/vault/errors.js
    - banking_api_server/lib/vault/crypto.js
    - banking_api_server/lib/vault/format.js
    - banking_api_server/lib/vault/audit.js
    - banking_api_server/lib/vault/index.js
    - banking_api_server/tests/vault/crypto.test.js
    - banking_api_server/tests/vault/format.test.js
    - banking_api_server/tests/vault/audit.test.js
    - banking_api_server/tests/vault/golden.test.js
    - banking_api_server/tests/vault/vault.regression.test.js
    - banking_api_server/tests/vault/vault.integration.test.js
    - banking_api_server/tests/vault/configStore-persistFalse.test.js
    - banking_api_server/tests/vault/fixtures/README.md
    - banking_api_server/tests/vault/fixtures/valid-v1.vault
    - banking_api_server/tests/vault/fixtures/corrupted-v1.vault
  modified:
    - banking_api_server/services/configStore.js (setRaw signature — backwards-compatible)
    - banking_api_server/package.json (argon2 dep)
    - banking_api_server/package-lock.json
    - .planning/REQUIREMENTS.md (added REQ-VAULT-01..13)
    - .gitignore (added 3 vault patterns)
decisions:
  - "AES-256-GCM via node:crypto (no new heavy dep; matches existing configStore.js pattern)"
  - "Argon2id parameters Object.freeze'd: m=65536/t=3/p=4/hashLen=32 (OWASP 2025)"
  - "Per-entry DEK wrapped under KEK — adding entry C does not touch A/B ciphertext bytes (binary-diff verified)"
  - "Whole-file HMAC over canonical JSON via HKDF sub-key catches structural tampering (per-entry GCM tags cannot)"
  - "audit.js intentionally does NOT require ./crypto or ./format — by construction has no path to decrypted values"
  - "configStore.setRaw(data, opts={}) — opts.persist===false skips SQLite; strict boolean type check throws on other types"
  - "Test-only hook _kekZeroedForTesting() gated by process.env.VAULT_TEST_HOOK==='true' (not documented in public API)"
metrics:
  duration: "~8 minutes 27 seconds (Argon2 hash time on dev machine: ~60ms)"
  tasks_completed: 3
  tests_added: 71
  completed: 2026-05-13
---

# Phase 269 Plan 01: Vault core library + test scaffolds Summary

Built the portable encrypted credential vault core library (Argon2id KEK + per-entry AES-256-GCM-wrapped DEK + whole-file HMAC) plus all Wave 0 test scaffolds and the configStore.setRaw extension needed by Plan 03.

## What Was Built

### Vault library (`banking_api_server/lib/vault/`)

| File | Lines | Role |
|------|------:|------|
| `errors.js` | 56 | 5 typed error classes — VaultIntegrityError, VaultAuthError, VaultNotFoundError, VaultEntryNotFoundError, VaultPasswordRequiredError |
| `crypto.js` | 106 | `KDF_PARAMS` (Object.freeze'd Argon2id config), `deriveKek`, `aeadSeal`, `aeadOpen`, `hkdfFileHmacKey` |
| `format.js` | 134 | `MAGIC='BNKV'`, `VERSION=1`, `canonicalJson` (alpha-sorted keys, deterministic), `parseEnvelope` (throws VaultIntegrityError on magic/version mismatch), `computeFileHmac` / `verifyFileHmac` (timingSafeEqual) |
| `audit.js` | 60 | NDJSON `recordAudit`; strict field allowlist `{op,key,result,caller}`; non-fatal write failures (console.warn only); does NOT require `./crypto` or `./format` |
| `index.js` | 343 | `openVault(path, password)` + `createVault(path, password)` returning a handle with `read/set/delete/list/rotate/save/close` |

### Test files (`banking_api_server/tests/vault/`)

| File | Tests | Coverage |
|------|------:|----------|
| `crypto.test.js` | 16 | KDF determinism, AEAD round-trip, byte-flip detection (iv/tag/ct), wrong-key opaque error, length validation, HKDF determinism |
| `format.test.js` | 16 | MAGIC/VERSION constants, canonicalJson key ordering, parseEnvelope magic/version errors, fileHmac compute/verify + tamper detection |
| `audit.test.js` | 6 | 7-field line shape, unexpected-field rejection, 50 non-interleaved appends, sentinel grep test (zero hits unless caller passes as key), non-fatal write failure |
| `golden.test.js` | 4 | Round-trip valid-v1.vault + tamper detection on corrupted-v1.vault |
| `vault.regression.test.js` | 14 | create/open basics, set→save→reopen, delete, opaque wrong-password error, rotate, per-entry binary diff, input validation |
| `vault.integration.test.js` | 6 | Full round-trip with real audit log, atomic save (fsp.rename spy), opaque-error parity (no oracle), KEK zeroing, audit log never contains values |
| `configStore-persistFalse.test.js` | 7 | Back-compat with no opts, {persist:false} skips SQLite, {persist:true} writes, {persist:'no'}/`{persist:1}` throws, cache observability via getEffective |
| **Total** | **71** | All passing |

### Golden fixtures

| File | Size | Password | Purpose |
|------|-----:|----------|---------|
| `tests/vault/fixtures/valid-v1.vault` | 759B | `golden-test-password` | Known-good round-trip; entries GREETING + NOTE |
| `tests/vault/fixtures/corrupted-v1.vault` | 759B | (same) | Byte 0 of `entries.GREETING.value` (base64-decoded) XOR'd with 0xff; fileHmac mismatches |
| `tests/vault/fixtures/README.md` | — | — | Test-data-only ⚠️ warning + regeneration recipe |

### configStore.setRaw extension

`banking_api_server/services/configStore.js` line ~491:
- Signature: `async setRaw(data, opts = {})`
- `opts.persist` must be boolean if provided (else throws); `opts.persist === false` skips SQLite upsert
- Default behavior unchanged — existing `setRaw(data)` callers continue to write to SQLite
- Cache update is unconditional so `getEffective(k)` works in both modes

### REQUIREMENTS.md + .gitignore

- **REQUIREMENTS.md:** Added "Portable Encrypted Credential Vault (Phase 269)" section with REQ-VAULT-01..13 each as `[ ]` (unchecked — Plans 02-05 close them out)
- **.gitignore:** Added 3 patterns after the existing `config.db` block:
  - `secrets.vault`
  - `secrets.vault.tmp`
  - `secrets.vault.audit.log`

## Frozen Crypto Choices

| Choice | Value | Source |
|--------|-------|--------|
| AEAD cipher | AES-256-GCM via `node:crypto` (12-byte IV, 16-byte tag) | RESEARCH.md "Pattern 1"; matches `configStore.js` existing pattern |
| KDF | Argon2id via `argon2@^0.44.0` (raw mode → 32-byte Buffer) | RESEARCH.md "Recommended Argon2id parameters"; OWASP 2025 |
| `KDF_PARAMS` (Object.freeze'd) | `memoryCost=65536, timeCost=3, parallelism=4, hashLength=32` | OWASP recommendation for developer-laptop threat model |
| Whole-file HMAC | HMAC-SHA256 with HKDF sub-key from KEK + `'fileHmac/v1'` info | RESEARCH.md "Pattern 1" |
| Magic + version | `BNKV` + integer `1` | RESEARCH.md "Magic + version" |
| Atomic write | `fsp.writeFile(tmp, ...); fsp.rename(tmp, final)` mode `0o600` | RESEARCH.md "Atomic file write" + `data/store.js` `_atomicWrite` |

## Argon2 Benchmark (dev machine)

`deriveKek('benchmark-password', 16-byte-salt)` on this machine: **~60ms per hash**.

This is within RESEARCH.md's target window (~300ms is acceptable startup cost; faster is fine). On constrained CI runners, hash time will be 200-500ms — the 30-second jest timeout in `crypto.test.js` and `golden.test.js` comfortably accommodates that.

## REGRESSION_PLAN §1 Statement

**Protected row:** `Config UI / configStore | All PingOne settings lost | services/configStore.js, routes/adminConfig.js`

**What this plan preserves:**
- `setRaw(data)` signature is backwards-compatible — existing callers (no opts arg) continue to write to SQLite with identical behavior
- `_encrypt`, `_decrypt`, `getMasked`, `getEffective`, `setConfig`, `FIELD_DEFS`, `SECRET_KEYS` — all UNTOUCHED
- Cache write happens AFTER SQLite write (same order as before)
- Try/catch wraps SQLite write so writes fail soft to `console.warn` (same as before)
- The only NEW behavior is explicit `{persist: false}` opts skipping the SQLite upsert (cache still updates so `getEffective` observes the value in this process)

Critical existing regression suite (REQ-VAULT-13) verified:
- `oauthStatus.regression.test.js` — green
- `oauthStatus.integration.test.js` — green
- `hitlRoute.regression.test.js` — green
- `hitlRoute.integration.test.js` — green
- **38/38 tests pass**

## Deviations from Plan

**None — plan executed exactly as written.**

Two minor planning-doc nuances handled without escalation:

1. **Worktree planning files:** The `.planning/phases/269-portable-encrypted-credential-vault-single-file-store-for-ap/` directory existed in the main checkout but had not been propagated to this worktree at execution start. Plans were read from the main checkout via absolute path. The SUMMARY was created in the worktree at the expected path (orchestrator will see it on worktree merge).

2. **Worktree git base check:** The pre-run base check expected commit `3a726f0`, but the worktree HEAD `02f107c` was already the latest main-branch commit and the expected base did not exist in the object database. Proceeded from the current HEAD since it was already up-to-date with main — no rebase was needed or possible.

## Acceptance Criteria — Status

All 18 acceptance criteria across the 3 tasks pass. Highlights:

- `grep "\"argon2\":" banking_api_server/package.json` → `^0.44.0` ✅
- `KDF_PARAMS.memoryCost / timeCost / parallelism` → `65536 / 3 / 4` ✅
- `MAGIC / VERSION` → `BNKV / 1` ✅
- 5 error classes present in `errors.js` ✅
- Both fixture files exist (`valid-v1.vault`, `corrupted-v1.vault`) ✅
- No `console.log` in `lib/vault/*` ✅
- `audit.js` does not require `./crypto` or `./format` ✅
- `kek.fill(0)` / `dek.fill(0)` appears 9× in `index.js` (close + delete + rotate + bad-HMAC paths) ✅
- `NAME_RE = /^[A-Z_][A-Z0-9_]*$/` ✅
- `VALUE_MAX_BYTES = 64 * 1024` ✅
- Atomic write pattern (tmp + rename) at lines 81-82 (create) and 305-306 (save) ✅
- Opaque error sanity check (`/argon|kek|dek/i`) → `OK` ✅
- `opts.persist` in `configStore.js` → 4 references; `shouldPersist` → 2 ✅
- REQ-VAULT- count in REQUIREMENTS.md → 13 ✅
- `secrets.vault` count in `.gitignore` → 3 ✅
- `setRaw({k:'v'}, {persist:'no'})` → `THREW` ✅
- 71/71 vault tests pass; 38/38 critical regression tests pass ✅

## Test Commands

```bash
# Plan 01 vault suite (71 tests)
cd banking_api_server && npx jest --testPathIgnorePatterns='/node_modules/' \
  --testPathPattern='tests/vault/' --bail --forceExit

# Critical regression suite (REQ-VAULT-13)
cd banking_api_server && npx jest --testPathIgnorePatterns='/node_modules/' \
  --testPathPattern='(oauthStatus|hitlRoute)\.(regression|integration)' --bail --forceExit

# Opaque error sanity check
cd banking_api_server && VAULT_TEST_HOOK=true node -e "(async () => { \
  const {createVault,openVault} = require('./lib/vault'); \
  const fs = require('fs'); \
  const p = require('os').tmpdir() + '/vt-' + Date.now() + '.vault'; \
  const v = await createVault(p, 'right'); await v.save(); v.close(); \
  try { await openVault(p, 'wrong'); } \
  catch (e) { console.log(/argon|kek|dek/i.test(e.message) ? 'LEAK' : 'OK'); } \
  finally { try { fs.unlinkSync(p); fs.unlinkSync(p + '.audit.log'); } catch {} } \
})();"
```

## Commits

| Task | Hash | Files | Tests |
|-----:|------|-------|------:|
| 1 — Scaffold + Wave 0 unit tests + golden fixtures | `20512609` | 14 created (lib/vault/* + 4 test files + 2 fixtures + README), 2 modified (package.json + lock) | 44 |
| 2 — openVault / createVault handle | `6f6eabee` | 1 modified (index.js), 2 created (regression + integration test files) | 20 |
| 3 — configStore.setRaw extension + REQ-VAULT-01..13 + .gitignore | `371f3ec5` | 3 modified (configStore.js + REQUIREMENTS.md + .gitignore), 1 created (configStore-persistFalse test) | 7 |
| **Total** | | | **71** |

## Self-Check: PASSED

**Files created — verified present:**
- ✅ banking_api_server/lib/vault/errors.js
- ✅ banking_api_server/lib/vault/crypto.js
- ✅ banking_api_server/lib/vault/format.js
- ✅ banking_api_server/lib/vault/audit.js
- ✅ banking_api_server/lib/vault/index.js
- ✅ banking_api_server/tests/vault/crypto.test.js
- ✅ banking_api_server/tests/vault/format.test.js
- ✅ banking_api_server/tests/vault/audit.test.js
- ✅ banking_api_server/tests/vault/golden.test.js
- ✅ banking_api_server/tests/vault/vault.regression.test.js
- ✅ banking_api_server/tests/vault/vault.integration.test.js
- ✅ banking_api_server/tests/vault/configStore-persistFalse.test.js
- ✅ banking_api_server/tests/vault/fixtures/valid-v1.vault
- ✅ banking_api_server/tests/vault/fixtures/corrupted-v1.vault
- ✅ banking_api_server/tests/vault/fixtures/README.md

**Commits — verified in git log:**
- ✅ 20512609 — feat(269-01): vault crypto + format + audit scaffolding + golden fixtures
- ✅ 6f6eabee — feat(269-01): implement openVault/createVault handle + regression + integration tests
- ✅ 371f3ec5 — feat(269-01): extend configStore.setRaw with {persist:false} + register REQ-VAULT-01..13 + .gitignore
