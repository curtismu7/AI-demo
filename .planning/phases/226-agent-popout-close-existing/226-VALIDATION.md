---
phase: 226
slug: agent-popout-close-existing
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-24
---

# Phase 226 — Validation Strategy

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest + React Testing Library |
| **Quick run command** | `cd banking_api_ui && npm run build` |
| **Full suite command** | `cd banking_api_ui && npm run test:unit -- --watchAll=false` |
| **Estimated runtime** | ~30s (build) |

---

## Sampling Rate

- **After every task commit:** `cd banking_api_ui && npm run build`
- **Before `/gsd-verify-work`:** Build clean

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 226-01-01 | 01 | 1 | onPopout prop added to BankingAgent | — | N/A | build | `cd banking_api_ui && npm run build` | ✅ | ⬜ pending |
| 226-01-02 | 01 | 1 | onPopout called at both UserDashboard render sites | — | N/A | build | `cd banking_api_ui && npm run build` | ✅ | ⬜ pending |

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Clicking pop-out closes the inline agent | Phase goal | No automated UI interaction test | Open inline agent (middle or right); click ↗ pop-out; verify inline agent column collapses and FAB reappears |
| agentPlacement preference unchanged after pop-out | Regression guard | Requires localStorage inspection | After pop-out, reload page; verify agent placement preference is preserved |

---

## Validation Sign-Off

- [x] All tasks have automated verify commands
- [x] No watch-mode flags
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-04-24
