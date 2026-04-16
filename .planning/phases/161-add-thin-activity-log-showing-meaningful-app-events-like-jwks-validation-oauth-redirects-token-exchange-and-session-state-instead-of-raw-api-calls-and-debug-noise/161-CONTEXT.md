# Phase 161: Add Thin Activity Log — Context

**Gathered:** 2026-04-15
**Status:** Ready for planning

<domain>
## Phase Boundary

Replace raw API call noise and debug `console.log` output with a curated activity feed showing meaningful app-level events: JWKS validation, OAuth redirects, token exchange, session state changes, and MCP tool calls. The existing `/activity` admin page and `tokenChainService` provide the foundation — this phase adds structured server-side event capture and an improved UI presentation.

</domain>

<decisions>
## Implementation Decisions

### Event Selection
- **D-01:** Include these meaningful events: JWKS validation (cache hit/miss, key rotation), OAuth redirects (authorize URL generation, callback receipt), token exchange (RFC 8693 subject/actor exchanges), session state changes (save success/failure, DBMOVED reconnect), MCP tool calls (tool invocation, result), login/logout lifecycle events.
- **D-02:** Exclude raw polling noise: `/api/tokens/session-preview`, `/api/auth/oauth/user/status`, `/api/admin/config`, `/api/auth/session`, `/api/auth/oauth/status` — these are high-frequency polling endpoints that produce no meaningful signal.
- **D-03:** Capture events server-side via a lightweight `appEventService` that replaces scattered `console.log('[tag]...')` calls with structured event objects (timestamp, category, severity, message, metadata).

### Display Location
- **D-04:** Enhance the existing `/activity` admin page (`ActivityLogs.js`, 584 lines) to show curated app events instead of (or alongside) the current raw admin activity logs.
- **D-05:** No new dashboard widget in this phase — keep focus on the dedicated activity page. Widget can be a future phase.

### Event Formatting
- **D-06:** Timeline presentation with category icons (🔑 OAuth, 🔄 Token Exchange, 💾 Session, 🛡️ JWKS, 🤖 MCP Agent) and severity levels (info, warning, error).
- **D-07:** Group related events by flow when possible — e.g., "Login Flow: PKCE → Redirect → Callback → Token → Session Save" shown as a collapsible group rather than 5 separate entries.
- **D-08:** Each event expandable to show metadata (token claims excerpt, error details, timing).

### Audience
- **D-09:** Admin-only — keep behind existing `AdminRoute` gate. This is educational/demo content for understanding the OAuth/identity flows, not end-user facing.

### Claude's Discretion
- Event retention policy (in-memory ring buffer size, cleanup interval)
- Exact icon/color choices for event categories
- Whether to add a filter dropdown for event categories on the activity page
- Internal data structure for the `appEventService`

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing Event Infrastructure
- `banking_api_server/services/tokenChainService.js` — In-memory token event tracking (223 lines), event types: auth/exchange/refresh/revoke
- `banking_api_server/services/securityMonitoringService.js` — Server-side audit trail with `logSecurityEvent()`
- `banking_api_server/services/adminAuditService.js` — Admin action audit logging
- `banking_api_server/services/oauthService.js` — Token exchange console.log patterns to replace (lines ~180-800)

### Existing UI
- `banking_api_ui/src/components/ActivityLogs.js` — Current admin activity logs page (584 lines), fetches from `/api/admin/activity`
- `banking_api_ui/src/services/apiTrafficStore.js` — Client-side ring buffer for raw API traffic (the "noise" to move away from)

### Session/Auth Event Sources
- `banking_api_server/services/sqliteSessionStore.js` — Session save/fail/reconnect events
- `banking_api_server/services/authStateCookie.js` — Cookie-based session restoration events

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `tokenChainService.js`: Already tracks token events in-memory with `Map()` per user — pattern to extend for general app events
- `securityMonitoringService.logSecurityEvent()`: Structured event logging pattern with `writeExchangeEvent()`
- `ActivityLogs` component: Full paginated admin page with filters — can be enhanced rather than rebuilt
- `apiTrafficStore.js`: Ring buffer pattern with localStorage persistence and subscriber notification

### Established Patterns
- In-memory `Map()` storage with per-user event arrays (tokenChainService pattern)
- `console.log('[tag] message')` convention throughout BFF — these tagged logs ARE the events to capture
- Subscriber/notification pattern in `apiTrafficStore.js` for real-time UI updates

### Integration Points
- Server: New `appEventService` hooks into existing `console.log` call sites in `oauthService.js`, `sqliteSessionStore.js`, `authStateCookie.js`, `server.js` JWKS validation paths
- API: New endpoint (or extend `/api/admin/activity`) to serve curated events
- UI: Enhance `ActivityLogs.js` component to display curated events with timeline formatting
- Route: `/activity` already registered in `App.js` line 548 behind `AdminRoute`

</code_context>

<specifics>
## Specific Ideas

- The phase title explicitly calls out: JWKS validation, OAuth redirects, token exchange, and session state as the key event types
- "Instead of raw API calls and debug noise" — the goal is signal-over-noise, not comprehensive logging
- The `[tag]` pattern in existing console.log calls (e.g., `[oauth/user/callback]`, `[TokenExchange]`, `[sqlite-session-store]`) maps naturally to event categories

</specifics>

<deferred>
## Deferred Ideas

- Dashboard widget showing recent activity events inline
- End-user facing activity log (simplified version for regular users)
- Persistent event storage (currently in-memory is fine for demo)
- WebSocket real-time event streaming to UI

</deferred>

---

*Phase: 161-add-thin-activity-log*
*Context gathered: 2026-04-15*
