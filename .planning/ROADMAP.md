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
| 56 | token-exchange-audit-and-compliance | Comprehensive RFC 8693 compliance audit against architectural diagrams | AUDIT-01, AUDIT-02, AUDIT-03, AUDIT-04, AUDIT-05, AUDIT-06 | 1 plan |
| 57 | oauth-client-credentials-security-hardening | Replace PATs with OAuth 2.0 client credentials for AI integrations (80% security value, 20% complexity) | SECURE-01, SECURE-02, SECURE-03, SECURE-04, SECURE-05, SECURE-06 | 1 plan |
| 58 | rfc8693-delegation-claims-compliance | Ensure RFC 8693 delegation pattern with correct may_act and act claim structures | DELEGATION-01, DELEGATION-02, DELEGATION-03, DELEGATION-04, DELEGATION-05, DELEGATION-06 | 1 plan |
| 59 | rfc9728-compliance-and-education-audit | Comprehensive audit of RFC 9728 Protected Resource Metadata implementation and educational coverage | RFC9728-01, RFC9728-02, RFC9728-03, RFC9728-04, RFC9728-05, RFC9728-06 | 1 plan |
| 60 | agent-showcase-and-integration-storytelling | Transform demonstration to showcase established banking platform embracing AI augmentation | SHOWCASE-01, SHOWCASE-02, SHOWCASE-03, SHOWCASE-04, SHOWCASE-05, SHOWCASE-06 | 1 plan |
| 61 | mcp-spec-error-code-compliance-audit | Comprehensive audit of MCP error handling to ensure 403→"invalid scopes" and 401→auth flow per MCP spec | MCPERR-01, MCPERR-02, MCPERR-03, MCPERR-04, MCPERR-05, MCPERR-06 | 1 plan |
| 62 | token-exchange-critical-fixes-and-enhancements | Address critical audit issues: may_act format, RFC 8707, scope simplification, test coverage, documentation | CRITICAL-01, CRITICAL-02, CRITICAL-03, CRITICAL-04, CRITICAL-05 | 1 plan |
| 63 | documentation-and-integration-critical-fixes | Fix critical documentation gaps: operations guides, developer integration, API docs, architecture, configuration | DOC-01, DOC-02, DOC-03, DOC-04 | 1 plan |
| 64 | unified-configuration-page | Merge config and demo-data into one unified configuration page with complete audit and seamless migration | UNIFIED-01, UNIFIED-02, UNIFIED-03, UNIFIED-04 | 1 plan |
| 65 | api-configuration-and-management-enhancements | Address critical API configuration issues, improve management worker authentication, and fix Vercel environment variable handling | API-01, API-02, API-03, API-04 | 1 plan |
| 66 | ui-enhancements-and-user-experience-improvements | Comprehensive UI improvements including agent interface enhancements, education panel updates, authentication flow improvements, and visual design refinements | UI-01, UI-02, UI-03, UI-04, UI-05 | 1 plan |
| 67 | documentation-enhancement-and-developer-tools | Complete documentation suite with comprehensive technical guides, visual diagrams, educational content, and developer tools for excellent developer experience | DOCS-01, DOCS-02, DOCS-03, DOCS-04, DOCS-05 | 1 plan |
| 83 | ai-tokens-education | Create comprehensive education page explaining actor tokens, subject tokens, and other AI-related tokens with interactive diagrams and terminology glossary | Complete | 1 plan |
| 55 | docker-kubernetes-deployment | Containerize all components for Kubernetes deployment | DOCKER-01, DOCKER-02 | 1 plan |
| 85 | chase-dashboard-styling | Dashboard styling to match Chase.com design language | Complete | 3/3 plans |
| 86 | test-everything-you-can-for-production-run | Comprehensive testing and verification for production launch | TBD | 0 plans |
| 87 | comprehensive-token-validation-at-every-step | Verify tokens at every step: Agent (MCP client) → App Host (BFF) → MCP Server (Gateway); document authz server vs local JWT validation | TOKEN-VAL-01, TOKEN-VAL-02, TOKEN-VAL-03 | 0 plans |
| 94 | explicit-hitl-for-agent-consent | Explicit HITL for user approval before agent performs actions on user behalf | HITL-01, HITL-02 | 0 plans |
| 95 | actor-token-agent-token-education | Document and teach that Actor token = Agent token; establish consistent terminology across docs and education UI | ACTOR-01 | ✅ Complete (1/1) |
| 96 | audience-aud-claim-validation | Validate audience (aud) claim in all tokens; ensure aud matches expected resource/API; configure and audit aud values in PingOne apps | AUD-01 | ✅ Complete (1/1) |

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
**Requirements**: CONFIG-01
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

**Goal:** Enterprise-grade HITL approval UX: amber high-value warning in consent UI (≥$500), surface-adaptive HITL card (inline for middle/dock, modal for FAB), and toolbar anatomy consistency across all 3 agent surfaces.
**Requirements**: HITL-01, HITL-02, HITL-03
**Depends on:** Phase 9
**Plans:** 3/3 plans complete

Plans:
- [x] 10-01-PLAN.md — AgentConsentModal: high-value amber warning + z-index fix + spec-compliant labels (HITL-01)
- [x] 10-02-PLAN.md — Inline HITL card for middle/dock surfaces; modal kept for FAB (HITL-02)
- [x] 10-03-PLAN.md — EmbeddedAgentDock toolbar: chevron icons + 44px height (HITL-03)

### Phase 11: Education content review and accuracy audit — OAuth RFCs MCP PingOne AI completeness check

**Goal:** Remove dead code, collapse lesson section accordion, fix dark mode to use ThemeContext
**Requirements**: CONFIG-01
**Depends on:** Phase 10
**Plans:** 1/1 plans complete

Plans:
- [x] TBD (run /gsd-plan-phase 11 to break down) (completed 2026-04-07)

### Phase 12: UI button consistency audit — standardize color scheme red and blue with white text no grey no purple

**Goal:** Establish a consistent two-color button system: red (danger/CTA) and blue (nav/secondary), both with white text. Add --app-primary-blue CSS variables and .btn-blue utility class. Convert all grey and orange interactive buttons to blue.
**Requirements**: Button color consistency
**Depends on:** Phase 11
**Plans:** 1/1 plans complete

Plans:
- [x] 12-01-PLAN.md — Button color system: add blue vars/class + convert all grey/orange buttons to blue

### Phase 13: Dashboard first impression overhaul — professional clean layout, no duplicate buttons, agent visible above the fold, no sensitive credentials on screen

**Goal:** Remove dead code, collapse lesson section accordion, fix dark mode to use ThemeContext
**Requirements**: CONFIG-01
**Depends on:** Phase 12
**Plans:** 1 plan

