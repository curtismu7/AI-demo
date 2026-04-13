---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: planning
last_updated: "2026-04-13T11:48:00.000Z"
progress:
  total_phases: 162
  completed_phases: 73
  total_plans: 241
  completed_plans: 181
---

# State — Super Banking AI Banking Demo

**Milestone:** v1.0 — Complete Demo + Educational Content
**Updated:** 2025-07-11

---

## Current Position

Phase: 14 (agent-window-polish) — PLANNING
Plan: unplanned (run /gsd-plan-phase 14)
**Previous:** Phase 13 (dashboard-first-impression-overhaul) — ✅ COMPLETE
**Next:** /gsd-plan-phase 14
**Status:** Ready to plan Phase 14

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
- Phase 20 (postman-collections) — complete (commits: 1c4f75f, 56df684, a549287, af3a767)
- Phase 52 (pingone-mfa-step-up) — complete (commits: a4477e1, a867fb6, a3c3b0d, 02bf0d8)
- Phase 53 (debug-testing-and-bug-fixes-for-phase-52-mfa-step-up) — complete (commits: a867fb6, a3c3b0d, 02bf0d8, 6b2711a)
- Phase 21 (customer-diagrams) — complete (commit: 772d2a5)
- Phase 22 (agent-capability-audit) — complete (commits: bd866c6, 1448b7a)
- Phase 23 (langchain-modernization) — complete (commits: f80d934, 343951c, 91789e8, c35b95e)
- Phase 29 (use-case-c-sensitive-data-access) — complete (commit: 3ca82da)
- Phase 48 (remove-invalid-spel-act-expression) — complete (commits: d4c0a7a, fc86d8d)
- Phase 85 (chase-dashboard-styling) — complete (commits: 7980dc5, 2891f33, 272d01a, 13d4676, ddc5895, fc6f87a)
- Phase 95 (actor-token-agent-token-education) — complete (commits: 900ea2d, 0a9a8cc) [2026-04-08]
- Phase 96 (audience-aud-claim-validation) — complete (commits: 2b24f38, c2b696d) [2026-04-08]
- Phase 99 (langgraph-upgrade) — complete (commits: pending) [2026-04-10]
- Phase 101 (token-exchange-flow-diagram-ui) — complete (commits: 0b67e63, e7af290, 0c70c0e) [2026-04-09]
- Phase 107 (make-hostname-and-redirect-uri-configurable) — complete (summaries: 107-01, 107-02, 107-03) [2026-04-09]
- Phase 108 (server-restart-notification-modal) — complete (summaries: 108-01, 108-02, 108-03) [2026-04-09]
- Phase 109 (demo-data-agent-placement-fix) — complete (commits: 6595727, 2fa5973) [2026-04-09]
- Phase 114 (ietf-agentic-identity-standards) — complete (summaries: 114-01, 114-02, 114-03) [2026-04-11]
- Phase 116 (full-langchain-native-agent-rebuild) — complete (commits: f8ebbeb, 0dd5367, 193f59e) [2026-04-11]
- Phase 122 (conditional-step-up-authentication) — complete (plan: 122-01) [2026-04-10]
- Phase 123 (pingone-mfa-test-page) — complete (plan: 123-01, commit: dec6ba6) [2026-04-11]

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
- [Phase 87]: Phase 87 planned with 7-task breakdown covering service, API, React component, tests, and Vercel deployment. Scope validation rules derived from live PingOne resources and PINGONE_MAY_ACT_SETUP.md reference table.
- [Phase 97]: In-memory mode state seeded from VALIDATION_MODE env var (not persisted to disk)
- [Phase 97]: RFC 7662 health probe: 400 response from PingOne counts as 'connected' (invalid token is expected)
- [Phase 110]: Token endpoint auth method stored in configStore; read at exchange time with env var fallback
- [Phase 111-scope-audit-compliance-app-ids]: Use pingone_worker_client_id long-form keys to match configStore.getEffective() lookup chain

## Blockers

(none)

---

## Quick Tasks Completed

