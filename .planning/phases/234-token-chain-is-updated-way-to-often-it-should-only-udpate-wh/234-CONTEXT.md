# Phase 234: Token-chain update frequency guard - Context

**Gathered:** 2026-04-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Reduce unnecessary token-chain updates so token-chain fetch/update behavior only runs when the active UI route has a token-chain surface.

In scope:
- Route-aware gating for token-chain update polling and refresh triggers
- Keep token-chain behavior unchanged on routes that actually render token-chain

Out of scope:
- Redesigning token-chain UI
- Changing token event semantics or backend token generation
</domain>

<decisions>
## Decisions

### D-01: Route-scoped updates only
Token-chain update polling and auto-refresh must run only when the current route includes a token-chain UI surface.

### D-02: No regression on token-chain pages
On token-chain routes, behavior remains functionally equivalent (data still appears and refreshes during normal user flows).

### D-03: Minimal diff
Implement as a focused gating change in existing UI update paths; avoid unrelated refactors.

### Claude's Discretion
- Exact route list and helper shape
- Whether to centralize route matching in a utility module
- Exact listener strategy for route change detection
</decisions>

<specifics>
## Specific Ideas

- Current issue: global provider-level polling in TokenChainContext runs after auth even when user is on non-token-chain pages.
- Candidate token-chain routes include dashboard/agent routes and inspector route(s).
</specifics>

<deferred>
## Deferred Ideas

- Broader token-chain architecture changes
- Server-side throttling as a replacement for UI route gating
</deferred>

---

*Phase: 234-token-chain-is-updated-way-to-often-it-should-only-udpate-wh*
*Context gathered: 2026-04-26*