Plans:
- [ ] TBD (run /gsd-plan-phase 13 to break down)

### Phase 14: Agent window polish — collapse cluttered left rail, prevent agent from covering the dashboard side panel

**Goal:** Remove dead code, collapse lesson section accordion, fix dark mode to use ThemeContext
**Requirements**: CONFIG-01
**Depends on:** Phase 13
**Plans:** 1 plan

Plans:
- [ ] TBD (run /gsd-plan-phase 14 to break down)

### Phase 15: Unified configuration + demo-data page — merge into single tabbed UI replacing separate Config and DemoData routes

**Goal:** Remove dead code, collapse lesson section accordion, fix dark mode to use ThemeContext
**Requirements**: CONFIG-01
**Depends on:** Phase 14
**Plans:** 1 plan

Plans:
- [ ] TBD (run /gsd-plan-phase 15 to break down)

### Phase 16: Education content refresh — RFCs, AI agent standards, industry guidance

**Goal:** Remove dead code, collapse lesson section accordion, fix dark mode to use ThemeContext
**Requirements**: CONFIG-01
**Depends on:** Phase 15
**Plans:** 1 plan

Plans:
- [ ] TBD (run /gsd-plan-phase 16 to break down)

### Phase 17: Ping Identity for AI principles — audit, agent flow badges, education panel

**Goal:** Remove dead code, collapse lesson section accordion, fix dark mode to use ThemeContext
**Requirements**: CONFIG-01
**Depends on:** Phase 16
**Plans:** 1 plan

Plans:
- [ ] TBD (run /gsd-plan-phase 17 to break down)

### Phase 18: Token Chain correctness — two-exchange support, robust event descriptions, agent request flow audit

**Goal:** Remove dead code, collapse lesson section accordion, fix dark mode to use ThemeContext
**Requirements**: CONFIG-01
**Depends on:** Phase 17
**Plans:** 1 plan

Plans:
- [ ] TBD (run /gsd-plan-phase 18 to break down)

### Phase 19: Demo Config page audit — verify all sections work and are necessary

**Goal:** Remove dead code, collapse lesson section accordion, fix dark mode to use ThemeContext
**Requirements**: CONFIG-01
**Depends on:** Phase 18
**Plans:** 1/1 plans complete

Plans:
- [x] 19-01-PLAN.md — Remove dead code + lesson accordion + fix dark mode

### Phase 20: Postman collections — fix 1-exchange utilities and build industry-standard 2-exchange collection

**Goal:** [To be planned]
**Requirements**: CONFIG-01
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
**Requirements**: CONFIG-01
**Depends on:** Phase 23
**Plans:** 0/2 plans executed

Plans:
- [ ] TBD (run /gsd-plan-phase 24 to break down)

### Phase 25: LLM landscape — commercial and open-source models, capabilities overview, and comparison

**Goal:** [To be planned]
**Requirements**: CONFIG-01
**Depends on:** Phase 24
**Plans:** 0/2 plans executed

Plans:
- [ ] TBD (run /gsd-plan-phase 25 to break down)

### Phase 26: AI platform landscape — AWS Bedrock, Microsoft Azure AI, Google Vertex AI, IBM watsonx, Anthropic, OpenAI tools overview and vendor comparison

**Goal:** [To be planned]
**Requirements**: CONFIG-01
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
**Requirements**: CONFIG-01
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
**Requirements**: CONFIG-01
**Depends on:** Phase 33
**Plans:** 2/2 plans complete

Plans:
- [x] 34-01-PLAN.md — MCP server: Upstash Redis persistence for AuditLogger (write + read + schema extension)
- [ ] 34-02-PLAN.md — Admin UI + BFF: agent audit fields display (agentId, duration, scope, filters)

### Phase 35: User-facing feature documentation — update docs for each feature explaining what it does and why it was added

**Goal:** Update FEATURES.md and CHANGELOG.md to document all features added in phases 29–34, with what-it-does and why-it-was-added explanations for each.
**Requirements**: CONFIG-01
**Depends on:** Phase 34
**Plans:** 1/1 plans complete

Plans:
- [x] 35-01-PLAN.md — Update FEATURES.md and CHANGELOG.md for phases 29–34

### Phase 36: Postman collections and environments audit — update all collections and environments for any missing or changed API routes, auth flows, and MCP endpoints

**Goal:** Full audit and update of all Postman collections and environment files — staleness fixes, 2-exchange audience correction, 3 new env vars, 2 new collections (MCP-Tools + BFF-API), stray files moved to docs/.
**Requirements**: CONFIG-01
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
**Plans:** 3/3 plans complete

Plans:
- [x] 38-01-PLAN.md — BFF delegationService.js + delegation API routes
- [x] 38-02-PLAN.md — Worker App config tab + GET /admin/config/worker-test endpoint
- [x] 38-03-PLAN.md — DelegationPage.js, App.js wire-up, UserDashboard link, build verify

### Phase 39: Architecture diagram — create draw.io diagram of the full app architecture (UI, BFF, MCP server, LangChain agent, PingOne, PingGateway) showing component relationships, auth flows, and token paths

**Goal:** [To be planned]
**Requirements**: CONFIG-01
**Depends on:** Phase 38
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 39 to break down)

### Phase 40: PingGateway MCP security: education panel on securing MCP with PingGateway plus feasibility analysis of building a custom gateway vs installing PingGateway

**Goal:** Education panel explaining how to secure MCP servers with PingGateway, plus a feasibility comparison between custom gateway vs PingGateway deployment.
**Requirements**: PGMCP-01, PGMCP-02
**Depends on:** Phase 39
**Plans:** 1 plan

Plans:
- [x] 40-01-PLAN.md — PingGatewayMcpPanel.js education component (4 tabs: Overview, Architecture, Custom vs PingGateway, Configuration)

### Phase 41: C4 top-down architecture diagram (draw.io) for the banking demo

**Goal:** Comprehensive C4 architecture diagram (draw.io) covering all four levels (Context, Container, Component, Code) with an education panel for interactive viewing.
**Requirements**: C4-01, C4-02, C4-03
**Depends on:** Phase 40
**Plans:** 1 plan

Plans:
- [x] 41-01-PLAN.md — C4 draw.io diagram (4 levels) + ArchitectureDiagramPanel.js education component

### Phase 42: Persist demo accounts across server restarts using env file on Vercel and SQLite on local

**Goal:** [To be planned]
**Requirements**: CONFIG-01
**Depends on:** Phase 41
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 42 to break down)

### Phase 43: Multi-vertical demo mode — retail and workforce HR variants via config, reusing banking infrastructure

**Goal:** Config-driven vertical switching between Banking, Retail, and Workforce (HR) modes — reusing the same OAuth flows, MCP server, and agent infrastructure with swapped terminology, theme, and account types.
**Requirements**: VERT-01, VERT-02, VERT-03, VERT-04, VERT-05
**Depends on:** Phase 42
**Plans:** 2 plans

