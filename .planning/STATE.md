---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: executing
last_updated: "2026-04-01T23:37:49.282Z"
progress:
  total_phases: 12
  completed_phases: 7
  total_plans: 20
  completed_plans: 16
---

# State — BX Finance AI Banking Demo

**Milestone:** v1.0 — Complete Demo + Educational Content
**Updated:** 2026-03-31

---

## Current Position

Phase: 12 (UI button consistency audit) — EXECUTING
Plan: 1 of 1
**Phase:** 06
**Status:** Executing Phase 12

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
- [Phase 08]: Listen for banking-agent-result event in UserDashboard rather than prop/callback chain — keeps components decoupled

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
- Phase 8 added: Banking transaction integrity — fix balance updates, validate all actions, and ensure enterprise-grade correctness
- Phase 9 added: CIBA step-up authentication — implement OTP modal, wire backchannel auth for write actions, and validate enterprise-grade UX
- Phase 10 added: Enterprise-grade HITL — high-value transaction warnings, CIBA or OTP step-up based on configuration, and polished approval UX
- Phase 11 added: Education content review and accuracy audit — OAuth RFCs MCP PingOne AI completeness check
- Phase 12 added: UI button consistency audit — standardize color scheme red and blue with white text no grey no purple
