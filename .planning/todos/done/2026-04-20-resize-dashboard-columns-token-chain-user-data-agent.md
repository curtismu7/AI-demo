---
created: 2026-04-20T00:00:00.000Z
title: Resize dashboard columns - token chain, user data, and agent positioning
area: ui
files:
  - banking_api_ui/src/components/BankingAgent.js
  - banking_api_ui/src/components/Dashboard.js
  - banking_api_ui/src/components/Dashboard.css
  - banking_api_ui/src/pages/AdminDashboard.css
---

## Problem

The dashboard layout has narrow user data sections on the right side, and the column widths are not optimal for the information hierarchy. Specifically:
- User data panel is too narrow to display information clearly
- Token chain visualization should be twice as large relative to the side menu
- Users cannot resize the 3 main columns (token chain, user data, and right/middle agent) to customize their workflow

## Solution

Implement resizable columns in the dashboard layout:
- Make the 3 main columns draggable/resizable with a resize handle between each
- Set default proportions so token chain is ~2× the side menu width
- Persist user's column width preferences (localStorage or session store)
- Ensure responsive behavior on smaller screens (stack columns or constrain min/max widths)
- Smooth animations when resizing, no jank or reflow issues

This improves UX for power users who want to focus on specific data (large token chain for debugging, large user data for inspection, large agent for interaction).
