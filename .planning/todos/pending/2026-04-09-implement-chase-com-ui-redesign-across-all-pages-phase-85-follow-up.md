---
created: 2026-04-09T13:45:00.000Z
title: Implement Chase.com UI redesign across all pages (Phase 85 follow-up)
area: ui
files:
  - .planning/phases/85-chase-dashboard-styling/STYLE_AUDIT.md
  - banking_api_ui/src/styles/index.css
  - banking_api_ui/src/components/UserDashboard.css
  - banking_api_ui/src/components/dashboard/
---

## Problem

Phase 85 completed a comprehensive audit mapping all colors/styles to Chase.com design, but implementation never happened (Plans 02-03 never ran). Only `/marketing` was manually updated. All other pages still use old Tailwind blue colors.

**Current State:**
- ✅ /marketing — has new Chase navy UI
- ❌ /dashboard, /accounts, /transactions, /admin, /settings, /configure — ALL have old blue UI
- ❌ No end-to-end feature testing with new UI applied

**Color Migration Required:**
- Primary Blue (#1e40af, #2563eb) → Navy (#004687)
- Text colors → Dark gray (#333333)
- Backgrounds → White #FFFFFF, light gray (#F5F5F5)
- No gradients (solid colors only)

**Phase 85 Audit Created:**
- `.planning/phases/85-chase-dashboard-styling/STYLE_AUDIT.md` (433 lines)
- 14-entry color mapping table
- 11 CSS files identified for modification
- 3 component files identified
- HIGH/MEDIUM/LOW priority order
- Implementation roadmap ready

## Solution

**Implementation Strategy** (use Phase 85 audit + Phase 113 framework):

1. **Foundation (Plan 1):** CSS variables
   - Create `--color-primary-navy: #004687`
   - Create `--color-text-dark: #333333`
   - Replace all color declarations with variables
   - Update `index.css`, global styles

2. **High Priority (Plan 2):** Visual impact components
   - Hero header: gradient → solid navy
   - Buttons: gradients → solid navy + hover
   - Dashboard background & primary text
   - 3-5 files modified

3. **Medium Priority (Plan 3):** Component styling
   - Card styling (standardized padding/radius)
   - Navigation active states
   - Account cards
   - Mobile dashboard colors

4. **Testing & Polish (Plan 4):** Verification
   - E2E testing each page: /dashboard, /accounts, /transactions, /admin, /settings, /configure
   - Mobile responsive check
   - Accessibility verification (WCAG AA already confirmed in Phase 85)
   - Build verification

5. **Feature Testing (Plan 5):** Functionality QA
   - Test all features work with new UI applied
   - Sign-in flow, transactions, MFA, agent, etc.
   - No regression in functionality

**Reference:** See `.planning/phases/85-chase-dashboard-styling/STYLE_AUDIT.md` for exact colors, files, and implementation order.

**Effort Estimate:** 4-5 plans, ~2-3 hours total. Phase 85 audit removed the guesswork.
