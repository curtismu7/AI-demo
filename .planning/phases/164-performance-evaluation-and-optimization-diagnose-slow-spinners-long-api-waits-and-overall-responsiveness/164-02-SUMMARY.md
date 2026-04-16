---
phase: 164-performance-evaluation-and-optimization
plan: 02
subsystem: server, ui
tags: [timing, middleware, performance, instrumentation]

requires:
  - phase: 164-01
    provides: cachedStatusService routing, SQLite fix
provides:
  - Server X-Response-Time header on all responses
  - SLOW request logging (>2s)
  - UI request duration measurement in spinner activity feed
affects: [performance, monitoring]

tech-stack:
  added: []
  patterns:
    - "Express timing middleware with res.end override"
    - "Client-side fetch duration logging to spinner activity"

key-files:
  created:
    - banking_api_server/middleware/timing.js
  modified:
    - banking_api_server/server.js
    - banking_api_ui/src/services/cachedStatusService.js

key-decisions:
  - "Timing middleware placed before all other middleware for accurate wall-clock measurement"
  - "spinnerActivity.addClientEvent used for UI timing display (guarded import)"

patterns-established:
  - "X-Response-Time header on all server responses"

requirements-completed: [PERF-164-03]

duration: 10min
completed: 2026-04-16
---

# Phase 164 Plan 02: Timing instrumentation

**Added X-Response-Time header to all server responses and request duration logging in the UI spinner activity feed.**

## Performance

- **Duration:** 10 min
- **Tasks:** 2 (1 auto + 1 checkpoint)
- **Files modified:** 3, 1 created

## Accomplishments
- Server timing middleware adds X-Response-Time header to every response
- Requests exceeding 2s logged as SLOW with path info
- cachedStatusService measures duration of fresh (non-cached) fetches
- Duration logged to spinner activity feed as client event

## Task Commits

1. **Task 1: Timing middleware + UI timing** — `d8a43b0`
2. **Task 2: Human verification checkpoint** — awaiting user

## Files Created/Modified
- `banking_api_server/middleware/timing.js` — Express timing middleware (new)
- `banking_api_server/server.js` — Wired timing middleware early in chain
- `banking_api_ui/src/services/cachedStatusService.js` — Added fetch duration measurement + spinner logging
