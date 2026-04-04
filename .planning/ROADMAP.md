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

**Goal:** Wire agent-triggered step-up to auto-initiate (CIBA or OTP) without manual click; change default to email/OTP; extend 428 step-up to sensitive account details; make threshold configurable in Admin Config; polish approval UX.

**Requirements**: CIBA-01, CIBA-02, CIBA-03, CIBA-04

**Depends on:** Phase 8
**Plans:** 6 plans

Plans:
- [ ] 09-01-PLAN.md — UserDashboard: auto-initiate countown + cancel + stale toast fix (CIBA-01)
- [ ] 09-02-PLAN.md — BankingAgent: method-specific messages + confirmation card + remove SensitiveConsentBanner (CIBA-02, CIBA-04)
- [ ] 09-03-PLAN.md — Server defaults: change method to email, add threshold to Admin Config (CIBA-03)
- [ ] 09-04-PLAN.md — BFF + local path: sensitive details 428 step-up, ACR gate (CIBA-02)
- [ ] 09-05-PLAN.md — MCP TypeScript: handle step_up_required from BFF (CIBA-02)

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

**Goal:** Extend the MCP server with 5 advanced capabilities: sequential thinking tool (inline collapsible reasoning steps in agent chat), async long-running task primitive with configurable UX mode (job ID / spinner / transparent) selectable on the Demo Config page, `.well-known/mcp-server` discovery endpoint, audit trail UI (`/audit` admin route backed by AuditLogger), and local MCP registry manifest + README setup guide. Also fixes the POST api/mcp/tool 400 error.
**Requirements**: MCP-ADV-01, MCP-ADV-02, MCP-ADV-03, MCP-ADV-04, MCP-ADV-05
**Depends on:** Phase 31
**Plans:** 5/5 plans complete

Plans:
- [ ] 32-01-PLAN.md — Bug fix + GET /.well-known/mcp-server discovery endpoint
- [ ] 32-02-PLAN.md — sequential_think MCP tool (server-side)
- [ ] 32-03-PLAN.md — MCP registry manifest + audit BFF route
- [ ] 32-04-PLAN.md — Sequential thinking UI + async UX mode config
- [ ] 32-05-PLAN.md — Audit trail page (/audit admin route + AuditPage)

### Phase 33: token chain history persistence - record and restore token chain across page refreshes using sessionStorage or localStorage

**Goal:** Persist token chain history[] across page refreshes via localStorage (cap 20, clear on logout). Fold in sub/act.sub claim display as User ID / Agent ID in TokenChainDisplay.
**Requirements**: PERSIST-01, PERSIST-02, PERSIST-03, SUB-CLAIM-01
**Depends on:** Phase 32
**Plans:** 1/1 plans complete

Plans:
- [ ] 33-01-PLAN.md — localStorage persistence + sub/act.sub display + clear on logout

### Phase 34: Agent action logging — log what agent, what action, rights used, and each step

**Goal:** Extend the Phase 32 AuditLogger stub into a real, persistent audit pipeline. Every MCP tool invocation logged with full agent identity, rights used, and step detail — visible in the admin audit panel and stored in Upstash Redis.
**Requirements**: TBD
**Depends on:** Phase 33
**Plans:** 2/2 plans complete

Plans:
- [x] 34-01-PLAN.md — MCP server: Upstash Redis persistence for AuditLogger (write + read + schema extension)
- [ ] 34-02-PLAN.md — Admin UI + BFF: agent audit fields display (agentId, duration, scope, filters)

### Phase 35: User-facing feature documentation — update docs for each feature explaining what it does and why it was added

**Goal:** Update FEATURES.md and CHANGELOG.md to document all features added in phases 29–34, with what-it-does and why-it-was-added explanations for each.
**Requirements**: TBD
**Depends on:** Phase 34
**Plans:** 1/1 plans complete

Plans:
- [x] 35-01-PLAN.md — Update FEATURES.md and CHANGELOG.md for phases 29–34

### Phase 36: Postman collections and environments audit — update all collections and environments for any missing or changed API routes, auth flows, and MCP endpoints

**Goal:** Full audit and update of all Postman collections and environment files — staleness fixes, 2-exchange audience correction, 3 new env vars, 2 new collections (MCP-Tools + BFF-API), stray files moved to docs/.
**Requirements**: TBD
**Depends on:** Phase 35
**Plans:** 0/3 plans executed

Plans:
- [ ] 36-01-PLAN.md — File organization + shared environment (3 new vars, move strays to docs/)
- [ ] 36-02-PLAN.md — Full audit of all existing collections + 2-exchange audience correction + Advanced-Utilities expansion
- [ ] 36-03-PLAN.md — Create BX-Finance-MCP-Tools and BX-Finance-BFF-API collections

### Phase 37: Public-facing MCP server for external agents — read-only tool surface, scoped credentials, and access controls so external agents have limited safe access

**Goal:** Add `readOnly` tool tiers to MCP server + `/.well-known/mcp-server` manifest v2 with access tiers + education panel discovery tab + README AI client discovery section
**Requirements**: MCP-PUB-01, MCP-PUB-02, MCP-PUB-03, MCP-PUB-04, MCP-PUB-05
**Depends on:** Phase 36
**Plans:** 2/2 plans complete

Plans:
- [ ] 37-01-PLAN.md — `readOnly` metadata in BankingToolRegistry + `tools/list` filter + `/.well-known/mcp-server` manifest v2 (tool access tiers)
- [ ] 37-02-PLAN.md — McpProtocolPanel discovery tab + TOOLS catalog `readOnly` column + README Server Discovery section

### Phase 38: Family delegation — delegate account access to other family members with scoped permissions (view accounts, balances, deposits, withdrawals, transfers), delegation history, email notification, PingOne user provisioning, and worker app config tab

