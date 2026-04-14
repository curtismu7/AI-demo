# Phase 147: Get rid of left agent. Keep the rest — Context [CORRECTED]

**Gathered:** April 14, 2026  
**Corrected:** April 14, 2026  
**Status:** Ready for planning

<domain>
## Phase Boundary

Remove **left-dock placement mode** as a valid agent positioning option. The left-dock mode places the agent in the left sidebar, where it conflicts with dashboard sidebar buttons. Users can still access the agent via inline (`/agent` route), float (FAB), bottom-dock, right-dock, and side-dock modes.

**Remove:** 'left-dock' as a valid placement value in AgentUiModeContext + any left-dock-specific styling/logic

**Keep:** The ba-left-col (left column) inside the agent component itself. All functionality stays (action buttons, suggestions, auth controls). Only the left-dock placement mode is removed.

**Result:** Agent cannot be placed in left sidebar, preventing conflicts with dashboard buttons. Agent remains fully featured in all other modes.

</domain>

<decisions>
## Implementation Decisions

### Placement Mode Removal
- **D-01:** Remove 'left-dock' from valid placement options in `AgentUiModeContext.js`
  - Current valid values: 'middle', 'bottom', 'left-dock', 'right-dock', 'none' (and variants)
  - After: 'middle', 'bottom', 'right-dock', 'none' (remove 'left-dock')
  - No mode-specific CSS/logic for left-dock rendering; clean removal

### BA-Left-Col Preservation
- **D-02:** Keep ba-left-col (left column) across ALL remaining modes
  - Action buttons (login/logout/refresh) stay
  - Suggestion chips stay
  - All existing functionality preserved
  - Left column appears in: inline, float, bottom-dock, right-dock, side-dock modes

### CSS/UI Logic Cleanup
- **D-03:** Remove left-dock-specific CSS rules and conditionals
  - Delete `.ba-left-col` rules that apply only when `ba-mode-left-dock` is active
  - Delete media queries or layout adjustments specific to left-dock placement
  - Keep all ba-left-col rules that apply to other modes
  - Scope: ~20-50 lines of left-dock-specific CSS (much less than original estimate)

### Test Updates
- **D-04:** Remove/update e2e test selectors that reference left-dock mode
  - Remove test cases that verify left-dock behavior
  - Keep test cases for other modes (inline, float, bottom-dock, right-dock)

</decisions>

<canonical_refs>
## Canonical References

Downstream agents MUST read these before planning or implementing.

### Agent Placement Configuration
- [banking_api_ui/src/context/AgentUiModeContext.js](banking_api_ui/src/context/AgentUiModeContext.js) — Defines valid placement modes; 'left-dock' is on line ~9
- [banking_api_ui/src/components/BankingAgent.js](banking_api_ui/src/components/BankingAgent.js) — Main component; contains conditionals/classNames for mode rendering (search `ba-mode-` for all mode checks)

### Styling
- [banking_api_ui/src/components/BankingAgent.css](banking_api_ui/src/components/BankingAgent.css) — Stylesheet; search for `.ba-mode-left-dock` and `left-dock` rules to remove

### Related Tests (e2e)
- [banking_api_ui/tests/e2e/banking-agent.spec.js](banking_api_ui/tests/e2e/banking-agent.spec.js) — May reference left-dock mode tests
- [banking_api_ui/tests/e2e/banking-agent.real.spec.js](banking_api_ui/tests/e2e/banking-agent.real.spec.js) — May reference left-dock mode tests

### Dashboard Sidebar (Context for why removal needed)
- [banking_api_ui/src/components/ChaseTopNav.js](banking_api_ui/src/components/ChaseTopNav.js) — Dashboard sidebar with buttons that conflict with left-dock agent placement

</canonical_refs>

<code_context>
## Existing Code Insights

### AgentUiModeContext Structure
AgentUiModeContext defines the valid placement modes as a list. 'left-dock' entry needs to be removed from this array.

### BankingAgent Mode Rendering
BankingAgent likely has conditionals like:
- `ba-mode-${placement}` className pattern
- Possibly mode-specific rendering logic or CSS classes applied based on placement value

### CSS Mode-Specific Rules
BankingAgent.css likely has patterns like:
- `.ba-mode-left-dock { ... }` — layout rules specific to left-dock mode
- `.ba-mode-left-dock .ba-left-col { ... }` — column styling for left-dock
- Media queries or responsive breakpoints that adjust left-dock behavior

### No Dead Code
Unlike the original scope, this change does NOT create dead code. The left-col functionality stays; only the placement option is removed.

</code_context>

<specifics>
## Specific Implementation Notes

- **Single point of truth:** AgentUiModeContext.js is the primary source of truth. Removing 'left-dock' from there cascades constraints to component logic.
- **CSS search strategy:** Search BankingAgent.css for `left-dock` and `.ba-mode-left-dock` to identify all removal targets.
- **Test strategy:** Search test files for `left-dock`, `left-dock` references, and remove those test cases.
- **Graceful fallback:** If existing code tries to set placement='left-dock' after this phase, it should fallback to a default (likely 'middle' or 'bottom').

</specifics>

<deferred>
## Deferred Ideas

None — scope is narrow and focused on placement mode removal.

</deferred>

---

*Phase: 147-get-rid-of-left-agent-keep-the-rest*  
*Actual Scope: Remove left-dock placement mode (not remove left column)*  
*Context gathered: April 14, 2026*  
*Corrected: April 14, 2026*