Plans:
- [x] 43-01-PLAN.md — verticalConfigService.js + vertical JSON configs (banking/retail/workforce) + REST API
- [x] 43-02-PLAN.md — VerticalContext.js + VerticalSwitcher.js UI + App.js integration

### Phase 44: Admin mode token exchange — use admin token (not user token) for MCP tool calls when in admin session, enable admin-only actions (view all users, delete account)

**Goal:** [To be planned]
**Requirements**: CONFIG-01
**Depends on:** Phase 43
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 44 to break down)

### Phase 45: need to support RFC 9728 (OAuth 2.0 Protected Resource Metadata)

**Goal:** [To be planned]
**Requirements**: CONFIG-01
**Depends on:** Phase 44
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 45 to break down)

### Phase 46: Standardize PingOne app, resource, and scope naming across all use cases

**Goal:** [To be planned]
**Requirements**: CONFIG-01
**Depends on:** Phase 45
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 46 to break down)

### Phase 47: Super Banking rename verification — confirm no regressions across UI, API, MCP, and docs

**Goal:** [To be planned]
**Requirements**: CONFIG-01
**Depends on:** Phase 46
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 47 to break down)

### Phase 48: Remove invalid SpEL act expression from Super Banking Banking API and enforce act chain at BFF PAZ layer instead update docs

**Goal:** [To be planned]
**Requirements**: CONFIG-01
**Depends on:** Phase 47
**Plans:** 1/1 plans complete

Plans:
- [x] TBD (run /gsd-plan-phase 48 to break down) (completed 2026-04-03)

### Phase 49: Setup wizard — credential input page that creates .env, provisions Vercel env vars, creates PingOne apps and resource servers, and attaches scopes via Management API worker token

**Goal:** A "PingOne Setup" tab in the Config page that accepts worker credentials, provisions all PingOne resources (apps, resource server, scopes, demo users) via Management API with SSE streaming progress, and writes .env or Vercel env vars automatically.
**Requirements**: SETUP-01, SETUP-02, SETUP-03, SETUP-04, SETUP-05
**Depends on:** Phase 48
**Plans:** 2/2 plans complete

Plans:
- [x] 49-01-PLAN.md — pingoneProvisionService.js + setupWizard.js SSE streaming route (BFF provisioning)
- [x] 49-02-PLAN.md — SetupWizardTab.js two-panel UI (form + live SSE log) + Config.js tab integration

### Phase 50: update docs setup script and fix logout URLs on PingOne apps using worker token

**Goal:** Fix logout URLs on PingOne apps programmatically via Management API, audit app configurations, and write comprehensive setup documentation (SETUP.md, PINGONE_APP_CONFIG.md, README quick-start).
**Requirements**: DOCS-01, DOCS-02, LOGOUT-01
**Depends on:** Phase 49
**Plans:** 1 plan

Plans:
- [x] 50-01-PLAN.md — pingoneAppConfigService.js + fix-logout-urls API + docs/SETUP.md + docs/PINGONE_APP_CONFIG.md + README updates

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
**Plans:** 6/6 plans complete

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

### Phase 54: Self-service user provisioning — create customer and admin logins with profile data and mayAct setup

**Goal:** A self-service page where anyone can create their own PingOne customer or admin user, fill in profile data (email, phone, address), set a password, and configure the mayAct custom JSON attribute needed for RFC 8693 token exchange delegation — all without touching the PingOne Console.
**Requirements**: SSU-01, SSU-02, SSU-03, SSU-04, SSU-05, SSU-06
**Depends on:** None (standalone)
**Plans:** 2 plans

Plans:
- [ ] 54-01-PLAN.md — pingOneUserService.js + selfServiceUsers.js REST API (PingOne Management API user CRUD, password set, mayAct attribute)
- [ ] 54-02-PLAN.md — SelfServicePage.js React UI (create form, profile view, mayAct config, diagnostic panel, /self-service route)

---

### Phase 55: docker-kubernetes-deployment

**Goal:** Containerize all Super Banking components for Kubernetes deployment with production-ready Docker images and orchestration manifests.

**Requirements:** DOCKER-01, DOCKER-02

**Plans:** 1/1 plan

Plans:
- [ ] 55-01-PLAN.md — Docker images and Kubernetes foundation (DOCKER-01, DOCKER-02)

**Success criteria:**
1. All 4 components (UI, API Server, MCP Server, Agent) build successfully as Docker images
2. Kubernetes manifests deploy complete application stack to local cluster
3. Health checks and monitoring work correctly
4. Application functions identically to Vercel deployment
5. Helm chart enables one-command deployment

---

### Phase 56: token-exchange-audit-and-compliance

**Goal:** Conduct comprehensive audit of RFC 8693 token exchange implementation against provided architectural diagrams, ensuring full compliance with both single and double exchange delegation patterns.

**Requirements:** AUDIT-01, AUDIT-02, AUDIT-03, AUDIT-04, AUDIT-05, AUDIT-06

**Plans:** 1/1 plan

Plans:
- [ ] 56-01-PLAN.md — Token exchange audit and compliance implementation (AUDIT-01 through AUDIT-06)

**Success criteria:**
1. 100% RFC 8693 specification compliance verified through comprehensive audit
2. Two-exchange delegation flow exactly matches provided diagram patterns
3. Complete audit trail provides full token provenance for security reviews
4. All configuration scenarios validated with clear error messaging
5. Comprehensive test suite achieves >95% code coverage for exchange logic
6. Complete documentation including RFC 8693 compliance report with evidence

---

## Dependency Order

Phase 1 (auth-flows) → Phase 2 (token-exchange) → Phase 3 (vercel-stability) → Phase 4 (education-content) → Phase 5 (user-documentation) → Phase 6 (token-exchange-fix)

