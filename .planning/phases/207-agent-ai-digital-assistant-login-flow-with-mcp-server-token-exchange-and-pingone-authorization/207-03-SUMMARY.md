---
phase: "207"
plan: "03"
status: complete
date_completed: 2026-04-20
commit: 8a67d489
---

## Phase 207 Plan 03 — HITL Async Decision Flow + Session Correlation

**One-liner**: Implemented full HITL (Human-in-the-Loop) async approval flow for MCP tool calls — PingOne Authorize signals `hitlRequired`, BFF blocks with `mcp_hitl_required` (428), UI shows approve/deny, agent resumes or cancels.

## Work Completed

### PingOne Authorize / simulated service
- `pingOneAuthorizeService.js`: `_extractHitlRequired()` checks PA obligations for `HITL`/`HUMAN_APPROVAL` type
- `simulatedAuthorizeService.js`: `SIMULATED_MCP_HITL_TOOLS` env var for demo control
- `mcpToolAuthorizationService.js`: `mcp_hitl_required` block (HTTP 428) with `taskId`

### HITL decision polling (in-memory)
- `banking_api_server/routes/mcpDecisionPolling.js` (179 lines, new):
  - `GET /decision/:taskId` — agent polls for approval
  - `POST /decision/:taskId/approve` and `/deny` — UI submits decision
  - In-memory Map with 5-min TTL + periodic cleanup (no Upstash dependency)
- `banking_api_server/server.js`: mounted polling router, generates `taskId`, stores pending HITL on block

### Agent UI integration
- `banking_api_ui/src/components/BankingAgent.js`: `mcp_hitl_required` catch → `setHitlPendingIntent` with `isMcpHitl` flag for approve/deny/retry flow; cancel handler POSTs deny to polling endpoint
- `banking_api_ui/src/services/bankingAgentService.js`: propagates `taskId` on thrown errors

### Regression plan
- `REGRESSION_PLAN.md`: updated with new protected areas (HITL polling route, decision Map)

## Self-Check: PASSED
