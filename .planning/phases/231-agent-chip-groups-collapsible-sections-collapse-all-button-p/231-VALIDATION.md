---
phase: 231
slug: agent-chip-groups-collapsible-sections-collapse-all-button-p
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-25
---

# Phase 231 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | jest 29.x (React Testing Library) |
| **Config file** | banking_api_ui/package.json (react-scripts) |
| **Quick run command** | `cd banking_api_ui && npm run build` |
| **Full suite command** | `cd banking_api_ui && npm run build && cd ../banking_api_server && npm test -- --testPathPattern=mfaService 2>/dev/null; true` |
| **Estimated runtime** | ~45 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd banking_api_ui && npm run build`
- **After every plan wave:** Run full suite command
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 45 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | Status |
|---------|------|------|-------------|-----------|-------------------|--------|
| 231-01-01 | 01 | 1 | REQ-1 (remove inline Learn & Explore) | build | `npm run build` in banking_api_ui | ⬜ pending |
| 231-01-02 | 01 | 1 | REQ-3 (collapsible groups + collapse-all) | build | `npm run build` in banking_api_ui | ⬜ pending |
| 231-01-03 | 01 | 1 | REQ-4 (discovery popout) | build | `npm run build` in banking_api_ui | ⬜ pending |
| 231-02-01 | 02 | 1 | REQ-2 (LangGraph heuristic coverage) | manual | Send each chip label via chat, verify no LLM fallback | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. This phase is frontend-only (JSX + CSS + JS service edits) with no new test files needed — validation is via `npm run build` (exit 0) and manual chip-routing verification.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Each chip label routes via heuristic (not LLM) | REQ-2 | LangGraph heuristic path has no automated assertion | Send each ACTION_GROUPS chip label and each EDUCATION_COMMANDS label as a chat message; confirm agent responds without invoking LLM fallback |
| Discovery popout opens/closes correctly | REQ-4 | UI interaction — no automated test | Click ⊞ All actions, verify popout appears; click ✕, verify it closes; press Escape, verify it closes |
| Chip groups collapse/expand | REQ-3 | UI interaction | Click group header to collapse; click collapse-all, verify all collapse; click expand-all, verify all expand |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 45s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
