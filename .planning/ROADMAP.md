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
| 83 | ai-tokens-education | 1/1 | Complete    | 2026-04-17 |
| 55 | docker-kubernetes-deployment | Containerize all components for Kubernetes deployment | DOCKER-01, DOCKER-02 | 1 plan |
| 85 | chase-dashboard-styling | Dashboard styling to match Chase.com design language | Complete | 3/3 plans |
| 86 | test-everything-you-can-for-production-run | Comprehensive testing and verification for production launch | TBD | 0 plans |
| 87 | comprehensive-token-validation-at-every-step | Verify tokens at every step: Agent (MCP client) → App Host (BFF) → MCP Server (Gateway); document authz server vs local JWT validation | TOKEN-VAL-01, TOKEN-VAL-02, TOKEN-VAL-03 | 0 plans |
| 94 | explicit-hitl-for-agent-consent | Explicit HITL for user approval before agent performs actions on user behalf | HITL-01, HITL-02 | 0 plans |
| 95 | actor-token-agent-token-education | Document and teach that Actor token = Agent token; establish consistent terminology across docs and education UI | ACTOR-01 | ✅ Complete (1/1) |
| 96 | audience-aud-claim-validation | Validate audience (aud) claim in all tokens; ensure aud matches expected resource/API; configure and audit aud values in PingOne apps | AUD-01 | ✅ Complete (1/1) |
| 99 | langgraph-upgrade | Migrate banking agent from LangChain createAgent to LangGraph StateGraph for better state management | None | ✅ Complete (1/1) |
| 100 | configurable-step-up-mfa-threshold | 2/2 | Complete   | 2026-04-18 |
| 101 | token-exchange-flow-diagram-ui | Single and double exchange with AI agent bubble on responses | TBD | 3/2 plans |
| 102 | agent-token-exchange-flow | Implement complete token exchange flow for agent: two-exchange (user+agent→MCP) and single-exchange (user→agent→MCP) paths | None | 0 plans |
| 103 | pingone-test-page | Comprehensive PingOne test page with Chase.com-style UI and fix buttons | TBD | 0 plans |
| 104 | pingone-test-security-audit | Security audit and hardening of PingOne test page to ensure worker tokens stay on backend | SEC-01, SEC-02, SEC-03, SEC-04, SEC-05 | 1 plan |
| 121 | api-display-modal-enhancement | Integrate API display service into dashboards and marketing page as draggable, resizable modal | TBD | 0 plans |
| 122 | conditional-step-up-auth | Conditional step-up authentication: logged-in users only need MFA for banking transactions, non-logged-in users need login + MFA | TBD | 0 plans |
| 163 | universal-sidebar-navigation | 2/2 | Complete    | 2026-04-16 |
| 166 | replace-gemini-with-anthropic | 1/1 | Complete    | 2026-04-16 |
| 169 | multi-idp-oauth-abstraction | OAuth endpoints, callbacks, role claims configurable for any IDP | FEDERATE-01..06 | 4 plans |

| 195 | security-hardening-act-delegation | RFC 8693 act claim validation, status codes, fallback removal | SEC-01..05 | 1 plan |
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

**Goal:** Transform the dashboard into a modern, professional interface that immediately communicates value and guides users to key features within 30 seconds of landing; establish design system foundation for dashboard and future UI components.
**Requirements**: CONFIG-01
**Depends on:** Phase 12
**Plans:** 3/3 plans complete

Plans:
- [x] 13-01-PLAN.md — Design system tokens + Hero section redesign (Wave 1)
- [x] 13-02-PLAN.md — Account cards + Action Hub (Wave 1, parallel to 13-01)
- [x] 13-03-PLAN.md — Loading states + Mobile responsiveness + Micro-interactions (Wave 2)

**Execution Structure:**
- **Wave 1 (Parallel):** Plans 01 & 02 execute simultaneously — 01 provides design tokens used by both, 02 is independent; enables rapid parallelization
- **Wave 2 (Sequential):** Plan 03 depends on Wave 1 outputs; adds performance polish, mobile optimization, accessibility compliance

**Success Criteria:**
- Hero section occupies 40% of above-fold with clear value prop and CTAs
- Account cards show balances prominently (20% of above-fold)
- Action Hub displays primary CTAs (25% of above-fold)
- <2s first meaningful paint, <100ms interaction response
- WCAG 2.1 AA accessibility; keyboard navigation; mobile-responsive
- Design tokens established for all components; skeleton loaders during data fetch

### Phase 14:
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

**Goal:** Add SectionApiCalls toggle to all 6 MFA sections; instrument mfaTest.js routes with apiCallTrackerService so the toggle shows real API data
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

**Goal:** Add SectionApiCalls toggle to all 6 MFA sections; instrument mfaTest.js routes with apiCallTrackerService so the toggle shows real API data
**Requirements**: CONFIG-01
**Depends on:** Phase 23
**Plans:** 0/2 plans executed

Plans:
- [ ] TBD (run /gsd-plan-phase 24 to break down)

### Phase 25: LLM landscape — commercial and open-source models, capabilities overview, and comparison

**Goal:** Add SectionApiCalls toggle to all 6 MFA sections; instrument mfaTest.js routes with apiCallTrackerService so the toggle shows real API data
**Requirements**: CONFIG-01
**Depends on:** Phase 24
**Plans:** 0/2 plans executed

Plans:
- [ ] TBD (run /gsd-plan-phase 25 to break down)

### Phase 26: AI platform landscape — AWS Bedrock, Microsoft Azure AI, Google Vertex AI, IBM watsonx, Anthropic, OpenAI tools overview and vendor comparison

**Goal:** Add SectionApiCalls toggle to all 6 MFA sections; instrument mfaTest.js routes with apiCallTrackerService so the toggle shows real API data
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

**Goal:** Add SectionApiCalls toggle to all 6 MFA sections; instrument mfaTest.js routes with apiCallTrackerService so the toggle shows real API data
**Requirements**: CONFIG-01
**Depends on:** Phase 30
**Plans:** 1 plan

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

**Goal:** Add SectionApiCalls toggle to all 6 MFA sections; instrument mfaTest.js routes with apiCallTrackerService so the toggle shows real API data
**Requirements**: CONFIG-01
**Depends on:** Phase 38
**Plans:** 1 plan

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

**Goal:** Add SectionApiCalls toggle to all 6 MFA sections; instrument mfaTest.js routes with apiCallTrackerService so the toggle shows real API data
**Requirements**: CONFIG-01
**Depends on:** Phase 41
**Plans:** 1 plan

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

**Goal:** Add SectionApiCalls toggle to all 6 MFA sections; instrument mfaTest.js routes with apiCallTrackerService so the toggle shows real API data
**Requirements**: CONFIG-01
**Depends on:** Phase 43
**Plans:** 1 plan

Plans:
- [ ] TBD (run /gsd-plan-phase 44 to break down)

### Phase 45: need to support RFC 9728 (OAuth 2.0 Protected Resource Metadata)

**Goal:** Add SectionApiCalls toggle to all 6 MFA sections; instrument mfaTest.js routes with apiCallTrackerService so the toggle shows real API data
**Requirements**: CONFIG-01
**Depends on:** Phase 44
**Plans:** 1 plan

Plans:
- [ ] TBD (run /gsd-plan-phase 45 to break down)

### Phase 46: Standardize PingOne app, resource, and scope naming across all use cases

**Goal:** Add SectionApiCalls toggle to all 6 MFA sections; instrument mfaTest.js routes with apiCallTrackerService so the toggle shows real API data
**Requirements**: CONFIG-01
**Depends on:** Phase 45
**Plans:** 1 plan

Plans:
- [ ] TBD (run /gsd-plan-phase 46 to break down)

### Phase 47: Super Banking rename verification — confirm no regressions across UI, API, MCP, and docs

**Goal:** Add SectionApiCalls toggle to all 6 MFA sections; instrument mfaTest.js routes with apiCallTrackerService so the toggle shows real API data
**Requirements**: CONFIG-01
**Depends on:** Phase 46
**Plans:** 1 plan

Plans:
- [ ] TBD (run /gsd-plan-phase 47 to break down)

### Phase 48: Remove invalid SpEL act expression from Super Banking Banking API and enforce act chain at BFF PAZ layer instead update docs

**Goal:** Add SectionApiCalls toggle to all 6 MFA sections; instrument mfaTest.js routes with apiCallTrackerService so the toggle shows real API data
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



### Phase 111: scope-audit-compliance-app-ids

**Goal:** Wire missing PingOne OAuth app client IDs (Worker Token and MCP Token Exchanger) into code configuration to close the configuration drift identified in SCOPE_AUDIT_REPORT.md — both apps exist in PingOne console but are not referenced in the codebase.

**Requirements:** SCOPE-COMPLIANCE-01

**Plans:** 1/1 plans complete

Plans:
- [x] 111-01-PLAN.md — Add Worker and MCP Exchanger client IDs to pingoneBackendDefaults.js and configStore.js

**Success criteria:**
1. Worker Token app client ID (95dc946f-5e0a-4a8b-a8ba-b587b244e005) added to code configuration
2. MCP Token Exchanger client ID (6380065f-f328-41c2-81ed-1daeec811285) added to code configuration
3. Both client IDs available via configStore with proper environment variable fallback
4. Token exchange flow uses correct MCP Exchanger client ID
5. Management API operations use correct Worker Token client ID
6. Build passes with zero warnings
7. All existing tests pass
8. Configuration drift closed per SCOPE_AUDIT_REPORT.md

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

- [ ] TBD (run /gsd-plan-phase 115 to break down)

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

**Goal:** Add SectionApiCalls toggle to all 6 MFA sections; instrument mfaTest.js routes with apiCallTrackerService so the toggle shows real API data
**Requirements**: CONFIG-01
**Depends on:** Phase 67
**Plans:** 1 plan

Plans:
- [ ] TBD (run /gsd-plan-phase 68 to break down)

### Phase 69: Standardize PingOne app, resource, and scope naming across all use cases

**Goal:** Add SectionApiCalls toggle to all 6 MFA sections; instrument mfaTest.js routes with apiCallTrackerService so the toggle shows real API data
**Requirements**: CONFIG-01
**Depends on:** Phase 68
**Plans:** 1 plan

Plans:
- [ ] TBD (run /gsd-plan-phase 69 to break down)

### Phase 70: Super Banking rename verification — confirm no regressions across UI, API, MCP, and docs

**Goal:** Add SectionApiCalls toggle to all 6 MFA sections; instrument mfaTest.js routes with apiCallTrackerService so the toggle shows real API data
**Requirements**: CONFIG-01
**Depends on:** Phase 69
**Plans:** 1 plan

Plans:
- [ ] TBD (run /gsd-plan-phase 70 to break down)

### Phase 71: 59.1 RFC 9728 compliance audit - Protected Resource Metadata implementation

**Goal:** Add SectionApiCalls toggle to all 6 MFA sections; instrument mfaTest.js routes with apiCallTrackerService so the toggle shows real API data
**Requirements**: CONFIG-01
**Depends on:** Phase 70
**Plans:** 1 plan

Plans:
- [ ] TBD (run /gsd-plan-phase 71 to break down)

### Phase 72: 60.1 Agent showcase and integration storytelling - banking platform AI narrative

**Goal:** Add SectionApiCalls toggle to all 6 MFA sections; instrument mfaTest.js routes with apiCallTrackerService so the toggle shows real API data
**Requirements**: CONFIG-01
**Depends on:** Phase 71
**Plans:** 1 plan

Plans:
- [ ] TBD (run /gsd-plan-phase 72 to break down)

### Phase 73: 61.1 MCP spec error code compliance audit - 403/401 per MCP spec

**Goal:** Add SectionApiCalls toggle to all 6 MFA sections; instrument mfaTest.js routes with apiCallTrackerService so the toggle shows real API data
**Requirements**: CONFIG-01
**Depends on:** Phase 72
**Plans:** 1 plan

Plans:
- [ ] TBD (run /gsd-plan-phase 73 to break down)

### Phase 74: 62.1 Token exchange critical fixes and enhancements - may_act, RFC 8707, scopes

**Goal:** Add SectionApiCalls toggle to all 6 MFA sections; instrument mfaTest.js routes with apiCallTrackerService so the toggle shows real API data
**Requirements**: CONFIG-01
**Depends on:** Phase 73
**Plans:** 1 plan

Plans:
- [ ] TBD (run /gsd-plan-phase 74 to break down)

### Phase 75: 63.1 Documentation and integration critical fixes - ops guides, API docs

**Goal:** Add SectionApiCalls toggle to all 6 MFA sections; instrument mfaTest.js routes with apiCallTrackerService so the toggle shows real API data
**Requirements**: CONFIG-01
**Depends on:** Phase 74
**Plans:** 1 plan

Plans:
- [ ] TBD (run /gsd-plan-phase 75 to break down)

### Phase 76: 64.1 Unified configuration page - consolidate /config and /demo-data

**Goal:** Add SectionApiCalls toggle to all 6 MFA sections; instrument mfaTest.js routes with apiCallTrackerService so the toggle shows real API data
**Requirements**: CONFIG-01
**Depends on:** Phase 75
**Plans:** 1 plan

