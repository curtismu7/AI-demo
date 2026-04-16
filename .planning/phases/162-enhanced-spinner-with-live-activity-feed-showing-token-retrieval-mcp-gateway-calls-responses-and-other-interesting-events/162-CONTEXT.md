# Phase 162: Enhanced Spinner with Live Activity Feed — Context

**Gathered:** 2026-04-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Enhance the existing full-screen spinner overlay to show a live scrolling activity feed of interesting server events (token retrieval, MCP gateway calls, OAuth redirects, responses) while the spinner is visible. Instead of showing only a single static message and endpoint, the spinner becomes a window into what the system is doing in real-time. Uses the existing `appEventService` (Phase 161) as the backend data source and the existing `spinnerService` imperative singleton pattern.

</domain>

<decisions>
## Implementation Decisions

### Area 1: Activity Feed Layout
- **D-01:** Add a scrollable activity feed below the existing spinner ring and message inside the `lo-card`. The card grows taller to accommodate up to ~6 visible event lines, with auto-scroll to newest.
- **D-02:** Each event line shows: category icon (🔑🔄💾🛡️🤖), timestamp delta (e.g., "+0.2s"), and a short message. Compact single-line format, monospace font for consistency.
- **D-03:** Keep the existing spinner ring, contextual message, and endpoint chip at the top. The activity feed is an additive enhancement below them.
- **D-04:** Activity feed only appears when there are events to show. Empty state = current spinner behavior (no feed section visible).

### Area 2: Event Source & Delivery
- **D-05:** Use client-side polling (short interval, ~2s) of the existing `/api/admin/app-events?since={timestamp}` endpoint while the spinner is visible. No SSE/WebSocket needed — the spinner is transient and polling is simpler.
- **D-06:** Poll only while the spinner is actively visible (start on spinner show, stop on spinner hide). No background polling overhead when spinner is hidden.
- **D-07:** Also capture client-side interceptor events (which API call is in-flight) to supplement server events — these show immediately without polling delay.

### Area 3: Event Content & Filtering
- **D-08:** During spinner display, show ALL event categories from appEventService (oauth, token_exchange, session, jwks, mcp, auth_lifecycle). No filtering — the point is to show everything interesting that's happening.
- **D-09:** Keep events brief in the spinner feed — full message only, no expandable metadata (that's for the ActivityLogs page). Truncate long messages to ~80 chars.
- **D-10:** Show events that arrived since the spinner became visible (not historical). Fresh events only per spinner session.

### Area 4: Transition from Current Spinner
- **D-11:** This is an enhancement to the existing `SpinnerHost.js` / `LoadingOverlay.css`, not a replacement. The spinner ring + message + endpoint chip stays exactly as-is.
- **D-12:** No feature flag needed — the activity feed is purely additive. If no events arrive during a spinner session, the user sees the exact same spinner as before.
- **D-13:** The activity feed service (`spinnerActivityService`) is a new thin client-side module that manages polling lifecycle and event collection, consumed by SpinnerHost.

### Claude's Discretion
- Exact styling of event lines (colors, spacing, font size)
- Animation for new events appearing (fade-in vs instant)
- Maximum events to retain in the spinner feed buffer (suggest ~20)
- Whether the feed auto-scrolls or stays at top

</decisions>

<canonical_refs>
## Canonical References

### Spinner Infrastructure
- `banking_api_ui/src/services/spinnerService.js` — Imperative singleton (increment/decrement, API_MESSAGES map, SPINNER_QUIPS, subscribe/notify pattern)
- `banking_api_ui/src/components/shared/SpinnerHost.js` — React portal rendering lo-backdrop > lo-card
- `banking_api_ui/src/components/shared/LoadingOverlay.css` — Full spinner overlay styles (z-200000, dark backdrop)
- `banking_api_ui/src/context/SpinnerContext.js` — React context bridging spinnerService to components

### Backend Event Service (Phase 161)
- `banking_api_server/services/appEventService.js` — In-memory ring buffer, logEvent(), getEvents({ since }), EVENT_CATEGORIES
- `banking_api_server/routes/admin.js` — GET /api/admin/app-events (requires admin auth + banking:admin scope)

### Existing UI Consumer
- `banking_api_ui/src/components/ActivityLogs.js` — Already fetches /api/admin/app-events with polling

</canonical_refs>

<code_context>
## Existing Code Insights

### spinnerService Pattern
- `spinner.increment(method, url)` / `spinner.decrement(isError)` called from apiClient interceptors
- `spinner.subscribe(fn)` for React bridge — returns unsubscribe function
- State: `{ visible, message, color, endpoint }`
- Debounce 200ms before showing, min display 1500ms

### appEventService API
- `getEvents({ category, severity, limit, since })` — returns events newest-first
- Events have: id, timestamp, category, severity, message, tag, metadata, flowId, username
- Categories: oauth, token_exchange, session, jwks, mcp, auth_lifecycle

### Key Constraint
- The /api/admin/app-events endpoint requires admin auth. The spinner activity feed should only poll when the user is an admin. For non-admin users, the spinner shows the current behavior (no feed).

</code_context>

<deferred>
## Deferred Ideas
- WebSocket/SSE real-time event streaming (polling is sufficient for spinner)
- Persistent event history across spinner sessions
- Event filtering in the spinner feed
- "Show MCP request and response metadata in token chain display" (separate todo, different UI surface)
</deferred>
