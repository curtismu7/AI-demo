---
phase: 269
plan: 05
subsystem: banking_api_server/scripts + docs/vault.md + REGRESSION_PLAN.md
tags: [vault, migration, docs, regression-plan, setupFresh, integration, security]
dependency_graph:
  requires:
    - banking_api_server/lib/vault/index.js (Plan 01 — openVault/createVault API)
    - banking_api_server/scripts/vault.js (Plan 02 — vault:create subcommand)
    - banking_api_server/services/vaultLoader.js (Plan 03 — BFF startup reference)
    - banking_mcp_gateway/src/vault.ts (Plan 04 — gateway reference for docs)
  provides:
    - banking_api_server/scripts/vault-migrate.js — vault:migrate-from-env CLI with closed allowlist
    - npm script: vault:migrate-from-env
    - docs/vault.md — 577-line operator reference covering crypto, CLI, recovery, CI, Vercel, threats, FAQ
    - REGRESSION_PLAN.md §1 — 4 new APPEND-ONLY rows (vault library, vault BFF startup, setupFresh phase order, setupFresh runChild env passthrough)
    - REGRESSION_PLAN.md §4 — Phase 269 Bug Log entry (feature addition, regression-relevant)
    - 269-VALIDATION.md — 13-row per-task verification map; nyquist_compliant: true
    - banking_api_server/scripts/setupFresh.js — configureVault() phase + 3 new flags + runChild env passthrough + module.exports for DI
    - banking_api_server/tests/vault/setupFresh-vault.test.js — 9 unit tests including POSITIVE-PATH end-to-end env-propagation regression guard
  affects:
    - End-of-phase 269 polish — operators can migrate, read docs, and the regression contract protects the vault module
tech-stack:
  added: []  # No new deps — reuses argon2/@inquirer/password/commander from Plans 01-02
  patterns:
    - "Closed allowlist (ALLOWED_ENV_VARS, 9 entries) prevents arbitrary env-var migration (T-269-23)"
    - "Migration logs name + length only — NEVER values (T-269-21); sentinel-grep test asserts"
    - "Default skip-on-conflict for re-runs (T-269-22); --force overrides"
    - "setupFresh runChild now honors opts.env (default: process.env — existing call sites unaffected)"
    - "configureVault DI options bag — testable without spawnSync or test-mode env vars"
    - "configureVault refuses to prompt interactively (T-269-26 — readlineFreeText doesn't mask)"
    - "VAULT_PATH written to banking_api_server/.env only (gateway sees via run-bank.sh symlink)"
    - "module.exports + require.main === module guard — `require('./setupFresh.js')` from tests does NOT auto-run setup"
    - "REGRESSION_PLAN.md edit is APPEND-ONLY (T-269-25 — verified 0 deletions)"
key-files:
  created:
    - banking_api_server/scripts/vault-migrate.js
    - banking_api_server/tests/vault/migrate.integration.test.js
    - banking_api_server/tests/vault/setupFresh-vault.test.js
    - docs/vault.md
  modified:
    - banking_api_server/package.json (added vault:migrate-from-env npm script)
    - banking_api_server/scripts/setupFresh.js (Step 0 runChild env passthrough + Step 1 configureVault phase + 3 new flags + module.exports + require.main guard + --help text)
    - REGRESSION_PLAN.md (§1: 4 new APPEND-ONLY rows; §4: Phase 269 Bug Log entry)
    - .planning/phases/269-portable-encrypted-credential-vault-single-file-store-for-ap/269-VALIDATION.md (13-row per-task verification map; frontmatter flipped to nyquist_compliant: true)
decisions:
  - "ALLOWED_ENV_VARS is Object.freeze'd at module top-level — no env-var-based expansion (T-269-23 invariant)"
  - "No --remove-from-env flag in vault-migrate — operator manually edits .env after verifying vault (half-edit-safety property)"
  - "docs/vault.md uses placeholders (<your-strong-passphrase>, s3cret-place-holder) — verified by grep for token-shaped strings"
  - "REGRESSION_PLAN.md edits are APPEND-ONLY (T-269-25); both Task 2 and Task 3 verified 0 deletions"
  - "configureVault refactored to accept DI options bag rather than introducing SUPER_BANKING_TEST_MODE — zero production code pollution for testability"
  - "POSITIVE-PATH test uses REAL runChild (no fake) — Step 0 env-passthrough regression guard. If env propagation breaks, openVault throws and the test fails."
  - "Default vault path is REPO_ROOT/secrets.vault — aligned with Plan 03 DEFAULT_VAULT_PATH and Plan 04 (gateway sees via run-bank.sh symlink, no separate gateway .env write needed)"
  - "main() wrapped in `if (require.main === module)` so `require('./setupFresh.js')` from tests does NOT auto-run setup; module.exports = { configureVault } unconditional"