Plans:
- [ ] TBD (run /gsd-plan-phase 76 to break down)

### Phase 77: 65.1 API configuration and management enhancements - auth methods, Vercel vars

**Goal:** Add SectionApiCalls toggle to all 6 MFA sections; instrument mfaTest.js routes with apiCallTrackerService so the toggle shows real API data
**Requirements**: CONFIG-01
**Depends on:** Phase 76
**Plans:** 1 plan

Plans:
- [ ] TBD (run /gsd-plan-phase 77 to break down)

### Phase 78: 66.1 UI enhancements and user experience improvements

**Goal:** Add SectionApiCalls toggle to all 6 MFA sections; instrument mfaTest.js routes with apiCallTrackerService so the toggle shows real API data
**Requirements**: CONFIG-01
**Depends on:** Phase 77
**Plans:** 1 plan

Plans:
- [ ] TBD (run /gsd-plan-phase 78 to break down)

### Phase 79: 67.1 Documentation enhancement and developer tools

**Goal:** Add SectionApiCalls toggle to all 6 MFA sections; instrument mfaTest.js routes with apiCallTrackerService so the toggle shows real API data
**Requirements**: CONFIG-01
**Depends on:** Phase 78
**Plans:** 1 plan

Plans:
- [ ] TBD (run /gsd-plan-phase 79 to break down)

### Phase 80: 68.1 RFC 9728 Support - Protected Resource Metadata implementation

**Goal:** Add SectionApiCalls toggle to all 6 MFA sections; instrument mfaTest.js routes with apiCallTrackerService so the toggle shows real API data
**Requirements**: CONFIG-01
**Depends on:** Phase 79
**Plans:** 1 plan

Plans:
- [ ] TBD (run /gsd-plan-phase 80 to break down)

### Phase 81: 69.1 Standardize PingOne app, resource, and scope naming across all use cases

**Goal:** Add SectionApiCalls toggle to all 6 MFA sections; instrument mfaTest.js routes with apiCallTrackerService so the toggle shows real API data
**Requirements**: CONFIG-01
**Depends on:** Phase 80
**Plans:** 1 plan

Plans:
- [ ] TBD (run /gsd-plan-phase 81 to break down)

### Phase 82: 70.1 Super Banking rename verification - confirm no regressions across all layers

**Goal:** Add SectionApiCalls toggle to all 6 MFA sections; instrument mfaTest.js routes with apiCallTrackerService so the toggle shows real API data
**Requirements**: CONFIG-01
**Depends on:** Phase 81
**Plans:** 1 plan

Plans:
- [ ] TBD (run /gsd-plan-phase 82 to break down)

### Phase 83: AI Tokens Education

**Goal:** Create a comprehensive education page explaining actor tokens, subject tokens, and other AI-related tokens used in the banking demo.

**Requirements:** Complete
**Depends on:** Phase 58, Phase 4
**Plans:** 1/1 plans complete

**Success criteria:**
1. Users can clearly distinguish between actor tokens and subject tokens
2. Token exchange flows are visually explained with interactive diagrams
3. Education panel is accessible from multiple contexts in the app
4. Content aligns with RFC 8693 token exchange specifications
5. Token terminology is consistent across all educational materials

Plans:
- [x] 83-01-PLAN.md - Design and implement AI tokens education panel with interactive diagrams and terminology glossary

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

**Goal:** Add SectionApiCalls toggle to all 6 MFA sections; instrument mfaTest.js routes with apiCallTrackerService so the toggle shows real API data
**Requirements**: CONFIG-01
**Depends on:** Phase 85
**Plans:** 1 plan

Plans:
- [ ] TBD (run /gsd-plan-phase 86 to break down)

### Phase 87: Comprehensive token validation at every step

**Goal:** Implement and document comprehensive token validation across all three components of the system: Agent (MCP client), App Host (BFF/Express server), and MCP Server (Gateway). For each component, determine whether to validate tokens with PingOne's authorization server or locally if JWT, document the decision pattern, and ensure consistent implementation.

**Requirements**: TOKEN-VAL-01, TOKEN-VAL-02, TOKEN-VAL-03
**Depends on:** Phase 91 (token introspection endpoint completed)
**Plans:** 1 plan (run /gsd-plan-phase 87 to break down)

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

**Goal:** Add SectionApiCalls toggle to all 6 MFA sections; instrument mfaTest.js routes with apiCallTrackerService so the toggle shows real API data
**Requirements**: CONFIG-01
**Depends on:** Phase 89
**Plans:** 1 plan

Plans:
- [ ] TBD (run /gsd-plan-phase 90 to break down)

### Phase 91: External MCP client access — public MCP server with PingOne-protected auth, restrict to @pingidentity.com Google login, per-client authorization, and Claude/ChatGPT integration planning

**Goal:** Add SectionApiCalls toggle to all 6 MFA sections; instrument mfaTest.js routes with apiCallTrackerService so the toggle shows real API data
**Requirements**: CONFIG-01
**Depends on:** Phase 90
**Plans:** 1 plan

Plans:
- [ ] TBD (run /gsd-plan-phase 91 to break down)

### Phase 92: User custom attribute validation — verify user has required PingOne custom attributes configured correctly, report and fix capability, integrate into existing scope/resource check tooling

**Goal:** Add SectionApiCalls toggle to all 6 MFA sections; instrument mfaTest.js routes with apiCallTrackerService so the toggle shows real API data
**Requirements**: CONFIG-01
**Depends on:** Phase 91
**Plans:** 1 plan

Plans:
- [ ] TBD (run /gsd-plan-phase 92 to break down)

### Phase 93: Surface agent-on-behalf-of-user actions in UI and education

**Goal:** Add SectionApiCalls toggle to all 6 MFA sections; instrument mfaTest.js routes with apiCallTrackerService so the toggle shows real API data
**Requirements**: CONFIG-01
**Depends on:** Phase 92
**Plans:** 1 plan

Plans:
- [ ] TBD (run /gsd-plan-phase 93 to break down)

### Phase 94: Explicit HITL for agent consent

**Goal:** Implement explicit human-in-the-loop (HITL) approval mechanism requiring user consent before the agent performs any action on the user's behalf. Clear presentation of what the agent is about to do, detailed explanation of scope/permissions, and explicit user approval (not silent background action).

**Requirements**: HITL-01, HITL-02
**Depends on:** Phase 93 (Surface agent-on-behalf-of-user actions)
**Plans:** 1 plan (run /gsd-plan-phase 94 to break down)

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

### Phase 99: langgraph-upgrade

**Goal:** Migrate banking agent from LangChain createAgent to LangGraph StateGraph for better state management and more sophisticated agent workflows

**Requirements:** None

**Status:** ✅ Complete (1/1 plans executed)

**Plans:** 1/1 plans complete

Plans:
- [x] 99-01-PLAN.md — Install @langchain/langgraph and migrate agentBuilder.js to StateGraph pattern

**Success criteria:**
1. @langchain/langgraph package installed
2. agentBuilder.js uses LangGraph StateGraph pattern
3. bankingAgentLangChainService.js invokes LangGraph graph
4. API server starts successfully with LangGraph
5. Banking agent responds to messages correctly
6. No breaking changes to the API endpoint

**Key Changes:**
- Installed @langchain/langgraph version 1.2.8
- Migrated agentBuilder.js from LangChain createAgent to LangGraph StateGraph
- Defined state schema with messages, userId, userToken, sessionId, tokenEvents, provider
- Created single agent node with start/end edges
- Updated bankingAgentLangChainService.js to invoke LangGraph graph
- Maintained backward compatible API endpoint

**Future Work:**
- Add tool calling nodes for MCP tool integration
- Implement multi-agent patterns for complex operations
- Add conditional edges for HITL consent flows

---

### Phase 98: update diagrams and docs to reflect new token validation options including introspection vs local jwt selection

**Goal:** Add SectionApiCalls toggle to all 6 MFA sections; instrument mfaTest.js routes with apiCallTrackerService so the toggle shows real API data
**Requirements**: ACTLOG-01, ACTLOG-02, ACTLOG-03, ACTLOG-04, ACTLOG-05, ACTLOG-06, ACTLOG-07
**Depends on:** Phase 97
**Plans:** 2/2 plans complete

Plans:
- [x] TBD (run /gsd-plan-phase 98 to break down) (completed 2026-04-08)

### Phase 99: test local server and make sure it all works

**Goal:** Verify that the local server starts cleanly, all OAuth flows work end-to-end, and features from phases 95-98 (actor token terminology, aud validation, introspection/JWT config toggle) function correctly without regressions.
**Requirements**: ACTLOG-01, ACTLOG-02, ACTLOG-03, ACTLOG-04, ACTLOG-05, ACTLOG-06, ACTLOG-07
**Depends on:** Phase 98
**Plans:** 2 plans

Plans:
- [ ] 99-01-PLAN.md — Automated checks: UI build, server unit tests, UI unit tests
- [ ] 99-02-PLAN.md — Human verification: server startup, OAuth flows, Phase 95-98 features

### Phase 100: configurable step-up MFA threshold and agent transaction stop limit

**Goal:** Add SectionApiCalls toggle to all 6 MFA sections; instrument mfaTest.js routes with apiCallTrackerService so the toggle shows real API data
**Requirements**: ACTLOG-01, ACTLOG-02, ACTLOG-03, ACTLOG-04, ACTLOG-05, ACTLOG-06, ACTLOG-07
**Depends on:** Phase 99
**Plans:** 2/2 plans complete

Plans:
- [x] TBD (run /gsd-plan-phase 100 to break down) (completed 2026-04-18)

### Phase 102: Agent Token Exchange Flow

**Goal:** Implement complete token exchange flow for agent to obtain proper tokens for calling MCP server. Support two paths: two-exchange (user + agent → MCP with act claim) and single-exchange (user → agent → MCP).

**Requirements:** None

**Depends on:** Phase 99, Phase 6

**Plans:** 1 plan

Plans:
- [ ] 102-01-PLAN.md — Agent token acquisition + two-exchange flow + single-exchange flow + MCP validation

**Success criteria:**
- Agent can obtain its own token via client credentials when needed
- Two-exchange flow works: user token + agent token → MCP token with `act` claim
- Single-exchange flow works: user token → agent token → MCP server
- MCP server correctly validates tokens from both paths
- Token chain display shows the correct exchange path used
- Agent tool calls work without authentication errors in both modes
- Session persists agent tokens correctly using SQLite (local) or Redis (Vercel)

### Phase 101: token exchange flow diagram UI - single and double exchange with AI agent bubble on responses

**Goal:** Add SectionApiCalls toggle to all 6 MFA sections; instrument mfaTest.js routes with apiCallTrackerService so the toggle shows real API data
**Requirements**: ACTLOG-01, ACTLOG-02, ACTLOG-03, ACTLOG-04, ACTLOG-05, ACTLOG-06, ACTLOG-07
**Depends on:** Phase 100
**Plans:** 3/2 plans complete

Plans:
- [x] TBD (run /gsd-plan-phase 101 to break down) (completed 2026-04-09)

### Phase 102: redesign app UI to match Ping Operations Fabric style - split-pane layout with architecture diagram panel and chat agent panel, PingIdentity branding, red accents, solution architecture section with token flow steps

**Goal:** Add SectionApiCalls toggle to all 6 MFA sections; instrument mfaTest.js routes with apiCallTrackerService so the toggle shows real API data
**Requirements**: ACTLOG-01, ACTLOG-02, ACTLOG-03, ACTLOG-04, ACTLOG-05, ACTLOG-06, ACTLOG-07
**Depends on:** Phase 101
**Plans:** 1 plan

Plans:
- [ ] TBD (run /gsd-plan-phase 102 to break down)


### Phase 103: PingOne Test Page

**Goal:** Build a comprehensive test page that tests all aspects of PingOne integration including APIs, Token exchange, configuration (Apps, Scopes, Resources, User attributes), and specifications. The page will have a Chase.com-style UI with fix buttons for each test. Worker token will be retrieved on startup if credentials are saved in .env.

**Requirements:** PINGONE-TEST-01, PINGONE-TEST-02, PINGONE-TEST-03, PINGONE-TEST-04, PINGONE-TEST-05, PINGONE-TEST-06, PINGONE-TEST-07

**Depends on:** Phase 2 (token-exchange), Phase 85 (chase-dashboard-styling)

**Plans:** 1 plan

Plans:
- [ ] TBD (run /gsd-plan-phase 103 to break down)

**Success criteria:**
1. Test page loads and automatically retrieves worker token on startup if creds are saved
2. All PingOne API tests run successfully with clear pass/fail indicators
3. Token exchange tests (1-exchange and 2-exchange) validate end-to-end flows
4. Fix buttons successfully resolve common configuration issues
5. UI matches Chase.com design language and is responsive
6. All tests can be run independently or in batch mode
7. Test results are persisted and can be exported

### Phase 104: PingOne Test Page Security Audit

**Goal:** Comprehensive security audit and hardening of PingOne test page to ensure worker tokens stay on backend and never leak to frontend.

