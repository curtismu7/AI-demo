---
phase: 227
slug: remove-side-menu-admin-dashboard
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-24
---

# Phase 227 — Validation Strategy

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
- **Before `/gsd-verify-work`:** Build clean + snapshot tests green

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 227-01-01 | 01 | 1 | AdminSideNav removed from all App.js routes | — | N/A | build | `cd banking_api_ui && npm run build` | ✅ | ⬜ pending |
| 227-01-02 | 01 | 1 | Admin Dashboard buttons removed from LandingPage + BankingAgent chip | — | N/A | build | `cd banking_api_ui && npm run build` | ✅ | ⬜ pending |
| 227-01-03 | 01 | 1 | SideNav snapshot updated | — | N/A | unit | `cd banking_api_ui && npm run test:unit -- --watchAll=false --testPathPattern=SideNav` | ✅ | ⬜ pending |

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Main content is full-width after side nav removal | CSS layout | Requires visual check | Navigate to /admin; verify no left sidebar, content fills width |
| Admin routes still accessible by URL | Non-regression | Requires navigation | Navigate directly to /activity, /dev-tools; verify they load |

---

## Validation Sign-Off

- [x] All tasks have automated verify commands
- [x] No watch-mode flags
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-04-24