**Goal:** Build a family account delegation feature: /delegation page for managing delegates, BFF delegation API with PingOne user provisioning and email notifications, scoped permissions (view/write), delegation history, and a Worker App config tab on /config.
**Requirements**: DELEG-01, DELEG-02, DELEG-03, DELEG-04, DELEG-05, DELEG-06, DELEG-07
**Depends on:** Phase 37
**Plans:** 3 plans

Plans:
- [ ] 38-01-PLAN.md — BFF delegationService.js + delegation API routes
- [ ] 38-02-PLAN.md — Worker App config tab + GET /admin/config/worker-test endpoint
- [ ] 38-03-PLAN.md — DelegationPage.js, App.js wire-up, UserDashboard link, build verify

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

### Phase 42: Persist demo accounts across server restarts using env file on Vercel and SQLite on local

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 41
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 42 to break down)

### Phase 43: Multi-vertical demo mode — retail and workforce HR variants via config, reusing banking infrastructure

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 42
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 43 to break down)

### Phase 44: Admin mode token exchange — use admin token (not user token) for MCP tool calls when in admin session, enable admin-only actions (view all users, delete account)

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 43
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 44 to break down)

### Phase 45: need to support RFC 9728 (OAuth 2.0 Protected Resource Metadata)

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 44
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 45 to break down)

### Phase 46: Standardize PingOne app, resource, and scope naming across all use cases

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 45
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 46 to break down)

### Phase 47: Super Banking rename verification — confirm no regressions across UI, API, MCP, and docs

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 46
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 47 to break down)

### Phase 48: Remove invalid SpEL act expression from Super Banking Banking API and enforce act chain at BFF PAZ layer instead update docs

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 47
**Plans:** 1/1 plans complete

Plans:
- [x] TBD (run /gsd-plan-phase 48 to break down) (completed 2026-04-03)

### Phase 49: Setup wizard — credential input page that creates .env, provisions Vercel env vars, creates PingOne apps and resource servers, and attaches scopes via Management API worker token

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 48
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 49 to break down)

### Phase 50: update docs setup script and fix logout URLs on PingOne apps using worker token

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 49
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 50 to break down)

### Phase 51: Auth rules audit tests and demo config section for login OTP and high-value transaction gates

**Goal:** Enforce session-required auth gate on all MCP tool calls and banking write routes; add client-side intent block in BankingAgent; add pre-login guest chip group; add Home page session banner; add SecuritySettings auth gate summary.
**Requirements**: AUTH-GATE-01, AUTH-GATE-02, AUTH-GATE-03, AUTH-GATE-04, AUTH-GATE-05
**Depends on:** Phase 50
**Plans:** 2/2 plans complete

Plans:
- [x] 51-01-PLAN.md — requireSession middleware + BankingAgent client-side auth gate + pre-login chips
- [x] 51-02-PLAN.md — Home page session banner + SecuritySettings auth gate summary section

### Phase 52: PingOne MFA step-up research and implementation — OTP FIDO TOTP full MFA capability

**Goal:** Full PingOne MFA step-up capability using the deviceAuthentications API directly — email OTP, TOTP, FIDO2/passkey, and push notification — always-on (default threshold $0) for all write operations, with CIBA auto-submit, enterprise OTP modal styling, and full email display.
**Requirements**: MFA-01, MFA-02, MFA-03, MFA-04, MFA-05, MFA-06, MFA-07, MFA-08, MFA-09
**Depends on:** Phase 51
**Plans:** 6 plans

Plans:
- [x] 52-01-PLAN.md — BFF mfaService.js + MFA routes (deviceAuthentications wrapper)
- [x] 52-02-PLAN.md — Config quick-fixes: threshold default $0, CIBA stepUpVerified, email unmask
- [x] 52-03-PLAN.md — OTP modal enterprise restyle + wire to PingOne MFA service
- [x] 52-04-PLAN.md — TOTP + push challenge UI + device picker
- [x] 52-05-PLAN.md — FIDO2 WebAuthn relay UI (Fido2Challenge component)
- [x] 52-06-PLAN.md — MCP tools load MFA gate + stepUpMethod config in SecuritySettings

### Phase 53: debug testing and bug fixes for phase 52 MFA step-up

**Goal:** Fix five edge-case gaps from Phase 52 MFA step-up: TTL on stepUpVerified (D-01), challenge-expiry recovery (D-02), token-expiry mid-MFA with silent refresh (D-03), no-devices enrollment flow (D-04), and always-require-step-up for withdrawals toggle (D-05).
**Requirements**: BUG-01, BUG-02, BUG-03, BUG-04, BUG-05
**Depends on:** Phase 52
**Plans:** 4 plans

Plans:
- [x] 53-01-PLAN.md — BFF session TTL + error codes (D-01, D-02, D-03 server)
- [x] 53-02-PLAN.md — stepUpWithdrawalsAlways toggle (D-05)
- [x] 53-03-PLAN.md — Device enrollment BFF endpoints (D-04 server)
- [x] 53-04-PLAN.md — UserDashboard error handling + enrollment panel UI (D-02, D-03, D-04 UI)

---

## Dependency Order

Phase 1 (auth-flows) → Phase 2 (token-exchange) → Phase 3 (vercel-stability) → Phase 4 (education-content) → Phase 5 (user-documentation) → Phase 6 (token-exchange-fix)

Phases 3, 4, and 5 can partially overlap after Phase 1 is complete:
- Phase 3 is independent of Phase 2 (Vercel fixes don't depend on token UI)
- Phase 4 depends on Phases 1–2 being complete so panels can reference working flows
- Phase 5 depends on all prior phases being stable