Phases 3, 4, and 5 can partially overlap after Phase 1 is complete:
- Phase 3 is independent of Phase 2 (Vercel fixes don't depend on token UI)
- Phase 4 depends on Phases 1–2 being complete so panels can reference working flows

Phase 55 (docker-kubernetes-deployment) depends on all core functionality being complete and stable.
Phase 56 (token-exchange-audit-and-compliance) depends on Phase 6 (token-exchange-fix) being complete.
Phase 57 (oauth-client-credentials-security-hardening) depends on Phase 56 (token-exchange-audit) being complete.
Phase 58 (rfc8693-delegation-claims-compliance) depends on Phase 57 (oauth-client-credentials) being complete.
- Phase 5 depends on all prior phases being stable

---

### Phase 57: oauth-client-credentials-security-hardening

**Goal:** Replace long-lived Personal Access Tokens with OAuth 2.0 client credentials for AI integrations, implementing scoped, short-lived tokens to reduce credential blast radius by 80% while adding only 20% architectural complexity.

**Requirements:** SECURE-01, SECURE-02, SECURE-03, SECURE-04, SECURE-05, SECURE-06

**Plans:** 1/1 plan

Plans:
- [ ] 57-01-PLAN.md — OAuth client credentials security hardening implementation (SECURE-01 through SECURE-06)

**Success criteria:**
1. 80% reduction in credential blast radius through scoped, time-limited tokens
2. 100% of MCP servers register as OAuth clients with proper credentials  
3. All API calls validated against defined scopes with least-privilege access
4. 30-minute token TTL with automatic rotation and secure credential management
5. Seamless transition from PATs with zero service disruption and backward compatibility

---

### Phase 58: rfc8693-delegation-claims-compliance

**Goal:** Ensure RFC 8693 token exchange implementation properly follows delegation pattern with correct `may_act` and `act` claim structures, where user tokens contain authorized agent identifiers and exchanged tokens contain complete delegation chains preserving user subject identity.

**Requirements:** DELEGATION-01, DELEGATION-02, DELEGATION-03, DELEGATION-04, DELEGATION-05, DELEGATION-06

**Plans:** 1/1 plan

Plans:
- [ ] 58-01-PLAN.md — RFC 8693 delegation claims compliance implementation (DELEGATION-01 through DELEGATION-06)

**Success criteria:**
1. 100% of user tokens contain proper `may_act` claims with authorized agent identifiers
2. 100% of exchanged tokens preserve user `sub` claim and contain correct nested `act` claims
3. Complete delegation chain (user → agent → MCP server) verified in all exchanged tokens
4. All agent and MCP server identifiers use consistent URI format
5. Comprehensive validation and error responses for malformed claims

---

### Phase 59: rfc9728-compliance-and-education-audit

**Goal:** Conduct comprehensive audit of RFC 9728 Protected Resource Metadata implementation and educational coverage to ensure full specification compliance and accurate educational content.

**Requirements:** RFC9728-01, RFC9728-02, RFC9728-03, RFC9728-04, RFC9728-05, RFC9728-06

**Plans:** 1/1 plan

Plans:
- [ ] 59-01-PLAN.md — RFC 9728 compliance and education audit implementation (RFC9728-01 through RFC9728-06)

**Success criteria:**
1. 100% RFC 9728 specification compliance with all mandatory and recommended requirements
2. All educational panels technically accurate and up-to-date with current implementation
3. Live demo works correctly in all environments and shows real metadata
4. Seamless integration with existing education flow and no breaking changes
5. Comprehensive documentation covering implementation, usage, and troubleshooting

---

### Phase 60: agent-showcase-and-integration-storytelling

**Goal:** Transform demonstration approach to showcase established banking application embracing AI Agent capabilities, telling compelling story of existing platform enhancement rather than new app development.

**Requirements:** SHOWCASE-01, SHOWCASE-02, SHOWCASE-03, SHOWCASE-04, SHOWCASE-05, SHOWCASE-06

**Plans:** 1/1 plan

Plans:
- [ ] 60-01-PLAN.md — Agent showcase and integration storytelling implementation (SHOWCASE-01 through SHOWCASE-06)

**Success criteria:**
1. Compelling integration narrative that resonates with technical and business audiences
2. Seamless user experience where agent features feel natural within existing banking workflows
3. Clear business value demonstration showing practical benefits for banking operations
4. Natural user journey for existing users to discover and adopt agent capabilities
5. Technical sophistication showcase without overwhelming complexity

---

### Phase 61: mcp-spec-error-code-compliance-audit

**Goal:** Comprehensive audit of MCP (Model Context Protocol) error handling to ensure full compliance with MCP specification error code requirements, particularly 403 → "invalid scopes" and 401 → authentication request flow.

**Requirements:** MCPERR-01, MCPERR-02, MCPERR-03, MCPERR-04, MCPERR-05, MCPERR-06

**Plans:** 1/1 plan

Plans:
- [ ] 61-01-PLAN.md — MCP specification error code compliance audit implementation (MCPERR-01 through MCPERR-06)

**Success criteria:**
1. 100% MCP specification error code compliance with all required mappings
2. Proper "invalid scopes" response for all 403 status codes per MCP spec
3. Correct authentication request flow for all 401 status codes per MCP spec
4. All MCP protocol errors use correct error code ranges (-32000 to -32099)
5. All error responses follow MCP specification JSON-RPC format

---

### Phase 62: token-exchange-critical-fixes-and-enhancements

**Goal:** Address critical issues identified in Phase 56 audit: may_act format standardization, RFC 8707 resource indicators implementation, scope narrowing simplification, comprehensive test coverage, and operational documentation enhancement.

**Requirements:** CRITICAL-01, CRITICAL-02, CRITICAL-03, CRITICAL-04, CRITICAL-05

**Plans:** 1/1 plan

Plans:
- [ ] 62-01-PLAN.md — Token exchange critical fixes and enhancements implementation (CRITICAL-01 through CRITICAL-05)

**Success criteria:**
1. 100% consistent may_act claim format using URI standard across all tokens
2. Full RFC 8707 resource indicator support in authorization flows and token validation
3. 50% reduction in scope validation complexity while maintaining security
4. 95% test coverage for all token exchange scenarios and error conditions
5. 100% operational and developer documentation coverage with practical guides

---

### Phase 63: documentation-and-integration-critical-fixes

**Goal:** Fix critical documentation gaps identified in Phase 56 AUDIT-06: operational documentation, developer integration guides, API documentation, architecture documentation, and configuration documentation enhancement.

**Requirements:** DOC-01, DOC-02, DOC-03, DOC-04

**Plans:** 1/1 plan

Plans:
- [ ] 63-01-PLAN.md — Documentation and integration critical fixes implementation (DOC-01 through DOC-04)

**Success criteria:**
1. 100% production deployment and operations guide coverage with monitoring, troubleshooting, and security procedures
2. 95% developer satisfaction with comprehensive integration guides, API reference, and practical examples
3. 100% API coverage with consistent format, usage examples, and version alignment
4. Complete system architecture, security architecture, and scaling documentation
5. Enhanced configuration guides with validation, troubleshooting, and best practices

---

### Phase 64: unified-configuration-page

**Goal:** Create a single, comprehensive configuration page that consolidates all demo settings from the current `/demo-data` and `/config` pages, providing users with a unified interface for managing the entire application configuration.

**Requirements:** UNIFIED-01, UNIFIED-02, UNIFIED-03, UNIFIED-04

**Plans:** 1/1 plan

Plans:
- [ ] 64-01-PLAN.md — Unified configuration page implementation (UNIFIED-01 through UNIFIED-04)

**Success criteria:**
1. Complete audit of all configStore keys and UI coverage
2. Consolidated backend API endpoints for configuration management
3. Unified frontend configuration page with logical sections
4. Advanced features like JWT key generation and migration tools
5. Seamless migration from old routes with proper redirects

---

### Phase 65: api-configuration-and-management-enhancements

**Goal:** Address critical API configuration and management issues that have accumulated from recent development work, focusing on improving backend API infrastructure, enhancing authentication methods for management workers, and fixing Vercel environment variable handling for better deployment reliability.

**Requirements:** API-01, API-02, API-03, API-04

**Plans:** 1/1 plan

Plans:
- [ ] 65-01-PLAN.md — API configuration and management enhancements implementation (API-01 through API-04)

**Success criteria:**
1. Zero configuration-related 500 errors in production deployment
2. All 2-exchange delegation flows work reliably with proper Vercel environment variables
3. PingOne Management API can automate resource server and scope setup
4. All 4 PingOne token authentication methods supported for management workers including JWT generation
5. Configuration persistence works across browser refreshes and server restarts
6. MCP Token Exchanger works with updated credentials and validation

---

### Phase 66: ui-enhancements-and-user-experience-improvements

**Goal:** Implement comprehensive UI improvements across the application to enhance user experience, improve agent interactions, refine educational content presentation, and create a more polished and accessible interface with better visual design and responsiveness.

**Requirements:** UI-01, UI-02, UI-03, UI-04, UI-05

**Plans:** 1/1 plan

Plans:
- [ ] 66-01-PLAN.md — User interface enhancements and user experience improvements implementation (UI-01 through UI-05)

**Success criteria:**
1. All 16 UI todos completed with enhanced agent interface, authentication flows, and educational content
2. Agent interface provides excellent user experience with proper sizing, responsiveness, and friendly account name display
3. Authentication flows are intuitive with session expiry countdown timer and self-service options
4. Educational content is comprehensive with MFA explanations, MCP tool gating, real-world examples, and visual flow diagrams
5. Configuration interfaces are unified with proper Vercel validation and token authentication method selection
6. Visual design is consistent, accessible, and performant across all devices and screen sizes

---

### Phase 67: documentation-enhancement-and-developer-tools

**Goal:** Complete the documentation suite with comprehensive technical guides, visual diagrams, educational content, and developer tools to provide excellent developer experience and clear understanding of the BX Finance banking demo architecture and implementation.

**Requirements:** DOCS-01, DOCS-02, DOCS-03, DOCS-04, DOCS-05

**Plans:** 1/1 plan

Plans:
- [ ] 67-01-PLAN.md — Documentation enhancement and developer tools implementation (DOCS-01 through DOCS-05)

**Success criteria:**
1. All remaining documentation and planning todos completed with comprehensive technical guides and visual diagrams
2. Token exchange documentation enhanced with canonical names, descriptions, scopes, and professional flow diagrams
3. Complete MFA setup guides with device enrollment instructions and RFC 8707 resource indicators education
4. MCP server education integrated with agent request flow and enhanced educational panels with real-world examples
5. Developer tools improved with enhanced Postman collections for both audiences and comprehensive phase planning tools
6. Quality assurance processes established with automated validation and maintenance procedures for ongoing documentation excellence

### Phase 68: RFC 9728 Support - Protected Resource Metadata implementation

**Goal:** [To be planned]
**Requirements**: CONFIG-01
**Depends on:** Phase 67
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 68 to break down)

