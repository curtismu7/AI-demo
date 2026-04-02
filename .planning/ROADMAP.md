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

**Goal:** BFF serves `/.well-known/oauth-protected-resource` (RFC 9728 standards-compliant endpoint); AgentGatewayPanel gains a `rfc9728` education tab with live demo fetching the endpoint.
**Requirements**: RFC9728-01, RFC9728-02
**Depends on:** Phase 6
**Plans:** 2 plans

Plans:
- [ ] 07-01-PLAN.md — BFF `/.well-known/oauth-protected-resource` endpoint + `/api/rfc9728` proxy
- [ ] 07-02-PLAN.md — `rfc9728` tab in AgentGatewayPanel with RFC9728Content and live metadata demo

### Phase 8: Banking transaction integrity — fix balance updates, validate all actions, and ensure enterprise-grade correctness

**Goal:** Remove dead code, collapse lesson section accordion, fix dark mode to use ThemeContext
**Requirements**: TBD
**Depends on:** Phase 7
**Plans:** 1/1 plans complete

Plans:
- [x] TBD (run /gsd-plan-phase 8 to break down) (completed 2026-04-01)

### Phase 9: CIBA step-up authentication — implement OTP modal, wire backchannel auth for write actions, and validate enterprise-grade UX

**Goal:** Remove dead code, collapse lesson section accordion, fix dark mode to use ThemeContext
**Requirements**: TBD
**Depends on:** Phase 8
**Plans:** 1 plan

Plans:
- [ ] TBD (run /gsd-plan-phase 9 to break down)

### Phase 10: Enterprise-grade HITL — high-value transaction warnings, CIBA or OTP step-up based on configuration, and polished approval UX

**Goal:** Remove dead code, collapse lesson section accordion, fix dark mode to use ThemeContext
**Requirements**: TBD
**Depends on:** Phase 9
**Plans:** 1 plan

Plans:
- [ ] TBD (run /gsd-plan-phase 10 to break down)

### Phase 11: Education content review and accuracy audit — OAuth RFCs MCP PingOne AI completeness check

**Goal:** Remove dead code, collapse lesson section accordion, fix dark mode to use ThemeContext
**Requirements**: TBD
**Depends on:** Phase 10
**Plans:** 1 plan

Plans:
- [ ] TBD (run /gsd-plan-phase 11 to break down)

### Phase 12: UI button consistency audit — standardize color scheme red and blue with white text no grey no purple

**Goal:** Establish a consistent two-color button system: red (danger/CTA) and blue (nav/secondary), both with white text. Add --app-primary-blue CSS variables and .btn-blue utility class. Convert all grey and orange interactive buttons to blue.
**Requirements**: Button color consistency
**Depends on:** Phase 11
**Plans:** 1/1 plans complete

Plans:
- [x] 12-01-PLAN.md — Button color system: add blue vars/class + convert all grey/orange buttons to blue

### Phase 13: Dashboard first impression overhaul — professional clean layout, no duplicate buttons, agent visible above the fold, no sensitive credentials on screen

**Goal:** Remove dead code, collapse lesson section accordion, fix dark mode to use ThemeContext
**Requirements**: TBD
**Depends on:** Phase 12
**Plans:** 1 plan

Plans:
- [ ] TBD (run /gsd-plan-phase 13 to break down)

### Phase 14: Agent window polish — collapse cluttered left rail, prevent agent from covering the dashboard side panel

**Goal:** Remove dead code, collapse lesson section accordion, fix dark mode to use ThemeContext
**Requirements**: TBD
**Depends on:** Phase 13
**Plans:** 1 plan

Plans:
- [ ] TBD (run /gsd-plan-phase 14 to break down)

### Phase 15: Unified configuration + demo-data page — merge into single tabbed UI replacing separate Config and DemoData routes

**Goal:** Remove dead code, collapse lesson section accordion, fix dark mode to use ThemeContext
**Requirements**: TBD
**Depends on:** Phase 14
**Plans:** 1 plan

Plans:
- [ ] TBD (run /gsd-plan-phase 15 to break down)

### Phase 16: Education content refresh — RFCs, AI agent standards, industry guidance

**Goal:** Remove dead code, collapse lesson section accordion, fix dark mode to use ThemeContext
**Requirements**: TBD
**Depends on:** Phase 15
**Plans:** 1 plan

Plans:
- [ ] TBD (run /gsd-plan-phase 16 to break down)

### Phase 17: Ping Identity for AI principles — audit, agent flow badges, education panel

**Goal:** Remove dead code, collapse lesson section accordion, fix dark mode to use ThemeContext
**Requirements**: TBD
**Depends on:** Phase 16
**Plans:** 1 plan

Plans:
- [ ] TBD (run /gsd-plan-phase 17 to break down)

### Phase 18: Token Chain correctness — two-exchange support, robust event descriptions, agent request flow audit

**Goal:** Remove dead code, collapse lesson section accordion, fix dark mode to use ThemeContext
**Requirements**: TBD
**Depends on:** Phase 17
**Plans:** 1 plan

