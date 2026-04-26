---
phase: 228
slug: admin-agent-chip-routing-fix-heuristic-so-chips-like-show-al
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-24
---

# Phase 228 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest + React Testing Library (react-scripts 5.0.1) |
| **Config file** | `banking_api_ui/package.json` → `"jest"` key |
| **Quick run command** | `cd banking_api_ui && npm run build` |
| **Full suite command** | `cd banking_api_ui && npm run test:unit -- --watchAll=false` |
| **Estimated runtime** | ~30s (build), ~60s (tests) |

---

## Sampling Rate

- **After every task commit:** `cd banking_api_ui && npm run build` (mandatory per CLAUDE.md)
- **After wave merge:** `cd banking_api_ui && npm run test:unit -- --watchAll=false`
- **Before `/gsd-verify-work`:** Build clean + unit tests green

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 228-01-01 | 01 | 1 | admin_accounts heuristic branch | — | admin role guard before returning all accounts | build | `cd banking_api_ui && npm run build` | ✅ | ⬜ pending |
| 228-01-02 | 01 | 1 | chip dispatch routes through parseLogPrompt | — | N/A | build | `cd banking_api_ui && npm run build` | ✅ | ⬜ pending |
| 228-01-03 | 01 | 1 | non-admin gets explicit error not silent scope-down | — | role guard explicit error | unit | `cd banking_api_ui && npm run test:unit -- --watchAll=false --testPathPattern=nlIntentParser` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing Jest infrastructure covers the project. No new test files required.
Run `npm run test:unit -- --watchAll=false --testPathPattern=nlIntentParser` after implementation.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| "Show all customer accounts" chip renders admin account list | Root cause fix | No automated UI test for chat response | Click chip in admin agent; verify account list appears (not LLM fallback) |
| "Show last 5 errors" chip renders error log entries | Root cause fix | No automated UI test for chat response | Click chip; verify 5 error log rows appear (not LLM fallback) |
| Non-admin user sees explicit error for admin_accounts | Security | Requires session role manipulation | Log in as customer; call admin_accounts action; verify "Admin access required" message |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify commands
- [x] Sampling continuity: no 3 consecutive unverified tasks
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 60s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-04-24