metrics:
  duration: "~28 minutes (3 tasks: migrate CLI + docs + setupFresh)"
  tasks_completed: 3
  tests_added: 21
  completed: 2026-05-13
---

# Phase 269 Plan 05: End-of-phase polish — migration script + docs + REGRESSION_PLAN + setupFresh wiring Summary

Phase 269 closes out with operator-facing polish — a one-shot `.env → vault` migration script, a 577-line operator manual, the REGRESSION_PLAN updates that protect the new code, and the setupFresh integration that gives fresh installs a vault from the first run.

## What Was Built

### Task 1 — `banking_api_server/scripts/vault-migrate.js` + 12 integration tests

Migration CLI with closed `ALLOWED_ENV_VARS` allowlist (9 entries):

```
HELIX_API_KEY
PINGONE_ADMIN_CLIENT_SECRET
PINGONE_AI_CORE_CLIENT_SECRET
PINGONE_AI_AGENT_CLIENT_SECRET
PINGONE_MCP_TOKEN_EXCHANGER_CLIENT_SECRET
MCP_GW_CLIENT_SECRET
BFF_INTERNAL_SECRET
CONFIG_ENCRYPTION_KEY
SESSION_SECRET
```

| Flag | Behavior |
|---|---|
| `--dry-run` | Print what WOULD copy; do not mutate vault. Counted in summary as "would copy". |
| `--force` | Overwrite existing vault entries (default: skip with "already in vault" log). |
| `--vault <path>` | Override VAULT_PATH env var. |

T-269-21 guarantee: the script logs ONLY the entry name and character length. The sentinel-grep integration test asserts that no captured stdout/stderr line contains a known secret value (`'XYZ-MIGRATE-TEST-SECRET-XYZ-' + Date.now()`).

T-269-23 guarantee: arbitrary env names (`MY_RANDOM`, `LD_PRELOAD`, `PATH`) are NOT migrated — they're not in `ALLOWED_ENV_VARS`. Verified by integration test that injects `LD_PRELOAD='/evil.so'` and asserts the vault never contains it.

### Task 2 — `docs/vault.md` (577 lines) + REGRESSION_PLAN.md + 269-VALIDATION.md finalize

Table of contents in `docs/vault.md`:

- Why a vault?
- Crypto choices (Argon2id m=64MiB/t=3/p=4, AES-256-GCM, whole-file HMAC, BNKV magic + version 1, atomic writes; alternatives considered + rejected)
- File location (repo-root default, VAULT_PATH override, file permissions guidance)
- CLI usage (6 vault subcommands + vault:migrate-from-env, password supply, stdout discipline, exit codes, resolution priority)
- Migration from .env (closed allowlist, flags, sample run, why no --remove-from-env)
- Recovery procedure (no recovery — re-provision from source)
- CI handling (VAULT_PASSWORD env, setupFresh fail-fast contract)
- Vercel (load is SKIPPED; use Encrypted Environment Variables)
- Threat model summary (30 STRIDE entries — T-269-01..30 with mitigation status)
- Requirement coverage (REQ-VAULT-01..13 cross-reference)
- FAQ (11 questions including "what if I forget the password", "can I commit secrets.vault", "does VAULT_PASSWORD show up in ps")

**REGRESSION_PLAN.md §1 — 4 APPEND-ONLY rows added:**

| Row | Files protected |
|---|---|
| Vault library | `banking_api_server/lib/vault/{crypto,format,audit,index}.js` — touch only via VERSION bump |
| Vault BFF startup | `banking_api_server/services/vaultLoader.js`, `banking_api_server/server.js` — setRaw {persist:false}, vault.close() in finally, delete VAULT_PASSWORD |
| setupFresh.js phase order | Phase order contractual: confirm-dir → cleanup → deps → hosts → [pingone-wipe] → [import] → bootstrap → [vault] → [helix] |
| setupFresh.js runChild env passthrough | spawn call MUST include `env: opts.env \|\| process.env` |

`git diff REGRESSION_PLAN.md | grep "^-" | grep -v "^--- " | wc -l` → **0** (append-only invariant verified, T-269-25).

