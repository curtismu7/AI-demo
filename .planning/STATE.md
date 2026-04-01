---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: planning
last_updated: "2026-04-01T14:42:46.703Z"
progress:
  total_phases: 7
  completed_phases: 5
  total_plans: 16
  completed_plans: 13
---

# State — BX Finance AI Banking Demo

**Milestone:** v1.0 — Complete Demo + Educational Content
**Updated:** 2026-03-31

---

## Current Position

Phase: 5 (user-documentation) — EXECUTING
Plan: Not started
**Phase:** 06
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

- ~~Plan Phase 1 (auth-flows)~~ *(complete)*
- Redeploy to Vercel (3 code commits since last deploy: 5aa8147, 09598d7, 59786c6)
- When merged to main: update raw doc links from `fix/dashboard-fab-positioning` → `main`
- **[TODO → Phase 4]** UI consistency audit — enterprise-grade cross-SPA visual polish (04-04-PLAN.md)
- **[TODO → Phase 4]** Marketing page agent dock UI match — dock styling should match /marketing page design language (04-04-PLAN.md)
- **[Phase 6]** Fix RFC 8693 token exchange: PingOne returning "Unsupported authentication method" — investigate agentMcpTokenService.js client auth method
- **[TODO → /demo-data]** Token Endpoint Auth Method selector — per-client picker (BASIC/POST/client_secret_jwt/private_key_jwt) on DemoDataPage; JWT key gen for JWT methods; BFF `jwtAssertionService.js` + `applyTokenEndpointAuth` extension

---

## Accumulated Context

### Roadmap Evolution

- Phase 7 added: RFC 9728 Protected Resource Metadata — education panel and demo integration