### Phase 69: Standardize PingOne app, resource, and scope naming across all use cases

**Goal:** [To be planned]
**Requirements**: CONFIG-01
**Depends on:** Phase 68
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 69 to break down)

### Phase 70: Super Banking rename verification — confirm no regressions across UI, API, MCP, and docs

**Goal:** [To be planned]
**Requirements**: CONFIG-01
**Depends on:** Phase 69
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 70 to break down)

### Phase 71: 59.1 RFC 9728 compliance audit - Protected Resource Metadata implementation

**Goal:** [To be planned]
**Requirements**: CONFIG-01
**Depends on:** Phase 70
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 71 to break down)

### Phase 72: 60.1 Agent showcase and integration storytelling - banking platform AI narrative

**Goal:** [To be planned]
**Requirements**: CONFIG-01
**Depends on:** Phase 71
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 72 to break down)

### Phase 73: 61.1 MCP spec error code compliance audit - 403/401 per MCP spec

**Goal:** [To be planned]
**Requirements**: CONFIG-01
**Depends on:** Phase 72
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 73 to break down)

### Phase 74: 62.1 Token exchange critical fixes and enhancements - may_act, RFC 8707, scopes

**Goal:** [To be planned]
**Requirements**: CONFIG-01
**Depends on:** Phase 73
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 74 to break down)

### Phase 75: 63.1 Documentation and integration critical fixes - ops guides, API docs

**Goal:** [To be planned]
**Requirements**: CONFIG-01
**Depends on:** Phase 74
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 75 to break down)

### Phase 76: 64.1 Unified configuration page - consolidate /config and /demo-data

**Goal:** [To be planned]
**Requirements**: CONFIG-01
**Depends on:** Phase 75
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 76 to break down)

### Phase 77: 65.1 API configuration and management enhancements - auth methods, Vercel vars

**Goal:** [To be planned]
**Requirements**: CONFIG-01
**Depends on:** Phase 76
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 77 to break down)

### Phase 78: 66.1 UI enhancements and user experience improvements

**Goal:** [To be planned]
**Requirements**: CONFIG-01
**Depends on:** Phase 77
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 78 to break down)

### Phase 79: 67.1 Documentation enhancement and developer tools

**Goal:** [To be planned]
**Requirements**: CONFIG-01
**Depends on:** Phase 78
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 79 to break down)

### Phase 80: 68.1 RFC 9728 Support - Protected Resource Metadata implementation

**Goal:** [To be planned]
**Requirements**: CONFIG-01
**Depends on:** Phase 79
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 80 to break down)

### Phase 81: 69.1 Standardize PingOne app, resource, and scope naming across all use cases

**Goal:** [To be planned]
**Requirements**: CONFIG-01
**Depends on:** Phase 80
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 81 to break down)

### Phase 82: 70.1 Super Banking rename verification - confirm no regressions across all layers

**Goal:** [To be planned]
**Requirements**: CONFIG-01
**Depends on:** Phase 81
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 82 to break down)

### Phase 83: AI Tokens Education

**Goal:** Create a comprehensive education page explaining actor tokens, subject tokens, and other AI-related tokens used in the banking demo.

**Requirements:** Complete
**Depends on:** Phase 58, Phase 4
**Plans:** 1 plan

