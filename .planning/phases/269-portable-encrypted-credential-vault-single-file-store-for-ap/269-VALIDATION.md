---
phase: 269
slug: portable-encrypted-credential-vault-single-file-store-for-ap
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-13
---

# Phase 269 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Filled by gsd-planner once plans exist. This skeleton is created up-front so the planner can populate the verification map and the gsd-plan-checker can score Dimension 8 (Nyquist) accurately.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | jest 29.x (matches `banking_api_server`) |
| **Config file** | `banking_api_server/package.json` (jest section) — vault module lives under banking_api_server/services |
| **Quick run command** | `npx jest --testPathPattern='vault'` |
| **Full suite command** | `cd banking_api_server && npm test` |
| **Estimated runtime** | ~30 seconds (vault module only); ~90 seconds full suite |

---

## Sampling Rate

- **After every task commit:** Run `npx jest --testPathPattern='vault'`
- **After every plan wave:** Run `cd banking_api_server && npm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds (vault-scoped); 90 seconds (full suite)

---

## Per-Task Verification Map

> Populated by gsd-planner after PLAN.md files exist. One row per task.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 269-01-01 | 01 | 1 | REQ-VAULT-01 | T-269-01 | TBD | unit | `npx jest vault.regression` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `banking_api_server/tests/services/vault.regression.test.js` — unit-test stubs for vault encrypt/decrypt + KDF derivation
- [ ] `banking_api_server/tests/services/vault.integration.test.js` — integration stubs for CLI read/write/rotate
- [ ] `banking_api_server/tests/fixtures/vault-golden.json` — golden encrypted vault for regression tests
- [ ] Add `argon2` to `banking_api_server/package.json` dependencies (Wave 0 setup task)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Password prompt TTY UX (no echo, confirm-on-set) | REQ-VAULT-05 | Cannot reliably automate TTY input in jest without mocking the very thing under test | Run `npm run vault:set HELIX_API_KEY` in a real terminal; confirm password is not echoed and confirmation prompt fires on `set` |
| Recovery-from-forgotten-password docs are accurate | REQ-VAULT-06 | Documentation review, not code | Read `docs/vault-recovery.md`; verify steps for re-provisioning Helix key from Helix console match current Helix dashboard |
| Audit log rotation behavior under disk-full | REQ-VAULT-07 | Disk-full simulation is fragile in CI | Manually fill disk on test partition; confirm vault read still succeeds with audit-log write failure logged but non-fatal |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
