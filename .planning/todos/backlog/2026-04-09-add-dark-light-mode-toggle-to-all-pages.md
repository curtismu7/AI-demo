---
created: 2026-04-09T01:35:04.401Z
title: Add dark/light mode toggle to all pages
area: ui
files:
  - banking_api_ui/src/components/LandingPage.js:45-55
  - banking_api_ui/src/components/LandingPage.css
  - banking_api_ui/src/context/ThemeContext.js
  - banking_api_ui/src/components/Footer.js:20-32
---

## Problem

Dark mode toggle button only works on some pages (Dashboard, Demo-data). The /marketing landing page now has a working dark mode button, but other pages may not have consistent dark/light mode support. Users cannot toggle theme everywhere they need to, reducing usability.

## Solution

Audit all pages and ensure they have:
1. ThemeContext hook connected (useTheme)
2. Dark mode toggle button in header/toolbar accessible to users
3. Proper CSS styling for both light and dark themes
4. Persistence via localStorage (already handled by ThemeContext)

Pages to check/update:
- LandingPage (/marketing) - ✅ DONE (commit 4894f46)
- Dashboard (/dashboard) - VERIFY works
- Admin Dashboard (/admin) - VERIFY works
- SetupPage (/setup) - CHECK if needed
- Config page (/config) - VERIFY works
- Demo-data page (/demo-data) - VERIFY works
- Any other public-facing pages

### Implementation Notes

- Agent theme (agentAppearance) should be independently controllable from page theme
- Don't couple page theme toggle to agent theme
- Use consistent button styling (emoji indicator + text or just emoji)
- Ensure accessibility (aria-label, title attribute)
- Test in both light and dark modes