**Requirements:** SEC-01, SEC-02, SEC-03, SEC-04, SEC-05

**Plans:** 1 plan
**Depends on:** Phase 103 (establishes new page templates and branding patterns)

Plans:
- [x] 104-01-PLAN.md — Security audit: Remove worker token from frontend response, keep tokens backend-only

**Success criteria:**
1. Worker token is never visible in browser dev tools (Network tab, Console, Application storage)
2. Frontend only sees token status (valid/expired) and expiry time, never the actual token
3. `/verify-assets` returns asset data without exposing the worker token
4. All error messages are sanitized (no token leakage)
5. Security model documented: tokens stay on backend, frontend sees metadata only

### Phase 105: make dashboards match the color scheme and general look of chase.com main page

**Goal:** Add SectionApiCalls toggle to all 6 MFA sections; instrument mfaTest.js routes with apiCallTrackerService so the toggle shows real API data
**Requirements**: ACTLOG-01, ACTLOG-02, ACTLOG-03, ACTLOG-04, ACTLOG-05, ACTLOG-06, ACTLOG-07
**Depends on:** Phase 104
**Plans:** 1 plan

Plans:
- [ ] TBD (run /gsd-plan-phase 105 to break down)

### Phase 106: RFC 8693 §4.4 delegation claims - nested act for delegation chains - ensure compliance and implementation

**Goal:** Implement and verify RFC 8693 nested `act` delegation-chain compliance in backend handling, diagnostics, and documentation, without adding new end-user UI.
**Requirements**: ACTLOG-01, ACTLOG-02, ACTLOG-03, ACTLOG-04, ACTLOG-05, ACTLOG-06, ACTLOG-07
**Depends on:** Phase 105
**Plans:** 1/1 plans complete

Plans:
- [x] 106-01-PLAN.md — Audit and align nested `act` delegation-chain handling across backend diagnostics, docs, and verification

### Phase 107: Make hostname and redirect URI configurable via admin config page

**Goal:** Enable runtime hostname configuration via admin config page, eliminating manual `.env` edits for deployments across localhost, staging, and production domains. All API calls and OAuth redirect URIs automatically use the configured hostname.
**Requirements**: ACTLOG-01, ACTLOG-02, ACTLOG-03, ACTLOG-04, ACTLOG-05, ACTLOG-06, ACTLOG-07
**Depends on:** Phase 106
**Plans:** 3/3 plans complete

Plans:
- [x] 107-01-PLAN.md — Backend hostname config API (GET/PUT endpoints + persistence)
- [x] 107-02-PLAN.md — Frontend hostname config UI (AdminConfig component + integration)
- [x] 107-03-PLAN.md — OAuth redirect URI integration (update OAuth services + verification)

### Phase 108: Add server restart notification modal with UX polish

**Goal:** When the server returns 504 errors or restarts, show users a clear "Server is restarting" modal instead of silent failures. Include auto-retry with exponential backoff and UX polish (animations, professional styling).

**Requirements**: SERVER-RESTART-01, SERVER-RESTART-02, SERVER-RESTART-03

**Depends on:** Phase 107

**Plans:** 3/3 plans complete

Plans:
- [x] 108-01-PLAN.md — Core service + modal component (504 detection, auto-retry, animations)
- [x] 108-02-PLAN.md — Integration (App.js mount, API error handling wiring)
- [x] 108-03-PLAN.md — Testing, CSS polish, regression verification

### Phase 109: Demo-data agent placement buttons should only configure state, not move agent

**Goal:** Add SectionApiCalls toggle to all 6 MFA sections; instrument mfaTest.js routes with apiCallTrackerService so the toggle shows real API data
**Requirements**: ACTLOG-01, ACTLOG-02, ACTLOG-03, ACTLOG-04, ACTLOG-05, ACTLOG-06, ACTLOG-07
**Depends on:** Phase 108
**Plans:** 1/1 plans complete

Plans:
- [x] TBD (run /gsd-plan-phase 109 to break down) (completed 2026-04-09)

### Phase 110: Fix demo-data page layout: add may_act demo button, fix Config button overflow, improve discoverability

**Goal:** Add SectionApiCalls toggle to all 6 MFA sections; instrument mfaTest.js routes with apiCallTrackerService so the toggle shows real API data
**Requirements**: ACTLOG-01, ACTLOG-02, ACTLOG-03, ACTLOG-04, ACTLOG-05, ACTLOG-06, ACTLOG-07
**Depends on:** Phase 109
**Plans:** 2/2 plans complete

Plans:
- [x] TBD (run /gsd-plan-phase 110 to break down) (completed 2026-04-09)

### Phase 112: marketing and dashboard ui polish - ensure consistent light and dark mode

**Goal:** Add SectionApiCalls toggle to all 6 MFA sections; instrument mfaTest.js routes with apiCallTrackerService so the toggle shows real API data
**Requirements**: ACTLOG-01, ACTLOG-02, ACTLOG-03, ACTLOG-04, ACTLOG-05, ACTLOG-06, ACTLOG-07
**Depends on:** Phase 111
**Plans:** 4/4 plans complete

Plans:
- [x] TBD (run /gsd-plan-phase 112 to break down) (completed 2026-04-09)

### Phase 113: Redesign UI to match Chase.com look and feel (preserve all functionality) for all pages

**Goal:** Apply Chase.com visual design (navy + blues, system fonts, horizontal top nav) to LandingPage, UserDashboard, Dashboard, and high-traffic admin pages while preserving all OAuth/MCP/education functionality.
**Requirements**: ACTLOG-01, ACTLOG-02, ACTLOG-03, ACTLOG-04, ACTLOG-05, ACTLOG-06, ACTLOG-07
**Depends on:** Phase 112
**Plans:** 4/4 plans complete ✅

Plans:
- [x] Plan 01: Create ChaseTopNav component; integrate into LandingPage, UserDashboard, Dashboard (COMPLETE — commit 9a90b90, 2026-04-09)
- [x] Plan 02: LandingPage hero Chase styling + SideNav Chase refinement (COMPLETE — commit f862f17, 2026-04-09)
- [x] Plan 03: Create chase-theme.css (system fonts, shared overrides); apply to high-traffic admin pages (COMPLETE — commit 82c1c13, 2026-04-09)
- [x] Plan 04: Polish & visual testing across all pages (COMPLETE — commit 2f0ea9e, 2026-04-09)

### Phase 114: IETF agentic identity standards compliance and education page - RFC7523bis, Identity Chaining, JAG-IR, AIMS, WIMSE, SD-JWT VC, PQ-T JOSE

**Goal:** Add a new education drawer (IETFStandardsPanel) covering all 7 IETF drafts where Ping Identity is author or co-author. Map each standard to IDC's 5 AI governance guardrails. Show what's already implemented in this demo vs. roadmap. Wire compliance callouts into existing TokenExchange and HumanInLoop panels.
**Requirements**: IETF-EDU-01, IETF-EDU-02, IETF-EDU-03
**Depends on:** Phase 108
**Plans:** 3/3 plans complete

Plans:
- [ ] Plan 01: Create IETFStandardsPanel.js with 8-tab education drawer (7 standards + overview/IDC guardrails tab)
- [ ] Plan 02: Register panel in EducationPanelsHost, add educationIds entry, wire SideNav + education commands
- [ ] Plan 03: Add compliance callouts to TokenExchangePanel and HumanInLoopPanel; link from BestPracticesPanel


### Phase 115: Agent framework integration — recreate BankingAgent using LangChain for improved tool orchestration, multi-turn conversations, and maintainability

**Goal:** Integrate LangChain as the agent framework for BankingAgent, replacing custom agent loop with LangChain agent executor. Preserve all current functionality (MCP tool integration, OAuth + RFC 8693 token exchange, HITL consent gates, token event tracking). Improve maintainability and enable multi-turn agentic patterns.

**Requirements**: ACTLOG-01, ACTLOG-02, ACTLOG-03, ACTLOG-04, ACTLOG-05, ACTLOG-06, ACTLOG-07
**Depends on:** Phase 114
**Plans:** 3 plans (Wave 1: 115-01, 115-02 parallel; Wave 2: 115-03)

Plans:
- [ ] 115-01-PLAN.md — LangChain agent foundation (tool registry, executor, memory) — Wave 1 (parallel)
- [ ] 115-02-PLAN.md — OAuth session + RFC 8693 token exchange integration — Wave 1 (parallel)
- [ ] 115-03-PLAN.md — HITL consent gates + UI wiring (BankingAgent.js, client service) — Wave 2 (depends on Wave 1)

**Success criteria:**
1. LangChain agent executor initialized with Claude 3, MCP tool registry, and ConversationBufferMemory
2. Agent invocations tied to authenticated OAuth sessions; RFC 8693 token exchange works (user acts on behalf of agent)
3. High-value operations (>$500) trigger HITL consent modal; user can approve/reject
4. Token events (exchange, tool calls) tracked and displayed for transparency
5. Agent can hold multi-turn conversation context; user can see chat history
6. All existing MCP tools callable through LangChain agent
7. Build completes without breaking changes
8. No regression in OAuth flow, token validation, or consent mechanisms

### Phase 116: Full LangChain native agent rebuild — replace retrofit with real framework agent across all surfaces

**Goal:** Replace deprecated createStructuredChatAgent + NL-intent dispatch with langchain 1.x createAgent() API across JS BFF and React UI. All user messages route through /api/banking-agent/message. 7-tool registry (banking + education + search). Per-request executor with session history. HITL consent gates wired.
**Requirements**: ACTLOG-01, ACTLOG-02, ACTLOG-03, ACTLOG-04, ACTLOG-05, ACTLOG-06, ACTLOG-07
**Depends on:** Phase 115
**Plans:** 3 plans (Wave 1: 116-01, 116-02 parallel; Wave 2: 116-03)

Plans:
- [ ] 116-01-PLAN.md — Rewrite bankingAgentLangChainService.js + bankingAgentRoutes.js for langchain 1.x — Wave 1 (parallel)
- [ ] 116-02-PLAN.md — Rebuild mcpToolRegistry.js with tool() function + 3 new tools — Wave 1 (parallel)
- [ ] 116-03-PLAN.md — Wire BankingAgent.js to sendAgentMessage, remove parseNaturalLanguage dispatch — Wave 2 (has checkpoint)

### Phase 117: LangChain production-quality agent with pluggable model interface (Groq default, OpenAI/Anthropic/HuggingFace support)

**Goal:** Build a production-quality pluggable model interface for the LangChain agent, with Groq as default and OpenAI, Anthropic, and HuggingFace available through a shared provider abstraction plus real configuration UI.
**Requirements**: ACTLOG-01, ACTLOG-02, ACTLOG-03, ACTLOG-04, ACTLOG-05, ACTLOG-06, ACTLOG-07
**Depends on:** Phase 116
**Plans:** 1/1 plans complete

Plans:
- [x] 117-01-PLAN.md — Implement shared provider abstraction, provider-specific configuration, and configuration UI for Groq/OpenAI/Anthropic/HuggingFace

### Phase 118: Research and plan HuggingFace integration with LangChain for cost-effective model deployment — evaluate ecosystem, licensing, model selection, deployment options

**Goal:** Research and recommend the right HuggingFace integration path for this LangChain system by comparing hosted and self-hosted options across licensing, model fit, LangChain integration, operational burden, cost, and latency.
**Requirements**: ACTLOG-01, ACTLOG-02, ACTLOG-03, ACTLOG-04, ACTLOG-05, ACTLOG-06, ACTLOG-07
**Depends on:** Phase 117
**Plans:** 1/1 plans complete

Plans:
- [x] 118-01-PLAN.md — Research hosted versus self-hosted HuggingFace options and recommend the integration path for the Phase 117 provider architecture

### Phase 119: Call MCP server and get tools without authenticating user

**Goal:** Expose MCP tool discovery to external AI clients (Claude Desktop, Cursor, Windsurf) without requiring authentication. Implement unauthenticated `/.well-known/mcp-server` endpoint (RFC 8414 convention) with whitelist-based tool filtering (safe: explain_topic, brave_search; blocked: banking operations) + rate limiting (100 req/min per IP).

**Requirements:** None (foundational infrastructure for AI client integration)

**Depends on:** Phase 118

**Plans:** 2/2 plans complete ✅

Plans:
- [x] 119-01-PLAN.md — Discovery endpoints (/.well-known/mcp-server + /api/mcp/tools) with whitelist filtering and rate limiting (Wave 1)
- [x] 119-02-PLAN.md — Unit + integration tests for discovery endpoints, whitelist enforcement, rate limiting (Wave 2)

**Success criteria:**
1. GET /.well-known/mcp-server returns 200 with tool list (only explain_topic, brave_search; no banking ops)
2. GET /api/mcp/tools returns identical tool list (dual endpoint parity)
3. Rate limit enforces exactly 100 requests/min per IP (429 on request 101)
4. No authentication required — both endpoints public
5. Response includes server metadata, tool names, descriptions, JSON schemas
6. Tool filtering uses whitelist constant (PUBLIC_TOOLS)
7. All tests passing (11 tests: 5 unit + 6 integration)

