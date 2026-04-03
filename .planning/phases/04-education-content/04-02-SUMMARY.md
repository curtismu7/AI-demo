---
phase: 04-education-content
plan: 02
subsystem: ui
tags: [react, education, mcp, auth-challenge]

requires:
  - phase: 04-01
    provides: educationIds pattern (independent but same wave)
provides:
  - McpProtocolPanel enhanced with auth-challenge tab and source file table
  - auth-challenge tab covering 3 trigger scenarios + flow ascii diagram
  - Source file reference table added to existing inrepo tab
affects: [education panels, MCP protocol education]

tech-stack:
  added: []
  patterns:
    - "Tab append pattern to existing EducationDrawer-based panels"

key-files:
  created: []
  modified:
    - banking_api_ui/src/components/education/McpProtocolPanel.js

key-decisions:
  - "Added auth-challenge tab (new) and enhanced existing inrepo tab with source files table rather than replacing it"
  - "Used real file paths confirmed via grep (server.js inline route, not a separate mcpTool.js route file)"

requirements-completed:
  - EDU-02

duration: 8min
completed: 2026-04-01
---

# Phase 04 Plan 02: McpProtocolPanel Auth Challenge Tabs Summary

**McpProtocolPanel enhanced with auth-challenge tab (CIBA/step-up flow) and source file reference table in existing in-repo tab.**

## Performance

- **Duration:** 8 min
- **Completed:** 2026-04-01
- **Tasks:** 3 (confirm file paths, add tabs, build verify)
- **Files modified:** 1

## Accomplishments

- Confirmed real file paths:
  - BFF tool proxy: `banking_api_server/server.js` (inline POST /api/mcp/tool, not a separate route file)
  - Auth gate: `banking_api_server/services/mcpToolAuthorizationService.js`
  - Token exchange: `banking_api_server/services/agentMcpTokenService.js`
  - MCP server: `banking_mcp_server/src/tools/BankingToolProvider.ts`
  - UI: `banking_api_ui/src/components/BankingAgent.js`
- Added `auth-challenge` tab (id: 'auth-challenge', label: 'Auth challenge') covering:
  - What an auth challenge is
  - 3 trigger scenarios (amount threshold, PingOne Authorize gate, mid-flow session loss)
  - Full flow sequence ASCII diagram (user click → BFF → PingOne → polling → retry)
  - Why HITL alignment matters
- Enhanced existing `inrepo` tab with source files table (6 rows)
- McpProtocolPanel now has 7 tabs total (previously 6)
- Build passes

## Deviations from Plan

[Rule 1 — deviation] Plan said McpProtocolPanel had 4 tabs; it actually had 6 (inspector + inrepo tabs added in a prior phase not tracked in plan). Added auth-challenge tab (making 7 total) and enhanced existing inrepo tab with the source files table rather than adding a duplicate in-repo tab.

## Self-Check: PASSED

- `grep -n "auth-challenge" McpProtocolPanel.js` → line 85
- `grep -n "inrepo" McpProtocolPanel.js` → line 156
- `npm run build` → `Compiled successfully.`
