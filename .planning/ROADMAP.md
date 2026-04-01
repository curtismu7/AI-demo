# Roadmap — BX Finance AI Banking Demo

**Milestone:** v1.0 — Complete Demo + Educational Content
**Date:** 2026-03-31

---

## Milestone Goal

A developer or architect who runs through the live demo in 5 minutes understands: (1) how three distinct auth flows work, (2) what RFC 8693 token exchange looks like in practice, and (3) how the MCP spec wires an AI agent to a secured banking API — all explained in context via in-app education panels.

---

## Phase Overview

| # | Phase | Goal | Requirements | Plans |
|---|-------|------|--------------|-------|
| 1 | auth-flows | All 3 auth flows complete and demo-ready | Complete    | 2026-04-01 |
| 2 | token-exchange | 1-exchange vs 2-exchange live visual showcase | Complete    | 2026-04-01 |
| 3 | vercel-stability | Vercel bugs fixed; demo reliable in production | STAB-01, STAB-02, STAB-03 | 2 plans |
| 4 | education-content | Educational panels complete for all key concepts | EDU-01, EDU-02, EDU-03, EDU-04 | 3 plans |
| 5 | user-documentation | Setup guide and architecture docs for learners | Complete    | 2026-04-01 |
| 6 | token-exchange-fix | RFC 8693 token exchange works end-to-end for both exchange paths | TOKEN-FIX-01, TOKEN-FIX-02 | 2 plans |

---

## Phase Details

### Phase 1: auth-flows

**Goal:** All three authentication flows (home-page login, CIBA, agent-triggered HITL login) run end-to-end without manual intervention and are clearly distinguishable in the UI.

**Requirements:** AUTH-01, AUTH-02, AUTH-03

**Plans:** 3/3 plans complete

Plans:
- [ ] 01-01-PLAN.md — Landing page login polish (AUTH-03): credential hints + 3-flows intro card
- [ ] 01-02-PLAN.md — MCP step_up_required structured passthrough (AUTH-01 layer 1)
- [ ] 01-03-PLAN.md — Agent step-up auto-retry + auth challenge inline login (AUTH-01 + AUTH-02)

**Success criteria:**
1. A user landing on the home page can log in as admin or customer with a single click and be routed to the correct dashboard
2. An agent operation that requires CIBA sends a push notification, the UI polls and shows pending state, and the agent unblocks on approval
3. An agent mid-flow encountering an auth challenge presents an inline login prompt; after the user authenticates, the agent continues the original operation automatically

---

### Phase 2: token-exchange

**Goal:** The difference between 1-exchange (user token → MCP token) and 2-exchange (user + agent tokens → MCP token with `act` claim) is visually demonstrable and explainable in real time.

**Requirements:** TOKEN-01, TOKEN-02

**Plans:** 2/2 plans complete

Plans:
- [ ] 02-01-PLAN.md — Exchange mode session toggle: BFF endpoint + ExchangeModeToggle UI (TOKEN-01)
- [ ] 02-02-PLAN.md — TokenChainDisplay claims strip + exchange mode banner (TOKEN-02)

**Success criteria:**
1. A UI toggle switches between 1-exchange and 2-exchange mode and the next agent operation uses the selected path
2. The token inspector panel shows the decoded MCP token after each agent operation, highlighting the presence or absence of the `act` and `may_act` claims
3. Switching modes produces a visible diff in the displayed token (act claim appears/disappears)

---

### Phase 3: vercel-stability

**Goal:** The demo runs reliably on Vercel without known cold-start or Lambda-isolation failures that would embarrass a presenter.

**Requirements:** STAB-01, STAB-02, STAB-03

**Plans:** 3 plans

Plans:
- [ ] 05-01-PLAN.md — Setup guide (docs/SETUP.md + README pointer) (DOC-01)
- [ ] 05-02-PLAN.md — Three draw.io sequence diagrams for 3 auth flows (DOC-02)
- [ ] 05-03-PLAN.md — Architecture walkthrough (docs/ARCHITECTURE_WALKTHROUGH.md) (DOC-02)

Plans:
- [ ] 03-01-PLAN.md — SSE Redis-list event bridge for Vercel (STAB-01)
- [x] 03-02-PLAN.md — Cold-start restoration + production safety guard tests (STAB-02, STAB-03)

**Success criteria:**
1. Agent flow diagram panels show streamed milestones on Vercel (not blank)
2. A user who logs in, adds a custom account, then hits a cold-start Lambda sees their custom account intact
3. Starting the server with `SKIP_TOKEN_SIGNATURE_VALIDATION=true` and `NODE_ENV=production` terminates the process immediately with a non-zero exit code

