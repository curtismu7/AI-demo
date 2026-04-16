# Phase 164 — Context: Performance Evaluation and Optimization

## Domain

Performance evaluation and optimization — diagnose slow spinners, long API waits, and overall responsiveness.

## Decisions

### D-01: Hybrid Polling Fix (LOCKED)
**Strategy:** Deduplicate + short TTL cache for auth endpoints, event-driven invalidation on login/logout/token-refresh. Kill the ~120 req/min polling firehose but keep data fresh enough for MCP.

**Implementation details:**
- Route all auth status calls (`/api/auth/oauth/status`, `/api/auth/oauth/user/status`, `/api/auth/session`) through `cachedStatusService.js` (already has 3s TTL + in-flight dedup)
- `sessionResolver.js` currently bypasses the cache intentionally — update comment and route through cache
- Call `clearStatusCache()` on `login`, `logout`, and `tokenRefreshed` events to prevent stale authenticated/unauthenticated state across transitions
- Slow `AgentFlowDiagramPanel.js` `setInterval` from 3s to 10-15s (token chain only changes during active agent operations)
- **Safe because:** BFF pattern means UI never sends access tokens directly — session cookie handles auth. `getTokenFromSession()` only called from tests, not production code.

### D-02: Timing Instrumentation (LOCKED)
**Target:** < 5 seconds for any request path end-to-end.
- Add server-side timing instrumentation (request start/end, LLM call duration, token exchange duration)
- Add UI-side timing (spinner start to content render)
- Show timing data in spinner activity feed
- Some slowness acceptable given LLM + OAuth + MCP pipeline — but expose the data so we can see where time goes

### D-03: SQLite Fix as Pre-Req (LOCKED)
**Approach:** Fix admin.js:769 SyntaxError and SQLite READONLY_DBMOVED before any Phase 164 optimization work. These blockers prevent testing. Handle as first task in Phase 164 (not a separate phase).

### D-04: Hybrid Measurement Approach (LOCKED)
**Approach:** Fix blockers first → add timing instrumentation → fix polling storm. Use instrumentation data to validate the polling fix actually improved things.

## Deferred Ideas

None.

## Claude's Discretion

- Exact cache TTL value (3s from existing `cachedStatusService` is fine, or adjust based on instrumentation data)
- Whether to add a visible perf overlay/dev-tools panel or just console/activity-feed output
- `AgentFlowDiagramPanel` poll interval (10s or 15s — either fine)
- Session-preview endpoint dedup strategy (similar to auth status, but separate concern)

## Code Context

### Polling Storm Root Cause (from codebase scout)
7+ independent callers hit auth/token endpoints causing ~120 req/min on idle dashboard:

| Caller | File | Endpoint(s) | Pattern |
|--------|------|-------------|---------|
| App.js `checkOAuthSession` | App.js:252-264 | 3 auth endpoints | Mount + retry loop |
| UserDashboard `fetchUserData` | UserDashboard.js:157-161 | 2 auth endpoints | Independent mount |
| Dashboard `fetchDashboard` | Dashboard.js:259-266 | 2 auth endpoints | Mount |
| sessionResolver | sessionResolver.js:14-16 | 3 auth endpoints | `Promise.allSettled`, intentionally uncached |
| TokenChainDisplay | TokenChainDisplay.js:968-1020 | `/api/tokens/session-preview` | Mount + `userAuthenticated` event, 5s cooldown |
| AgentFlowDiagramPanel | AgentFlowDiagramPanel.js:139 | `/api/token-chain/current` | 3s `setInterval` while panel visible |
| BankingAgent | BankingAgent.js:1097-1098 | 2 auth endpoints | On agent init |
| apiClient `getTokenFromSession` | apiClient.js:155-161 | 2 auth endpoints | Tests only (not production) |

### Existing Infrastructure
- `cachedStatusService.js`: 3s TTL cache + in-flight request dedup — exists but auth endpoints bypass it
- `clearStatusCache()`: Already exported, clears all cached responses — exists but not wired to login/logout events
- `spinnerActivityService.js`: Activity feed for spinner events — can show timing data
- BFF pattern: `getValidToken()` returns null, cookies handle auth — safe to cache status responses

### Server Blockers
- `admin.js:769`: SyntaxError "missing ) after argument list" — prevents server startup
- SQLite `SQLITE_READONLY_DBMOVED`: Session store can't write — prevents login persistence
