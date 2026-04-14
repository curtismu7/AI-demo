# Phase 147: Get rid of left agent. Keep the rest — Context

**Gathered:** April 14, 2026
**Status:** Ready for planning

<domain>
## Phase Boundary

Remove the left column (`ba-left-col`) from the BankingAgent component across ALL rendering modes (inline, float, bottom-dock, left-dock, side-dock). The left column contains action chips, suggestion buttons, auth controls (login/logout/refresh), and "Learn more" educational dropdown.

**Keep:** Right column (chat messages + text input), left-dock sidebar placement itself, all agent modes.

**Result:** Chat-focused agent interface without side controls.

</domain>

<decisions>
## Implementation Decisions

### Removal Scope
- **D-01:** Remove `ba-left-col` (JSX div + all children) from **ALL modes** — inline `/agent`, float, bottom-dock, left-dock, right-dock, side-dock.
  - No mode-specific conditionals for left-col visibility.
  - Left-dock placement option itself remains (the sidebar container stays); only the agent's internal left column is removed.

### Relocated Functionality
- **D-02:** Move **suggestion chips** from left column to above the text input box.
  - Quick-pick row of suggestions appears above `ba-input-field`.
  - Discoverable while typing, always accessible.
  - Replaces left-column suggestion buttons.

### Action Buttons (Login, Logout, Refresh)
- **the agent's Discretion:** These button functions are dropped from the agent interface entirely. Users rely on:
  - Primary app navbar (ChaseTopNav, DashboardQuickNav) for logout/navigation
  - PingOne login flow if session expires
  - Session refresh happens via the BFF automatically on token expiry
  - No need to provide quick-access buttons within agent chat

### CSS Cleanup
- **D-03:** **Full cleanup** — delete all `ba-left-col` CSS rules from `BankingAgent.css`.
  - Remove `.ba-left-col` block rules (width, padding, layout)
  - Remove all mode-specific `.ba-left-col` rules (inline, bottom-dock, split-column, side-dock variants)
  - Scope: ~100-150 lines across multiple media queries and mode blocks
  - Result: Smaller stylesheet, no dead CSS

</decisions>

<canonical_refs>
## Canonical References

Downstream agents MUST read these before planning or implementing.

### Agent Layout + Components
- [banking_api_ui/src/components/BankingAgent.js](banking_api_ui/src/components/BankingAgent.js) — Main component; contains JSX for `ba-left-col` (line ~2860)
- [banking_api_ui/src/components/BankingAgent.css](banking_api_ui/src/components/BankingAgent.css) — Stylesheet; `ba-left-col` rules spread across file (lines 175-2400+)

### Related Tests (e2e)
- [banking_api_ui/tests/e2e/banking-agent.spec.js](banking_api_ui/tests/e2e/banking-agent.spec.js) — References `.ba-left-col .ba-action-item` (lines 175, 254)
- [banking_api_ui/tests/e2e/banking-agent.real.spec.js](banking_api_ui/tests/e2e/banking-agent.real.spec.js) — References `.ba-left-col` in locator (line 66)

### UI Mode Context
- [banking_api_ui/src/context/AgentUiModeContext.js](banking_api_ui/src/context/AgentUiModeContext.js) — Placement modes; confirms 'left-dock' is valid placement (line 9)

### Navigation
- [banking_api_ui/src/components/ChaseTopNav.js](banking_api_ui/src/components/ChaseTopNav.js) — Primary navbar (logout, navigation)
- [banking_api_ui/src/App.js](banking_api_ui/src/App.js) — Route mounting for `/agent` (line 547)

### Session/Auth
- [banking_api_server/routes/auth.js](../../../banking_api_server/routes/auth.js) — Session status, logout
- [banking_api_server/routes/oauthToken.js](../../../banking_api_server/routes/oauthToken.js) — Token refresh

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Input suggestions pattern:** The agent can reuse existing suggestion rendering (JSX .map over array). Code will move from ba-left-col section to above ba-input-field.

### Established Patterns
- **Chat header toolbar:** BankingAgent already has a header with close/minimize buttons. No new controls need to be added here (auth buttons are dropped per decision).
- **Input area layout:** The `ba-input-field` container is flexible; can accommodate suggestion chips above it.

### Integration Points
- **Suggestion state:** Already managed in component state via `suggestionList`, `sendAgentMessage()`. Move JSX rendering, keep logic unchanged.
- **Action buttons removed:** `handleActionClick()`, `handleLoginAction()` are only called from left-col JSX. Once JSX removed, these become dead code (mark for cleanup).
- **Test updates:** e2e tests reference `.ba-left-col .ba-action-item`; will need to be removed or rewritten if they depend on left-col existence.

</code_context>

<specifics>
## Specific Ideas

- **Suggestion row styling:** Compact horizontal chips, similar existing `.ba-suggestion` CSS rules. Adapt spacing to fit above textarea input.
- **Input area restructuring:** Minimal HTML change — wrap suggestions + input in a container if needed for flexbox layout. No new wrappers unless necessary for styling.
- **Mobile consideration:** On small screens, suggestion row may wrap. Ensure readable on phone/tablet (existing responsive rules should apply).

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 147-get-rid-of-left-agent-keep-the-rest*  
*Context gathered: April 14, 2026*
