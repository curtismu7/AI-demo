# Phase 185: Token Color Legend + Consistent Color Coding - Context

**Gathered:** 2026-04-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Apply consistent 🔴 Subject / 🔵 Actor / 🟢 MCP token-type color coding across ALL token display components in the app, and add a visible color legend explaining what the circles mean.

</domain>

<decisions>
## Implementation Decisions

### Color System
- **D-01:** Three token types: Subject (red), Actor/Agent (blue), MCP/Gateway (green)
- **D-02:** Use CSS-rendered colored dots (not emoji) for consistent sizing across platforms — except DecodedTokenPanel which already has emoji and can keep them
- **D-03:** Colors already established in TokenDisplay.css: Subject=#dc2626, Actor=#2563eb, MCP=#16a34a

### Legend
- **D-04:** Add a shared TokenColorLegend component that can be rendered inline wherever tokens appear
- **D-05:** Legend shows all three colored dots with labels: "🔴 Subject Token", "🔵 Actor/Agent Token", "🟢 MCP/Gateway Token"

### Token Chain Display
- **D-06:** Add colored dot before each event label in TokenChainDisplay EventRow based on token type
- **D-07:** Token type derived from event.id and event.tokenType (user-token → subject, agent-actor-token → actor, exchanged-token → mcp)

### Scope
- **D-08:** Components to update: TokenChainDisplay.js, TokenDisplay.jsx, token inspector pop-out window (inside TokenChainDisplay.js openInNewWindow)
- **D-09:** DecodedTokenPanel already done (has colored headers + emoji) — no changes needed
- **D-10:** Education components (ActorTokenEducation) — defer to separate phase, not critical path

### Claude's Discretion
- Legend exact styling (compact inline bar vs small floating widget)
- Whether to add legend to PingOneTestPage as well

</decisions>

<specifics>
## Specific Ideas

- User said "keep these colors throughout the app any time we show a token"
- User said "we need a ledger telling everyone what these balls mean"
- The colored dots should be small circle indicators, not large badges

</specifics>

<canonical_refs>
## Canonical References

No external specs — requirements are fully captured in decisions above.

### Existing implementations
- `banking_api_ui/src/components/DecodedTokenPanel.jsx` — Already has deriveTokenType() and color-coded headers
- `banking_api_ui/src/components/TokenDisplay.css` — Has the three color variant CSS classes
- `banking_api_ui/src/components/TokenChainDisplay.js` — EventRow, TokenInspectorPanel, openInNewWindow
- `banking_api_ui/src/components/TokenDisplay.jsx` — Raw token decoder component

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `deriveTokenType(label)` in DecodedTokenPanel.jsx — derives subject/actor/mcp from label string
- `.token-display-header--subject/actor/mcp` CSS classes in TokenDisplay.css — color definitions
- `event.tokenType` in TokenChainDisplay — already has token type on events
- `event.id` values: 'user-token' (subject), 'agent-actor-token' (actor), 'exchanged-token' (mcp)

### Established Patterns
- Dark theme throughout (backgrounds #0f172a, #1e293b)
- Badge/pill pattern used extensively in token chain and test page
- Token chain uses `tcd-` CSS prefix, decoded panels use `decoded-` prefix

### Integration Points
- TokenChainDisplay EventRow — prepend colored dot to event label
- TokenChainDisplay openInNewWindow() — add dot to HTML template
- TokenDisplay.jsx header — add dot similar to DecodedTokenPanel
- New shared TokenColorLegend component imported where needed

</code_context>

<deferred>
## Deferred Ideas

- Education components (ActorTokenEducation) color coding — separate phase if needed
- Agent chat inline token messages — too deep in chat rendering, defer

</deferred>

---

*Phase: 185-token-color-legend*