Plans:
- [ ] TBD (run /gsd-plan-phase 18 to break down)

### Phase 19: Demo Config page audit — verify all sections work and are necessary

**Goal:** Remove dead code, collapse lesson section accordion, fix dark mode to use ThemeContext
**Requirements**: TBD
**Depends on:** Phase 18
**Plans:** 1/1 plans complete

Plans:
- [x] 19-01-PLAN.md — Remove dead code + lesson accordion + fix dark mode

### Phase 20: Postman collections — fix 1-exchange utilities and build industry-standard 2-exchange collection

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 19
**Plans:** 3/3 plans complete

Plans:
- [x] TBD (run /gsd:plan-phase 20 to break down) (completed 2026-04-02)

### Phase 21: Customer diagrams — token exchange flow and token anatomy before/after exchange

**Goal:** Two customer-facing draw.io diagrams documenting the RFC 8693 token exchange chain: a sequence/flow diagram showing delegation steps, and a token anatomy diagram showing JWT claims at each stage.
**Requirements**: DIAG-01 (token exchange flow diagram), DIAG-02 (token anatomy diagram)
**Depends on:** Phase 20
**Plans:** 1 plan

Plans:
- [ ] 21-01-PLAN.md — Create BX-Finance-Token-Exchange-Customer.drawio + BX-Finance-Token-Anatomy.drawio

### Phase 22: Agent capability audit — enterprise-grade tools, full account data, Brave Search routing, Groq NLU, exhaustive chip coverage

**Goal:** Close chip coverage gaps (add query_user_by_email and web_search chips), wire Brave Search as a BFF-side action with server-only API key handling, and verify all MCP tools return complete data.
**Requirements**: AGENT-01 (chip coverage), AGENT-02 (full account data), AGENT-03 (Brave Search wire), AGENT-04 (NLU routing)
**Depends on:** Phase 21
**Plans:** 2 plans

Plans:
- [ ] 22-01-PLAN.md — Audit MCP tool chip coverage + add query_user chip + verify full account/transaction data
- [ ] 22-02-PLAN.md — Wire Brave Search (braveSearchService + web_search intent + Groq NLU prompt)

### Phase 23: LangChain modernization — upgrade to 0.3.x LCEL, multi-provider model switching UI, user API key input, education page

**Goal:** Modernize langchain_agent/ to 0.3.x LCEL, add 5-provider LLM factory, BFF session-stored API keys, widget settings panel, Config page section, and LangChain education sidebar + /langchain deep-dive page.
**Requirements**: LCH-01, LCH-02, LCH-03, LCH-04
**Depends on:** Phase 22
**Plans:** 4 plans

Plans:
- [ ] 23-01-PLAN.md — Python upgrade: requirements.txt + LangChainConfig extension + llm_factory.py + LCEL migration
- [ ] 23-02-PLAN.md — BFF /api/langchain/config routes + Config page LangChain Agent section
- [ ] 23-03-PLAN.md — Widget provider badge + settings panel (depends 23-01, 23-02)
- [ ] 23-04-PLAN.md — Education: LangChainPanel + /langchain page + BankingAgent NLU wiring (depends 23-02)

### Phase 24: Agent builder landscape — LangChain, open-source and commercial frameworks, vendor comparison

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 23
**Plans:** 0/2 plans executed

Plans:
- [ ] TBD (run /gsd-plan-phase 24 to break down)

### Phase 25: LLM landscape — commercial and open-source models, capabilities overview, and comparison

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 24
**Plans:** 0/2 plans executed

Plans:
- [ ] TBD (run /gsd-plan-phase 25 to break down)

### Phase 26: AI platform landscape — AWS Bedrock, Microsoft Azure AI, Google Vertex AI, IBM watsonx, Anthropic, OpenAI tools overview and vendor comparison

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 25
**Plans:** 0/2 plans executed

Plans:
- [ ] TBD (run /gsd-plan-phase 26 to break down)

### Phase 27: PingOne Authorize PAZ setup — transaction limit policy, AUD validation, act chain introspection to match RFC 8693 token exchange implementation

**Goal:** Fix RFC 8693 act.sub extraction in the MCP first-tool gate and extend the PAZ setup documentation with AUD validation, act chain policy design, and transaction limit examples.
**Requirements**: PAZ-01 (act.sub code fix), PAZ-02 (AUD + act chain + transaction limit docs)
**Depends on:** Phase 26
**Plans:** 2 plans

Plans:
- [ ] 27-01-PLAN.md — Fix actClientId extraction (act.client_id || act.sub) + update JSDoc comments
- [ ] 27-02-PLAN.md — Extend PINGONE_AUTHORIZE_PLAN.md with AUD validation, act.sub, and transaction limit sections

### Phase 28: Vercel config tab — read environment variables via Vercel API, display editable fields in UI, write non-secret vars back to Vercel, secrets entered by user and stored server-side only

