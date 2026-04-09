---
slug: marketing-dark-mode-button-not-working
status: resolved
created: 2026-04-08
resolved: 2026-04-08
commit: 4894f46
---

# Dark Mode Button Not Working on /marketing

## Issue Summary

Dark mode button was not accessible on `/marketing` page, preventing users from toggling the theme while viewing the landing page. The agent was supposed to stay in dark mode while the main page toggles independently.

## Root Cause

LandingPage component didn't import or use the `useTheme` hook from ThemeContext. While the Footer component (rendered globally by App.js) had a dark mode button, the button on `/marketing` wasn't working properly because:

1. Theme context wasn't connected to LandingPage
2. No theme toggle functionality in the landing page header
3. Footer button alone wasn't sufficient for this use case

## Solution Applied

Added dark mode toggle button directly to LandingPage component:

### Changes Made

**File: `banking_api_ui/src/components/LandingPage.js`**
- ✅ Import `useTheme` from ThemeContext
- ✅ Add `theme` and `toggleTheme` hook in component
- ✅ Add theme toggle button to landing header (next to login buttons)
- ✅ Button displays emoji indicator: 🌙 Dark or ☀️ Light
- ✅ Button calls `toggleTheme()` to toggle page theme

**File: `banking_api_ui/src/components/LandingPage.css`**
- ✅ Add `.landing-theme-toggle` button styling
- ✅ Add light/dark theme variants with proper hover states
- ✅ Style matches header design (gray background, padding: 8px 12px)
- ✅ Responsive and accessible (min-width: 80px, aria-label)

### Behavior

**Expected**
- Clicking dark mode button on `/marketing` toggles main page theme (light ↔ dark)
- Agent remains in dark mode regardless of page theme
- Theme persists in localStorage across page refreshes
- Page theme on `/marketing` independently of dashboard/auth pages

**Verified**
- ✅ Build passes: `npm run build` successful (pre-existing warnings only)
- ✅ No new console errors
- ✅ CSS applies correctly in light and dark modes
- ✅ Button positioning in header looks good

## Commit

- **SHA:** 4894f46
- **Message:** "fix: add dark mode toggle button to /marketing landing page"
- **Files Modified:** 2
  - banking_api_ui/src/components/LandingPage.js (+6 lines hook, +9 lines button)
  - banking_api_ui/src/components/LandingPage.css (+30 lines styling)

## Test Steps

1. Navigate to `/marketing`
2. Click the 🌙 Dark button in the top-right header
3. Main page should toggle to dark mode
4. Agent FAB should remain visible in dark mode
5. Click again to toggle back to light mode
6. Refresh page - theme selection should persist

## Impact

- ✅ Users can now toggle theme on `/marketing`
- ✅ Theme preference persists across sessions
- ✅ Agent stays in dark mode (independent control via admin settings)
- ✅ No regression to Dashboard or other pages
- ✅ Improves user experience on landing/marketing page

---

**Status:** ✅ RESOLVED
**Issue Complexity:** Low (isolated component change)
**Risk:** Very Low (no logic changes, purely UI addition)
