# Phase 148: Redesign AI Agent chat UI — compact layout, grouped chips, visible prompt field — Context

**Gathered:** April 14, 2026
**Status:** Ready for planning

<domain>
## Phase Boundary

Redesign the BankingAgent chat interface to be more compact and information-dense while maintaining full functionality. The redesign focuses on:
- Grouping action buttons (chips) into thematic categories for clarity
- Collapsing chip groups by default to maximize chat area
- Making the prompt input field more prominent and accessible
- Condensing message spacing to display more conversation history
- Rendering as an inline split-column layout (like the middle agent mode) for dashboard integration

**Scope:** UI/UX improvements to the left and right columns of BankingAgent component
**Out of scope:** New functionality, agent capabilities, backend changes
</domain>

<decisions>
## Implementation Decisions

### D-01: Chip Grouping Strategy — By Category
Action buttons grouped into three semantic categories:
- **Account Operations:** My Accounts, Check Balance, View Sensitive Account Details
- **Transaction Operations:** Recent Transactions, Deposit, Withdraw, Transfer
- **Admin:** MCP Tools, Log Out

Rationale: Users naturally think in task categories. This grouping mirrors banking UI patterns (Chase, Wells Fargo, etc.) and reduces cognitive load when searching for an action.

### D-02: Compact Chip Layout — Collapsible Emoji Buttons
- Each category displays as a collapsible header (Account ▼, Transaction ▼, Admin ▼)
- Chips shown as emoji-only buttons (e.g., 🏦, 💰, 📋) when expanded
- No text labels on chips to maximize compactness
- Titles appear on hover (title attribute)
- Category headers remain visible; clicking header toggles expansion

### D-03: Inline Column Rendering — Split Layout
- Render as inline split-column layout matching the middle agent mode (established design pattern)
- Left column: Grouped collapsible chips + auth button (if applicable)
- Right column: Chat messages + prompt input
- On dashboard: Uses CSS Grid layout similar to middle-dock right-dock modes (token | banking | agent)
- Maintains consistency with Phase 147 (middle/right agent implementations)

### D-04: Prompt Field Visibility — Pinned & Prominent
- Input field pinned to bottom of agent column (never scrolls out of view)
- Visual prominence increased:
  - Larger font size relative to messages
  - Distinct border or background color to draw focus
  - Placeholder text suggests action ("Ask about accounts, transfers, etc.")
- Input always visible even when scrolled up in chat history

### D-05: Message Display — Condensed Density
- Reduce line-height in messages (e.g., 1.3x instead of 1.5x)
- Slightly smaller font size for message text (maintain readability)
- Tighter vertical padding between messages
- Result: More messages visible on screen, but still clear and readable

### D-06: Collapsible Groups — Smart Defaults & Persistence
- Default state on first load: Account group expanded, Transaction and Admin groups collapsed
- User can toggle any group open/closed
- State persisted in localStorage under key: `ba_chip_groups_state` (JSON: `{ "account": true, "transaction": false, "admin": false }`)
- Persisted state restored on page reload
- Applies to all placement modes (inline, middle, right-dock, bottom-dock)

### the Agent's Discretion
- Specific emoji choices for each chip (e.g., account = 🏦 vs 💼) — recommended to use banking/finance standard emojis but agent can adjust for visual balance
- Exact condensed font sizes/line-heights — agent may fine-tune based on visual testing to maintain readability
- Hover tooltip text — can be refined based on UX feedback
</decisions>

<canonical_refs>
## Canonical References

Downstream agents MUST read these before planning or implementing.

### Agent Component Structure
- [banking_api_ui/src/components/BankingAgent.js](banking_api_ui/src/components/BankingAgent.js) — Main agent component; contains ACTIONS array (lines ~85-95), ba-body rendering (line ~2657), ba-left-col and ba-right-col structure (lines ~2860, ~3060)
- [banking_api_ui/src/components/BankingAgent.css](banking_api_ui/src/components/BankingAgent.css) — Agent styling; inline column layout patterns (search `.ba-mode-inline`, `.ba-split-column`); message display styles (`.banking-agent-messages`, `.ba-message-*`)

