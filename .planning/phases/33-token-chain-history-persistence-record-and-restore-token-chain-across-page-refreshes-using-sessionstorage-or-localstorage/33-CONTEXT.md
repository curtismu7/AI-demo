# Phase 33: Token Chain History Persistence - Context

**Gathered:** 2026-04-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Persist the `TokenChainContext` history (array of per-call token chain snapshots) across page refreshes using localStorage, so users can navigate away or refresh and return to see the full OAuth flow visualization from their current browser session.

This phase does NOT change the token chain display UI beyond what is needed for persist/restore. It also folds in the "sub claim display" enhancement (D-04).

</domain>

<decisions>
## Implementation Decisions

### Storage
- **D-01:** Use **localStorage** (not sessionStorage). History survives tab close and browser restart until explicitly cleared.
- Storage key: `tokenChainHistory` (or similar — agent's discretion on exact key name, keep consistent with existing `agentDisplayMode` / `agentAsyncToolMode` pattern)
- Cap at 20 entries to match existing in-memory limit in `setTokenEvents`

### What to Persist
- **D-02:** Persist **`history[]` only**. The `events` state (current call view) resets to empty on page load — restoring stale "current" events would be confusing.
- On mount, hydrate `history` from localStorage. `events` starts as `[]` as usual.

### Clear on Logout
- **D-03:** **Clear persisted history on logout.** Token chain data is session-scoped; stale entries from a prior user would be misleading. Wire into the existing logout path.

### Sub Claim Display (folded todo)
- **D-04:** Surface the `sub` claim as the User ID and `act`/agent ID in the token chain display and education panels. This todo (score=0.7) is folded into Phase 33 since it touches the token chain event objects and display.
  - `sub` → displayed as "User ID" in token event rows
  - `act.sub` → displayed as "Agent ID" in delegated token event rows
  - Update wherever token events are rendered (TokenChainPanel, BankingAgent inline messages)

### Agent's Discretion
- Exact localStorage key name (follow `camelCase` pattern from Config.js)
- Serialization format (JSON.stringify/parse is standard)
- Whether to debounce writes to localStorage (avoid thrashing on rapid tool calls)
- Error handling for localStorage quota errors (silent catch + warn is fine)

</decisions>

<specifics>
## Specific Ideas

- Existing localStorage pattern: `Config.js` uses `localStorage.getItem(KEY) || default` in `useState` initializer — same pattern for `TokenChainProvider`
- The `setTokenEvents` method already slices to 20 entries: `prev.slice(0, 19)` — persistence should respect this same cap
- On logout, clear the localStorage key (not the entire localStorage — scoped clear only)

</specifics>

<canonical_refs>
## Canonical References

### Token Chain Context
- `banking_api_ui/src/context/TokenChainContext.js` — The context provider to modify. Has `history`, `events`, `setTokenEvents`, `clearEvents`. No persistence today.

### Existing localStorage pattern
- `banking_api_ui/src/components/Config.js` — Reference pattern for localStorage in this codebase (lines ~172-250: DISPLAY_MODE_KEY, ASYNC_UX_MODE_KEY)

### Logout path
- `banking_api_ui/src/App.js` — Locate the `logout` function / logout handler to wire the clear-on-logout behavior

### Token chain display (sub claim targets)
- Search `banking_api_ui/src/components` for `TokenChainPanel` — renders token event rows where `sub` / `act.sub` should be surfaced

No external specs — requirements fully captured in decisions above.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `TokenChainContext.js` (`history`, `setTokenEvents`, `clearEvents`) — modify in place; add localStorage hydration on mount and write-through on each `setTokenEvents` call
- `Config.js` localStorage pattern — direct reuse: `useState(() => JSON.parse(localStorage.getItem(KEY) || '[]'))`

### Integration Points
- `App.js` logout handler — add `localStorage.removeItem(TOKEN_CHAIN_HISTORY_KEY)` call
- Wherever token events are rendered for `sub` / `act.sub` labels — `TokenChainPanel.js` (find and update)

### Established Patterns
- localStorage writes happen in event handlers / setters, not in effects
- Keys are `camelCase` strings defined as module-level constants

</code_context>

<deferred>
## Deferred Ideas

- Reviewed todos not folded: all other matched todos (score < 0.7 or unrelated to token chain) remain in backlog
- Cross-tab sync (e.g., BroadcastChannel for localStorage changes) — not in scope
- Server-side history persistence — not in scope; client-only

</deferred>