**Goal:** Add a Vercel Env tab to the Config page that reads and writes env vars via Vercel Projects API (BFF-side only), shows secrets as masked indicators, and allows plain var editing inline.
**Requirements**: VCFG-01 (BFF route), VCFG-02 (React component), VCFG-03 (Config.js tab wiring + build)
**Depends on:** Phase 27
**Plans:** 2 plans

Plans:
- [ ] 28-01-PLAN.md — BFF route /api/admin/vercel-config (GET list + PATCH update via Vercel Projects API)
- [ ] 28-02-PLAN.md — VercelConfigTab.js component + Config.js tab bar wiring + npm run build verify

### Phase 29: use-case C sensitive data access - explicit authz least-data-necessary controls optional HITL for elevated actions

**Goal:** Demonstrate Use-case C: agent requests masked sensitive account fields, double-gate (scope + PAZ) blocks until user clicks Reveal in consent banner, full values released after approval. Includes rich account data model, education panel, Demo Data configurability.
**Requirements**: UC-C-01, UC-C-02, UC-C-03, UC-C-04
**Depends on:** Phase 28
**Plans:** 6 plans

Plans:
- [ ] 29-01-PLAN.md — Account data model expansion (new fields, 12-digit format, GET /my masking)
- [ ] 29-02-PLAN.md — BFF sensitive endpoint + sensitiveDataService.js (scope + PAZ + session consent)
- [ ] 29-03-PLAN.md — MCP tool get_sensitive_account_details + scope catalog + local fallback
- [ ] 29-04-PLAN.md — UI SensitiveConsentBanner + BankingAgent.js consent detection/retry
- [ ] 29-05-PLAN.md — Demo Data page Account Profile Fields section
- [ ] 29-06-PLAN.md — Education panel SensitiveDataPanel (2 tabs) + agent chip + build verify
### Phase 30: agent layout modes - float, left-dock, right-dock, bottom-dock with resizable panels and responsive 3-column layout adjustment

**Goal:** Extend AgentUiModeContext and toggle UI to support left-dock and right-dock placement modes with a width-resizable SideAgentDock component; update App.js to mount the side dock; fix the accounts regression when switching to middle layout.
**Requirements**: LAYOUT-01, LAYOUT-02, LAYOUT-03, LAYOUT-04, LAYOUT-05, LAYOUT-06
**Depends on:** Phase 29
**Plans:** 3/3 plans complete

Plans:
- [ ] 30-01-PLAN.md — Extend AgentUiModeContext: add left-dock/right-dock placement types + unit tests
- [ ] 30-02-PLAN.md — SideAgentDock component + CSS + App.js wiring
- [ ] 30-03-PLAN.md — AgentUiModeToggle: Left/Right buttons + accounts regression fix (todo #11)

### Phase 31: floating draggable resizable windows - agent request flow, agent panel, API viewer, log viewer and all drawers use unified drag-resize system with consistent UX across all windows

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 30
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 31 to break down)

### Phase 32: MCP server advanced capabilities - sequential thinking tool, async long-running tasks primitive, well-known server discovery, audit trail observability, and MCP registry integration

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 31
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 32 to break down)

### Phase 33: token chain history persistence - record and restore token chain across page refreshes using sessionStorage or localStorage

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 32
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 33 to break down)

### Phase 34: Agent action logging — log what agent, what action, rights used, and each step

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 33
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 34 to break down)

### Phase 35: User-facing feature documentation — update docs for each feature explaining what it does and why it was added

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 34
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 35 to break down)

### Phase 36: Postman collections and environments audit — update all collections and environments for any missing or changed API routes, auth flows, and MCP endpoints

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 35
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 36 to break down)

### Phase 37: Public-facing MCP server for external agents — read-only tool surface, scoped credentials, and access controls so external agents have limited safe access

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 36
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 37 to break down)

### Phase 38: Family delegation — delegate account access to other family members with scoped permissions (view accounts, balances, deposits, withdrawals, transfers), delegation history, email notification, PingOne user provisioning, and worker app config tab

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 37
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 38 to break down)

### Phase 39: Architecture diagram — create draw.io diagram of the full app architecture (UI, BFF, MCP server, LangChain agent, PingOne, PingGateway) showing component relationships, auth flows, and token paths

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 38
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 39 to break down)

### Phase 40: PingGateway MCP security: education panel on securing MCP with PingGateway plus feasibility analysis of building a custom gateway vs installing PingGateway

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 39
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 40 to break down)

### Phase 41: C4 top-down architecture diagram (draw.io) for the banking demo

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 40
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 41 to break down)

---

## Dependency Order

Phase 1 (auth-flows) → Phase 2 (token-exchange) → Phase 3 (vercel-stability) → Phase 4 (education-content) → Phase 5 (user-documentation) → Phase 6 (token-exchange-fix)

Phases 3, 4, and 5 can partially overlap after Phase 1 is complete:
- Phase 3 is independent of Phase 2 (Vercel fixes don't depend on token UI)
- Phase 4 depends on Phases 1–2 being complete so panels can reference working flows
- Phase 5 depends on all prior phases being stable