### Layout Patterns — Reference for Split-Column Design
- [banking_api_ui/src/components/UserDashboard.js](banking_api_ui/src/components/UserDashboard.js) — Inline agent rendering for middle/right modes (lines ~1900-2000); demonstrates split-column grid layout
- [banking_api_ui/src/components/UserDashboard.css](banking_api_ui/src/components/UserDashboard.css) — Grid layout CSS; `.ud-body--dashboard-split3` et al. show column structure for reference

### Prior Phase — Left-Dock Removal (context for placement modes)
- [148-ROADMAP.md entry - Phase 147](../../ROADMAP.md#phase-147) — Removed left-dock placement; keep this phase's design aligned with remaining modes (inline, middle, right-dock, bottom-dock, float)

### Theme & Styling Context
- [banking_api_ui/src/context/ThemeContext.js](banking_api_ui/src/context/ThemeContext.js) — Theme colors (light/dark mode); use for condensed message display colors
- [banking_api_ui/src/context/IndustryBrandingContext.js](banking_api_ui/src/context/IndustryBrandingContext.js) — Banking brand palette; useful for emoji/icon color consistency

</canonical_refs>

<code_context>
## Existing Code Insights

### BankingAgent Component Structure
The agent currently has:
- **ACTIONS array** (9 items): Flat list of all action buttons with emoji, label, and description
- **ba-left-col** (line ~2860): Renders action buttons as vertical stack; currently uses `.ba-action-item` className
- **ba-right-col** (line ~3060): Renders chat messages + messages container + input form

### Split-Column Patterns Established
From Phase 147 (middle/right agent) and UserDashboard:
- `.ba-mode-inline.ba-split-column` selector shows how inline agents are styled
- `.ud-body--dashboard-split3` CSS pattern shows 3-column grid layout (token | banking | agent)
- Inline agents use flexbox column layout with flex shrink/grow controls

### Message Display
- Messages currently in `.banking-agent-messages` container (flex column, flex: 1, overflow-y auto)
- Message styles: `.ba-message-user` and `.ba-message-assistant` classes
- No existing condensed/compact density styles — will need new CSS variants

### localStorage Patterns in Codebase
Agent already uses localStorage:
- `embeddedAgentFabVisibility.js` checks `localStorage` for agent FAB state
- EmbeddedAgentDock.js stores dock height and collapsed state in localStorage
- Pattern: Try-catch around localStorage access, graceful fallback

### Collapsible/Expandable Patterns
No existing collapsible chip groups. Will need to add:
- State management (React useState for each group, or single object)
- Toggle handler (onClick on header)
- CSS `.is-collapsed` or `.is-expanded` classes for styling

</code_context>

<specifics>
## Specific Ideas & References

### Action Button Categories (ACTIONS Array reorganization)
Current flat list should be reorganized as:

```javascript
// Account Operations
{ id: 'accounts', label: '🏦 My Accounts', ... }
{ id: 'balance', label: '💰 Check Balance', ... }
{ id: 'sensitive-account-details', label: '👁 View Sensitive Account Details', ... }

// Transaction Operations
{ id: 'transactions', label: '📋 Recent Transactions', ... }
{ id: 'deposit', label: '⬇ Deposit', ... }
{ id: 'withdraw', label: '⬆ Withdraw', ... }
{ id: 'transfer', label: '↔ Transfer', ... }

// Admin
{ id: 'mcp_tools', label: '🔧 MCP Tools', ... }
{ id: 'logout', label: '🚪 Log Out', ... }
```

### Chase.com Reference
User intends this to match Chase's approach — compact sidebar with action groupings and collapsible sections. Verify against Chase's online banking UI if reference images are available.

### Inline Column Consistency
The redesigned agent should visually match the existing middle agent (inline on dashboard) — same grid proportions, same spacing, same responsive behavior.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 148-redesign-ai-agent-chat-ui-compact-layout-grouped-chips-visible-prompt-field*
*Context gathered: April 14, 2026*