| ID | Task | Commit | Date |
|---|---|---|---|
| 260403-ibs | Rename BX Finance → Super Banking across docs, source, and UI | 04fa9c7 | 2026-04-03 |
| 260403-ief | Rename PingOne apps and resources BX Finance → Super Banking (manual console) | 9a7fe9e | 2026-04-03 |
| 260403-igq | Fix PINGONE_MAY_ACT_TWO_TOKEN_EXCHANGES.md to canonical Super Banking naming | b08495e | 2026-04-03 |
| 260407-vsc | Verify agent:invoke scope configuration for token exchange — confirmed app b2752071-2d03-4927-b865-089dc40b9c85 properly configured | verification-only | 2026-04-07 |
| 260407-nzk | Document all API calls, token exchanges, and their scopes — comprehensive mapping with auth requirements and flow diagrams | 9c2b3f8 | 2026-04-07 |
| 260407-85p1 | **Phase 85 Plan 01: Dashboard Color Audit** — Audit current colors, map to Chase.com navy, create STYLE_AUDIT.md with implementation roadmap | 7980dc5, 2891f33 | 2026-04-07 |
| 260407-85p2 | **Phase 85 Plan 02: Dashboard Styling** — CSS variables, DashboardHero.css, UserDashboard.css updated with Chase navy colors | 272d01a, 13d4676 | 2026-04-07 |
| 260407-85p3 | **Phase 85 Plan 03: Mobile & Verification** — Responsive design across 320px–1440px verified, WCAG AAA compliance confirmed, all Wave 3 tests passing | ddc5895 | 2026-04-07 |
| 260407-p86a | **Phase 86 Added: test-everything-you-can-for-production-run** — Comprehensive testing and verification phase for production launch | (roadmap update commit pending) | 2026-04-07 |
| 260407-phst | **Update PHASES.md with Phase 85 and 86 status** — Add Phase 85 complete and Phase 86 unplanned to phase status tracking file | 6908933 | 2026-04-07 |
| 260407-cvfy | **Code Verification: API Scopes vs Implementation** — Verified 32 endpoints, scope enforcement, RFC 8693 token exchange (1-exchange & 2-exchange), critical OAuth/MCP/CIBA paths, RFC compliance (6749, 8693, 8707, 7636, 9728). Result: ✅ Code matches documentation exactly. No critical gaps. | b1a65dc | 2026-04-07 |

---

## Pending Todos (59)

- **[TODO -> docs]** Add API calls with JSON body or headers for education - Create service to capture and display API calls for educational purposes
- **[TODO -> ui]** Show tokens for each call with ability to decode them - Create token service with collapsible display and JWT decode functionality
- **[TODO -> auth]** Reorganize PingOne apps — OIDC agents to AI Agents group, OIDC user apps to Applications group
- **[TODO -> ui]** Fix floating agent popout window size — popout must match agent height and be at least as wide as the agent panel
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

- Phase 143 added: UX agent banking actions via MCP server — new user token scoped to agent with aud claim, then 1-token or 2-token exchange for MCP token (FF), pattern evolution from standard authz to agentic authz
- Phase 142 added: UX clear separation of banking action buttons — standard authz (transfer, deposit) vs token exchange — visual distinction for PingOne OAuth actions
- Phase 138 added: Audit and fix all placeholder content across app and server — replace with real functionality
- Phase 137 added: Configure page complete redesign — Chase.com style, functional PingOne config, full review and testing
- Phase 136 added: Token chain reliability audit and hardening — make foolproof
- Phase 132 added: Full end-to-end testing of pingone-test page — verify all token acquisition, token exchange, config, assets, and decoded token display
- Phase 131 added: PingOne test page — config and resources sections: show pass/fail details and explain why
- Phase 130 added: PingOne Asset Verification — rich table with apps, resources, scopes and missing item highlights
- Phase 129 added: Audit last 15 todos — verify completed correctly, no errors, working
- Phase 126 renamed + context added: Surface sub claim as user ID in token chain display and education panels
- Phase 122 added: Conditional Step-Up Authentication for Banking Transactions — Logged-in users only require MFA for banking transactions, non-logged-in users require both login and MFA
- Phase 121 added: API Display Modal Enhancement — Integrate new API display service into dashboards and marketing page as draggable, resizable modal for educational purposes

- Phase 116 added: Full LangChain native agent rebuild — replace retrofit with real framework agent across all surfaces (float, left, right, middle). Real framework agent with PingOne RFC 8693 token exchange. No compatibility shims.

- Phase 114 added: IETF agentic identity standards compliance and education page — RFC7523bis, Identity Chaining, JAG-IR, AIMS, WIMSE, SD-JWT VC, PQ/T JOSE
- Phase 108 added: Add server restart notification modal with UX polish
- Phase 102 added: redesign app UI to match Ping Operations Fabric style - split-pane layout with architecture diagram panel and chat agent panel, PingIdentity branding, red accents, solution architecture section with token flow steps

- Phase 101 added: token exchange flow diagram UI - single and double exchange with AI agent bubble on responses

- Phase 100 added: configurable step-up MFA threshold and agent transaction stop limit

