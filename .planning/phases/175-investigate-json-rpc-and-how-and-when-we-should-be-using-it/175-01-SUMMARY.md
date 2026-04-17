---
phase: 175-investigate-json-rpc
plan: 01
subsystem: research
tags: [json-rpc, mcp, protocol, architecture, research]

requires: []
provides:
  - JSON-RPC 2.0 specification analysis for banking demo context
  - Pattern comparison: MCP (JSON-RPC) vs BFF (REST) vs SSE (streaming)
  - Recommendation document with decision matrix
affects: [future-mcp-features]

tech-stack:
  added: []
  patterns: []

key-files:
  created:
    - .planning/phases/175-investigate-json-rpc-and-how-and-when-we-should-be-using-it/175-JSON-RPC-RESEARCH.md
    - .planning/phases/175-investigate-json-rpc-and-how-and-when-we-should-be-using-it/175-PATTERN-COMPARISON.md
    - .planning/phases/175-investigate-json-rpc-and-how-and-when-we-should-be-using-it/175-RECOMMENDATION.md
  modified: []

key-decisions:
  - "Banking demo already uses JSON-RPC 2.0 correctly in MCP server — MCP spec requires it"
  - "BFF correctly uses REST/HTTP — JSON-RPC would break OAuth, cookies, HTTP caching"
  - "No migration needed — architecture is sound"

patterns-established:
  - "MCP layer = JSON-RPC 2.0, BFF layer = REST, streaming = SSE"

requirements-completed: []

duration: 25min
completed: 2026-04-17
---

# Phase 175 Plan 01: JSON-RPC Investigation Research Summary

**JSON-RPC 2.0 already adopted in MCP server (spec-required); BFF correctly uses REST; no migration needed**

## Performance

- **Duration:** ~25 min
- **Completed:** 2026-04-17
- **Tasks:** 2 (spec analysis + pattern comparison)
- **Files created:** 3 research documents (517 total lines)

## Accomplishments
- 175-JSON-RPC-RESEARCH.md (188 lines): Full JSON-RPC 2.0 spec analysis, MCP comparison, code examples
- 175-PATTERN-COMPARISON.md (242 lines): Current patterns audit across MCP server, BFF, SSE streaming
- 175-RECOMMENDATION.md (87 lines): Decision matrix showing JSON-RPC correct where used, REST correct elsewhere

## Task Commits

1. **Task 1: JSON-RPC spec analysis** — `5344231` (docs)
2. **Task 2: Pattern comparison** — `5344231` (docs, combined commit)

## Files Created/Modified
- `175-JSON-RPC-RESEARCH.md` — JSON-RPC 2.0 spec overview, advantages/disadvantages, MCP alignment
- `175-PATTERN-COMPARISON.md` — Current messaging patterns: MCP (JSON-RPC), BFF (REST), SSE (streaming)
- `175-RECOMMENDATION.md` — Decision: already correct, no migration needed, minor optional improvements

## Decisions Made
- **No action required** — architecture already correct
- MCP server: JSON-RPC 2.0 with proper error codes (-32600 to -32603)
- BFF: REST with HTTP status codes, cookies, redirects — correct for browser-facing APIs
- Minor optional: extract shared `createErrorResponse` utility (not worth the effort for demo)

## Deviations from Plan
None — plan executed as written

## Issues Encountered
None — research-only phase, no code changes

## Self-Check: PASSED

## Next Phase Readiness
- Clear recommendation: no JSON-RPC migration needed
- Future MCP features should continue using JSON-RPC 2.0 as MCP spec requires

---
*Phase: 175-investigate-json-rpc*
*Completed: 2026-04-17*
