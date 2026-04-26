# Phase 224: token-audit-trail-and-decoder - Context

**Gathered:** 2026-04-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Add two new tabs to the existing Dev Tools Dashboard floating panel:
1. **Audit Trail** — timestamped list of operations (token acquisitions, MCP tool calls, auth events) with colored scope/context badges; each entry is clickable for expanded detail
2. **Token Decoder** — side-by-side decoded JWT claim columns for each token currently in the chain (actor token, subject/user token, MCP/resource server tokens)

This phase does NOT add new backend endpoints or change the token exchange flows. It is a read-only display layer over existing data that is already captured (TokenChainContext events, apiCallTrackerService, token-chain API).

</domain>

<decisions>
## Implementation Decisions

### Click-through Detail Interaction
- **D-01:** Audit trail entries expand **in-place** (inline expand below the row) — same pattern as TestCard on MFA/authz-test pages. No modal, no side pane.
- **D-02:** On expand, show **decoded JWT claims** for any token produced by that operation — reuse `DecodedTokenPanel.jsx` directly.
- **D-03:** Expanded state is per-row (multiple rows can be open simultaneously).

### Preserved User Requirement
- **D-04:** Click-into-for-more-detail behavior must be present — this was explicitly requested and is non-negotiable.

### Claude's Discretion
- **Where it lives:** Add as two new tabs (`audit` and `decoder`) inside the existing `DevToolsDashboard.jsx`. This reuses FloatingPanel, the tab bar pattern, and keeps everything in one floating panel. No new floating panel or page needed.
- **Audit Trail data source:** Source from `TokenChainContext` events (token acquisitions per tool call) as the primary feed. Augment with `apiCallTrackerService` session data if available. Badge labels derived from token category (actor/subject/mcp) and scope claims.
- **Token Decoder column layout:** Horizontal scrollable columns — one column per token currently in `displayEvents` from `TokenChainContext`. Reuse `DecodedTokenPanel.jsx` per column. If only one token exists, single-column view. Keep columns narrow enough to show 2-3 at once without horizontal scroll on typical screen width.
- **Badge color system:** Reuse `deriveTokenCategory` from `TokenColorSystem` (already imported in `DecodedTokenPanel.jsx`) to match existing red/blue/green actor/subject/mcp color semantics.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing Components to Extend/Reuse
- `banking_api_ui/src/components/DevToolsDashboard.jsx` — existing 3-tab floating panel; add 2 new tabs here
- `banking_api_ui/src/components/DecodedTokenPanel.jsx` — single-token decoded JWT view; reuse per column in Token Decoder and per expand in Audit Trail
- `banking_api_ui/src/components/TokenColorSystem.js` (or `.ts`) — `deriveTokenCategory` for badge colors
- `banking_api_ui/src/context/TokenChainContext.js` — `useTokenChainOptional()` hook, `displayEvents`, `history`

### Similar Pattern References (read for TestCard expand pattern)
- `banking_api_ui/src/components/MFATestPage.jsx` — TestCard expand-in-place pattern for request/response
- `banking_api_ui/src/components/AuthzTestPage.jsx` — `PingOneCallDebug` component, inline expand pattern

### Regression Guard
- `REGRESSION_PLAN.md` §1 — read before touching DevToolsDashboard, TokenChainDisplay, or BankingAgent

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `DecodedTokenPanel.jsx`: Accepts `{ decoded: { header, payload }, label }`. Renders color-coded sections for identity claims, scopes, timing, raw JSON. Has tooltip glossary for RFC claims. Ready to embed.
- `DevToolsDashboard.jsx`: Tab bar + FloatingPanel pattern is clean. Adding a new tab requires: adding entry to `TABS` array, adding a `display: activeTab === "X" ? "flex" : "none"` panel block.
- `deriveTokenCategory(label)`: Returns `"actor" | "subject" | "mcp" | null` — drives red/blue/green badge colors.
- `useTokenChainOptional()`: Returns `{ events, history, displayEvents, sessionTokenEvent, resolvedIdentity }` — no auth required.

### Established Patterns
- **Tab add pattern:** `TABS` array + conditional `display` on each panel block (all panels mounted, CSS-toggled for state preservation).
- **Expand-in-place:** Row has `onClick` to toggle `expanded` boolean state; expanded section renders below using conditional render or CSS height transition.
- **Scope badge:** `decoded-scope-badge` CSS class already in `TokenDisplay.css` — reuse for audit trail scope badges.

### Integration Points
- `DevToolsDashboard.jsx` imports from `TokenChainContext` indirectly (via `TokenChainDisplay` and `UnifiedTokenFlowInspector`). New tabs can call `useTokenChainOptional()` directly.
- `apiCallTrackerService` data is fetched via `ApiCallDisplay` component (session-based, already used on authz-test page). Audit trail can optionally pull from same endpoint.

</code_context>

<specifics>
## Specific Ideas

- User showed screenshots with: colored context badges (Partner Agent / Org Management / Notifications), timestamped entries like `createOrganization`, `Tools Discovery`, `Session Initialize`
- Token Decoder screenshot showed side-by-side columns: PARTNER ACTOR | PARTNER SUBJECT | ORGMGMT TOKEN | NOTIFY TOKEN with highlighted fields (scope, may_act, act, sub)
- These map to: Audit Trail ← token acquisition events + MCP tool calls; Token Decoder ← current `displayEvents` from TokenChainContext rendered as columns

</specifics>

<deferred>
## Deferred Ideas

- Persistent audit log across sessions (localStorage or BFF endpoint) — currently in-memory only
- Filtering/search within audit trail — future enhancement
- Token diff view (show what changed between token acquisitions) — future phase

</deferred>

---

*Phase: 224-token-audit-trail-and-decoder*
*Context gathered: 2026-04-24*
