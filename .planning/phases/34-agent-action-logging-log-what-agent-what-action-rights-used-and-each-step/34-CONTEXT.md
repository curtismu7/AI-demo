---
phase: 34
title: Agent Action Logging
created: 2026-04-03
---

# Phase 34 Context — Agent Action Logging

## Goal

Extend the Phase 32 `AuditLogger` stub into a real, persistent audit pipeline. Every MCP tool invocation should be logged with full agent identity, rights used, and step detail — visible in a new `/admin` audit panel and stored in Upstash Redis.

---

## Decisions

### D-01: Where logs live
**Both** — server-side (Upstash Redis, durable) AND surfaced in the browser as a live audit feed in `/admin`.

Implication: The MCP server's `AuditLogger` writes to Upstash Redis. The BFF's `/api/mcp/audit` proxy (already exists) reads from Redis via the MCP server's `/audit` HTTP endpoint. The admin UI polls or fetches from `/api/mcp/audit`.

### D-02: What's captured per log entry
**All fields** — capture everything:
- `eventId`, `timestamp`
- Agent identity: `agentId` (from `act.sub` claim), `userId` (from `sub` claim)
- Action: `operation` (tool name), `resourceType`, `resourceId`
- Rights: `scope` (scopes on the token used), `tokenType` (`agent` / `user` / `exchanged`)
- Step detail: `requestSummary` (sanitized tool input params), `responseSummary` (outcome summary, not raw response)
- `outcome` (`success` / `failure` / `partial`)
- `duration` (ms, latency)
- `errorCode`, `errorMessage` (on failure)

Note: No raw token values ever logged. Scope strings and claim values (`sub`, `act.sub`) are safe to log.

### D-03: UI presentation
**New `/admin` panel section** — add an "Agent Audit Log" tab or section to the existing admin dashboard (`/admin` route). Should show:
- Paginated/scrollable list of recent entries (newest first)
- Each row: timestamp, agent ID, tool name, outcome badge, duration
- Expandable row detail: full rights (scopes), userId, requestSummary
- Filter controls: by outcome, by tool name, by agent ID
- Live refresh (manual "Refresh" button or short poll interval)

### D-04: Retention + storage
**Upstash Redis** — use the existing Upstash Redis connection (already used for sessions via `express-session`). Store audit entries as a Redis List (`LPUSH` / `LTRIM` for bounded list, e.g. last 500 entries) or as a Sorted Set keyed by timestamp.

Key: `mcp:audit:events` (list, most-recent-first via `LPUSH` + `LTRIM 0 499`).
TTL: entries expire after 7 days (or use `EXPIRE` on the list key).

Implication: The Upstash `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` env vars already exist for sessions — the MCP server needs them added as env vars on Render too.

### D-05: Relationship to Phase 32 AuditLogger
**Extending** — Phase 32 created `AuditLogger.ts` with the right interface but `queryAuditLogs()` and `generateAuditSummary()` return stubs (empty array / zeros). This phase:
1. Wires `logBankingOperation()` / `logAuthentication()` etc. to `LPUSH` into Upstash
2. Implements `queryAuditLogs()` to `LRANGE` from Upstash with filtering
3. Extends `AuditEvent` schema with `scope`, `tokenType`, `requestSummary`, `responseSummary`
4. The MCP server `/audit` HTTP endpoint (on `HttpMCPTransport`) becomes real (currently forwards to the stub)
5. The BFF `/api/mcp/audit` proxy and the new Admin UI panel consume it

---

## Scope Boundaries

**In scope:**
- Upstash Redis write + read in `AuditLogger.ts`
- Extend `AuditEvent` schema with `scope`, `tokenType`, `requestSummary`, `responseSummary`
- MCP server `/audit` HTTP endpoint returns real Redis data
- New admin panel UI section: "Agent Audit Log" tab on `/admin`
- Render env vars: add `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`

**Out of scope (future phases):**
- Real-time WebSocket push to UI (polling is fine for now)
- Alerting / anomaly detection on audit events
- Per-user audit log access (non-admin views)
- Export to CSV / external SIEM

---

## Technical Notes

- Upstash Redis REST client (`@upstash/redis`) is likely already in `banking_api_server` — check if MCP server needs it added to `package.json`
- `requestSummary`: sanitize by stripping `password`, `secret`, `token` fields from tool input params before logging
- The existing `mcpAudit.js` BFF route already supports `?limit=`, `?eventType=`, `?outcome=`, `?since=`, `?summary=1` — the Admin UI can use these directly
- Admin panel lives in `banking_api_ui/src/components/` — likely a new `AgentAuditLog.js` component rendered inside the existing admin dashboard

---

## Files Likely Touched

| File | Change |
|------|--------|
| `banking_mcp_server/src/utils/AuditLogger.ts` | Implement Redis write/read in all log methods + queryAuditLogs |
| `banking_mcp_server/src/interfaces/config.ts` | Add `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` env vars |
| `banking_mcp_server/package.json` | Add `@upstash/redis` dependency (if not present) |
| `banking_mcp_server/src/server/HttpMCPTransport.ts` | Wire `/audit` endpoint to real `AuditLogger.queryAuditLogs()` |
| `banking_api_ui/src/components/AgentAuditLog.js` | New admin panel component |
| `banking_api_ui/src/pages/AdminDashboard.js` (or similar) | Add AgentAuditLog tab/section |