**REGRESSION_PLAN.md §4 — Phase 269 Bug Log entry** (feature addition, regression-relevant) lists every touched file, the configStore signature extension, the BFF IIFE wrap, and the "do not break" list (4 rows above + on-disk format + IIFE ordering + fail-fast password contract).

**269-VALIDATION.md — 13 rows in per-task verification map:**

| Task ID | Plan | Status |
|---|---|---|
| 269-01-01 → 269-01-03 | Plan 01 (vault library) | ✅ green |
| 269-02-01 → 269-02-02 | Plan 02 (CLI) | ✅ green |
| 269-03-01 → 269-03-02 | Plan 03 (BFF startup) | ✅ green |
| 269-04-01 → 269-04-02 | Plan 04 (gateway) | ✅ green |
| 269-05-01 → 269-05-03 | Plan 05 (migrate + docs + setupFresh) | ✅ green |

Frontmatter: `nyquist_compliant: true`, `wave_0_complete: true`, `status: ready`. All 6 sign-off boxes checked.

### Task 3 — `banking_api_server/scripts/setupFresh.js` + 9 unit tests

**Step 0 (precondition) — runChild env passthrough:**

```diff
  const child = spawn('node', scriptArgs, {
    cwd: opts.cwd || SERVER_ROOT,
+   env: opts.env || process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
```