### Phase 120: UI/UX: Audit all buttons and navigation; make sidebar and nav more bank-like

**Goal:** Audit all interactive buttons and navigation elements across the app (sidebar, top nav, bottom sections). Verify buttons work and are visible to correct roles. Redesign sidebar and top navigation to look more bank-like: tighter spacing, professional line icons (not emoji), prominent section headers, smooth animations, and softer color palette.
**Requirements**: ACTLOG-01, ACTLOG-02, ACTLOG-03, ACTLOG-04, ACTLOG-05, ACTLOG-06, ACTLOG-07
**Depends on:** Phase 119
**Plans:** 1 plan

Plans:
- [ ] TBD (run /gsd-plan-phase 120 to break down)

### Phase 121: API Display Modal Enhancement

**Goal:** Integrate new API display service into dashboards and marketing page as a draggable, resizable modal for educational purposes. The modal should be able to be dragged off-monitor and resized from all corners.

**Requirements**: ACTLOG-01, ACTLOG-02, ACTLOG-03, ACTLOG-04, ACTLOG-05, ACTLOG-06, ACTLOG-07
**Depends on:** Phase 120
**Plans:** 1 plan

Plans:
- [ ] TBD (run /gsd-plan-phase 121 to break down)

### Phase 122: Conditional Step-Up Authentication for Banking Transactions

**Goal:** Implement conditional authentication flow where logged-in users only require MFA for banking transactions, while non-logged-in users require both login and MFA.

**Requirements**: ACTLOG-01, ACTLOG-02, ACTLOG-03, ACTLOG-04, ACTLOG-05, ACTLOG-06, ACTLOG-07

**Depends on:** Phase 1 (auth-flows), Phase 100 (configurable-step-up-mfa-threshold), Phase 94 (explicit-hitl-for-agent-consent)

**Plans:** 1 plan

Plans:
- [x] 122-01: Implement conditional auth gate (session check → step-up MFA)

**Success criteria:**
1. Logged-in users performing banking transactions are prompted for MFA only (not login)
2. Non-logged-in users performing banking transactions are prompted for login first, then MFA
3. Session state is properly checked before determining auth requirements
4. Step-up MFA threshold is respected for both flows
5. No regression in existing authentication flows
6. UI clearly communicates which auth step is required (login vs MFA)

### Phase 184: End-to-end delegated token flow: agent CC token + user OAuth token sent to MCP Gateway for dual token exchange at PingOne before fulfilling request

**Goal:** Make the Phase 184 delegated path explicit and verifiable across UI, backend routes, and docs so Exchange 2 consistently means user OAuth token + agent CC token exchanged for an MCP Gateway token before request fulfillment.
**Requirements**: P184-01, P184-02, P184-03
**Depends on:** Phase 183
**Plans:** 3/3 plans complete

Plans:
- [x] 184-01-PLAN.md — PingOne Test Page: label Exchange 2 as Phase 184 canonical dual-token gateway flow (completed 2026-04-17)
- [x] 184-02-PLAN.md — PingOne test routes: dual-mode semantics target MCP Gateway audience (legacy alias preserved)
- [x] 184-03-PLAN.md — Docs + runbook alignment for Phase 184 dual-token terminology and flow

**Success criteria:**
1. Exchange 2 labeled as Phase 184 canonical in test UI (13+ references)
2. Backend routes normalize 'double' → 'dual' and route dual-mode to MCP Gateway audience
3. Docs reference Phase 184 as canonical agent token exchange path with reference table
4. Developers reading test UI, backend code, and setup guide all see consistent Phase 184 terminology
5. Legacy patterns (1-exchange, 2-step) clearly marked as fallback/educational only

### Phase 185: Token color legend and consistent token-type color coding across all token displays including token chain, decoded panels, and education components

**Goal:** Consistent token-type color coding (Subject=🔴, Actor=🔵, MCP=🟢) across TokenChainDisplay, TokenDisplay, DecodedTokenPanel, and PingOneTestPage; shared TokenColorLegend component; RFC 8693 badge color alignment.
**Requirements**: TBD
**Depends on:** Phase 184
**Plans:** 1/1 plans complete

Plans:
- [ ] 185-01-PLAN.md — CSS classes, badge color fix, PingOneTestPage legend

### Phase 186: ID token exchange flow — agent sends prompt to MCP server, gets 401, performs OIDC authz with PingOne to get access+id+refresh tokens, then exchanges agent CC token plus user ID token via dual token exchange at MCP Gateway

**Goal:** Dual ID token + agent CC token exchange via RFC 8693 with test page integration and documentation
**Requirements**: TBD
**Depends on:** Phase 185
**Plans:** 3 plans ✅ COMPLETE

Plans:
- [x] 186-01-PLAN.md — Backend 401 handler, OIDC auth, token exchange wiring
- [x] 186-02-PLAN.md — Test page integration with ID token exchange flow  
- [x] 186-03-PLAN.md — Documentation and verification

### Phase 187: 1-token exchange 401 flow — MCP 401 triggers user authz then token exchange for MCP token

**Goal:** Wire real MCP 401 intercept path: when MCP returns 401, BFF signals need_auth, user re-authenticates, 1-token RFC 8693 exchange produces MCP token; remove legacy exchange3 two-step card; add live 401 test card to test page; document in PINGONE_TOKEN_EXCHANGE_COMPARISON.md
**Requirements**: P187-D01, P187-D02, P187-D03, P187-D04, P187-D05, P187-D06, P187-D07
**Depends on:** Phase 186
**Plans:** 4/4 plans complete

Plans:
- [ ] 187-01-PLAN.md — BFF need_auth signal (agentMcpTokenService + bankingAgentRoutes)
- [ ] 187-02-PLAN.md — BFF test route (GET /exchange-1token-401-flow)
- [ ] 187-03-PLAN.md — UI changes (BankingAgent need_auth intercept + exchange401 card replacing exchange3)
- [ ] 187-04-PLAN.md — Docs + build verify + ROADMAP update

### Phase 188: Define AI token exchange taxonomy — user token (subject), agent token (actor), transaction token (MCP access) — validate naming against RFC 8693 and MCP spec

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 187
**Plans:** 2/2 plans complete

Plans:
- [x] TBD (run /gsd-plan-phase 188 to break down) (completed 2026-04-18)

### Phase 189: Marketing page user authentication — login on /marketing goes straight to customer dashboard; resource-server buttons (balance, transactions) call banking API directly; PingOne authz validates user; agent path follows 401→exchange pattern

**Goal:** Enable customers to explore banking resources directly from /marketing page without forcing navigation to /dashboard. Add resource-server action buttons (balance, transactions) that are disabled when logged out and active when logged in. Reuse Phase 187 token exchange flow on 401 responses.
**Requirements**: MARKETING-189-01, MARKETING-189-02
**Depends on:** Phase 188
**Plans:** 1/1 plans complete

Plans:
- [x] 189-01-PLAN.md — Add resource buttons to marketing page with state-driven enable/disable (MARKETING-189-01, MARKETING-189-02)

