---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: executing
last_updated: "2026-04-04T20:49:12.535Z"
progress:
  total_phases: 55
  completed_phases: 34
  total_plans: 99
  completed_plans: 95
---

# State — Super Banking AI Banking Demo

**Milestone:** v1.0 — Complete Demo + Educational Content
**Updated:** 2025-07-11

---

## Current Position

Phase: 10 (enterprise-grade-hitl-high-value-transaction-warnings-ciba-or-otp-step-up-based-on-configuration-and-polished-approval-ux) — EXECUTING
Plan: 1 of 3
**Status:** Executing Phase 10

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
- Phase 13 (dashboard-first-impression-overhaul) — complete (commit: 358ed1f)
- Phase 19 (demo-config-page-audit) — complete
- Phase 20 (postman-collections) — complete (commits: 1c4f75f, 56df684, a549287, af3a767)
- Phase 52 (pingone-mfa-step-up) — complete (commits: a4477e1, a867fb6, a3c3b0d, 02bf0d8)
- Phase 53 (debug-testing-and-bug-fixes-for-phase-52-mfa-step-up) — complete (commits: a867fb6, a3c3b0d, 02bf0d8, 6b2711a)
- Phase 21 (customer-diagrams) — complete (commit: 772d2a5)
- Phase 22 (agent-capability-audit) — complete (commits: bd866c6, 1448b7a)
- Phase 23 (langchain-modernization) — complete (commits: f80d934, 343951c, 91789e8, c35b95e)
- Phase 29 (use-case-c-sensitive-data-access) — complete (commit: 3ca82da)
- Phase 48 (remove-invalid-spel-act-expression) — complete (commits: d4c0a7a, fc86d8d)
- Phase 49 added: Setup wizard — credential input page that creates .env, provisions Vercel env vars, creates PingOne apps and resource servers, and attaches scopes via Management API worker token
- Phase 50 added: Update docs, setup script, and fix logout URLs on PingOne apps using worker token — audit all PingOne config documentation and ensure logout URLs are correct everywhere
- Phase 54 added: Self-service user provisioning — create customer and admin logins with profile data (email, phone, address) and mayAct custom JSON attribute setup

---

## Decisions

| ID | Decision | Phase | Notes |
|----|----------|-------|-------|
| D-01 | BFF is sole token custodian | foundation | Tokens never reach browser |
| D-02 | Two exchange paths toggled by feature flag | foundation | `USE_AGENT_ACTOR_FOR_MCP` + `ff_two_exchange_delegation` |
| D-03 | WebSocket for BFF→MCP | foundation | Required for stateful auth challenge flow |
| D-04 | Vercel + Upstash for hosting | foundation | Known serverless constraints documented in REGRESSION_PLAN.md |
| D-05 | Education panels embedded in app | foundation | In-context explanation while demo runs |
| D-06 | Render.com for MCP WebSocket server | Phase 32 | Vercel serverless can't hold persistent WebSocket; Render Docker service handles it |

---
- [Phase 08]: Listen for banking-agent-result event in UserDashboard rather than prop/callback chain — keeps components decoupled
- [Phase 48]: Removed invalid SpEL act expression from Step 1e — PingOne handles act nesting natively per RFC 8693 §4.4

## Blockers

(none)

---

## Quick Tasks Completed

| ID | Task | Commit | Date |
|---|---|---|---|
| 260403-ibs | Rename BX Finance → Super Banking across docs, source, and UI | 04fa9c7 | 2026-04-03 |
| 260403-ief | Rename PingOne apps and resources BX Finance → Super Banking (manual console) | 9a7fe9e | 2026-04-03 |
| 260403-igq | Fix PINGONE_MAY_ACT_TWO_TOKEN_EXCHANGES.md to canonical Super Banking naming | b08495e | 2026-04-03 |

---

## Pending Todos (57)

- **[TODO -> auth]** Reorganize PingOne apps — OIDC agents to AI Agents group, OIDC user apps to Applications group
- **[TODO -> ui]** Fix floating agent popout window size — popout must match agent height and be at least as wide as the agent panel
- **[TODO -> ui]** Add self-service button to side menu on main page and dashboards
- **[TODO -> docs]** Add RFC 8707 resource indicators to educational panels and verify PingOne support
- ~~Plan Phase 1 (auth-flows)~~ *(complete)*
- Redeploy to Vercel (commits since last deploy include Phase 29: 3ca82da)
- ~~When merged to main: update raw doc links~~ *(merged to main 2026-04-03)*
- **[TODO -> Phase 4]** UI consistency audit — enterprise-grade cross-SPA visual polish (04-04-PLAN.md)
- **[TODO -> Phase 4]** Marketing page agent dock UI match — dock styling should match /marketing page design language (04-04-PLAN.md)
- **[Phase 6]** Fix RFC 8693 token exchange: PingOne returning "Unsupported authentication method" — investigate agentMcpTokenService.js client auth method
- **[TODO -> /demo-data]** Token Endpoint Auth Method selector — per-client picker (BASIC/POST/client_secret_jwt/private_key_jwt) on DemoDataPage; JWT key gen for JWT methods; BFF jwtAssertionService.js + applyTokenEndpointAuth extension

---

## Accumulated Context

### Roadmap Evolution

