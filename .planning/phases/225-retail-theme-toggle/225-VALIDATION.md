---
phase: 225
slug: retail-theme-toggle
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-24
---

# Phase 225 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest + React Testing Library (react-scripts 5.0.1) |
| **Config file** | `banking_api_ui/package.json` → `"jest"` key |
| **Quick run command** | `cd banking_api_ui && npm run build` |
| **Full suite command** | `cd banking_api_ui && npm run test:unit -- --watchAll=false` |
| **Estimated runtime** | ~30 seconds (build), ~60 seconds (test suite) |

---

## Sampling Rate

- **After every task commit:** Run `cd banking_api_ui && npm run build` (mandatory per CLAUDE.md)
- **After every plan wave:** Run `cd banking_api_ui && npm run test:unit -- --watchAll=false`
- **Before `/gsd-verify-work`:** Build clean + unit tests green
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 225-01-01 | 01 | 1 | ff_retail_mode in FLAG_REGISTRY | — | N/A | build | `cd banking_api_ui && npm run build` | ✅ | ⬜ pending |
| 225-01-02 | 01 | 1 | retail preset in INDUSTRY_PRESETS | — | N/A | build | `cd banking_api_ui && npm run build` | ✅ | ⬜ pending |
| 225-02-01 | 02 | 1 | RetailModeBanner renders + CSS | — | N/A | build | `cd banking_api_ui && npm run build` | ✅ | ⬜ pending |
| 225-03-01 | 03 | 2 | retailMode state + useEffect | — | N/A | build | `cd banking_api_ui && npm run build` | ✅ | ⬜ pending |
| 225-03-02 | 03 | 2 | renderBankingMain branch | — | N/A | build | `cd banking_api_ui && npm run build` | ✅ | ⬜ pending |
| 225-03-03 | 03 | 2 | BankingAgent retail greeting | — | N/A | build | `cd banking_api_ui && npm run build` | ✅ | ⬜ pending |
| 225-03-04 | 03 | 2 | SideNav snapshot not regressed | — | N/A | unit | `cd banking_api_ui && npm run test:unit -- --watchAll=false --testPathPattern=SideNav` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. No new test files needed.

After implementation, run `npm run test:unit -- --watchAll=false --testPathPattern=SideNav` and
update the snapshot if the SideNav renders a preset picker that now includes "retail".

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| ff_retail_mode flag renders in Feature Flags page | D-01 | No automated UI test for flag list | Browse /feature-flags; confirm "Retail Mode" entry appears |
| Retail preset CSS vars (blue #0046BE) applied when flag ON | D-03 | CSS var inspection requires browser DevTools | Toggle flag ON; inspect `--app-primary-red` on `:root` |
| Banking mode restored and CSS vars reset when flag OFF | D-03 | CSS var inspection requires browser DevTools | Toggle flag OFF; verify banking colors restored |
| Banner visible on Dashboard in both modes | UI-SPEC | No automated banner test | Check Dashboard renders RetailModeBanner in retail + banking mode |
| Cart total updates when items added | D-03 | No cart unit test | Add product; verify Subtotal updates |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 60s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-04-24