**Success criteria:**
1. Resource buttons (balance, transactions) appear on /marketing homepage  
2. Buttons are disabled + show "Sign in to view" when user is logged out
3. Buttons are enabled + fire action callbacks when user is logged in
4. Clicking button fetches data from BFF /api/banking/* endpoint (get_account_balance, get_transactions)
5. 401 from BFF triggers need_auth signal → agent intercept → login redirect → return to /marketing
6. After login, user returns to /marketing with buttons active (login returns to /marketing, not /dashboard)
7. npm run build exit 0; no new errors
8. No regression in existing LandingPage or BankingAgent functionality

### Phase 190: Align UI with 2-token exchange taxonomy and education

**Goal:** Align all user-facing token-exchange language, diagrams, and examples with the Phase 188 RFC 8693 taxonomy so the product consistently teaches 1-exchange, 2-exchange, and the Phase 186 ID-token variant without legacy labels.
**Requirements**: TAX-190-01, TAX-190-02, TAX-190-03
**Depends on:** Phase 188
**Plans:** 1/1 plans complete

Plans:
- [x] 190-01-PLAN.md — Audit and align UI terminology, education copy, and token-exchange visuals with Phase 188 taxonomy

### Phase 191: OIDC resource server app — banking summary page with decoded tokens, target for MCP server dual token exchange ✅

**Goal:** Build a standalone OIDC-authenticated resource server app that looks like the Banking summary page and displays decoded access/ID tokens. This app is the target audience for the MCP server's dual token exchange — the agent exchanges tokens to call this resource server on behalf of the user. Shows the full OIDC flow: user authenticates, app displays decoded tokens (claims, scopes, aud, act), and serves as the real resource server endpoint for RFC 8693 token exchange.
**Requirements**: TBD
**Depends on:** Phase 190
**Plans:** 1 plan

Plans:
- [x] 191-01-PLAN.md — Backend route + ResourceServerPage (OIDC, banking summary, decoded tokens, routing)

### Phase 192: Client credentials resource server app — banking summary page with client_id/client_secret auth, clearly labeled as service-to-service pattern

**Goal:** Build a second version of the banking summary resource server app that authenticates using client_id/client_secret (Client Credentials grant). Clearly labeled throughout as "Client ID / Client Secret" service-to-service pattern — no user authentication, no OIDC. Contrasts with Phase 191's OIDC user-delegated flow to show the difference between user-context and machine-context access to the same banking API.
**Requirements**: TBD
**Depends on:** Phase 191
**Plans:** 0/1 plans executed

Plans:
- [ ] 192-01-PLAN.md — Backend route + ClientCredentialsResourcePage (CC, banking summary, comparison, routing)

### Phase 193: Allow unauthenticated dashboard access — lazy login on agent chat and action buttons, dual token exchange on demand

**Goal:** Let users browse /dashboard without logging in. Login triggers only when user tries to: (1) use the agent chat (dual token exchange, same as dashboard), or (2) click action buttons (transfer, etc.). On /marketing, same pattern — agent chat triggers login + dual token exchange. Read-only banking data visible without auth; write operations and agent require OIDC session.
**Requirements**: TBD
**Depends on:** Phase 192
**Plans:** 2/2 plans complete

Plans:
- [ ] 193-01-PLAN.md — Route /dashboard for unauthenticated users + agent FAB visibility + return_to
- [ ] 193-02-PLAN.md — Gate action buttons behind lazy login triggers

### Phase 194: Display complete token chain and OIDC flow visualization with token state changes, MCP calls, and backend operations

**Goal:** Create a comprehensive flow timeline visualization showing the complete OAuth + token exchange + MCP + backend operations sequence. Users see each step (OIDC login → exchange decision → exchange → tool call → backend operation) with token state transitions and which token powers each milestone. Backend operations are connected to their triggering MCP tool calls to demonstrate the full end-to-end flow.

**Requirements**: VIZ-01: OIDC flow timeline component, VIZ-02: Token state indicators, VIZ-03: Backend operation display

**Depends on:** Phase 193 (lazy login on dashboard)

**Plans:** 3 plans

Plans:
- [ ] 194-01-PLAN.md — OidcFlowTimeline component + milestone tracking in TokenChainContext
- [ ] 194-02-PLAN.md — Token state indicators (TokenStateIndicator component) + token state integration
- [ ] 194-03-PLAN.md — Backend operation display (BackendOperationIndicator) + backend API audit trail integration

**Success criteria:**
1. OidcFlowTimeline displays 5+ milestones (OIDC login, exchange start, exchange complete, MCP tool call, backend operation)
2. Each milestone shows status (pending → active → done) with spinner/checkmark animations
3. Token state indicator shows token type, claims, and expiry for each milestone
4. Backend operations linked to MCP tool calls with endpoint, status, response time
5. Complete end-to-end flow visible on one dashboard panel
6. Milestones persist in localStorage
7. Build passes (npm run build exit 0)

### Phase 195: Phase 172 security hardening — act claim validation, status codes, fallback removal, and test coverage

**Goal:** Harden the Phase 172 dual-token / RFC 8693 implementation: fix DELEGATION_CLAIM_MISSING status code (403→401), add act structural validation in both delegationErrorMiddleware files, remove subject-only fallback from agentMcpTokenService, enforce D-02 act claim check at MCP server boundary in BankingToolProvider, and add 5 token exchange tests.
**Requirements**: N/A (audit/hardening of existing phase)
**Depends on:** Phase 172
**Plans:** 1/1 plans complete

Plans:

- [x] [195-01-SUMMARY.md](.planning/phases/195-phase-172-security-hardening-act-claim-validation-status-codes-fallback-removal-and-test-coverage/195-01-SUMMARY.md) — Status code fix, act structural validation, fallback removal, D-02 MCP boundary enforcement, test coverage

### Phase 196: Combine feature flags, configuration, and setup into unified tabbed page with clear visual tabs (color and outlines) including IDP setup tab

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 195
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 196 to break down)

---

### Phase 197: Fix Phase 193 regression — sidebar missing on unauthenticated dashboard

**Goal:** Fix regression where unauthenticated guests on `/dashboard` route had no sidebar navigation.

**Requirements**: None (regression fix)

**Depends on:** Phase 193

**Plans:** 1/1 plans complete

Plans:
- [x] 197-01-PLAN.md — Add AdminSideNav to guest /dashboard branch; make sidebar actions guest-aware (Sign In vs Log Out)

**Success criteria:**
1. Sidebar visible on unauthenticated `/dashboard`
2. Guest action menu shows "Dark Mode" + "Sign In"
3. Authenticated users see normal "Switch Role" + "Log Out" + "Dark Mode"
4. Sign In button triggers OAuth login with `return_to=/dashboard`
5. Build passes without errors

**Key Deliverables:**
- App.js: Added `<AdminSideNav user={null} />` to unauthenticated /dashboard branch
- AdminSideNav.jsx: Conditional action items (spread syntax for auth-dependent actions); added sign-in case handler

### Phase 123: PingOne MFA Test Page

**Goal:** Create a comprehensive test page for PingOne MFA functionality including OTP (SMS, email), FIDO2/passkey, registration, and authentication testing.

**Requirements**: ACTLOG-01, ACTLOG-02, ACTLOG-03, ACTLOG-04, ACTLOG-05, ACTLOG-06, ACTLOG-07

**Depends on:** Phase 52 (PingOne MFA step-up implementation), Phase 1 (auth-flows)

**Plans:** 0/1 plans complete

Plans:
- [x] 123-01: Create MFA test page with SMS, email, and FIDO2 testing

**Success criteria:**
1. MFA test page accessible from Admin Dashboard
2. SMS OTP test flow works end-to-end
3. Email OTP test flow works end-to-end
4. FIDO2/passkey test flow works end-to-end
5. User registration test flow works with MFA enrollment
6. User authentication test flow works with step-up MFA
7. Device enrollment test flow allows adding new MFA devices
8. Device management test UI allows listing and removing devices
9. All test results displayed clearly with pass/fail status
10. Fix buttons provide actionable guidance for failed tests

### Phase 172: MCP server token exchange — require token exchange at MCP server before forwarding to backend app instead of OAuth pass-through ✅

**Goal:** Wire RFC 8693 token exchange into MCP server tool execution path with lazy caching, tool-specific scopes, and backend act claim validation
**Requirements**: D-01 (lazy+cache), D-02 (backend validates act), D-03 (narrowed scopes), D-04 (hard fail)
**Depends on:** Phase 171
**Plans:** 3/3 plans complete

Plans:
- [x] 172-01-PLAN.md — TokenCacheService and tool-to-scope mapping
- [x] 172-02-PLAN.md — Wire token exchange + cache into BankingToolProvider
- [x] 172-03-PLAN.md — requireDelegation middleware for act claim validation

### Phase 173: Research and create a frontend using WebMCP from Google

**Goal:** Build a browser-based MCP interaction panel (prototype) that lets users list and call MCP tools through the BFF proxy, with streaming results, hybrid error handling, and shared agent state — behind a feature flag.
**Requirements:** [WEBMCP-01: Feature flag gating, WEBMCP-02: Browser MCP client service, WEBMCP-03: Tool interaction panel UI, WEBMCP-04: Shared agent state integration, WEBMCP-05: Hybrid error handling]
**Depends on:** Phase 172
**Plans:** 2/2 plans complete

Plans:
- [ ] 173-01-PLAN.md — Feature flag + WebMCP client service
- [ ] 173-02-PLAN.md — WebMCP UI panel + dashboard integration
### Phase 174: HITL step-up modal — replace toast with blocking modal for MFA and consent flows ✅

**Goal:** Replace toast-based MFA with blocking modal supporting OTP, FIDO2 passkey, and PingOne MFA
**Requirements**: CUA-01, CUA-02, CUA-03
**Depends on:** Phase 173
**Plans:** 4/4 plans complete

Plans:
- [x] 174-01-PLAN.md — OtpStepUpModal component + BankingAgent integration
- [x] 174-02-PLAN.md — UI freeze + context line wiring
- [x] 174-03-PLAN.md — FIDO2 passkey modal + method toggle
- [x] 174-04-PLAN.md — PingOne MFA wiring (P1MFA device picker, push, FIDO assertion)

### Phase 175: Investigate JSON-RPC and how and when we should be using it

**Goal:** Deploy banking_mcp_server to EKS with K8s manifests, publicly reachable at api.pingdemo.com with WebSocket + HTTP Streamable transport, OAuth 2.0 Protected Resource auth, CORS, and rate limiting
**Requirements**: CUA-01, CUA-02, CUA-03
**Depends on:** Phase 174
**Plans:** 2/2 plans complete

Plans:
- [x] TBD (run /gsd-plan-phase 175 to break down) (completed 2026-04-17)

### Phase 176: Show users in config what LLM we are using and pick the order — if first errors go to next, LM Studio default, bad LLM should not stop it from working

**Goal:** Build configuration UI for LLM provider selection with automatic fallback chain and availability status. Show current provider+model, allow switching providers, display fallback priorities, and enable agent to auto-retry next provider if first fails.
**Requirements**: LLM-CONFIG-01
**Depends on:** Phase 175
**Plans:** 2/1 plans complete

Plans:
- [x] 176-01-PLAN.md — LlmConfigPanel UI, provider status service, agent fallback logic

### Phase 177: PingOne Test page — clarify token exchange sections (User+Agent+MCP differences), add subject_token to second exchange, explain IDToken FF bypass

**Goal:** Clarify Exchange 2 vs 3 differences, fix TokenLineageDiff truncation, add expected-change categorization, extend diagnosis to validate token claims, add comprehensive auto-fix
**Requirements**: TBD
**Depends on:** Phase 176
**Plans:** 3/3 plans complete

Plans:
- [x] 177-01-PLAN.md — Clarify Exchange 2 vs 3, add subject token to Exchange 3, ungated ID Token card
- [x] 177-02-PLAN.md — Fix TokenLineageDiff truncation + expected-change categorization
- [x] 177-03-PLAN.md — Extend diagnosis claim validation + fix button for PingOne config

### Phase 178: Agentic Trust alignment — education page mapping 6 security pillars, scope narrowing visualization, last-mile vault concept, threat model framing for credential replay, rogue agents, impersonation, and overpermissioning

**Goal:** Create comprehensive Agentic Trust education content mapping 6 security pillars (credential replay prevention, rogue agent prevention, impersonation/delegation, per-hop token exchange, least privilege scope narrowing, last-mile vault) to the banking demo implementation, with interactive flow diagram and threat model framing.
**Requirements**: TRUST-01, TRUST-02, TRUST-03, TRUST-04, TRUST-05
**Depends on:** Phase 177
**Plans:** 2/2 plans complete

Plans:
- [x] 178-01-PLAN.md — Agentic Trust education page with 6 pillars, flow diagram, threat model
- [x] 178-02-PLAN.md — Scope narrowing visualization and last-mile vault education on PingOne Test page








### Phase 179: Add dropdown for user to choose which LLM to use — when they select it, show config for that model

**Goal:** Replace LLM provider button row with a dropdown selector that shows contextual config (model picker + API key) for the selected provider only.
**Requirements**: LLM-01
**Depends on:** Phase 178
**Plans:** 1/1 plans complete

Plans:
- [x] 179-01-PLAN.md — Refactor LangChainAgentConfig to dropdown provider + model selector








### Phase 180: Evaluate and implement Google Gemma 4 as another LLM provider

**Goal:** Integrate Google Gemma 4 as the default local LLM provider via Ollama/LM Studio, update model dropdowns and labels, create comparison script for intent accuracy evaluation
**Requirements**: GEMMA-01, GEMMA-02, GEMMA-03, GEMMA-04
**Depends on:** Phase 179
**Plans:** 1/1 plans complete

Plans:
- [x] 180-01-PLAN.md — BFF config + UI labels + comparison script

### Phase 181: We need to add a training slide out for CUA for AI

**Goal:** Add a Computer Use Agent (CUA) training slide-out drawer that explains what CUA is, how it works, how it compares to MCP/tool-use, the security implications, and how it relates to this banking demo.
**Requirements**: CUA-01, CUA-02, CUA-03
**Depends on:** Phase 180
**Plans:** 3/3 plans complete

Plans:
- [x] 181-01-PLAN.md — CUA education drawer component + EDU registration
- [x] 181-02-PLAN.md — NL routing + RFC/sidebar/agent discoverability wiring
- [x] 181-03-PLAN.md — Cross-links with HITL/MCP panels + copy polish

### Phase 182: Public URL for MCP server so external clients like Claude can connect

**Goal:** Deploy banking_mcp_server to EKS with K8s manifests, publicly reachable at api.pingdemo.com with WebSocket + HTTP Streamable transport, OAuth 2.0 Protected Resource auth, CORS, and rate limiting
**Requirements**: TBD
**Depends on:** Phase 181
**Plans:** 1/1 plans complete

Plans:
- [ ] 182-01-PLAN.md — K8s manifests (Deployment, Service, Ingress, ConfigMap, Secret) + README docs

### Phase 183: MCP tools metadata compliance and token chain logging

**Goal:** Make MCP tool definitions fully MCP 2025-11-25 spec-compliant (annotations, titles, icons) and add comprehensive per-tool-call token chain audit logging with visibility in admin audit page and user token panel.

**Requirements**: TBD
**Depends on:** Phase 182
**Plans:** 4/4 plans complete

Plans:
- [x] 183-01-PLAN.md — Tool metadata compliance (titles, icons, annotations for all 9 tools; emit via /tools/list)
- [x] 183-02-PLAN.md — Token chain audit infrastructure (AuditLogger logTokenChain method, TokenExchangeService upgrade, BankingToolProvider audit calls)
- [x] 183-03-PLAN.md — Admin audit page token chain tab (eventType='token_chain' filter, specialized table, hover detail view)
- [x] 183-04-PLAN.md — User token chain panel MCP trail (/api/token-chain mcpToolCallsChain, TokenChainContext integration, TokenChainPanel rendering)

### Phase 124: MFA HITL Indication

**Goal:** Add clear Human-in-the-Loop (HITL) indication to MFA prompts so users understand when they need to manually approve a transaction.

**Requirements**: ACTLOG-01, ACTLOG-02, ACTLOG-03, ACTLOG-04, ACTLOG-05, ACTLOG-06, ACTLOG-07

**Depends on:** Phase 122 (conditional-step-up-authentication), Phase 52 (pingone-mfa-step-up)

**Plans:** 1/1 plans complete

Plans:
- [x] 124-01-PLAN.md — Add explicit manual-approval copy and persistent HITL indication across relevant MFA/step-up flows

**Success criteria:**
1. MFA prompt clearly indicates HITL status with text like "Manual approval required"
2. Visual cue (icon/badge) distinguishes HITL from automatic MFA
3. Users understand they need to manually approve the transaction
4. Education panel explains HITL concept in context
5. HITL indication works for all step-up MFA scenarios
6. UI contract preserved (no breaking changes to existing MFA flow)

### Phase 125: 124

**Goal:** Wizard at /setup/wizard — accordion UX, credentials validate, Run All SSE pipeline, mcp_exchanger app creation, SPEL attribute mapping, localStorage resume, .env output
**Requirements**: ACTLOG-01, ACTLOG-02, ACTLOG-03, ACTLOG-04, ACTLOG-05, ACTLOG-06, ACTLOG-07
**Depends on:** Phase 124
**Plans:** 1 plan

Plans:
- [ ] TBD (run /gsd-plan-phase 125 to break down)

### Phase 126: Surface sub claim as user ID in token chain display

**Goal:** Surface the `sub` claim as the human-readable user ID in the token chain display and education panels. Use `act` claim to show the agent/actor identity. Make identity visible in chain so users can see who is acting on whose behalf.

**Requirements**: ACTLOG-01, ACTLOG-02, ACTLOG-03, ACTLOG-04, ACTLOG-05, ACTLOG-06, ACTLOG-07
**Depends on:** Phase 124
**Plans:** 1/1 plans complete

Plans:
- [x] 126-01-PLAN.md — Surface friendly sub/act identity across token chain display, education panels, and AgentFlowDiagramPanel

### Phase 127: Comprehensive Debug and Fix - Fix pingone-test page, mfa-test page, and agent failures

**Goal:** Systematically debug and fix critical issues preventing the app from working: pingone-test page failures, mfa-test page failures, and agent failures.

**Requirements**: ACTLOG-01, ACTLOG-02, ACTLOG-03, ACTLOG-04, ACTLOG-05, ACTLOG-06, ACTLOG-07
**Depends on:** Phase 116 (full-langchain-native-agent-rebuild), Phase 122 (conditional-step-up-authentication), Phase 52 (pingone-mfa-step-up)

**Plans:** 1/1 plans complete

Plans:
- [x] 127-01: Debug PingOne Test page failures
- [x] 127-02: Debug MFA Test page failures — routes verified working; mfaEnabled:false is config (PINGONE_MFA_POLICY_ID not set), not a code bug
- [x] 127-03: Debug Banking Agent failures — agentBuilder Anthropic fallback added, routes confirmed
- [x] 127-04: Fix identified issues — all PingOne test bugs, build, UI, and agentBuilder fixed
- [x] 127-05: Verify end-to-end functionality — worker-token, agent-token, verify-assets, config all pass

### Phase 169: Add OAuth token display page — show user info from token or PingOne userinfo endpoint

**Goal:** Create a dedicated OAuth token display page that serves as the final destination after successful authentication. Display user's JWT token claims and optionally call PingOne userinfo endpoint for enriched profile data.
**Requirements**: TBD
**Depends on:** Phase 168
**Plans:** 3 plans

Plans:
- [x] 169-01-PLAN.md — Create React component displaying JWT token claims in organized card layout
- [x] 169-02-PLAN.md — Add BFF route for PingOne userinfo enrichment + enhanced display with additional user attributes
- [x] 169-03-PLAN.md — Wire OAuth callback to redirect to token display page + end-to-end testing + REGRESSION_PLAN update

**Success criteria:**
1. New page at `/oauth/token-display` displays token claims and PingOne user info
2. OAuth flow automatically redirects to token display page after authentication
3. Both JWT and enriched PingOne data displayed (graceful fallback if enrichment unavailable)
4. All existing OAuth flows (admin, user) unaffected
5. Build passes with no errors
6. REGRESSION_PLAN.md updated with implementation notes

### Phase 170: Force HITL for all Transfers in authorization server

**Goal:** Enforce HITL (Human-In-The-Loop) approval requirement for ALL transfer operations (regardless of amount), implemented across the BFF authorization layer.
**Requirements**: TRANSFER-HITL-01, TRANSFER-HITL-02, TRANSFER-HITL-03, TRANSFER-HITL-04
**Depends on:** Phase 169
**Plans:** 3/2 plans complete

Plans:
- [x] 170-01-PLAN.md — Modify transactionConsentChallenge to force HITL for all transfers + verify BFF 428 enforcement (TRANSFER-HITL-01, TRANSFER-HITL-02)
- [x] 170-02-PLAN.md — Add unit and integration tests + update REGRESSION_PLAN.md (TRANSFER-HITL-03, TRANSFER-HITL-04)

### Phase 171: https://developer.pingidentity.com/blog/introducing-the-pingone-mcp-server/

**Goal:** Create a comprehensive technical blog post on PingIdentity Developer Blog showcasing the PingOne MCP server implementation from the BX Finance demo. Explain how the MCP server enables secure AI agent integration with banking APIs using modern OAuth 2.0 patterns (RFC 8693 token exchange, CIBA, HITL).

**Requirements**: BLOG-POST-171-01 (blog structure and content), BLOG-POST-171-02 (production deployment guide)

**Depends on:** Phase 170 (Force HITL for all Transfers)

**Plans:** 3 plans

Plans:
- [x] 171-01-PLAN.md — Blog outline, introduction, "What is MCP", and live demo walkthrough
- [x] 171-02-PLAN.md — Three auth flows, RFC 8693 token exchange (1-exchange vs 2-exchange), BX Finance case study  
- [x] 171-03-PLAN.md — Production deployment guide, best practices, diagram sourcing, publication checklist

**Success criteria:**
1. Complete ~3,000–4,000 word blog post drafted
2. All major sections: MCP overview, auth flows, RFC 8693, case study, deployment, best practices
3. Code examples taken directly from banking_api_server/ and banking_mcp_server/
4. Diagrams sourced and ready for design handoff
5. Publication checklist verified (security, accuracy, compliance)
6. Ready for PingIdentity Developer Blog submission


### Phase 128: Quality Audit and Fix — Phases 120–127 Code Review and Professional Polish

**Goal:** Reevaluate all code delivered in phases 120–127: review PLAN.md artifacts against actual implementation, identify and fix bugs, eliminate dead code and lint warnings, and elevate the entire codebase to top professional quality.

**Scope:**
- Fix all ESLint/build warnings (unused vars, missing hook dependencies, anonymous exports)
- Complete phase 127 remaining tasks: banking agent debug, MFA test verification, E2E
- Audit and fix SideNav, TopNav, MFATestPage, PingOneTestPage, BankingAgent for correctness
- Verify all phase 120–127 acceptance criteria are actually met in the code
- No regressions: `npm run build` exits 0 with no new errors

**Requirements**: QUALITY-128-01
**Depends on:** Phase 127 (comprehensive-debug-and-fix)

**Plans:** 0/1 plans complete

Plans:
- [x] 128-01: Fix build warnings, lint cleanup, dead code removal — 12 warnings → 0
- [x] 128-02: Complete banking agent debug and E2E verification — agentBuilder fixed, endpoints verified
- [x] 128-03: Code quality audit — SideNav, TopNav, key components — duplicate entries, missing route, a11y fix
- [x] 128-04: Final quality verification and cleanup — build: Compiled successfully, zero warnings

### Phase 129: Audit last 15 todos — verify completed correctly, no errors, working

**Goal:** Wizard at /setup/wizard — accordion UX, credentials validate, Run All SSE pipeline, mcp_exchanger app creation, SPEL attribute mapping, localStorage resume, .env output
**Requirements**: ACTLOG-01, ACTLOG-02, ACTLOG-03, ACTLOG-04, ACTLOG-05, ACTLOG-06, ACTLOG-07
**Depends on:** Phase 128
**Plans:** 1 plan

Plans:
- [x] Audited 15 most recent todos — 7 archived to done, 8 remain as backlog

### Phase 130: PingOne Asset Verification — rich table with apps, resources, scopes and missing item highlights ✅ COMPLETE

**Goal:** Replace the 4-tile PingOne Asset Verification summary with a rich app→resource→scope table. Each app row shows its granted resource servers and scopes, with red highlights for missing expected apps, unassigned resource servers, and absent banking scopes. Summary count tiles remain above the table.
**Requirements**: APP-RESOURCE-SCOPE-TABLE, MISSING-HIGHLIGHT
**Depends on:** Phase 129
**Plans:** 2/2 plans complete

Plans:
- [x] 130-01-PLAN.md — Backend: add getApplicationResources() + enrich verify-assets response
- [x] 130-02-PLAN.md — Frontend: AssetTable component with missing-item highlights

### Phase 131: PingOne test page — config and resources sections: show pass/fail details and explain why

**Goal:** Enhance Configuration and Resources TestCards to show inline env var name, format hint, and amber fix message when failed — so operators understand why each item passes or fails without clicking Fix buttons.
**Requirements**: ACTLOG-01, ACTLOG-02, ACTLOG-03, ACTLOG-04, ACTLOG-05, ACTLOG-06, ACTLOG-07
**Depends on:** Phase 130
**Plans:** 1 plan

Plans:
- [ ] 131-01-PLAN.md — Add CONFIG_META + enhance TestCard inline detail block + wire up Config/Resources sections + CSS

### Phase 132: Full end-to-end testing of pingone-test page — verify all token acquisition, token exchange, config, assets, and decoded token display

**Goal:** Fix the `decodeJwtForDisplay is not defined` ReferenceError that breaks all token endpoints on the test page, then verify the full /pingone-test page end-to-end: worker token, authz token, agent token, all 3 token exchanges, configuration section inline details (Phase 131), asset table (Phase 130), and decoded token panels.
**Requirements**: ACTLOG-01, ACTLOG-02, ACTLOG-03, ACTLOG-04, ACTLOG-05, ACTLOG-06, ACTLOG-07
**Depends on:** Phase 131
**Plans:** 2/2 plans complete

Plans:
- [x] 132-01-PLAN.md — Fix decodeJwtForDisplay in pingoneTestRoutes.js (backend bug, Wave 1)
- [x] 132-02-PLAN.md — Human verification checkpoint: full /pingone-test end-to-end tour (Wave 2)

### Phase 133: PingOne test page UX — add Test/Get Token button to Agent Token card, add decoded token panel and Show API call to every section on the page

**Goal:** UX improvements on /pingone-test: rename Agent Token button to "Get Token", add collapsible "Show API Calls" toggle to every major section (replacing the single global API Calls section).
**Requirements**: ACTLOG-01, ACTLOG-02, ACTLOG-03, ACTLOG-04, ACTLOG-05, ACTLOG-06, ACTLOG-07
**Depends on:** Phase 132
**Plans:** 1 plan

Plans:
- [x] 133-01-PLAN.md — testLabel prop + SectionApiCalls component + per-section toggles + CSS + build verify

### Phase 134: Audit all phases 120+ — verify code quality, plan completeness, no regressions, no cross-phase conflicts; plan and execute any unplanned or unexecuted phases

**Goal:** Audit all phases 120 and above: verify each delivered its goal, no regressions introduced, no cross-phase conflicts, and any unplanned or unexecuted phases are identified and resolved.
**Requirements**: ACTLOG-01, ACTLOG-02, ACTLOG-03, ACTLOG-04, ACTLOG-05, ACTLOG-06, ACTLOG-07
**Depends on:** Phase 133
**Plans:** 1 plan

Plans:
- [ ] TBD (run /gsd-plan-phase 134 to break down)

### Phase 135: MFA test page UX — add decoded token panels and Show API Calls toggle to every section (mirror Phase 133 for MFA page)

**Goal:** Add SectionApiCalls toggle to all 6 MFA sections; instrument mfaTest.js routes with apiCallTrackerService so the toggle shows real API data
**Requirements**: ACTLOG-01, ACTLOG-02, ACTLOG-03, ACTLOG-04, ACTLOG-05, ACTLOG-06, ACTLOG-07
**Depends on:** Phase 134
**Plans:** 1 plan

Plans:
- [x] 135-01-PLAN.md — Add apiCallTrackerService to mfaTest.js routes + SectionApiCalls to all 6 sections + CSS

### Phase 136: Token chain reliability audit and hardening - make foolproof

**Goal:** Audit every place the token chain can break or go silent — missing events after login, chain not updating after agent tool calls, UI stuck on placeholder, identity hints not resolving, session preview stale — and fix each one. Add automated smoke tests and a visible error state when the chain fails so breakages are immediately obvious.
**Requirements**: ACTLOG-01, ACTLOG-02, ACTLOG-03, ACTLOG-04, ACTLOG-05, ACTLOG-06, ACTLOG-07
**Depends on:** Phase 134 (audit 120+), Phase 132 (decoded token panels)
**Plans:** 3/3 plans complete

Plans:
- [x] TBD (run /gsd-plan-phase 136 to break down) (completed 2026-04-18)

### Phase 137: Configure page complete redesign — Chase.com style, functional PingOne config, full review and testing

**Goal:** Wizard at /setup/wizard — accordion UX, credentials validate, Run All SSE pipeline, mcp_exchanger app creation, SPEL attribute mapping, localStorage resume, .env output
**Requirements**: ACTLOG-01, ACTLOG-02, ACTLOG-03, ACTLOG-04, ACTLOG-05, ACTLOG-06, ACTLOG-07
**Depends on:** Phase 136
**Plans:** 5/5 plans complete

Plans:
- [x] TBD (run /gsd-plan-phase 137 to break down) (completed 2026-04-12)

### Phase 138: audit and fix all placeholder content across the app and server replace with real functionality

**Goal:** Audit and fix all placeholder/stub content across UI and server; apply Chase.com visual redesign pass across all pages.
**Requirements**: D-01, D-02, D-03, D-04, D-05
**Depends on:** Phase 137
**Plans:** 5/5 plans complete

Plans:
- [x] 138-01-PLAN.md — Server stubs: agentSessionMiddleware refresh + demoScenario lastMigration + BankingAgent dead code
- [x] 138-02-PLAN.md — UserDashboard placeholder pills + Chase hero/cards redesign
- [x] 138-03-PLAN.md — Chase nav + Login + Transactions redesign
- [x] 138-04-PLAN.md — Chase Profile + SecurityCenter + Admin pages redesign
- [x] 138-05-PLAN.md — Human verification checkpoint

### Phase 139: Full test page fix + educational overhaul — PingOne Test + MFA Test, entity mapping, tokens, APIs, SPEL

**Goal:** Make /pingone-test and /mfa-test fully functional and maximally educational. Fix all broken flows (token exchange subjects, FIDO2 WebAuthn). Add comprehensive PingOne entity mapping (apps × resources × scopes × users × SPEL). Add decoded claim tooltips, token lineage diffs, and "What is Happening" panels to every section. Surface as much PingOne data as possible for learning.
**Requirements**: All buttons functional; decoded tokens on every card; verify-assets expanded with users/grants/SPEL; per-section edu panels on both pages.
**Depends on:** Phase 138, Phase 104 (worker token security fix — done)
**Plans:** 3/3 plans complete

Plans:
- [x] 139-01-PLAN.md — Audit + fix broken flows (exchange subjectToken, FIDO2 WebAuthn, Fix buttons)
- [x] 139-02-PLAN.md — PingOne entity mapper: apps × resources × scopes × users × SPEL × grant matrix
- [x] 139-03-PLAN.md — Educational overlays: claim tooltips, token lineage diffs, What is Happening panels


### Phase 140: OAuth return_to redirect — after PingOne login return to originating page with session access token available for token exchange

**Goal:** Strip `?oauth=success` query param from the browser URL after PingOne login redirects to return_to page. BFF already fully implements return_to; the only gap is the frontend not cleaning up the oauth param (sso_silent is already cleaned; oauth was not).
**Requirements**: URL clean after login; session retry logic unaffected; npm run build 0.
**Depends on:** Phase 139
**Plans:** 1/1 plans complete

Plans:
- [x] 140-01-PLAN.md — Strip ?oauth param from URL on App.js mount (one-shot useEffect matching sso_silent pattern)

### Phase 141: local setup wizard — guided PingOne configuration, app/resource/scope creation, SPEL attribute mapping, worker credentials, env file generation — app runs on completion

**Goal:** Wizard at /setup/wizard — accordion UX, credentials validate, Run All SSE pipeline, mcp_exchanger app creation, SPEL attribute mapping, localStorage resume, .env output
**Requirements**: ACTLOG-01, ACTLOG-02, ACTLOG-03, ACTLOG-04, ACTLOG-05, ACTLOG-06, ACTLOG-07
**Depends on:** Phase 140
**Plans:** 4 plans

Plans:
- [ ] 141-01-PLAN.md — Extend pingoneProvisionService: mcp_exchanger app + schema attr + SPEL claim
- [ ] 141-02-PLAN.md — Build SetupWizard.js accordion component + CSS
- [ ] 141-03-PLAN.md — Wire route + SideNav + SetupWizardTab env update
- [ ] 141-04-PLAN.md — Human verify checkpoint

### Phase 142: UX: clear separation of banking action buttons — standard authz (transfer, deposit) vs token exchange — visual distinction for PingOne OAuth actions ✅ COMPLETE

**Goal:** Wizard at /setup/wizard — accordion UX, credentials validate, Run All SSE pipeline, mcp_exchanger app creation, SPEL attribute mapping, localStorage resume, .env output
**Requirements**: ACTLOG-01, ACTLOG-02, ACTLOG-03, ACTLOG-04, ACTLOG-05, ACTLOG-06, ACTLOG-07
**Depends on:** Phase 141
**Plans:** 3/3 plans complete

Plans:
- [x] 142-01-PLAN.md — Add diagonal stripe CSS pattern to standard banking buttons
- [x] 142-02-PLAN.md — Implement disabled and authorization pending states
- [x] 142-03-PLAN.md — Manual verification of styling

### Phase 143: UX: agent banking actions via MCP server — new user token scoped to agent with aud claim, then 1-token or 2-token exchange for MCP token (FF), showing pattern evolution from standard authz to agentic authz ✅ COMPLETE

**Goal:** Enable agent-initiated banking transactions with user approval gates, real-time feedback, and live token exchange path demonstration.
**Requirements**: TOKEN-01, TOKEN-02, AGENT-APPROVAL-01, AGENT-ACTIVITY-01
**Depends on:** Phase 142
**Plans:** 4/4 plans complete

Plans:
- [x] 143-01-PLAN.md — Approval threshold HITL modal + error handling service
- [x] 143-02-PLAN.md — Token path display + real-time progress feedback
- [x] 143-03-PLAN.md — Agent Activity tab + feature flag for token exchange path
- [x] 143-04-PLAN.md — Manual verification checkpoint

### Phase 144: Agent token exchange from ID token — agent never receives access token, only scoped to user data via RFC 8693 token exchange

**Goal:** Add ff_id_token_exchange feature flag (default OFF); when ON, BFF performs RFC 8693 exchange using user ID token as subject_token so the agent never receives the user access token — only a narrowly-scoped MCP token.
**Requirements**: REQ-144-01, REQ-144-02, REQ-144-03, REQ-144-04, REQ-144-05
**Depends on:** Phase 143
**Plans:** 2/2 plans complete

Plans:
- [x] 144-01-PLAN.md — BFF: register ff_id_token_exchange, add performTokenExchangeFromIdToken, add /exchange-id-token-to-mcp route
- [x] 144-02-PLAN.md — UI: ID Token Exchange test row in PingOneTestPage + idTokenMode label in TokenChainDisplay

### Phase 145: MCP server audit — does the server meet spec requirements and provide the agent with tools + metadata (capabilities, descriptions, parameter schemas) to make decisions dynamically, not hardcoded tool calls

**Goal:** Wizard at /setup/wizard — accordion UX, credentials validate, Run All SSE pipeline, mcp_exchanger app creation, SPEL attribute mapping, localStorage resume, .env output
**Requirements**: ACTLOG-01, ACTLOG-02, ACTLOG-03, ACTLOG-04, ACTLOG-05, ACTLOG-06, ACTLOG-07
**Depends on:** Phase 144
**Plans:** 2/2 plans complete

Plans:
- [x] 145-01-PLAN.md — MCP server tools/list metadata contract audit + registry/handler tests
- [x] 145-02-PLAN.md — Agent metadata-first schema consumption hardening + dynamic schema tests

### Phase 146: Scope vocabulary alignment — match code to PingOne

**Goal:** Curated admin activity feed showing meaningful OAuth, token exchange, session, and JWKS events with timeline UI, replacing raw API noise
**Requirements**: ACTLOG-01, ACTLOG-02, ACTLOG-03, ACTLOG-04, ACTLOG-05, ACTLOG-06, ACTLOG-07
**Depends on:** Phase 145
**Plans:** 5/5 plans complete

Plans:
- [x] TBD (run /gsd-plan-phase 146 to break down) (completed 2026-04-14)

### Phase 147: Get rid of left agent. Keep the rest — ✅ COMPLETE

**Goal:** Remove left-dock placement mode for agent component to prevent conflicts with dashboard sidebar buttons. Agent remains fully functional in all other modes.
**Requirements**: None (bug fix / UX improvement)
**Depends on:** Phase 146
**Plans:** 1/1 ✅ Complete
**Status:** ✅ Completed 2026-04-14

Plans:
- [x] 147-01-PLAN.md — Remove left-dock placement mode from agent

### Phase 148: Redesign AI Agent chat UI — compact layout, grouped chips, visible prompt field

**Goal:** Redesign BankingAgent UI for compactness and clarity while maintaining full functionality across all placement modes. Users can intuitively navigate action buttons organized by category (Account, Transaction, Admin), see more chat messages on screen, and have easy access to the prompt input.

**Requirements**: ACTLOG-01, ACTLOG-02, ACTLOG-03, ACTLOG-04, ACTLOG-05, ACTLOG-06, ACTLOG-07
**Depends on:** Phase 147
**Plans:** 3 plans in 1 wave

Plans:
- [x] 148-01-PLAN.md — Group ACTIONS by semantic categories and add collapsible state management with localStorage persistence
- [x] 148-02-PLAN.md — Implement emoji-only chip rendering, condensed messages, prominent sticky prompt field, and collapsible group CSS
- [x] 148-03-PLAN.md — Visual verification checkpoint across all placement modes

### Phase 149: Verify Phase 146 scope alignment — pingone-test page shows correct scopes, detects missing/wrong scopes, and can update PingOne ✅ COMPLETE

**Goal:** Fix Phase 146 gaps: scope detection targets the banking resource server by name/audience (not array index), expose missing canonical scopes in verify-assets response, and add Fix-in-PingOne action buttons to create the banking resource server and missing canonical scopes from the test page.
**Requirements**: SCOPE-149-01, SCOPE-149-02, SCOPE-149-03
**Depends on:** Phase 148
**Plans:** 3/3 plans complete

Plans:
- [x] 149-01-PLAN.md — BFF: fix banking RS detection in verify-assets + add POST /api/pingone-test/fix-banking-resource-server
- [x] 149-02-PLAN.md — UI: scope-fix-panel with conditional fix buttons + scopes tab RS name + build verification

### Phase 150: Evaluate Anthropic Managed Agents SDK — replace custom MCP infrastructure [COMPLETE]

**Goal:** Research and evaluate whether Anthropic's Claude Managed Agents SDK can simplify or replace the current custom MCP server infrastructure, handling agent loop, context management, session continuity, and tool execution automatically.

**Requirements**: EVAL-150-01, EVAL-150-02
**Depends on:** Phase 149
**Plans:** 1 plan

Plans:
- [x] 150-01-PLAN.md — Evaluate Anthropic Managed Agents SDK vs current MCP infrastructure

### Phase 151: Scope vocabulary audit — review docs, code, tests, and PingOne Test page for clean scope alignment [COMPLETE]

**Goal:** Audit all OAuth scope strings across code, config, docs, tests, and PingOne Test page for consistent vocabulary and clean alignment
**Requirements**: SCOPE-151-01
**Depends on:** Phase 150
**Plans:** 1/1 plans complete

Plans:
- [x] 151-01-PLAN.md — Scope vocabulary audit across codebase

### Phase 152: PingOne Test Page — live integration testing and bug fixes

**Goal:** Test all /api/pingone-test/* endpoints against live PingOne, fix bugs discovered during integration testing. Covers: managementService.initialize() token passing, enableResourceServer() PingOne grants API payload format (scope format, 400/409 conflict handling, PUT vs PATCH, duplicate scope name detection), and full pi.flow OAuth chain validation (Steps 1-5: authorize, credentials, resume, token, exchange).
**Requirements**: TEST-152-01 (live endpoint testing), TEST-152-02 (enableResourceServer bug fixes), TEST-152-03 (pi.flow chain validation)
**Depends on:** Phase 151
**Plans:** 2 plans

Plans:
- [ ] TBD (run /gsd-plan-phase 152 to break down)

### Phase 153: Postman collections — fix auth flow and add session cookie support [COMPLETE]

**Goal:** Fix both Postman collections: (1) Super Banking PingOne Test collection — replace broken login GET requests with browser-based auth + sessionCookie variable, add Cookie headers to session-dependent requests. (2) PingOne Authorization Code pi.flow collection — fix redirect_uri from Vercel production to local (api.pingdemo.com:4000), fix callback path (/oauthuser/ → /oauth/user/). Rename BX Finance → Super Banking in pi.flow collection.
**Requirements**: POST-153-01 (test collection auth fix), POST-153-02 (pi.flow redirect_uri fix), POST-153-03 (BX Finance rename in pi.flow)
**Depends on:** Phase 152
**Plans:** 1 plan

Plans:
- [x] 153-01-PLAN.md — Fix Postman collections (auth flow, redirect_uri, rename)

### Phase 154: Create plan to implement DPoP, research if PingOne SSO supports it, if not how can we simulate it [COMPLETE]

**Goal:** Research DPoP (RFC 9449) implementation feasibility with PingOne SSO; create implementation or simulation plan
**Requirements**: DPOP-154-01
**Depends on:** Phase 153
**Plans:** 1 plan

Plans:
- [x] 154-01-PLAN.md — DPoP research and PingOne support assessment

### Phase 155: Redesign left sidebar as unified navigation menu with icon + label styling [COMPLETE]


**Goal:** Create unified admin sidebar with all navigation consolidated on ALL pages for admin users. All entries styled consistently in **white text** with icon + label pairs. Support expandable submenu sections like PingIdentity design. All menu links verified to point to real routes. Admin users get complete left-side navigation throughout the app.

**Requirements**: SIDE-155-01 (sidebar menu component), SIDE-155-02 (icon + label styling), SIDE-155-03 (hierarchical menus), SIDE-155-04 (verify all links), SIDE-155-05 (global integration)
**Depends on:** Phase 154
**Plans:** 3/3 plans complete

Plans:
- [x] [155-01-PLAN.md](.planning/phases/155-redesign-left-sidebar-as-unified-navigation-menu/155-01-PLAN.md) — AdminSideNav component + AdminLayout wrapper + CSS styling (COMPLETE — AdminSideNav.jsx, AdminSideNav.css, AdminLayout.jsx created)
- [x] [155-02-PLAN.md](.planning/phases/155-redesign-left-sidebar-as-unified-navigation-menu/155-02-PLAN.md) — Consolidate DashboardQuickNav buttons into sidebar (COMPLETE — Home, Agent, Dark Mode, Logout actions added)
- [x] [155-03-PLAN.md](.planning/phases/155-redesign-left-sidebar-as-unified-navigation-menu/155-03-PLAN.md) — Add expandable submenu sections, white text, consistent formatting (COMPLETE — User Banking, Audit & Logs, Security, Configuration submenus added with all entries white)
- [x] **155-04 (inline)** — Fix all broken links + integrate sidebar globally (COMPLETE — Fixed 5 broken routes: /activity-logs→/activity, /security-settings→/settings, /oauth-debug→/oauth-debug-logs, /client-reg→/client-registration. Removed non-existent items. Added API Traffic, Scope Audit/Reference. Integrated AdminSideNav into App.js to render on all pages for admin users)

### Phase 156: Improve security error messages for token scope violations and delegation failures

**Goal:** Improve error messages to teach WHY security decisions were made: every rejection includes what failed, why it failed, how to fix it, and a teaching moment about security principles.
**Requirements**: ACTLOG-01, ACTLOG-02, ACTLOG-03, ACTLOG-04, ACTLOG-05, ACTLOG-06, ACTLOG-07
**Depends on:** Phase 155
**Plans:** 3 plans

Plans:
- [ ] 156-01-PLAN.md — BFF middleware + error schema service (token, scope, delegation validation)
- [ ] 156-02-PLAN.md — MCP server validation + JsonRpc error formatting
- [ ] 156-03-PLAN.md — Frontend error display (modals, toasts, audit log)


### Phase 157: Audit and align AI agent security with PingOne Identity for AI best practices — delegation, consent flow, custom resources, attribute mapping, error messaging

**Goal:** Audit current AI agent security implementation against PingOne's "Securing AI agents with PingOne using delegation and least privilege" guide and plan alignment improvements.


**Requirements**: ACTLOG-01, ACTLOG-02, ACTLOG-03, ACTLOG-04, ACTLOG-05, ACTLOG-06, ACTLOG-07
**Depends on:** Phase 156
**Plans:** 2/2 plans complete

Plans:
- [ ] 157-01-PLAN.md — Comprehensive security audit (7 areas against PingOne guide)
- [ ] 157-02-PLAN.md — Gap analysis with severities, dependencies, and follow-up phases

### Phase 158: Add token validation test scenarios — demonstrate MCP server rejecting wrong tokens (user token with wrong scope/aud) and educational error messages

**Goal:** Add UI/API test scenarios to demonstrate how the MCP server rejects wrong tokens (user token with incorrect scope/audience) and displays educational error messages explaining the rejection and why it matters.
**Requirements**: ACTLOG-01, ACTLOG-02, ACTLOG-03, ACTLOG-04, ACTLOG-05, ACTLOG-06, ACTLOG-07
**Depends on:** Phase 157
**Plans:** 1/0 plans complete

Plans:
- [x] TBD (run /gsd-plan-phase 158 to break down) (completed 2026-04-15)

### Phase 159: AI Safety Red Button Kill Switch — immediate agent revocation, rate limiting, state capture, and forensic audit trail for TRiSM compliance

**Goal:** Implement red button kill switch demonstrating AI TRiSM principles: immediate OAuth token revocation (< 2 sec), rate limiting to cap blast radius, state capture for forensics, and immutable audit trail for compliance.
**Requirements**: REQ-159-01 through REQ-159-08 (AI TRiSM compliance)
**Depends on:** Phase 158
**Plans:** 2/2 plans complete

Plans:
- [x] 159-01-PLAN.md — Kill switch backend: token revocation, rate limiting, state capture, audit logging
- [x] 159-02-PLAN.md — Red button UI: confirmation modal, forensic audit dashboard integration

### Phase 160: AI TRiSM Training Panel — educational slide-out explaining Trust, Risk Management, Security, Governance, Lifecycle, and IAM principles for AI agents

**Goal:** Create interactive training panel explaining all six AI TRiSM principles with live demos from the app showing how each principle is implemented: Trust, Risk Management, Security, Governance, Lifecycle, and IAM.
**Requirements**: ACTLOG-01, ACTLOG-02, ACTLOG-03, ACTLOG-04, ACTLOG-05, ACTLOG-06, ACTLOG-07
**Depends on:** Phase 159
**Plans:** 2/2 plans complete

Plans:
- [x] 160-01-PLAN.md — TRiSM panel infrastructure: main slide-out + 6 principle slides + navigation
- [x] 160-02-PLAN.md — Integration: Learn button in top nav, glossary component, build verification

### Phase 161: Add thin activity log showing meaningful app events like JWKS validation OAuth redirects token exchange and session state instead of raw API calls and debug noise

**Goal:** Curated admin activity feed showing meaningful OAuth, token exchange, session, and JWKS events with timeline UI, replacing raw API noise
**Requirements**: ACTLOG-01, ACTLOG-02, ACTLOG-03, ACTLOG-04, ACTLOG-05, ACTLOG-06, ACTLOG-07
**Depends on:** Phase 160
**Plans:** 3 plans

Plans:
- [ ] 161-01-PLAN.md — appEventService backend + API endpoint
- [ ] 161-02-PLAN.md — Instrument OAuth, token exchange, session, JWKS event sources
- [ ] 161-03-PLAN.md — Enhanced ActivityLogs UI with timeline, icons, flow groups

### Phase 162: Enhanced spinner with live activity feed showing token retrieval, MCP gateway calls, responses, and other interesting events

**Goal:** Add a live scrolling activity feed to the spinner overlay showing server events (OAuth, token exchange, MCP calls, session, JWKS) while the spinner is visible. Uses Phase 161's appEventService as data source. Admin-only enhancement; non-admin spinner unchanged.
**Requirements**: SPIN-162-01
**Depends on:** Phase 161
**Plans:** 0/1 plans executed

Plans:
- [ ] 162-01-PLAN.md — Create spinnerActivityService, enhance SpinnerHost with activity feed, update CSS

### Phase 163: Universal sidebar navigation

**Goal:** Make the sidebar the universal, role-aware navigation surface for all logged-in users and remove redundant page-specific navigation so the app has a single primary navigation system.
**Requirements**: NAV-163-01, NAV-163-02, NAV-163-03, NAV-163-04, NAV-163-05
**Depends on:** Phase 162
**Plans:** 2/2 plans complete

Plans:
- [x] 163-01-PLAN.md — Make AdminSideNav role-aware and render it for all logged-in users
- [x] 163-02-PLAN.md — Remove redundant top-nav/dashboard quick-nav patterns so the sidebar is the single navigation source

### Phase 164: Performance evaluation and optimization — diagnose slow spinners, long API waits, and overall responsiveness

**Goal:** Fix SQLite/server blockers, eliminate auth status polling storm (120 req/min to <20), add timing instrumentation with <5s target for all request paths
**Requirements**: PERF-164-01 (fix blockers), PERF-164-02 (polling dedup), PERF-164-03 (timing instrumentation), PERF-164-04 (idle rate <20 req/min)
**Depends on:** Phase 163
**Plans:** 2 plans

Plans:
- [ ] 164-01-PLAN.md — Fix SQLite DBMOVED, route auth callers through cachedStatusService, slow AgentFlowDiagramPanel
- [ ] 164-02-PLAN.md — Server timing middleware, UI timing integration, end-to-end verification

### Phase 165: Add LM Studio as local model provider — fallback when Groq quota exceeded

**Goal:** Add LM Studio (OpenAI-compatible local server) as a fallback model provider when Groq quota is exceeded, keeping the demo functional without cloud API dependencies.
**Requirements**: LMSTUDIO-01, LMSTUDIO-02
**Depends on:** Phase 164
**Plans:** 1/1 plans complete

Plans:
- [ ] 165-01-PLAN.md — Add LM Studio fallback to BFF NL intent chain and LangChain agent factory

### Phase 166: Replace Gemini with Anthropic

**Goal:** Replace Gemini with Anthropic Claude in the NL intent fallback chain so the sequence becomes Groq → LM Studio → Anthropic → heuristic, while keeping the rest of the intent-routing contract stable.
**Requirements**: INTENT-CHAIN-01
**Depends on:** Phase 165
**Plans:** 1/1 plans complete

Plans:
- [x] 166-01-PLAN.md — Replace Gemini with Anthropic in the NL intent fallback chain and update config/docs

### Phase 167: MCP Tools Education Page

**Goal:** Display all available MCP tools from the BankingToolRegistry in an interactive, educational page/panel with descriptions, required scopes, and input schemas.

**Requirements**: EDU-05 (MCP tools education display)

**Depends on:** Phase 166

**Plans:** 2/2 plans complete

Plans:
- [x] 167-01-PLAN.md — MCPToolsEducation component: render tools categorized with scopes (Wave 1)
- [x] 167-02-PLAN.md — Integrate MCPToolsEducation into Admin Config page as tab (Wave 2)

**Success criteria:**
1. All 10 MCP tools display with name, description, required scopes, and parameter schemas
2. Tools are grouped by category: Read-Only (4), Write Operations (4), Public (2)
3. Component styling matches ActorTokenEducation pattern
4. MCPToolsEducation accessible from Admin Config page as a tab
5. Build passes without errors

### Phase 168: support HTTP2 stream from Agent to mcp servers

**Goal:** Enable full HTTP/2 streaming support for Agent ↔ MCP Server communication. Replace polling-based patterns with true multiplexed streams for efficient resource usage, real-time updates, and improved latency.

**Requirements**: TBD
**Depends on:** Phase 167
**Plans:** 3/3 plans complete

Plans:
- [x] 168-01-PLAN.md — HTTP/2 bridge service + BFF routing (Wave 1: connection pooling, MCP proxy)
- [x] 168-02-PLAN.md — Agent streaming response parsing + flow event integration (Wave 2: streamed responses, real-time events)
- [x] 168-03-PLAN.md — Comprehensive testing, performance verification, REGRESSION_PLAN update (Wave 3: validation, documentation)

**Success criteria:**
1. HTTP/2 bridge created with persistent connection pooling to MCP server
2. Agent service parses embedded flow events from streaming responses (no polling)
3. Multiplexing verified: 3+ concurrent tool calls on single HTTP/2 connection
4. Latency improvement: tool response time reduced by ~1s (eliminated polling delay)
5. Backward compatible: HTTP/1.1 clients still work
6. Full test coverage with performance baseline documented
7. REGRESSION_PLAN.md updated with implementation notes and known limitations


### Phase 169: Multi-IDP OAuth Configuration Abstraction & Federate Portability

**Goal:** Make the banking demo work with any OAuth provider (PingOne, PingFederate, Auth0, Okta, Azure AD) without code changes — only configuration.

**Requirements**: FEDERATE-01, FEDERATE-02, FEDERATE-03, FEDERATE-04, FEDERATE-05, FEDERATE-06

**Depends on:** Phase 168

**Plans:** 4/4 plans planned

Plans:
- [ ] 169-01-PLAN.md — Extract OAuth endpoints to configStore + update all services (Wave 1: authorization, token, userinfo, JWKS, issuer endpoints)
- [ ] 169-02-PLAN.md — Support OIDC Discovery for auto-endpoint population (Wave 1: .well-known/openid-configuration fetch + validation)
- [ ] 169-03-PLAN.md — Make OAuth callback paths configurable + dispatcher (Wave 2: dynamic route registration for `/api/auth/oauth/callback` vs `/oauth2/callback`)
- [ ] 169-04-PLAN.md — Abstract role/population claim mapping for any IDP (Wave 2: PingOne population_id → Azure AD app_roles → Auth0 roles → Okta groups)

**Success criteria:**
1. All 5 OAuth endpoints (auth, token, userinfo, JWKS, issuer) configurable via configStore + env vars
2. OIDC discovery optional: set issuer → auto-populate all endpoints from .well-known metadata
3. Callback paths configurable: `/api/auth/oauth/callback` (PingOne default) → `/oauth2/callback` (Federate) → `/callback` (Auth0)
4. Role determination abstracted: PingOne population_id, Azure app_roles, Auth0 roles, Okta groups all supported
5. Federate setup guide complete: 5-step migration from PingOne without code changes
6. Full test coverage: 40+ test cases covering PingOne, Federate, Auth0, Okta patterns
7. Backward compatible: existing PingOne configuration unchanged
8. Zero hardcoded `auth.pingone` URLs in service code (only in docs/comments)

**Key Deliverables:**
- configStore: 5 OAuth endpoint fields + 4 role claim fields
- oauthEndpointResolver.js: centralized endpoint resolution with discovery priority
- oauthDiscoveryService.js: OIDC metadata fetching + validation
- callbackDispatcher.js: dynamic route registration for configurable callback paths
- roleClaimResolver.js: abstract role determination from any claim structure
- Docs: FEDERATE-SETUP.md (complete migration), OIDC-DISCOVERY.md, CALLBACK-PATHS.md, ROLE-MAPPING.md
- Tests: 40+ cases across all 4 plans

### Phase 195: Security Hardening — RFC 8693 act Claim Validation, Status Codes, Fallback Removal

**Goal:** Close Phase 172 security gaps identified in code review: validate act claim structure, enforce correct HTTP status codes, remove unsafe fallbacks, and implement boundary validation at MCP server.

**Requirements**: SEC-01, SEC-02, SEC-03, SEC-04, SEC-05

**Depends on:** Phase 172

**Plans:** 1/1 plan complete

Plans:
- [x] 195-01-PLAN.md — Status code fix (403→401), act validation, fallback removal, MCP boundary check, tests (Wave 1)

**Success criteria:**
1. DELEGATION_CLAIM_MISSING returns 401 Unauthorized (auth failure, not authz)
2. act claim validated to be an object with sub or client_id (structural check)
3. Malformed act claims rejected with 403 INSUFFICIENT_PERMISSIONS
4. Subject-only fallback removed: exchange failures hard-fail immediately
5. MCP server validates act claim BEFORE using exchanged token (defense in depth)
6. 5 new token exchange tests pass covering D-01, D-02, D-04
7. All existing tests still pass (29 total)
8. RFC 8693 compliance verified

**Key Deliverables:**
- errorSchemaService.js: DELEGATION_CLAIM_MISSING → 401
- delegationErrorMiddleware.js: Structural act validation (object + sub/client_id check)
- agentMcpTokenService.js: Subject-only fallback removed
- BankingToolProvider.ts: D-02 act validation at MCP boundary + decodeJwtPayload helper
- BankingToolProvider.test.ts: 5 new token exchange tests (D-01, D-02, D-04)