**Success criteria:**
1. Users can clearly distinguish between actor tokens and subject tokens
2. Token exchange flows are visually explained with interactive diagrams
3. Education panel is accessible from multiple contexts in the app
4. Content aligns with RFC 8693 token exchange specifications
5. Token terminology is consistent across all educational materials

Plans:
- [ ] 83-01-PLAN.md - Design and implement AI tokens education panel with interactive diagrams and terminology glossary

### Phase 84: review all syntax errors code failures looping best practices for all code

**Goal:** Remove dead code, clean up debug logging, consolidate shell scripts into enterprise-grade run.sh, and improve code quality across all services
**Requirements**: CONFIG-01
**Depends on:** Phase 83
**Plans:** 3/3 plans complete

**Accumulated todos (to include in plan):**
- Enterprise-grade `run.sh` startup script: consolidate 5+ shell scripts into single entry point with pre-flight checks, subcommands (start/stop/restart/logs/test/status), post-start summary banner, PID-file process management, shellcheck-clean

Plans:
- [x] 84-01-PLAN.md — Audit code quality issues (shell scripts, console logs, dead code, test status)
- [x] 84-02-PLAN.md — Create enterprise run.sh with subcommands, pre-flight checks, PID management
- [x] 84-03-PLAN.md — Fix high-priority code quality issues (clean logs, remove dead code, fix error handling)

### Phase 85: chase-dashboard-styling

**Goal:** Update Super Banking dashboards to match Chase.com's visual design language
**Requirements**: Complete
**Depends on:** Phase 84
**Plans:** 3/3 plans complete

**Success criteria:**
1. Dashboard colors match Chase.com navy (#004687) primary brand color
2. All buttons have navy background with white text and 4px border radius
3. All cards have consistent white backgrounds, 20px padding, 8px border radius, and subtle shadows
4. Typography hierarchy matches Chase standards
5. Mobile dashboard is responsive and readable at all breakpoints
6. Color contrast meets WCAG AA accessibility standards
7. No broken functionality; all interactive elements work
8. npm run build passes without errors

Plans:
- [x] 85-01-PLAN.md — Dashboard color audit and Chase.com color mapping (COMPLETE)
- [x] 85-02-PLAN.md — Styling implementation: CSS variables, hero, dashboard components (COMPLETE)
- [x] 85-03-PLAN.md — Mobile optimization and responsive verification (COMPLETE)

### Phase 86: test everything you can for production run

**Goal:** [To be planned]
**Requirements**: CONFIG-01
**Depends on:** Phase 85
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 86 to break down)

### Phase 87: Comprehensive token validation at every step

**Goal:** Implement and document comprehensive token validation across all three components of the system: Agent (MCP client), App Host (BFF/Express server), and MCP Server (Gateway). For each component, determine whether to validate tokens with PingOne's authorization server or locally if JWT, document the decision pattern, and ensure consistent implementation.

**Requirements**: TOKEN-VAL-01, TOKEN-VAL-02, TOKEN-VAL-03
**Depends on:** Phase 91 (token introspection endpoint completed)
**Plans:** 0 plans (run /gsd-plan-phase 87 to break down)

**Key Focus Areas:**
1. **Agent (MCP Client) — Token Validation**
   - External AI clients (Claude, ChatGPT) authenticate and obtain Bearer tokens
   - Before invoking MCP tools, validate token with /api/introspect endpoint (Phase 91)
   - Document: When to call /api/introspect vs cache locally

2. **App Host (BFF/Express Server) — Token Validation**
   - All incoming requests checked for valid Bearer token
   - Token validated either with PingOne authorization server OR locally if JWT + RS256
   - Scope validation: extract scopes from token and enforce per-route
   - Document: Validation chain for OAuth flows, agent delegation, and user actions

3. **MCP Server (Gateway) — Token Validation**
   - WebSocket upgrade validates Bearer token from client
   - Token must be active + have mcp:read scope (at minimum)
   - Client identity (sub + act claims) tracked for audit and authorization
   - Document: MCP-specific token validation vs traditional REST API validation

**Success Criteria:**
- Token validation patterns documented for each component with clear decision trees
- Every API endpoint has explicit token validation (remote or local)
- MCP gateway WebSocket handshake includes token validation
- Test coverage for each pattern (valid, expired, invalid, missing scopes)
- Architecture diagram showing token flow with validation points

Plans:
- [ ] 87-01-PLAN.md — Document and audit Agent token validation patterns (when to call /api/introspect)
- [ ] 87-02-PLAN.md — Document and audit App Host token validation patterns (BFF/Express validation chain)
- [ ] 87-03-PLAN.md — Document and audit MCP Server token validation patterns (WebSocket + tool calls)
- [ ] 87-04-PLAN.md — Create architecture diagrams and decision trees; verify consistency across docs

### Phase 88: Audit and align all documentation and code to PingOne app names, rename apps where needed, update Vercel and localhost env vars, validate setup and creation code

**Goal:** Complete env var alignment to canonical PingOne app names — rename remaining vars (Worker/Admin App/User App), fix services using bare process.env, fix 2-exchange error metadata, create KV migration script, update Vercel env docs.
**Requirements**: CONFIG-01
**Depends on:** Phase 87
**Plans:** 3 plans

Plans:
- [ ] 88-01-PLAN.md — Complete remaining env var renames + configStore updates + service code fixes
- [ ] 88-02-PLAN.md — KV/SQLite migration script + Vercel env var documentation
- [ ] 88-03-PLAN.md — Fix 2-exchange delegation test failures (Wave 2)

### Phase 89: Audit and update all documentation to match standardized PingOne app names

**Goal:** Update all docs (README, env.example, ENVIRONMENT_MAPPING, MAY_ACT guides, SETUP, NAMING_AUDIT) to use canonical PingOne app names and Phase 88 env var names.
**Requirements**: CONFIG-01
**Depends on:** Phase 88
**Plans:** 2 plans

Plans:
- [ ] 89-01-PLAN.md — Update core docs: README, env.example, ENVIRONMENT_MAPPING.md, PINGONE_APP_CONFIG.md, PINGONE_ACTUAL_ENVIRONMENT.md
- [ ] 89-02-PLAN.md — Update MAY_ACT docs, PINGONE_NAMING_STANDARDIZATION_AUDIT.md, SETUP.md

### Phase 90: Scope/resource check: OIDC app OIDC scope spelling validation, resource URL validation, and fix capability

**Goal:** [To be planned]
**Requirements**: CONFIG-01
**Depends on:** Phase 89
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 90 to break down)

### Phase 91: External MCP client access — public MCP server with PingOne-protected auth, restrict to @pingidentity.com Google login, per-client authorization, and Claude/ChatGPT integration planning

**Goal:** [To be planned]
**Requirements**: CONFIG-01
**Depends on:** Phase 90
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 91 to break down)

