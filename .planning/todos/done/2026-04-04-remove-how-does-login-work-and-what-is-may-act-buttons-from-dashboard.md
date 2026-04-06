---
created: 2026-04-04T12:30:36.992Z
title: Remove How does login work and What is may_act buttons from dashboard
area: ui
files:
  - banking_api_ui/src/components/UserDashboard.js:1285-1295
  - banking_api_ui/src/components/DemoDataPage.js:616-625
  - banking_api_ui/src/components/Dashboard.js:361-370
---

## Problem

The "How does login work?" and "What is may_act?" buttons appear directly on the dashboard
(and DemoDataPage). These are education shortcut buttons that open the relevant education
drawers, but they are redundant — the same education content is reachable from the hamburger
menu (≡) in the top-right corner of the page.

The buttons take up visible space on the dashboard and clutter the UI, especially in the
middle agent layout where vertical space is limited. In the screenshot they appear as two
large red buttons overlapping the header area.

## Solution

Remove the two buttons from all three locations:
- `UserDashboard.js` lines ~1285–1295 — the render block containing the two `<button>` elements
- `DemoDataPage.js` lines ~616–625 — same pattern
- `Dashboard.js` lines ~361–370 — same pattern

The education drawers they open ("How does login work?" → auth education, "What is may_act?" →
MayActPanel) remain fully accessible via the ≡ menu — no functionality is lost.

Before removing, confirm the ≡ menu has both entries (check `EducationBar.js` or `SideNav.js`
for menu item labels). If either entry is missing from the menu, add it there first, then
remove the duplicate buttons.
