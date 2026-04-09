---
created: 2026-04-09T01:35:04.401Z
title: Verify and finish incomplete implementation work
area: planning
files:
  - banking_api_ui/src/components/DemoDataPage.js
  - banking_api_ui/src/components/UserDashboard.js
  - banking_api_ui/src/components/LandingPage.js
---

## Problem

Recent session made several changes that need verification and completion:
1. AgentUiModeToggle removed from DemoDataPage.js - needs build verification
2. Dark mode button added to /marketing - needs end-to-end testing 
3. Potential other unfinished work identified during session

These incomplete items could cause regressions or unfinished features.

## Solution

Complete verification checklist:

### Phase 109: Remove Agent Layout Buttons from Demo-Data Page
- [x] Remove AgentUiModeToggle import from DemoDataPage.js (commit 306047c)
- [x] Remove AgentUiModeToggle section from template
- [x] Remove unused useAgentUiMode hook
- [ ] Verify DemoDataPage builds cleanly
- [ ] Test that demo-data page no longer has agent layout controls
- [ ] Confirm AgentUiModeToggle still works on UserDashboard toolbar

### Dark Mode Button on /marketing
- [x] Add useTheme hook to LandingPage.js
- [x] Add dark mode toggle button to header
- [x] Add CSS styling for button
- [x] Verify build passes (commit 4894f46)
- [ ] Manual test: dark mode button works on /marketing
- [ ] Manual test: agent stays dark regardless of page theme
- [ ] Manual test: theme persists across page refresh
- [ ] Manual test: no regressions on other pages

### General Verification
- [ ] Run `npm run build` clean with no new errors
- [ ] Test full demo flow: /marketing → login → /dashboard
- [ ] Check console for errors in both light and dark modes
- [ ] Verify theme toggle doesn't affect agent rendering on dock

## Next Steps

After verification, any remaining issues should be:
1. Logged as separate todos for specific fixes
2. Added to regressions/bugs list if they break existing functionality
3. Scheduled for Phase 109-112 work if they're UI polish
