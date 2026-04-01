---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: planning
last_updated: "2026-04-01T01:53:24.654Z"
progress:
  total_phases: 5
  completed_phases: 1
  total_plans: 3
  completed_plans: 3
---

# State — BX Finance AI Banking Demo

**Milestone:** v1.0 — Complete Demo + Educational Content
**Updated:** 2026-03-31

---

## Current Position

Phase: 1 (auth-flows) — EXECUTING
Plan: Not started
**Phase:** 2
**Status:** Ready to plan

---

## Completed Phases

(none — milestone just initialized)

---

## Decisions

| ID | Decision | Phase | Notes |
|----|----------|-------|-------|
| D-01 | BFF is sole token custodian | foundation | Tokens never reach browser |
| D-02 | Two exchange paths toggled by feature flag | foundation | `USE_AGENT_ACTOR_FOR_MCP` + `ff_two_exchange_delegation` |
| D-03 | WebSocket for BFF→MCP | foundation | Required for stateful auth challenge flow |
| D-04 | Vercel + Upstash for hosting | foundation | Known serverless constraints documented in REGRESSION_PLAN.md |
| D-05 | Education panels embedded in app | foundation | In-context explanation while demo runs |

---

## Blockers

(none)

---

## Pending Todos

- Plan Phase 1 (auth-flows)
- Redeploy to Vercel (3 code commits since last deploy: 5aa8147, 09598d7, 59786c6)
- When merged to main: update raw doc links from `fix/dashboard-fab-positioning` → `main`
