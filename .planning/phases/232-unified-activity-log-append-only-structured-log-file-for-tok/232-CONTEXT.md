---
phase: 232
title: Unified Activity Log
status: discussed
date: "2026-04-25"
---

# Phase 232 — Context & Decisions

## Phase Goal

Extend the existing `appEventService.js` in-memory ring buffer with append-only NDJSON file persistence, add two missing event categories (`authorize` and `agent_prompt`), instrument the authorize gate and agent prompt paths, and ensure all existing token exchange / MCP / PingOne API call sites emit structured events. The Activity Logs UI (`ActivityLogs.js`) already polls `/api/admin/app-events` — no UI changes required; new events surface automatically.

---

## Locked Decisions

### D-01: Storage — file persistence alongside in-memory buffer

**Decision:** Add append-only NDJSON file persistence to `appEventService.js`. Keep the existing in-memory ring buffer (for the UI polling endpoint). On each `logEvent` call, also `fs.appendFileSync` to `banking_api_server/logs/activity.ndjson` (one JSON object per line).

**Rationale:** The roadmap explicitly says "append-only structured log file." The in-memory buffer is already wired to the UI. Adding file persistence requires ~30 lines, no new dependencies, survives server restarts, and is exportable.

**Constraints:**
- Create `banking_api_server/logs/` directory if it doesn't exist (on module load, not per-call).
- Rotate or cap file growth is out of scope for Phase 232 — this is a demo, not production.
- Errors in file write must not throw / crash the event logging path (wrap in try/catch, log to console.warn only).
- Log file path configurable via `ACTIVITY_LOG_FILE` env var; default `./logs/activity.ndjson`.

---

### D-02: UI loading/spinner states — deferred to Phase 233

**Decision:** Phase 232 covers **server-side event emission only**. Frontend loading-state events (every async operation that triggers a spinner: agent processing, token exchange in progress, MCP tool execution, PingOne API in-flight, step-up MFA challenge, CIBA polling, HITL consent waiting, session refresh) are deferred to Phase 233.

**Rationale:** UI events require a frontend-to-BFF POST endpoint and changes to all loading state handlers in the React SPA — a separate concern from server-side instrumentation. Phase 233 already covers enrichment/expansion; UI events fit naturally there.

---

### D-03: New categories — authorize and agent_prompt

**Decision:** Add two categories to `EVENT_CATEGORIES` in `appEventService.js`:
- `authorize` — for PingOne Authorize gate decisions (allow/deny with policy context)
- `agent_prompt` — for LLM prompt submissions, agent reasoning steps, tool selection

**Files to instrument:**
- `banking_api_server/routes/authorize.js` → emit `authorize` events on gate allow/deny
- `banking_api_server/services/bankingAgentLangGraphService.js` → emit `agent_prompt` events on each LLM invocation and tool call

---

### D-04: Instrumentation coverage — audit and fill server-side gaps

**Decision:** As part of Phase 232, audit which token exchange, MCP, and PingOne API call sites currently do NOT call `logEvent`, and add instrumentation to fill the gaps. This is scoped to server-side paths only.

**Known gaps to check:**
- `routes/tokenChain.js` — token exchange flows
- `routes/oauth.js` — OAuth callback, token refresh
- `banking_mcp_server/` — MCP tool dispatch
- `services/agentMcpTokenService.js`, `agentTokenService.js` — agent token acquisition
- `services/cibaService.js` — CIBA request events
- `services/delegationService.js` — delegation chain events

**Approach:** Add `logEvent` calls at key decision points (success and failure). Don't instrument every line — focus on: request received, PingOne API called, result (success/fail with reason).

---

### D-05: ActivityLogs UI — no changes needed

**Decision:** `ActivityLogs.js` already polls `/api/admin/app-events` every 10 seconds and renders all event categories with icons, severity badges, and flow grouping. New events from Phase 232 instrumentation will appear automatically. No UI changes required in this phase.

**Exception:** If the `authorize` or `agent_prompt` category icons/labels are missing from `CATEGORY_ICONS` / `CATEGORY_LABELS` in `ActivityLogs.js`, add those two entries only.

---

## Out of Scope (Phase 232)

- UI loading/spinner state events → Phase 233
- Token payload decoding in log entries → Phase 233
- Log rotation / file size management
- Redis stream persistence (already handled by `auditLogService.js` for kill events)
- New UI tabs or views for the new event types

---

## Key Files

| File | Role |
|------|------|
| `banking_api_server/services/appEventService.js` | Add file persistence + 2 new categories |
| `banking_api_server/routes/authorize.js` | Add authorize gate event emission |
| `banking_api_server/services/bankingAgentLangGraphService.js` | Add agent_prompt event emission |
| `banking_api_server/routes/tokenChain.js` | Fill token exchange instrumentation gaps |
| `banking_api_server/routes/oauth.js` | Fill OAuth event gaps |
| `banking_api_ui/src/components/ActivityLogs.js` | Add category icons for authorize + agent_prompt only |
| `banking_api_server/logs/activity.ndjson` | New append-only log file (created at runtime) |