---

### Phase 4: education-content

**Goal:** Every major concept in the demo — OIDC 2.1, MCP spec, key RFCs, guided tour — has an in-app explanation that a developer or architect can follow without leaving the browser.

**Requirements:** EDU-01, EDU-02, EDU-03, EDU-04

**Plans:** 4 plans

Plans:
- [x] 04-01-PLAN.md — OIDC 2.1 education panel (EDU-01)
- [x] 04-02-PLAN.md — MCP spec 2025-11-25 panel (EDU-02)
- [x] 04-03-PLAN.md — RFC reference cards + guided tour (EDU-03, EDU-04)
- [x] 04-04-PLAN.md — UI consistency audit + marketing agent dock polish

**Success criteria:**
1. The OIDC 2.1 panel exists, covers the key changes from OIDC Core, and links to the relevant spec section
2. The MCP spec panel walks through the tool-call lifecycle and auth challenge mechanism with code references to this repo
3. RFC reference cards exist for 8693, 9396, 7519, 9700, and OIDC CIBA — each with a "see it here" link into the live demo
4. The guided tour mode sequences all 3 auth flows with narration; a presenter can run it start to finish without switching away from the app
5. All SPA pages pass a cross-cutting visual audit: consistent spacing, typography, color, and interaction states; no placeholder content or console errors; marketing agent dock matches /marketing page design language

---

### Phase 5: user-documentation

**Goal:** A developer who finds the repo can set up a working instance and understand the architecture without asking questions.

**Requirements:** DOC-01, DOC-02

**Plans:** 0/3 plans complete

Plans:
- [ ] 05-01-PLAN.md — Setup guide (docs/SETUP.md + README pointer) (DOC-01)
- [ ] 05-02-PLAN.md — Three draw.io sequence diagrams for 3 auth flows (DOC-02)
- [ ] 05-03-PLAN.md — Architecture walkthrough (docs/ARCHITECTURE_WALKTHROUGH.md) (DOC-02)

**Success criteria:**
1. Following the setup guide produces a working local demo with all 3 auth flows operational
2. The architecture doc explains what token exists where at each step in each auth flow, with labeled sequence diagrams

---

### Phase 6: token-exchange-fix

**Goal:** The RFC 8693 token exchange pipeline works reliably for both 1-exchange and 2-exchange paths: BFF authenticates to PingOne correctly, tokens are narrowed to the MCP audience, and the agent can run tool calls without "Unsupported authentication method" errors.

**Requirements:** TOKEN-FIX-01, TOKEN-FIX-02

**Plans:** 3 plans

Plans:
- [ ] 05-01-PLAN.md — Setup guide (docs/SETUP.md + README pointer) (DOC-01)
- [ ] 05-02-PLAN.md — Three draw.io sequence diagrams for 3 auth flows (DOC-02)
- [ ] 05-03-PLAN.md — Architecture walkthrough (docs/ARCHITECTURE_WALKTHROUGH.md) (DOC-02)

Plans:
- [x] 06-01-PLAN.md — Fix 2-exchange auth methods + auth-method unit tests (TOKEN-FIX-01)
- [x] 06-02-PLAN.md — 1-exchange + 2-exchange delegation tests + security properties (TOKEN-FIX-02)

**Success criteria:**
1. Agent tool calls complete without token exchange errors in both 1-exchange and 2-exchange modes
2. The BFF token exchange request uses the authentication method configured in the PingOne app (client_secret_basic, client_secret_post, or private_key_jwt)
3. The token inspector panel shows a valid decoded MCP token after each agent operation
4. No "Unsupported authentication method" or "Request denied" errors appear in normal agent flows

### Phase 7: RFC 9728 Protected Resource Metadata — education panel and demo integration

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 6
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd:plan-phase 7 to break down)

---

## Dependency Order

Phase 1 (auth-flows) → Phase 2 (token-exchange) → Phase 3 (vercel-stability) → Phase 4 (education-content) → Phase 5 (user-documentation) → Phase 6 (token-exchange-fix)

Phases 3, 4, and 5 can partially overlap after Phase 1 is complete:
- Phase 3 is independent of Phase 2 (Vercel fixes don't depend on token UI)
- Phase 4 depends on Phases 1–2 being complete so panels can reference working flows
- Phase 5 depends on all prior phases being stable
