---
phase: 269
slug: portable-encrypted-credential-vault-single-file-store-for-ap
status: ready
nyquist_compliant: true
wave_0_complete: true
created: 2026-05-13
updated: 2026-05-13
---

# Phase 269 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Filled by gsd-planner after plans were drafted; finalized by Plan 05 Task 2.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | jest 29.7.0 (matches `banking_api_server` + `banking_mcp_gateway`) |
| **Config file** | `banking_api_server/jest.config.js` (existing); `banking_mcp_gateway/jest.config.js` for the gateway-side test |
| **Quick run command** | `cd banking_api_server && npx jest tests/vault/ --bail` |
| **Full suite command** | `cd banking_api_server && npm test` + `cd banking_mcp_gateway && npm test` |
| **Estimated runtime** | ~10s (vault suite only); ~90s full suite |

---

## Sampling Rate

- **After every task commit:** Run `npx jest tests/vault/ --bail` (vault-scoped, ~10s)
- **After every plan wave:** Run `cd banking_api_server && npx jest oauthStatus.regression oauthStatus.integration hitlRoute.regression hitlRoute.integration tests/vault/ --bail` (REQ-VAULT-13 critical suite)
- **Before `/gsd-verify-work`:** Full `npm test` in both `banking_api_server` and `banking_mcp_gateway`
- **Max feedback latency:** 10 seconds (vault-scoped); 90 seconds (full suite)

---

## Per-Task Verification Map

13 rows — one per task across Plans 01-05.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 269-01-01 | 01 | 1 | REQ-VAULT-01,02,03,07,12 | T-269-01,02,03,05,10 | KDF + AEAD + format + audit + golden round-trip | unit | `npx jest tests/vault/crypto.test.js tests/vault/format.test.js tests/vault/audit.test.js tests/vault/golden.test.js --bail` | ✅ created in this task | ✅ green |
| 269-01-02 | 01 | 1 | REQ-VAULT-01,02,03 | T-269-02,03,08,09 | openVault/createVault handle round-trip + close zeroes KEK | unit + integration | `npx jest tests/vault/vault.regression.test.js tests/vault/vault.integration.test.js --bail` | ✅ | ✅ green |
| 269-01-03 | 01 | 1 | REQ-VAULT-09 | T-269-06 | configStore.setRaw {persist:false} | regression | `npx jest tests/vault/configStore-persistFalse.test.js --bail` | ✅ | ✅ green |
| 269-02-01 | 02 | 2 | REQ-VAULT-05,06,10 | T-269-04,06,11,12,30 | CLI logic isolation + dispatch + no-recovery warning + vault:create | regression | `npx jest tests/vault/cli.regression.test.js --bail` | ✅ | ✅ green |
| 269-02-02 | 02 | 2 | REQ-VAULT-05,10 | T-269-04,06,11,12,13,30 | E2E CLI via spawnSync — 6 subcommands incl. vault:create under stdio:'ignore' | integration | `npx jest tests/vault/cli.integration.test.js --bail` | ✅ | ✅ green |
| 269-03-01 | 03 | 2 | REQ-VAULT-04,09,11 | T-269-06,08,09,14,15 | vaultLoader DI tests | integration | `npx jest tests/vault/bff-startup.test.js tests/vault/serverless.test.js --bail` | ✅ | ✅ green |
| 269-03-02 | 03 | 2 | REQ-VAULT-04,09,11,13 | T-269-16 | server.js wiring + critical regression suite | integration | `npx jest oauthStatus.regression oauthStatus.integration hitlRoute.regression hitlRoute.integration tests/vault/ --bail` | ✅ exists | ✅ green |
| 269-04-01 | 04 | 3 | REQ-VAULT-08,11 | T-269-06,08,15,17,18 | Gateway vault.ts + allowlist | unit | `cd banking_mcp_gateway && npx jest tests/vault.test.ts --bail` | ✅ | ✅ green |
| 269-04-02 | 04 | 3 | REQ-VAULT-08,13 | T-269-16 | Gateway index.ts wiring; existing suite green | integration | `cd banking_mcp_gateway && npm test --silent` | ✅ exists | ✅ green |
| 269-05-01 | 05 | 3 | REQ-VAULT-04,06 | T-269-21,22,23 | Migration script — closed allowlist, no value leak | integration | `npx jest tests/vault/migrate.integration.test.js --bail` | ✅ created Plan 05 Task 1 | ✅ green |
| 269-05-02 | 05 | 3 | REQ-VAULT-06,13 | T-269-24,25 | Docs accuracy + REGRESSION_PLAN append-only | manual + grep | `wc -l docs/vault.md` ≥ 200; `git diff REGRESSION_PLAN.md \| grep "^-" \| grep -v "^--- " \| wc -l` returns 0 | ✅ docs/vault.md (577 lines) | ✅ green |
| 269-05-03 | 05 | 3 | REQ-VAULT-04,05,06 | T-269-26,27,28,29 | setupFresh.js vault phase (fail-fast, vault:create, REPO_ROOT path, .env write) | integration | `npx jest tests/vault/setupFresh-vault.test.js --bail` | ✅ created Plan 05 Task 3 | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