- Phase 99 added: test local server and make sure it all works

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
- Phase 98 added: update diagrams and docs to reflect new token validation options including introspection vs local jwt selection
- Phase 43 added: Multi-vertical demo mode — retail and workforce HR variants via config, reusing banking infrastructure
- Phase 88 added: Audit and align all documentation and code to PingOne app names, rename apps where needed, update Vercel and localhost env vars, validate setup and creation code
- Phase 89 added: Audit and update all documentation to match standardized PingOne app names
- Phase 48 added: Remove invalid SpEL act expression from Super Banking Banking API and enforce act chain at BFF/PAZ layer instead — update docs
- Phase 44 added: Admin mode token exchange — use admin token (not user token) for MCP tool calls when in admin session, enable admin-only actions (view all users, delete account)
- Phase 84 added: review all syntax errors code failures looping best practices for all code
- Todo allocated to Phase 84: enterprise-grade run.sh startup script with post-start guide
- Phase 46 added: Standardize PingOne app, resource, and scope naming across all use cases
- Phase 47 added: Super Banking rename verification — confirm no regressions across UI, API, MCP, and docs
- Phase 26 added: AI platform landscape — AWS Bedrock, Microsoft Azure AI, Google Vertex AI, IBM watsonx, Anthropic, OpenAI tools overview and vendor comparison
- Phase 87 added: Comprehensive token validation at every step — document and audit token validation patterns for Agent (MCP client), App Host (BFF), and MCP Server (Gateway); decide when to validate with authz server vs local JWT
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
- Phase 90 added: Scope/resource check — OIDC app scope spelling validation, resource URL validation, and fix capability
- Phase 91 added: External MCP client access — public MCP server with PingOne-protected auth, restrict to @pingidentity.com Google login, per-client authorization, and Claude/ChatGPT integration planning
- Phase 92 added: User custom attribute validation — verify user has required PingOne custom attributes configured correctly, report and fix capability, integrate into existing scope/resource check tooling
- Phase 93 added: Surface agent-on-behalf-of-user actions in UI and education — make visible in dashboard what the AI agent is doing on the user's behalf, with explanatory education panels describing the pattern
- Phase 94 added: Explicit HITL for agent consent — implement user approval UI before agent performs actions on user behalf, clear permission explanations, approval evidence in token exchange
- Phase 95 added: Actor token = Agent token education — document that Actor token is the Agent token, establish consistent terminology across code/docs/UI, eliminate confusion between actor/agent/act/agent-actor
- Phase 96 added: Audience (aud) claim validation — validate aud in all tokens, ensure aud matches API/resource, configure aud values in PingOne apps, audit aud mismatches, prevent token confusion and delegation attacks
- Phase 91 (Plan 01): RFC 7662 Token Introspection Endpoint — Wave 1 COMPLETE (tokenIntrospectionService, /api/introspect route, 20 test cases, all passing)
- Phase 97 added: Demo config with introspection and JWT validation options — ensure introspection and JWT validation are options in demo config, verify APIs working to PingOne endpoint
- Phase 105 added: make dashboards match the color scheme and general look of chase.com main page
- Phase 106 added: RFC 8693 §4.4 delegation claims - nested act for delegation chains - ensure compliance and implementation

---

## Roadmap Evolution

- Phase 109 added: Demo-data agent placement buttons should only configure state, not move agent [2026-04-08]
- Phase 110 added: Fix demo-data page layout: add may_act demo button, fix Config button overflow, improve discoverability [2026-04-08]
- Phase 112 added: Marketing and dashboard UI polish - ensure consistent light and dark mode [2026-04-08]
- Phase 113 added: Redesign UI to match Chase.com look and feel (preserve all functionality) for all pages [2026-04-09]
- Phase 115 added: Agent framework integration — recreate BankingAgent using LangChain for improved tool orchestration, multi-turn conversations, and maintainability [2026-04-09]
- Phase 116 added: Full LangChain native agent rebuild — replace createStructuredChatAgent retrofit with langchain 1.x createAgent() API across BFF and UI; 7-tool registry; per-request executor; session history; HITL 428 consent [2026-04-09]
- Phase 117 added: LangChain production-quality agent with pluggable model interface (Groq default, OpenAI/Anthropic/HuggingFace support) [2026-04-09]
- Phase 118 added: Research and plan HuggingFace integration with LangChain for cost-effective model deployment — evaluate ecosystem, licensing, model selection, deployment options [2026-04-09]
- Phase 141 added: Local setup wizard — guided PingOne configuration, app/resource/scope creation, SPEL attribute mapping, worker credentials, env file generation — app runs on completion [2026-04-13]

---

## Roadmap Evolution

- Phase 117 added: "LangChain production-quality agent with pluggable model interface" [2026-04-09]
- Phase 118 added: "Research and plan HuggingFace integration with LangChain" [2026-04-09]
- Phase 119 added: "Call MCP server and get tools without authenticating user" [2026-04-09]
- Phase 120 added: "UI/UX: Audit all buttons and navigation; make sidebar and nav more bank-like" [2026-04-10]
- Phase 99 added: "LangGraph upgrade — migrate banking agent from LangChain createAgent to LangGraph StateGraph for better state management" [2026-04-10]
- Phase 102 added: "Agent token exchange flow — implement two-exchange (user+agent→MCP) and single-exchange (user→agent→MCP) paths" [2026-04-10]
- Phase 103 added: "PingOne Test Page — comprehensive test page with Chase.com-style UI and fix buttons" [2026-04-10]
- Phase 133 added: "PingOne test page UX — add Test/Get Token button to Agent Token card, add decoded token panel and Show API call to every section on the page" [2026-04-12]
- Phase 134 added: "Audit all phases 120+ — verify code quality, plan completeness, no regressions, no cross-phase conflicts; plan and execute any unplanned or unexecuted phases" [2026-04-12]
- Phase 135 added: "MFA test page UX — add decoded token panels and Show API Calls toggle to every section (mirror Phase 133 for MFA page)"
- Phase 139 added: "Full test page fix + educational overhaul — PingOne Test + MFA Test, entity mapping, tokens, APIs, SPEL" [2026-04-12]
