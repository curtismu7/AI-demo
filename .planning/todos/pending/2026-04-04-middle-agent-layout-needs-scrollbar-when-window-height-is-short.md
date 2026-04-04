---
created: 2026-04-04T12:29:02.037Z
title: Middle agent layout needs scrollbar when window height is short
area: ui
files:
  - banking_api_ui/src/components/UserDashboard.js:1396
  - banking_api_ui/src/components/BankingAgent.js
---

## Problem

In the middle (split3) agent layout, the agent column (`ud-agent-column`) does not scroll
when the browser window is vertically short. The chip buttons, chat history, and input area
get clipped or overflow outside the visible area — the user cannot reach the bottom of the
agent panel without resizing the window.

Observed in the screenshot showing the agent in middle layout: chips like "Token introspection
(RFC 7662)" are cut off at the bottom, suggesting the agent column has no `overflow-y: auto`
or the inner chat container lacks a constrained height + scroll.

## Solution

In the `ud-agent-column` CSS class (or the `BankingAgent` container rendered inside it),
ensure the agent column:

1. Has a defined max-height (e.g. `height: 100%` or `calc(100vh - <header height>)`)
2. Sets `overflow-y: auto` so a scrollbar appears when content overflows vertically
3. The inner scrollable region should be the chip area + chat messages area — NOT the input
   bar (the input bar should stay pinned at the bottom)

Pattern to follow:
```css
.ud-agent-column {
  overflow: hidden;          /* prevent column itself from overflowing grid */
  display: flex;
  flex-direction: column;
}

.banking-agent-inner {       /* or whatever wraps chips + messages */
  flex: 1;
  overflow-y: auto;
  min-height: 0;             /* critical for flex children to scroll */
}

.banking-agent-input-bar {   /* input always visible at the bottom */
  flex-shrink: 0;
}
```

The `min-height: 0` on the scrollable flex child is the most commonly missed part — without
it, flex items don't respect parent height constraints and overflow silently.

Also check: does `BankingAgent.js` set `overflow: hidden` anywhere on its root div that
might prevent the column from scrolling?