### Phase 92: User custom attribute validation — verify user has required PingOne custom attributes configured correctly, report and fix capability, integrate into existing scope/resource check tooling

**Goal:** [To be planned]
**Requirements**: CONFIG-01
**Depends on:** Phase 91
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 92 to break down)

### Phase 93: Surface agent-on-behalf-of-user actions in UI and education

**Goal:** [To be planned]
**Requirements**: CONFIG-01
**Depends on:** Phase 92
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 93 to break down)

### Phase 94: Explicit HITL for agent consent

**Goal:** Implement explicit human-in-the-loop (HITL) approval mechanism requiring user consent before the agent performs any action on the user's behalf. Clear presentation of what the agent is about to do, detailed explanation of scope/permissions, and explicit user approval (not silent background action).

**Requirements**: HITL-01, HITL-02
**Depends on:** Phase 93 (Surface agent-on-behalf-of-user actions)
**Plans:** 0 plans (run /gsd-plan-phase 94 to break down)

**Key Focus Areas:**
1. **Agent Action Interceptor**
   - Before agent executes tool call on user's behalf, pause and present approval dialog
   - Dialog shows: action description, API endpoint, scopes/permissions required, user confirmation needed

2. **User Consent UI**
   - Clear explanation: "Agent wants to [action description] on your behalf"
   - Permission breakdown: "This requires: [scope 1], [scope 2], [scope 3]"
   - Buttons: "Allow" (one-time) vs "Allow Always" vs "Deny"
   - Audit trail: log all approvals/denials with timestamp

3. **Delegation Context**
   - Token exchange includes "user consented to [scope] via [method]" claim
   - RFC 8693 act claim includes user approval evidence
   - Server-side enforcement: validates that user actually approved before executing

4. **Configuration & Defaults**
   - Admin can configure: require HITL for all actions, low/medium/high risk actions, or none
   - User preference: remember "Allow Always" decisions per agent/action type
   - Audit: all HITL decisions logged and reviewable

**Success Criteria:**
- HITL approval UI blocking before sensitive agent actions
- Clear permission explanations visible to user
- Approval decisions logged with timestamp and user confirmation
- Token exchange includes approval evidence in delegation context
- Configuration options for admins to tune approval requirements
- Support for "Allow Always" with rate limiting and scope constraints

Plans:
- [ ] 94-01-PLAN.md — Design HITL approval dialog and user consent flow
- [ ] 94-02-PLAN.md — Implement interceptor middleware in BFF for agent actions
- [ ] 94-03-PLAN.md — Add approval evidence to token exchange (RFC 8693 delegation context)
- [ ] 94-04-PLAN.md — Admin configuration UI and audit logging for HITL decisions


### Phase 95: Actor token = Agent token education and terminology

**Goal:** Document and teach that the Actor token is the Agent token (they are the same thing with different names in different contexts). Establish consistent terminology across all code, documentation, and education UI. Clarify when to use "actor", "agent", "act claim", and "agent actor" to eliminate confusion.

**Status:** ✅ COMPLETE (1/1 plans executed)
**Requirements**: ACTOR-01, ACTOR-02
**Depends on:** Phase 94 (Explicit HITL for agent consent)
**Executed:** 2026-04-08 — Plan 01 complete (commits: 900ea2d, 0a9a8cc)

**Key Focus Areas:**

1. **Terminology Clarification**
   - **Actor Token** = Token identifying the entity performing actions (usually an AI agent)
   - **Agent Token** = Same token, used when discussing the banking agent specifically
   - **Agent Actor** = RFC 8693 terminology: agent acting on behalf of user
   - **Act Claim** = JWT claim containing subject being acted upon (user) and actor (agent)
   - Use consistently: prefer "Agent" in UI, "Actor" in RFC/technical docs, "Agent Actor" in architecture

2. **Documentation Audit & Updates**
   - Scan all `.md` files for inconsistent use of "actor" vs "agent"
   - Create definitive terminology guide (ACTOR_TOKEN_TERMINOLOGY.md)
   - Update README, API docs, OAuth docs, RFC 8693 guides
   - Update PingOne configuration docs (show which apps are agent apps, actor apps)
   - Update architecture diagrams (annotate tokens with "Agent/Actor" labels)

3. **Education Panels & UI**
   - Add education panel: "What is the Actor Token?"
   - Explain: Actor = Agent Acting on User Behalf (RFC 8693 pattern)
   - Show diagram: User Token → Agent Actor → Modified Token with Act Claim
   - In token inspector: label claims clearly (act=agent, sub=user, etc.)
   - In MCP server logs: show which agent (actor) invoked which tool

4. **Code & Comments**
   - Add JSDoc comments explaining actor/agent terminology
   - Variable naming: use `agentActorToken` or `agentToken` consistently
   - Comments: "Agent (Actor) validation" instead of ambiguous terms
   - Test names: "agent-as-actor-token-exchange" format

