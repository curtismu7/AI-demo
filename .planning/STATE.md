---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: executing
last_updated: "2026-04-14T11:15:00.000Z"
progress:
  total_phases: 153
  completed_phases: 74
  total_plans: 257
  completed_plans: 193
---

# State — Super Banking AI Banking Demo

**Milestone:** v1.0 — Complete Demo + Educational Content
**Updated:** 2026-04-14

---

## Current Position

Phase: 147 (get-rid-of-left-agent-keep-the-rest) — ✅ COMPLETE
Plan: 1 of 1 (147-01) — ✅ COMPLETE
**Previous:** Phase 146 (scope-vocabulary-alignment-match-code-to-pingone) — ✅ COMPLETE
**Next:** Phase 148 (/gsd-plan-phase 148)
**Status:** Ready to begin Phase 148

---

## Completed Phases

- Phase 1 (auth-flows) — complete
- Phase 2 (token-exchange) — complete
- Phase 3 (vercel-stability) — complete
- Phase 4 (education-content) — complete
- Phase 6 (token-exchange-fix) — complete
- Phase 7 (rfc-9728-protected-resource-metadata) — complete
- Phase 8 (banking-transaction-integrity) — complete
- Phase 12 (ui-button-consistency) — complete
- Phase 19 (demo-config-page-audit) — complete
- Phase 20 (postman-collections) — complete
- Phase 52 (pingone-mfa-step-up) — complete
- Phase 53 (debug-testing-and-bug-fixes-for-phase-52-mfa-step-up) — complete
- Phase 21 (customer-diagrams) — complete
- Phase 22 (agent-capability-audit) — complete
- Phase 23 (langchain-modernization) — complete
- Phase 29 (use-case-c-sensitive-data-access) — complete
- Phase 48 (remove-invalid-spel-act-expression) — complete
- Phase 85 (chase-dashboard-styling) — complete
- Phase 146 (scope-vocabulary-alignment-match-code-to-pingone) — complete
- Phase 147 (get-rid-of-left-agent-keep-the-rest) — complete ✅

---

## Phase 147 Details

**Phase Goal:** Remove left-dock placement mode from agent UI to prevent conflicts with dashboard sidebar

**Completed:** 2026-04-14 06:15 UTC

**What Was Built:**
- Removed 'left-dock' from AgentUiModeContext.js validation (all placement checks updated)
- Removed Left button from AgentUiModeToggle.js UI tab bar
- Implemented right-dock as inline column layout (matching middle mode structure)
- Verified CSS cleanup (0 orphaned left-dock rules)
- Verified e2e test updates (0 left-dock references)
- Build verification: npm run build ✓ (exit code 0)

**Key Commits:**
- 580ae8c: docs(147): complete phase 147 — SUMMARY.md
- 4116e2a: fix(147-01): right-dock as inline column; remove Left button
- a1fc875: fix(147-01): remove left-dock placement mode from AgentUiModeContext

**Verification:**
✅ All modes functional (middle, right, bottom, float)
✅ ba-left-col preserved in all modes
✅ Right mode renders inline, not overlay
✅ Build successful
✅ No double-rendering