- Phase 7 added: RFC 9728 Protected Resource Metadata — education panel and demo integration
- Phase 8 added: Banking transaction integrity — fix balance updates, validate all actions, and ensure enterprise-grade correctness
- Phase 9 added: CIBA step-up authentication — implement OTP modal, wire backchannel auth for write actions, and validate enterprise-grade UX
- Phase 10 added: Enterprise-grade HITL — high-value transaction warnings, CIBA or OTP step-up based on configuration, and polished approval UX
- Phase 11 added: Education content review and accuracy audit — OAuth RFCs MCP PingOne AI completeness check
- Phase 12 added: UI button consistency audit — standardize color scheme red and blue with white text no grey no purple
- Phase 24 added: Agent builder landscape — LangChain, open-source and commercial frameworks, vendor comparison
- Phase 25 added: LLM landscape — commercial and open-source models, capabilities overview, and comparison
- Phase 45 added: need to support RFC 9728 (OAuth 2.0 Protected Resource Metadata)
- Phase 53 added: debug testing and bug fixes for phase 52 MFA step-up
- Phase 43 added: Multi-vertical demo mode — retail and workforce HR variants via config, reusing banking infrastructure
- Phase 48 added: Remove invalid SpEL act expression from Super Banking Banking API and enforce act chain at BFF/PAZ layer instead — update docs
- Phase 44 added: Admin mode token exchange — use admin token (not user token) for MCP tool calls when in admin session, enable admin-only actions (view all users, delete account)
- Phase 46 added: Standardize PingOne app, resource, and scope naming across all use cases
- Phase 47 added: Super Banking rename verification — confirm no regressions across UI, API, MCP, and docs
- Phase 26 added: AI platform landscape — AWS Bedrock, Microsoft Azure AI, Google Vertex AI, IBM watsonx, Anthropic, OpenAI tools overview and vendor comparison
- Phase 27 added: PingOne Authorize PAZ setup — transaction limit policy, AUD validation, act chain introspection to match RFC 8693 token exchange implementation
- Phase 28 added: Vercel config tab — read environment variables via Vercel API, display editable fields in UI, write non-secret vars back to Vercel, secrets entered by user and stored server-side only
- Phase 29 added: Use-case C — agent accessing sensitive or regulated data; explicit authorization, least-data-necessary controls, optional HITL for elevated actions
- Phase 30 added: Agent layout modes — float, left-dock, right-dock, bottom-dock; resizable panels; responsive 3-column layout adjustment for left/right docking
- Phase 31 added: Floating draggable resizable windows — agent request flow, agent panel, API viewer, log viewer, all drawers unified under a single drag-resize system
- Phase 32 added: MCP server advanced capabilities — sequential thinking tool, async long-running tasks (SEP-1686), .well-known server discovery, audit trail observability, MCP registry integration
- Phase 33 added: Token chain history persistence — record and restore token chain across page refreshes using sessionStorage or localStorage
- Phase 34 added: Agent action logging — log what agent performed each action, which rights (scopes/permissions) were used, and record each step for observability and audit
- Phase 35 added: User-facing feature documentation — update docs for each feature explaining what it does and why it was added
- Phase 41 added: C4 top-down architecture diagram (draw.io) for the banking demo
- Phase 42 added: Persist demo accounts across server restarts using env file on Vercel and SQLite on local
- Phase 51 added: Auth rules audit tests and demo config section for login OTP and high-value transaction gates
- Phase 52 added: PingOne MFA step-up research and implementation — OTP FIDO TOTP full MFA capability
- Phase 55 added: Docker Kubernetes deployment — containerize all components for Kubernetes deployment with production-ready Docker images and orchestration manifests
- Phase 56 added: Token exchange audit and compliance — comprehensive RFC 8693 compliance audit against architectural diagrams
- Phase 57 added: OAuth client credentials security hardening — replace PATs with OAuth 2.0 client credentials for AI integrations (80% security value, 20% complexity)
- Phase 58 added: RFC 8693 delegation claims compliance — ensure proper may_act and act claim structures for delegation patterns
- Phase 59 added: RFC 9728 compliance and education audit — comprehensive audit of Protected Resource Metadata implementation and educational coverage
- Phase 60 added: Agent showcase and integration storytelling — transform demonstration to showcase established banking platform embracing AI augmentation
- Phase 61 added: MCP specification error code compliance audit — comprehensive audit of MCP error handling to ensure 403→"invalid scopes" and 401→auth flow per MCP spec
- Phase 62 added: Token exchange critical fixes and enhancements — address critical audit issues: may_act format, RFC 8707, scope simplification, test coverage, documentation
- Phase 63 added: Documentation and integration critical fixes — fix critical documentation gaps: operations guides, developer integration, API docs, architecture, configuration
- Phase 64 added: Unified configuration page — merge config and demo-data into one unified configuration page with complete audit and seamless migration
- Phase 65 added: API configuration and management enhancements — address critical API configuration issues, improve management worker authentication, and fix Vercel environment variable handling
- Phase 66 added: UI enhancements and user experience improvements — comprehensive UI improvements including agent interface, education panels, authentication flows, and visual design
- Phase 67 added: Documentation enhancement and developer tools — complete documentation suite with comprehensive technical guides, visual diagrams, educational content, and developer tools