5. **Compliance & Cross-reference**
   - RFC 8693 Section 4.2: act claim (actor's identity)
   - RFC 8693 Section 4.3: may_act claim (permissions to act on behalf)
   - Reference these sections in docs when explaining agent/actor pattern
   - MCP spec: clarify "client credentials" vs "agent actor delegation"

**Success Criteria:**
- Consistent terminology used across codebase (actor vs agent vs agent-actor)
- Education panel explaining Actor Token = Agent Token relationship
- All documentation updated with clear terminology definitions
- Token inspector shows actor/agent labels on relevant claims
- No ambiguous use of "actor" or "agent" in new code
- Terminology guide (ACTOR_TOKEN_TERMINOLOGY.md) comprehensive and linked from README

Plans:
- [ ] 95-01-PLAN.md — Terminology audit: scan docs and code, create ACTOR_TOKEN_TERMINOLOGY.md
- [ ] 95-02-PLAN.md — Update all documentation: README, API docs, RFC guides, architecture
- [ ] 95-03-PLAN.md — Add education panels and token inspector labels for actor/agent
- [ ] 95-04-PLAN.md — Update code comments and variable naming for consistency; verify RFC 8693 references


### Phase 96: Audience (aud) claim validation and configuration

**Goal:** Implement comprehensive audience (aud) claims validation across all OAuth tokens and APIs. Ensure every token includes a correct aud claim identifying the intended recipient (resource server, API, or service). Configure aud values in PingOne applications, validate on every incoming request, and audit aud mismatches to prevent token confusion and delegation attacks.

**Status:** ✅ COMPLETE (1/1 plans executed)
**Requirements**: AUD-01, AUD-02, AUD-03
**Depends on:** Phase 95 (Actor token = Agent token education)
**Executed:** 2026-04-08 — Plan 01 complete (commits: 2b24f38, c2b696d)

**Key Focus Areas:**

1. **Audience Value Definition**
   - **BFF API**: aud should include "banking-api" or configured API identifier
   - **MCP Server**: aud should include "mcp-server" or "mcp.pingdemo.com"
   - **PingOne Resource Servers**: Each resource has its own aud value (e.g., "https://api.example.com/users")
   - **Agent Actor Tokens**: aud identifies the target API being accessed on user's behalf
   - Use HTTPS URLs for aud values (per OAuth spec best practice)

2. **PingOne Configuration Audit**
   - Review all OAuth applications: what aud values do they request/expect?
   - Review all resource servers: what aud identifiers are configured?
   - Ensure consistency: all BFF tokens have matching aud claims
   - Document aud values per environment (localhost, Vercel, production)
   - Create PingOne configuration template with aud standardization

3. **Token Validation Implementation**
   - BFF middleware: validate aud claim on every incoming token
   - MCP gateway: validate aud claim before processing WebSocket messages
   - Per-route validation: some routes may require specific aud values
   - Scope + Aud combination: both scope AND aud must match request
   - Error handling: reject with 401 if aud doesn't match, log for audit

4. **Audience in Different Token Types**
   - **User tokens** (from login): aud identifies the app requesting access
   - **Agent actor tokens** (from token exchange): aud identifies the target API the agent can access
   - **MCP tokens**: aud identifies the MCP server as intended recipient
   - **API key / PAT tokens**: aud identifies the service they're valid for
   - Document aud claim variation per token type

5. **Aud Mismatch Detection & Audit**
   - Log all aud validation failures (token aud ≠ expected aud)
   - Audit table: track aud mismatches with timestamp, token type, expected/actual values
   - Admin dashboard: show aud validation failures and patterns
   - Alert on suspicious patterns (same client sending many wrong aud values)
   - Prevent token replay attacks across APIs (same token used for different aud)

6. **Education & Documentation**
   - Create "Understanding Audience (aud) Claims" education panel
   - Diagram: How aud prevents token misuse (token intended for API A can't be used for API B)
   - Update token inspector: show aud claim prominently
   - Document aud values for each PingOne app in ENVIRONMENT_MAPPING.md
   - Add aud checks to setup verification script

**Success Criteria:**
- Every OAuth token request includes correct aud claim
- BFF validates aud on every incoming request
- MCP gateway validates aud during WebSocket upgrade
- All PingOne apps configured with correct aud values
- Aud validation failures logged and auditable
- No token acceptance without matching aud (fail closed)
- Education panel explains what aud does and why it matters
- Setup script verifies aud configuration in PingOne
- Architecture diagrams show aud claim in token flows

Plans:
- [x] 96-01-PLAN.md — Audit PingOne configuration: identify all aud values, standardize, document
- [ ] 96-02-PLAN.md — Implement aud validation middleware in BFF and MCP gateway
- [ ] 96-03-PLAN.md — Add aud claim audit logging and dashboard
- [ ] 96-04-PLAN.md — Add education panel and update token inspector with aud labels

### Phase 97: Demo config with introspection and JWT validation options; verify APIs working to PingOne endpoint

**Goal:** Enable demo operators to choose between introspection-based and JWT-based token validation. Provide health check to verify PingOne introspection endpoint connectivity. Document validation tradeoffs and guide proper mode selection. Showcase Phase 91 Wave 1 token introspection in action within the demo.
**Requirements**: CONFIG-01
**Depends on:** Phase 96
**Plans:** 1/1 plans complete

Plans:
- [x] 97-01-PLAN.md — Configuration and validation mode toggle, health check endpoint, UI component, documentation

### Phase 98: update diagrams and docs to reflect new token validation options including introspection vs local jwt selection

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 97
**Plans:** 2/2 plans complete

Plans:
- [x] TBD (run /gsd-plan-phase 98 to break down) (completed 2026-04-08)

### Phase 99: test local server and make sure it all works

**Goal:** Verify that the local server starts cleanly, all OAuth flows work end-to-end, and features from phases 95-98 (actor token terminology, aud validation, introspection/JWT config toggle) function correctly without regressions.
**Requirements**: TBD
**Depends on:** Phase 98
**Plans:** 2 plans

Plans:
- [ ] 99-01-PLAN.md — Automated checks: UI build, server unit tests, UI unit tests
- [ ] 99-02-PLAN.md — Human verification: server startup, OAuth flows, Phase 95-98 features

### Phase 100: configurable step-up MFA threshold and agent transaction stop limit

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 99
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 100 to break down)

### Phase 101: token exchange flow diagram UI - single and double exchange with AI agent bubble on responses

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 100
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 101 to break down)

### Phase 102: redesign app UI to match Ping Operations Fabric style - split-pane layout with architecture diagram panel and chat agent panel, PingIdentity branding, red accents, solution architecture section with token flow steps

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 101
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 102 to break down)


### Phase 103: Redesign /marketing landing page — professional layout, clear CTA, and agent integration

**Goal:** Transform the public `/marketing` page into a professional, credible landing experience that clearly communicates the demo's value proposition (RFC 8693 flows, MCP spec, AI-banking integration) and guides visitors to appropriate entry points (admin or customer login).

**Requirements:** MKT-01, MKT-02, MKT-03, MKT-04, MKT-05, MKT-06, MKT-07

**Depends on:** Phase 102 (branding colors, design patterns established)

**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 103 to break down)

### Phase 104: Apply light grey backgrounds consistently across all pages

**Goal:** Audit all authenticated, public, and internal pages; apply light grey background (#F5F5F5) consistently for unified visual experience. Establish background color conventions and ensure no visual regressions or accessibility issues.

**Requirements:** BG-01, BG-02, BG-03, BG-04, BG-05, BG-06, BG-07

**Depends on:** Phase 103 (establishes new page templates and branding patterns)

**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 104 to break down)

### Phase 105: make dashboards match the color scheme and general look of chase.com main page

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 104
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 105 to break down)

### Phase 106: RFC 8693 §4.4 delegation claims - nested act for delegation chains - ensure compliance and implementation

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 105
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 106 to break down)

### Phase 107: Make hostname and redirect URI configurable via admin config page

**Goal:** Enable runtime hostname configuration via admin config page, eliminating manual `.env` edits for deployments across localhost, staging, and production domains. All API calls and OAuth redirect URIs automatically use the configured hostname.
**Requirements**: TBD
**Depends on:** Phase 106
**Plans:** 3 plans

Plans:
- [ ] 107-01-PLAN.md — Backend hostname config API (GET/PUT endpoints + persistence)
- [ ] 107-02-PLAN.md — Frontend hostname config UI (AdminConfig component + integration)
- [ ] 107-03-PLAN.md — OAuth redirect URI integration (update OAuth services + verification)

---
