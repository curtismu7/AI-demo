# BX Finance — AI Banking Demo

## What This Is

A hands-on educational demo that teaches developers, architects, and conference audiences how to implement secure AI agent authentication using real OAuth 2.0 / OIDC standards. The demo uses a fictional bank (BX Finance) to show three distinct authentication flows, two token exchange patterns (RFC 8693), CIBA, and the full MCP 2025-11-25 spec — all running live, with in-app education panels explaining each concept as it happens.

## Core Value

A developer who completes a 5-minute walkthrough of the live demo should understand exactly how to implement a secure, delegated AI agent that acts on behalf of a human user without ever exposing raw tokens to the browser or the agent.

## Requirements

### Validated

- ✓ Authorization Code + PKCE login (home page, admin and user routes) — existing
- ✓ BFF token custodian pattern (tokens never reach browser, session-backed) — existing
- ✓ RFC 8693 1-exchange token chain (user token → MCP token) — existing
- ✓ RFC 8693 2-exchange token chain (user token + agent token → MCP token with act claim) — existing
- ✓ CIBA backend (routes/ciba.js, cibaEnhanced.js, poll/cancel/notify endpoints) — existing
- ✓ MCP 2025-11-25 server (WebSocket, tool registry, BankingToolProvider, auth challenges) — existing
- ✓ In-app education panels (TokenChain, MayAct, McpProtocol, PAR, HumanInLoop, BestPractices, LoginFlow, RFCIndex, etc.) — existing
- ✓ Vercel deployment (banking-demo-puce.vercel.app, api/handler.js, Upstash Redis sessions) — existing
- ✓ `/.well-known/mcp-server` discovery endpoint (HttpMCPTransport) — Phase 32
- ✓ `sequential_think` MCP tool — structured 5-step reasoning, no auth required — Phase 32
- ✓ Async UX mode selector (job-id/spinner/transparent) on Config page, localStorage-persisted — Phase 32
- ✓ MCP audit trail (`/audit` admin route + `/api/mcp/audit` BFF proxy + AuditLogger) — Phase 32
- ✓ MCP registry manifest (`mcpServers` in package.json + AI Client Setup in README) — Phase 32

### Active

- [ ] **AUTH-01**: CIBA flow fully wired end-to-end in UI — initiate → poll → approval notification → agent unblocks
- [ ] **AUTH-02**: Agent-triggered login HITL — agent encounters auth challenge mid-flow → user presented login → agent resumes after approval
- [ ] **AUTH-03**: Home page login flow polished — clear entry point, role routing (admin vs customer), first-time user experience
- [ ] **TOKEN-01**: 1-exchange vs 2-exchange visual toggle — UI switch to live-demonstrate both paths with side-by-side token diff
- [ ] **TOKEN-02**: Live token inspector — show decoded JWT, act claim, may_act claim, aud, scope in a readable panel during agent operations
- [ ] **STAB-01**: SSE flow diagram on Vercel — fix Lambda isolation bug (Redis pub/sub or static-frame fallback for serverless)
- [ ] **STAB-02**: Cold-start account persistence — fix extra accounts (investment, custom) lost on cold-start
- [ ] **STAB-03**: SKIP_TOKEN_SIGNATURE_VALIDATION hard guard — replace console.error with process.exit(1) for production safety
- [ ] **EDU-01**: OIDC 2.1 education panel — what changed from OIDC Core, why it matters for agents
- [ ] **EDU-02**: MCP spec 2025-11-25 panel — protocol walkthrough, tool call lifecycle, auth challenge spec
- [ ] **EDU-03**: RFC reference cards — 8693 (token exchange), 9396 (RAR), 7519 (JWT), 9700 (MCP auth), OIDC CIBA — with "see it in this demo" links
- [ ] **EDU-04**: Guided demo tour — linear walkthrough mode that sequences all 3 auth flows with explanations for a conference presenter
- [ ] **DOC-01**: User-facing setup guide — PingOne app config → environment variables → running the demo locally
- [ ] **DOC-02**: Architecture walkthrough doc — how the 3-layer stack (UI → BFF → MCP) works, with annotated sequence diagrams

### Out of Scope

- Production hardening / pen testing — this is a demo, not a production deployment
- LangChain agent expansion — `langchain_agent/` is optional/deprecated; not part of this milestone
- Multi-tenant or SaaS features — single demo environment only
- Custom identity provider support — PingOne is the only IdP for this milestone
- Mobile / native app flows — web only

## Context

- **Stack**: Node 20 / Express BFF + React 18 CRA SPA + TypeScript MCP server (WebSocket)
- **Auth**: PingOne as-a-service; separate OAuth clients for admin, user, and AI agent
- **Sessions**: Upstash Redis on Vercel (critical for cold-start correctness); better-sqlite3 locally
- **Token flow flag**: `USE_AGENT_ACTOR_FOR_MCP` + `ff_two_exchange_delegation` toggle between 1- and 2-exchange paths
- **Known fragile areas**: SSE on Vercel (Lambda isolation), cold-start accounts, REAUTH_KEY loop guard
- **Deployment**: Vercel (banking-demo-puce.vercel.app), branch `fix/dashboard-fab-positioning`
- **Codebase map**: `.planning/codebase/` — 7 documents (STACK, ARCHITECTURE, STRUCTURE, CONVENTIONS, INTEGRATIONS, TESTING, CONCERNS)

## Constraints

- **Tech stack**: Express + React CRA + TypeScript MCP — do not introduce new frameworks mid-milestone
- **Tokens stay server-side**: BFF must remain sole token custodian; no token exposure to browser
- **Vercel serverless**: Changes to session handling must account for Lambda isolation and cold starts
- **Build must pass**: `cd banking_api_ui && npm run build` exit 0 after every UI change; `tsc` clean in MCP server
- **Regression list**: Read `REGRESSION_PLAN.md` §1 before touching protected areas

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| BFF as sole token custodian | Security — tokens never reach browser; RFC 8693 exchange happens server-side | ✓ Good |
| Two separate exchange paths (feature flag) | Demo both 1-exchange and 2-exchange patterns for education | ✓ Good |
| WebSocket for BFF→MCP (not HTTP) | Stateful session management; auth challenge flow requires persistent connection | ✓ Good |
| Vercel + Upstash for hosting | Easiest public demo URL; serverless constraints are known and mitigated | — Pending |
| Education panels embedded in app | Learners see explanation in context of the live demo | ✓ Good |
| Render.com for MCP WebSocket server | Vercel serverless doesn't support persistent WebSocket; Render Docker service handles it | ✓ Good |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-03 after Phase 32*