This was added in iteration 2 to close the env-passthrough gap. Defaulting to `process.env` keeps existing call sites byte-for-byte equivalent (spawn's default-inherit semantics match `env: process.env`). The new path that matters is configureVault passing `opts.env = { ...process.env, VAULT_PASSWORD, VAULT_PATH }`.

**Step 1 — three new flags:**

| Flag | Purpose |
|---|---|
| `--skip-vault` | Skip the credential vault setup phase. No prompt, no file written, no .env mutation. |
| `--vault-password <pw>` | Vault password. Visible in `/proc/<pid>/cmdline` while setup runs — warning in --help text. T-269-27 accepted tradeoff. |
| `--vault-path <path>` | Override vault file path. Default: `<repo-root>/secrets.vault`. |

LOCAL_FLAGS Set updated; `_stripValueFlag('--vault-password')` + `_stripValueFlag('--vault-path')` remove the value tokens from `passthroughFlags` so they don't reach bootstrapPingOne.

**Step 2 — `configureVault(opts = {})`:**

DI signature — every collaborator (runChild, readQuestion, ok, skip, fail) is overridable with the module-scoped helper as default. Production call site `await configureVault()` is unchanged.

Returns `{ok: true}` on success or `{ok: false, reason: '...'}` on fail-fast. Caller (main()) decides whether to `process.exit(1)`.

Behavior:

| State | Action |
|---|---|
| Vault file already exists | `_skip('vault present at <path> — skipping creation')` → return `{ok: true}` (T-269-29) |
| No password + interactive TTY | `_fail('No vault password supplied...')` → return `{ok: false, reason: 'no-password'}` (T-269-26) |
| No password + non-interactive | `_skip('no --vault-password and no VAULT_PASSWORD env...')` → return `{ok: true}` |
| Happy path | runChild(`vault:create`) → if fail, `_fail` + return; runChild(`vault:migrate-from-env`) → if fail, `_fail` + return; appendFileSync `VAULT_PATH=...` to envFile; `_ok` + return `{ok: true}` |

Both runChild invocations pass `opts.env = { ...process.env, VAULT_PASSWORD: password, VAULT_PATH: vaultPath }` — VAULT_PASSWORD ONLY goes through env (NOT argv — T-269-27).

**Step 3 — main() wiring (both branches):**

`phases.push('vault')` added when `!SKIP_VAULT`. configureVault call inserted in both bootstrap-ran path (between `ok('PingOne resources provisioned')` and `if (!SKIP_HELIX)`) AND the `skipBootstrap` early-return branch.

**Step 4 — module.exports + main() guard:**

```js
module.exports = { configureVault };

if (require.main === module) {
  openLog();
  patchConsole();
  // ... process.on handlers ...
  main().then(...).catch(...);
}
```

Importing `require('./setupFresh.js')` from a test no longer auto-runs setup. The export is unconditional so `Object.keys(require('./setupFresh.js'))` returns `['configureVault']`.

**Step 5 — --help text gains 3 new flag lines** describing each flag including the T-269-27 cmdline-visibility warning on `--vault-password`.

**Tests (9 unit tests — Option B DI strategy):**

| # | Test | Verifies |
|---|---|---|
| 1 | Happy path | runChild called twice (create + migrate); both opts.env carry VAULT_PASSWORD + VAULT_PATH; .env appended with VAULT_PATH= |
| 2 | **POSITIVE-PATH: env reaches REAL spawned child (Step 0 regression guard)** | REAL runChild (no fake); after configureVault returns, `openVault(vaultPath, sentinelPassword)` succeeds — proves env propagation end-to-end |
| 3 | Existing vault file | Skip-creation branch, no runChild call, .env untouched |
| 4 | Fail-fast (interactive + no password) | Returns `{ok: false, reason: 'no-password'}`, fail() called with `'No vault password supplied'` message |
| 5 | Non-interactive + no password | Returns `{ok: true}`, skip() called, no runChild |
| 6 | runChild fails on vault-create | Returns `{ok: false, reason: 'create-failed'}`, only 1 runChild call, no .env write |
| 7 | runChild fails on vault-migrate | Returns `{ok: false, reason: 'migrate-failed'}`, 2 runChild calls, no .env write |
| 8 | **T-269-26 password-leak sentinel** | Concatenated log output (ok + skip + fail) does NOT contain the sentinel password bytes |
| 9 | Default vault path resolution | Falls back to REPO_ROOT/secrets.vault when not passed via DI |

## Verification

### Test pass rates

```
Task 1: 12/12 migrate.integration.test.js tests passing
Task 3:  9/9 setupFresh-vault.test.js tests passing
Full vault suite (after Plan 05): 147/147 tests passing
Critical regression suite (REQ-VAULT-13): 38/38 tests passing
```

### REGRESSION_PLAN.md append-only invariant

```
$ git diff REGRESSION_PLAN.md | grep "^-" | grep -v "^--- " | wc -l
0
```

### Module-import without side effects

```
$ cd banking_api_server && node -e "const m = require('./scripts/setupFresh.js'); console.log('exports:', Object.keys(m));"
exports: [ 'configureVault' ]
```

(Setup banner does NOT print — the `require.main === module` guard works.)

### Acceptance criteria — all green

**Task 1:**
- `grep -c "\"vault:migrate-from-env\"" banking_api_server/package.json` → 1 ✅
- `grep -c "ALLOWED_ENV_VARS" banking_api_server/scripts/vault-migrate.js` → 3 ≥ 2 ✅
- `grep -c "Object.freeze" banking_api_server/scripts/vault-migrate.js` → 1 ✅
- `grep -c "delete process.env.VAULT_PASSWORD" banking_api_server/scripts/vault-migrate.js` → 1 ✅
- `grep -c "length=" banking_api_server/scripts/vault-migrate.js` → 2 ≥ 2 ✅

**Task 2:**
- `wc -l docs/vault.md` → 577 ≥ 200 ✅
- `grep -c "Argon2id\|m=65536\|t=3\|p=4" docs/vault.md` → 5 ≥ 2 ✅
- `grep -c "AES-256-GCM\|BNKV" docs/vault.md` → 7 ≥ 2 ✅
- `grep -c "no password recovery\|There is no recovery" docs/vault.md` → 3 ≥ 1 ✅
- `grep -c "REQ-VAULT-" docs/vault.md` → 15 ≥ 5 ✅
- `grep -c "lib/vault" REGRESSION_PLAN.md` → 2 ≥ 2 ✅
- `grep -c "vaultLoader" REGRESSION_PLAN.md` → 2 ≥ 1 ✅
- `git diff REGRESSION_PLAN.md | grep "^-" | grep -v "^--- " | wc -l` → 0 ✅
- `grep -c "REQ-VAULT-\|269-01-01\|269-05-03" .planning/phases/269-portable-encrypted-credential-vault-single-file-store-for-ap/269-VALIDATION.md` → 18 ≥ 5 ✅
- `nyquist_compliant: true` and `wave_0_complete: true` in frontmatter ✅

**Task 3:**
- `grep -c "env: opts.env" scripts/setupFresh.js` → 1 ✅ (Step 0 precondition landed)
- `grep -c "async function configureVault" scripts/setupFresh.js` → 1 ✅
- `grep -c "module.exports = { configureVault }" scripts/setupFresh.js` → 1 ✅
- `grep -c "require.main === module" scripts/setupFresh.js` → 2 ✅
- `grep -c "SUPER_BANKING_TEST_MODE" scripts/setupFresh.js` → 0 ✅ (Option B avoids test-mode branches)
- `grep -c "SKIP_VAULT" scripts/setupFresh.js` → 4 ≥ 3 ✅
- `grep -cE "VAULT_PASSWORD_ARG|VAULT_PATH_ARG" scripts/setupFresh.js` → 6 ≥ 4 ✅
- `grep -cE "args\.includes\('--skip-vault'\)|args\.indexOf\('--vault-password'\)|args\.indexOf\('--vault-path'\)" scripts/setupFresh.js` → 3 ✅
- `grep -cE "readlineFreeText.*[Vv]ault.*password" scripts/setupFresh.js` → 0 ✅ (no password prompt via readlineFreeText)
- `grep -c "'scripts/vault.js', 'create'" scripts/setupFresh.js` → 1 ✅
- `grep -c "'__init__'" scripts/setupFresh.js` → 0 ✅ (placeholder pattern not used)
- `grep -c "path.join(REPO_ROOT, 'secrets.vault')" scripts/setupFresh.js` → 1 ✅
- `grep -c "skip-vault\|vault-password\|vault-path" scripts/setupFresh.js` → 16 ≥ 9 ✅

## Phase 269 Retrospective

### Plans 01-05 — what shipped

| Plan | Subsystem | Status | Tests |
|---|---|---|---|
| 01 | Vault core library (`lib/vault/{crypto,format,audit,errors,index}.js` + configStore.setRaw extension + golden fixtures) | ✅ complete | 71 |
| 02 | Operator CLI (`scripts/vault.js` + 6 subcommands + npm scripts) | ✅ complete | 41 |
| 03 | BFF startup wiring (`services/vaultLoader.js` + `server.js` IIFE) | ✅ complete | 14 |
| 04 | MCP Gateway wiring (`banking_mcp_gateway/src/vault.ts` + index.ts IIFE) | ✅ complete | 8 |
| 05 | Migration CLI + docs + REGRESSION_PLAN + setupFresh integration | ✅ complete | 21 |
| **Total** | | | **155+** |

### Test count by category

| Category | Count |
|---|---|
| Unit (crypto, format, audit, golden) | 42 |
| CLI regression (mocked lib/vault) | 26 |
| Integration (real vault FS, real spawnSync) | 27 |
| BFF startup integration (real vault + mocked configStore) | 14 |
| Gateway vault.ts | 8 |
| Migration integration (Task 1) | 12 |
| setupFresh DI unit tests (Task 3) | 9 |
| configStore-persistFalse regression | 7 |
| Existing critical regression suite (REQ-VAULT-13) | 38 (preserved green) |

### Files created vs modified (across all 5 plans)

| Type | Count | Examples |
|---|---|---|
| Created | ~22 | `lib/vault/{crypto,format,audit,errors,index}.js`, `services/vaultLoader.js`, `scripts/vault.js`, `scripts/vault-migrate.js`, `banking_mcp_gateway/src/vault.ts`, `docs/vault.md`, 11 test files, 2 golden fixtures |
| Modified | ~8 | `services/configStore.js` (setRaw signature), `server.js` (IIFE wrap), `package.json` (deps + scripts), `.gitignore` (3 patterns), `.env.example` (VAULT_* docs), `banking_mcp_gateway/src/index.ts` (IIFE wrap), `banking_mcp_gateway/.env.example`, `scripts/setupFresh.js` (configureVault + runChild env), `REGRESSION_PLAN.md` (§1: 4 rows + §4 entry) |

### REQ-VAULT-01..13 coverage matrix

| REQ | Plan | Verification |
|---|---|---|
| REQ-VAULT-01 (cipher) | 01 | tests/vault/crypto.test.js — AES-256-GCM round-trip + tag tamper |
| REQ-VAULT-02 (KDF) | 01 | tests/vault/crypto.test.js — Argon2id determinism + frozen params |
| REQ-VAULT-03 (envelope) | 01 | tests/vault/format.test.js — magic + version + canonical JSON + HMAC |
| REQ-VAULT-04 (location + discovery) | 03, 05 | bff-startup.test.js — VAULT_PATH override + no-file skip; this plan adds setupFresh writes VAULT_PATH |
| REQ-VAULT-05 (CLI shape) | 02 | tests/vault/cli.regression.test.js + cli.integration.test.js |
| REQ-VAULT-06 (no recovery) | 02, 05 | CLI prints warning; docs/vault.md documents procedure; no `--admin-recover` flag |
| REQ-VAULT-07 (audit log) | 01 | tests/vault/audit.test.js — line shape + sentinel grep |
| REQ-VAULT-08 (MCP Gateway) | 04 | banking_mcp_gateway/tests/vault.test.ts + smoke tests |
| REQ-VAULT-09 (BFF) | 03 | tests/vault/bff-startup.test.js — 5-state matrix |
| REQ-VAULT-10 (CI / non-interactive) | 02, 05 | VAULT_PASSWORD env supported in CLI + migrate + setupFresh fail-fast |
| REQ-VAULT-11 (Vercel) | 03, 04 | tests/vault/serverless.test.js + gateway vault.ts VERCEL=1 short-circuit |
| REQ-VAULT-12 (test strategy) | 01 | 71 tests + 2 golden fixtures + full Wave 0 |
| REQ-VAULT-13 (Validation/Nyquist) | all | 269-VALIDATION.md 13-row per-task map; critical regression suite green |

### Threat coverage (T-269-01..30)

All 30 threats either **mitigated** (29) or **accepted with documentation** (1 — T-269-27, the `--vault-password` cmdline argv visibility tradeoff). See `docs/vault.md` "Threat model summary" for the full table.

**T-269-26 mitigation changed during planning iteration:** initially proposed "TTY no-echo prompt" — discovered during read of setupFresh.js that `readlineFreeText` does NOT mask input (documented limitation around line 905). Switched to **fail-fast no-prompt** contract: setupFresh REFUSES to prompt for the vault password interactively; the operator MUST supply via `--vault-password <pw>`, `VAULT_PASSWORD` env, or `--skip-vault`. Documented in `docs/vault.md` FAQ.

### Deviations from 269-RESEARCH.md

**None on the load-bearing crypto + format decisions.** The implementation matched the research:

- AES-256-GCM (native node:crypto, no new dep) ✅
- Argon2id m=65536/t=3/p=4 hashLen=32 ✅
- Per-entry DEK wrapped under KEK + whole-file HMAC ✅
- BNKV magic + version 1 ✅
- Atomic writes (tmp + rename, mode 0o600) ✅
- Audit log = plaintext NDJSON, name + result only ✅
- No recovery — re-provision documented procedure ✅
- VAULT_PASSWORD dropped from process.env after open ✅

One scope decision flagged by research (open question #1): does this phase wire the MCP Gateway? **Answer: yes.** Plan 04 wired the gateway as an optional consumer with an allowlist regex constraining which vault entries the gateway accepts.

Two minor implementation-strategy adjustments:

1. **Plan 02 `parseArgsAndDispatch`** — the research suggested using commander's full dispatch; the implementation uses commander for `--help` metadata only and hand-rolls the subcommand dispatch. Same observable behavior; just a more deterministic test surface for the unknown-subcommand exit code 64.
2. **Plan 04 TypeScript shim** — research listed two options (`import = require()` vs `const vaultLib: any = require(...)`); plan picked the latter for cleanest TS-strict compilation. No behavior change.

## Self-Check: PASSED

**Files created — verified present:**

- ✅ banking_api_server/scripts/vault-migrate.js
- ✅ banking_api_server/tests/vault/migrate.integration.test.js
- ✅ banking_api_server/tests/vault/setupFresh-vault.test.js
- ✅ docs/vault.md (577 lines)

**Files modified — verified in git:**

- ✅ banking_api_server/package.json (added vault:migrate-from-env)
- ✅ banking_api_server/scripts/setupFresh.js (configureVault + runChild env passthrough + flags + exports)
- ✅ REGRESSION_PLAN.md (§1: 4 APPEND-ONLY rows; §4: Phase 269 entry; 0 deletions verified)
- ✅ .planning/phases/.../269-VALIDATION.md (13-row map; nyquist_compliant: true)

**Commits — verified in git log:**

- ✅ b12d5991 — feat(269-05): vault-migrate-from-env CLI + closed-allowlist integration tests
- ✅ 6ab21478 — docs(269-05): operator vault guide + REGRESSION_PLAN §1 rows + finalize VALIDATION
- ✅ 54e25250 — feat(269-05): setupFresh.js configureVault phase + runChild env passthrough

**Tests — verified passing at SUMMARY-write time:**

- ✅ 12/12 migrate.integration.test.js (Task 1)
- ✅ 9/9 setupFresh-vault.test.js (Task 3, includes POSITIVE-PATH env-passthrough regression guard)
- ✅ 147/147 full vault suite (Plans 01-05 combined)
- ✅ 38/38 critical regression suite (REQ-VAULT-13)

**REGRESSION_PLAN append-only invariant:**

- ✅ `git diff REGRESSION_PLAN.md | grep "^-" | grep -v "^--- " | wc -l` returns 0
