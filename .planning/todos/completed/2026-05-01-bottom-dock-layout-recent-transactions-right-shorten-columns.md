---
created: 2026-05-01T00:00:00Z
title: Bottom-dock layout — move Recent Transactions right, shorten columns to reveal agent
area: ui
files:
  - banking_api_ui/src/components/UserDashboard.js
  - banking_api_ui/src/components/UserDashboard.css
---

## Problem

When the Banking Agent is in **bottom-dock** mode the customer dashboard layout has two problems:

1. **Recent Transactions is in the left column** — but in bottom-dock the left column and right column are stacked vertically, and Recent Transactions is long, pushing the bottom agent off-screen. It should move to the right column (or a secondary position) so Accounts appears prominently and the page is shorter.

2. **Columns are too tall** — the content columns are so long that the bottom-docked agent panel is hidden below the fold. Users have to scroll down just to see the chat. The columns need a max-height or the layout needs to be reorganized so the agent is visible without scrolling.

## Solution

In `dashboardLayout === "classic"` (bottom-dock mode):
- Move "Recent Transactions" section to the right column (after Accounts summary), or reduce its row count (show only 5 rows) to shorten the page
- Cap the main content area height (e.g. `max-height: calc(100vh - <dock-height>)`) OR apply a class like `.ud-layout--bottom-dock` that constrains column heights
- The bottom dock should be visible on first load without any scrolling

Check `UserDashboard.js` for `dashboardLayout` usage and the column/section rendering logic.
