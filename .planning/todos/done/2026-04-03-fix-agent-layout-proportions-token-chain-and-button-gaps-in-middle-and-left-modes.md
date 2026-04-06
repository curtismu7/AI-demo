---
created: 2026-04-03T15:08:12.075Z
title: Fix agent layout proportions, token chain and button gaps in middle and left modes
area: ui
files:
  - banking_api_ui/src/components/UserDashboard.css:106-130
  - banking_api_ui/src/components/UserDashboard.css:134-160
  - banking_api_ui/src/components/UserDashboard.css:1963-2000
  - banking_api_ui/src/components/UserDashboard.js:1387-1450
  - banking_api_ui/src/components/BankingAgent.css
  - banking_api_ui/src/components/EmbeddedAgentDock.js
---

## Problem

Multiple layout issues observed across the "left/float" and "middle/split3" agent placement modes. Seen in screenshots during phase 09 UAT:

### Issue 1: Left mode — agent panel is under the quick-action buttons instead of beside them

In the left (floating) placement mode, the BankingAgent panel renders below the quick-action chips/buttons row rather than in the right-column space reserved for it. The right side of the page has large white space that is wasted. Root cause likely: the grid column for the agent (`minmax(160px, min(28vw, 280px))`) is too narrow, or the agent panel has `position: absolute/fixed` stacking under the buttons' z-index context.

### Issue 2: Left mode — agent panel is too narrow

Even accounting for the right-column slot, the agent panel feels too cramped. The current CSS uses `minmax(160px, min(28vw, 280px))` which maxes at 280px — not enough for an interactive chat panel. Should likely be at least 380–420px on a wide desktop.

### Issue 3: Middle mode — center banking content column is too wide relative to the agent column

In split3 (middle placement), `grid-template-columns: 1fr 1fr 1fr` gives equal thirds. The banking content column (center) is too wide and the agent column is too narrow to be usable for a chat interface. Suggested fix: `1fr 1.5fr 1fr` or `320px 1fr 400px` to give the agent more breathing room.

### Issue 4: Token chain is missing / not visible

TokenChainDisplay is present in the JSX at `UserDashboard.js:1392` and `:1420`, but it's not visible in the screenshots. In the left/float mode it's supposed to appear in the `.ud-left` column; in split3 it's in the first `ud-token-rail` column. Possible causes:
- z-index or overflow:hidden clipping it
- The `.ud-left` column `width: min(480px, 100%)` may be collapsing when the agent panel occupies the right slot
- TokenChainDisplay may be rendered but `display:none` or 0 height in the current layout

### Issue 5: Quick-action buttons have white space (gap) between them

The horizontal chip buttons in the agent action bar have visible spacing gaps between them. They were visually tight before — the gap was likely introduced by a `gap` or `margin` change in the flex container. Check `.agent-action-bar`, `.agent-chips`, or the button row in `BankingAgent.css`.

### Issue 6: Bottom placement agent is too short to be usable

`EmbeddedAgentDock` uses a persisted `dockHeight` (key: `embedded_agent_dock_height_px`). The default height appears to be too short — the chat interface is barely visible. The min-height or default stored height needs to be increased (suggest ≥ 360px default, prevent docking below 200px).

---

### Layout options to evaluate before fixing:

The three placement modes need a coherent responsive strategy. Options documented here for planning:

**Option A: Keep 1fr 1fr 1fr for middle, fix left-mode only**
- Pro: minimal change
- Con: middle/split3 agent column remains cramped at 1/3 viewport

**Option B: Middle = `max(360px, 30vw) 1fr max(380px, 32vw)` (token | content | agent)**
- Pro: agent gets ~380px regardless of viewport width; content gets remaining
- Con: on narrow screens (1024–1280px) the two fixed panels compress the center

**Option C: Middle = `260px 1fr 400px` with token rail hidden below 1280px**
- Pro: agent always 400px wide; token rail only shows on wide screens
- Con: token chain becomes harder to discover on smaller desktop

**Option D: Left float mode gets wide right column — `minmax(0,1fr) 420px`**
- Pro: agent has 420px; matches the existing iframe-width convention for agent panels
- Con: need to also fix z-index stacking so agent doesn't fall below button row

**Recommended:** Option B for middle, Option D for left/float.

## Solution

1. **Left/float mode (`ud-body--2026` without split3):**
   - Change the third grid column from `minmax(160px, min(28vw, 280px))` → `minmax(360px, 420px)` so the agent panel has enough width
   - Check and fix z-index: agent wrapper should stack above the quick-action bar, not below it
   - Ensure no `overflow: hidden` on the parent clips the agent

2. **Middle/split3 mode:**
   - Change `grid-template-columns: 1fr 1fr 1fr` → `minmax(240px, 260px) 1fr minmax(360px, 420px)` to give the agent meaningful width and let the center grow

3. **Token chain:**
   - Verify `.ud-left` column is still rendered in float mode with the wider agent column
   - Add `min-width: 240px` guard to `.ud-left` so it doesn't collapse
   - Check TokenChainDisplay render condition in `UserDashboard.js:1392`

4. **Button gaps:**
   - Inspect `.agent-chips` or the quick-action row flex container in BankingAgent.css
   - Remove any `gap` or `margin` added recently; replace with consistent small value if needed

5. **Bottom dock height:**
   - Set default `dockHeight` to `380` in `EmbeddedAgentDock.js` (was probably 240–280)
   - Add `minHeight` guard of `200` so the drag handle can't collapse it below usability
