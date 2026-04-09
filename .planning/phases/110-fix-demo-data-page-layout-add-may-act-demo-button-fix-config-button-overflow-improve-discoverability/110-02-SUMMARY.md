---
phase: 110
plan: "02"
subsystem: banking_api_ui, banking_api_server
tags: [ux, demo-data, navigation, token-exchange, config]
dependency_graph:
  requires: [110-01]
  provides: [sticky-section-nav, token-endpoint-auth-selector]
  affects: [DemoDataPage.js, DemoDataPage.css, demoScenario.js, configStore.js, agentMcpTokenService.js]
tech_stack:
  added: [IntersectionObserver]
  patterns: [configStore FIELD_DEFS pattern, validated PATCH with whitelist, configStore read-back with env fallback]
key_files:
  modified:
    - banking_api_ui/src/components/DemoDataPage.js
    - banking_api_ui/src/components/DemoDataPage.css
    - banking_api_server/routes/demoScenario.js
    - banking_api_server/services/configStore.js
    - banking_api_server/services/agentMcpTokenService.js
decisions:
  - Route added to demoScenario.js (mounted at /api/demo-scenario) — no new route file needed
  - PATCH validates against whitelist (client_secret_basic, client_secret_post, client_secret_jwt, empty)
  - configStore.get() takes priority over env var at token-exchange time
metrics:
  duration: "~35 min"
  completed_date: "2026-04-09"
  tasks_completed: 4
  files_modified: 5
---

# Phase 110 Plan 02: Sticky Section Nav + Token Endpoint Auth Method Selector Summary

**One-liner:** Adds sticky left-rail jump-to nav with IntersectionObserver active-state, and configurable token endpoint auth method selectors (frontend + BFF configStore + token exchange read-back).

## What Was Built

**Task 1 — Sticky section nav:**
- `NAV_SECTIONS` array: 9 entries (Storage, Demo vertical, PingOne audit, Agent auth, User profile, Scope, Marketing login, PingOne Authorize, may_act)
- `IntersectionObserver` `useEffect` highlights `activeNav` state as user scrolls (`rootMargin: '-10% 0px -70% 0px'`)
- `<nav className="demo-data-page__nav">` renders as left-rail sibling of `<main>`
- CSS: sticky, 152px wide, `border-right`, `--active` class = red highlight; hidden at `max-width: 768px`
- `demo-data-page__body` updated to `display: flex` at desktop

**Task 2 — Token endpoint auth selectors (frontend):**
- State: `agentTokenEndpointAuth`, `mcpTokenEndpointAuth`, `tokenAuthSaving`
- Loaded on mount via `GET /api/demo-scenario/token-endpoint-auth`
- Two `<select>` controls with options: `— use env var —`, `client_secret_basic`, `client_secret_post`, `client_secret_jwt`
- Save button calls `handleTokenAuthSave` → `PATCH /api/demo-scenario/token-endpoint-auth`
- Placed inside PingOne Authorize section (`#demo-p1az-flags-heading`)

**Task 3 — BFF routes (`demoScenario.js`):**
- `GET /api/demo-scenario/token-endpoint-auth` → reads both configStore keys
- `PATCH /api/demo-scenario/token-endpoint-auth` → validates against `VALID_TOKEN_AUTH_METHODS` set, calls `configStore.setConfig()`

**Task 3 — configStore (`configStore.js`):**
- `FIELD_DEFS`: `ai_agent_token_endpoint_auth_method` + `mcp_exchanger_token_endpoint_auth_method` (both `public: true, default: ''`)
- `envFallbackMap`: maps to `AI_AGENT_TOKEN_ENDPOINT_AUTH_METHOD` / `MCP_EXCHANGER_TOKEN_ENDPOINT_AUTH_METHOD` env vars

**Task 3 — Token exchange read-back (`agentMcpTokenService.js`):**
- `aiAgentAuthMethod` now: `configStore.get('ai_agent_token_endpoint_auth_method') || process.env.AI_AGENT_TOKEN_ENDPOINT_AUTH_METHOD || 'basic'`
- `mcpExchangerAuthMethod` now: `configStore.get('mcp_exchanger_token_endpoint_auth_method') || process.env.MCP_EXCHANGER_TOKEN_ENDPOINT_AUTH_METHOD || 'basic'`

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| T1+T2+T3 | `7dc8523` | feat(110-02): sticky section nav + token endpoint auth method selector |

## Deviations from Plan

**1. [Auto-resolved] Route mounted at /api/demo-scenario not /api/config**
- Plan left prefix TBD ("determine prefix by reading app.js")
- Found: `demoScenario.js` mounted at `/api/demo-scenario` — used that prefix throughout
- Updated frontend calls to `/api/demo-scenario/token-endpoint-auth`

## Self-Check: PASSED

- [x] `grep "NAV_SECTIONS" banking_api_ui/src/components/DemoDataPage.js` → 3 matches
- [x] `grep "IntersectionObserver" banking_api_ui/src/components/DemoDataPage.js` → match
- [x] `grep "demo-data-page__nav" banking_api_ui/src/components/DemoDataPage.css` → 6 matches
- [x] `grep "768px" banking_api_ui/src/components/DemoDataPage.css` → match
- [x] `grep "agentTokenEndpointAuth" banking_api_ui/src/components/DemoDataPage.js` → 3 matches
- [x] `grep "token-endpoint-auth" banking_api_server/routes/demoScenario.js` → 5 matches
- [x] Commit `7dc8523` exists
- [x] `npm run build` → exit 0
