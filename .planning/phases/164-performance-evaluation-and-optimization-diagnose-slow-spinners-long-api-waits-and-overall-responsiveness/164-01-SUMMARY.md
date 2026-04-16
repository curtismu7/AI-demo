---
phase: 164-performance-evaluation-and-optimization
plan: 01
subsystem: ui, server
tags: [caching, polling, sqlite, performance]

requires: []
provides:
  - Auth status deduplication via cachedStatusService with 3s TTL
  - Auto-invalidation on login/logout events
  - getCachedJson axios-compatible wrapper
  - Fixed SQLite DBMOVED by deleting stale sessions.db
  - AgentFlowDiagramPanel polling slowed to 10s
affects: [164-02, performance, auth]

tech-stack:
  added: []
  patterns:
    - "getCachedJson() wrapper for axios-compatible cached responses"
    - "window event listeners for cache invalidation (userAuthenticated/userLoggedOut)"

key-files:
  created: []
  modified:
    - banking_api_ui/src/services/cachedStatusService.js
    - banking_api_ui/src/services/sessionResolver.js
    - banking_api_ui/src/App.js
    - banking_api_ui/src/components/UserDashboard.js
    - banking_api_ui/src/components/Dashboard.js
    - banking_api_ui/src/components/BankingAgent.js
    - banking_api_ui/src/components/education/TokenExchangePanel.js
    - banking_api_ui/src/components/AgentFlowDiagramPanel.js

key-decisions:
  - "getCachedJson returns { data } shape to minimize caller changes from axios.get"
  - "BankingAgent uses getCachedStatus (raw JSON) since resolveSessionFromAuthTrio expects unwrapped objects"
  - "Cache auto-invalidation via window CustomEvent listeners at module load time"

patterns-established:
  - "All auth status polling goes through cachedStatusService — no direct axios.get or fetch to auth endpoints"

requirements-completed: [PERF-164-01, PERF-164-02, PERF-164-04]

duration: 15min
completed: 2026-04-16
---

# Phase 164 Plan 01: Auth polling deduplication + SQLite fix

**Eliminated ~120 req/min idle auth polling by routing all callers through cachedStatusService with 3s TTL and event-driven invalidation.**

## Performance

- **Duration:** 15 min
- **Tasks:** 3
- **Files modified:** 8

## Accomplishments
- All 7 auth status callers now route through cachedStatusService (was: direct axios.get/fetch)
- Cache auto-clears on userAuthenticated/userLoggedOut events — no stale auth state after login/logout
- AgentFlowDiagramPanel polling reduced from 3s to 10s
- SQLite DBMOVED fixed by deleting stale sessions.db

## Task Commits

1. **Task 1: Fix SQLite DBMOVED** — deleted stale sessions.db
2. **Task 2: Route auth callers through cache** — updated 7 files
3. **Task 3: Slow AgentFlowDiagramPanel** — 3s → 10s interval

Combined commit: `f0828ab`

## Files Modified
- `cachedStatusService.js` — Added getCachedJson wrapper, auto-invalidation listeners
- `sessionResolver.js` — Switched from bffAxios to getCachedJson
- `App.js` — checkOAuthSession uses getCachedJson
- `UserDashboard.js` — fetchUserData uses getCachedJson
- `Dashboard.js` — fetchTokenData uses getCachedJson
- `BankingAgent.js` — All 3 auth trio patterns use getCachedStatus
- `TokenExchangePanel.js` — Uses getCachedJson
- `AgentFlowDiagramPanel.js` — 10s polling interval
