---
phase: 149
slug: verify-phase-146-scope-alignment-pingone-test-page-shows-correct-scopes-detects-missing-wrong-scopes-and-can-update-pingone
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-14
---

# Phase 149 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | React build verification (`npm run build`) — no formal test framework for UI integration tests |
| **Config file** | `banking_api_ui/package.json` (build script) |
| **Quick run command** | `cd banking_api_ui && npm run build` |
| **Full suite command** | `cd banking_api_ui && npm run build` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd banking_api_ui && npm run build`
- **After every plan wave:** Run `cd banking_api_ui && npm run build`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 149-01-01 | 01 | 1 | Banking RS detection by name/audience | — | RS identified by name, not array index | grep | `grep -n "find(" banking_api_server/routes/pingoneTestRoutes.js` | ✅ | ⬜ pending |
| 149-01-02 | 01 | 1 | Fix endpoint route created | — | Uses worker token (BFF pattern) | grep | `grep -n "fix-banking-resource-server" banking_api_server/routes/pingoneTestRoutes.js` | ✅ | ⬜ pending |
| 149-02-01 | 02 | 1 | Fix button in UI | — | No tokens in UI | grep | `grep -n "fix-banking-resource-server\|Fix Banking" banking_api_ui/src/components/PingOneTestPage.jsx` | ✅ | ⬜ pending |
| 149-02-02 | 02 | 1 | Build passes after UI change | — | N/A | build | `cd banking_api_ui && npm run build` (exit 0) | ✅ | ⬜ pending |
| 149-03-01 | 03 | 2 | Visual verification on /pingone-test | — | N/A | manual | Manual: load /pingone-test, check scope section | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

*Existing infrastructure covers all phase requirements.* No new test files required — verification is build gate + grep checks + manual browser test.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| /pingone-test shows canonical banking scopes correctly | Phase 149 goal | Requires live PingOne + browser session | Load /pingone-test, check scopes section shows `banking:read`, `banking:write`, `banking:admin`; verify missing scopes are flagged |
| Fix button calls PingOne and updates RS | Phase 149 goal | Requires live PingOne + worker token with management scopes | Click fix button; verify success toast and re-check shows scopes now present |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