All scaffolds were created in their respective Plan 01-05 task commits.

- [x] `banking_api_server/lib/vault/{crypto,format,audit,errors,index}.js` — Plan 01 Task 1
- [x] `banking_api_server/tests/vault/{crypto,format,audit,golden,vault.regression,vault.integration,configStore-persistFalse}.test.js` — Plan 01
- [x] `banking_api_server/tests/vault/fixtures/{valid-v1,corrupted-v1}.vault` + `README.md` — Plan 01 Task 1
- [x] `banking_api_server/scripts/vault.js` + `tests/vault/cli.{regression,integration}.test.js` — Plan 02
- [x] `banking_api_server/services/vaultLoader.js` + `tests/vault/{bff-startup,serverless}.test.js` — Plan 03
- [x] `banking_mcp_gateway/src/vault.ts` + `tests/vault.test.ts` — Plan 04
- [x] `banking_api_server/scripts/vault-migrate.js` + `tests/vault/migrate.integration.test.js` — Plan 05 Task 1
- [x] `docs/vault.md` — Plan 05 Task 2
- [x] `banking_api_server/tests/vault/setupFresh-vault.test.js` — Plan 05 Task 3
- [x] `argon2` (`^0.44.0`) in `banking_api_server/package.json` dependencies — Plan 01 Task 1
- [x] `@inquirer/password` (`^5.0.13`) + `commander` (`^14.0.3`) in `banking_api_server/package.json` — Plan 02

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Password prompt TTY UX (no echo, confirm-on-set) | REQ-VAULT-05 | Cannot reliably automate TTY input in jest without mocking the very thing under test | Run `npm run vault:set HELIX_API_KEY` in a real terminal; confirm password is not echoed and a confirmation prompt fires on `set` |
| Recovery-from-forgotten-password docs are accurate | REQ-VAULT-06 | Documentation review, not code | Read `docs/vault.md` "Recovery procedure" section; verify each entry's regeneration path matches the current Helix / PingOne console UX |
| Audit log rotation behavior under disk-full | REQ-VAULT-07 | Disk-full simulation is fragile in CI | Manually fill disk on test partition; confirm vault read still succeeds with audit-log write failure logged but non-fatal |
| End-to-end setupFresh with vault | REQ-VAULT-04,05,06 | Touches PingOne in a real tenant — destructive | Operator runs `npm run setup:fresh -- --yes --no-clean --skip-helix --vault-password testpw --vault-path /tmp/manual-test.vault` and confirms vault is created + `VAULT_PATH` appended to `banking_api_server/.env` |
| End-to-end setupFresh fail-fast (T-269-26) | REQ-VAULT-06 | Requires interactive TTY which CI lacks | Operator runs `npm run setup:fresh` in an interactive terminal WITHOUT setting `VAULT_PASSWORD` and WITHOUT passing `--vault-password` or `--skip-vault`; confirms exit 1 with `No vault password supplied` message |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 30s (vault-scoped); < 90s (full suite)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** ready for execution (Plans 01-05 all complete + verified)
