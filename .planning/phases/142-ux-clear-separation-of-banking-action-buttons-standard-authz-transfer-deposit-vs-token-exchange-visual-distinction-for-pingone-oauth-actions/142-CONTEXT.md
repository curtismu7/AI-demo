# Phase 142: UX clear separation of banking action buttons — Context

**Gathered:** 2026-04-13  
**Status:** Ready for planning  
**Source:** Interactive discuss-phase  

---

## Phase Boundary

This phase introduces **visual and functional separation** between:
1. **Standard banking actions** (Transfer, Deposit, Withdraw) — use standard OAuth tokens + PingOne OTP/MFA
2. **Agent-mediated actions** (future Phase 143) — use token exchange for new user token scoped to agent

This phase implements the **standard action side only**. Agent buttons and flows are deferred to Phase 143.

---

## Decisions

### D-01: Agent action color — Blue gradient
- Agent actions (future) will use a distinct **blue gradient** (not red)
- Rationale: Creates clear visual category separation; blue is professional/trustworthy for delegated actions
- Standard actions remain red (current design)

### D-02: Text labeling for agent actions — "Agent" prefix
- Agent action buttons will read **"Agent Transfer"**, **"Agent Deposit"**, **"Agent Withdraw"**
- Rationale: Clear, explicit language; user immediately understands delegation
- Use same button size/padding as standard actions

### D-03: Agent action icon — Sparkle (✨)
- Agent buttons will include a **sparkle/star icon (U+2728, ✨)** 
- Placement: TBD in planning (likely prefix or inline with text)
- Rationale: Indicates AI/automated capability without cluttering the interface

### D-04: Standard action stripe pattern — Diagonal stripes, moderate opacity
- Standard buttons (Transfer, Deposit, Withdraw) will display **thin diagonal stripes (left-to-right)** over their existing red gradient
- Opacity: **20-30% visible** through the gradient (clearly distinctive but not overwhelming)
- Rationale: Distinguishes "established/standard" category from future "agent" category
- Pattern rendered via CSS (repeating-linear-gradient overlay or ::before pseudo-element)

### D-05: Authorization pending state — Status text + spinner + combination styling
- When button is in authorization/validation state:
  - Button text changes to **"Verify your identity..."** (user-facing, friendly)
  - Inline spinner element displays inside the button (visual feedback)
  - Button disabled: **opacity 50% + grayscale filter + cursor: not-allowed**
  - Combination effect: Multi-signal that action is pending
- Rationale: User-friendly language + strong visual feedback = high confidence

### D-06: Unauthenticated state — Disabled with tooltip
- When user is not logged in, Transfer/Deposit/Withdraw buttons:
  - **Disabled** (not hidden)
  - Display **tooltip on hover: "Log in to transfer funds"**
  - Not clickable; no error flow triggered
- Rationale: Educates user about requirement without hiding capability

### D-07: Button locations — Both table AND separate cards
- Standard actions available in **two locations**:
  - Inline action buttons in Account Management **table rows** (if table row includes action column)
  - Separate **cards/panels below the table** (Transfer, Deposit, Withdraw cards) — current location
- Rationale: Supports both quick inline actions and detailed forms
- Phase 142 applies styling to both locations consistently

### D-08: Agent button visibility — Always visible (side-by-side)
- Once Phase 143 deploys agent buttons alongside standard buttons:
  - Both **standard and agent versions shown together** in each location
  - No toggle to hide agent buttons
  - User can choose which flow to use
- Rationale: Shows pattern evolution (standard → agent augmentation) transparently
- **Phase 142 scope:** Standard buttons only; Phase 143 will add agent buttons

---

## the agent's Discretion

- **Icon placement specifics** — Prefix, suffix, inline, or overlay — planner will determine best UX
- **Stripe rendering technique** — CSS patterns library, canvas, SVG, or canvas-based approach — researcher will evaluate
- **Hover state enhancements** — What additional feedback on hover? Planner will decide
- **Error states for auth failures** — How to display when PingOne auth times out or fails? Planner will coordinate with Phase 143
- **Accessibility** — ARIA labels, screen reader cues for disabled state — planner/implementer will ensure compliance
- **Mobile responsiveness** — Button sizing and spacing on small screens — implementer will handle

---

## Deferred Ideas

- **Search/filter by action type** — User preference to show only agent actions or only standard actions (potential future phase)
- **Action history filtering** — Show which actions were performed by user vs agent (separate analytics phase)
- **Batch actions** — Multi-select and perform actions on multiple accounts (future phase)
- **Custom action labels** — Allow users to rename buttons (future customization phase)

---

## Canonical References

No external specifications or ADRs for this phase.

**Relevant code already in place:**
- [banking_api_ui/src/components/UserDashboard.js](banking_api_ui/src/components/UserDashboard.js) — Transfer, Deposit, Withdraw form components
- [banking_api_ui/src/components/UserDashboard.css](banking_api_ui/src/components/UserDashboard.css) — Current button styles (transfer-btn, deposit-btn, withdraw-btn)
- [banking_api_ui/src/components/Accounts.js](banking_api_ui/src/components/Accounts.js) — Account table (if row actions added)

**Related phases:**
- Phase 141 (Local setup wizard) — May interact with auth state
- Phase 143 (Agent banking actions via MCP) — Will add agent button variants using these decisions

---

## Specifics

**Current button styling baseline** (to be enhanced, not replaced):
- Red gradient: `linear-gradient(180deg, var(--app-primary-red-mid) 0%, var(--app-primary-red) 100%)`
- Padding: `12px 20px`
- Border radius: `6px`
- Font: `0.875rem, weight 500`
- Hover: Darker gradient + transition 0.2s ease

**Phase 142 adds:**
- Diagonal stripe overlay (20-30% opacity, thin pattern)
- Disabled state styling (opacity + grayscale when unauthenticated)
- Authorization pending state (spinner + status text + combined disabled styling)
- Standard button presence in Account Management table (if applicable)

---

*Phase 142 context — Ready for research and planning.*
