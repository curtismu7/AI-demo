# Phase 85 Context: Chase Dashboard Styling

**Date:** 2026-04-07  
**Phase:** 85 — chase-dashboard-styling  
**Depends on:** Phase 84

---

## User Vision

Make the Super Banking demo dashboards visually match Chase.com's main page design language. The goal is to create a professional, modern banking UI that reflects real-world financial institution design patterns.

---

## Chase.com Visual Design Language

### Color Palette

| Element | Chase Color | Current Banking | Change Needed |
|---------|-------------|-----------------|---------------|
| Primary | Navy Blue (#004687 or #003DA5) | Variable (blue/red mix) | Standardize to Chase navy |
| Secondary | Lighter Blue (#0066CC or #0052A3) | Variable | Align secondary blue |
| Accent | White/Cream (#FFFFFF, #F5F5F5) | Current bg | Keep or lighten |
| Text | Dark Gray (#333333) | Current | Possibly darker for contrast |
| Borders | Light Gray (#E0E0E0) | Current | May need adjustment |
| Success | Green (#4CAF50 or Chase green) | Current | Verify match |
| Warning/Alert | Orange/Red | Current | Verify match |

### Typography

- **Headline font:** Sans-serif, bold (e.g., Arial, Segoe UI, -apple-system)
- **Body font:** Sans-serif, regular weight (e.g., Arial, Segoe UI, -apple-system)
- **Font sizes:** Hierarchical (h1 > h2 > h3 > body > small)
- **Line height:** 1.5-1.6 for readability
- **Letter spacing:** Standard (no extreme spacing)

### Layout & Components

| Component | Chase Style | Current | Changes |
|-----------|-------------|---------|---------|
| **Cards** | Rounded corners (4-8px), subtle shadow, padding 16-20px | May vary | Standardize radius, shadow, padding |
| **Buttons** | Rounded (4px), navy bg, white text, hover state darkens | May vary | Match Chase button styles |
| **Account tiles** | Card-based grid, 2-3 per row on desktop, 1 on mobile | Current layout | May need grid adjustment |
| **Header/Hero** | Gradient or solid blue bg, white text, clear hierarchy | Current | Align to Chase brand |
| **Sidebar** | Light gray bg, dark text, clear section breaks | Current | May need adjustment |
| **Modals/Dialogs** | White bg, rounded corners, close button top-right | Current | Verify consistency |
| **Forms** | Input borders, focus states with blue outline | Current | Match Chase interaction states |

### Spacing & Whitespace

- **Padding:** 16px, 20px, 24px (consistent rhythm)
- **Margins:** 16px, 20px, 24px (consistent rhythm)
- **Gap between elements:** 16px-20px
- **Card spacing:** 20px padding inside; 16-20px gap between cards

### Interactive States

| State | Chase Pattern |
|-------|---|
| **Hover** | Slightly darker bg or subtle shadow increase |
| **Focus** | Blue outline (2-3px), consistent across all elements |
| **Active** | Navy blue text/bg + underline or highlight |
| **Disabled** | Gray out (opacity ~0.5) |

---

## Current Banking UI Status

**Main Dashboard Components:**
- `UserDashboard.js` — Overall dashboard layout
- `Dashboard.js` — Dashboard wrapper
- `DashboardHero.js` — Top hero/header section
- `MobileDashboard.js` — Mobile-specific layout
- `DashboardLayoutToggle.js` — Layout switcher (grid/list/etc.)
- `DashboardQuickNav.js` — Quick navigation menu

**Styling approach:**
- Likely using inline CSS or className-based Tailwind/custom CSS
- May have theme/context for colors
- Need to audit current color values and component styling

---

## Phase Scope

✅ **In Scope:**
- Audit current dashboard colors and compare to Chase.com
- Identify all color values needing change (CSS vars, inline styles, Tailwind classes)
- Update main dashboard components (Dashboard.js, UserDashboard.js, DashboardHero.js, etc.)
- Ensure color consistency across admin dashboard and user dashboard
- Update button styles to match Chase (rounded, navy, white text)
- Update card/tile styles (shadows, padding, border radius)
- Verify mobile responsiveness after styling changes
- Update color theme across all related pages

⚠️ **Out of Scope:**
- Redesigning layout/architecture (only styling/colors)
- Adding new components or features
- Marketing pages (per CLAUDE.md preference for /marketing stability)
- Logo/branding assets (assume provided or out of scope)

---

## Decisions (Locked In)

| ID | Decision | Rationale |
|----|----------|-----------|
| D-01 | Use Chase navy (#004687 or #003DA5) as primary color | Standard Chase brand color |
| D-02 | Match button styles to Chase (rounded, navy bg, white text) | Professional, consistent UX |
| D-03 | Card-based component styling with consistent padding/radius | Visual hierarchy and clarity |
| D-04 | Preserve layout structure; only change styling | Minimize risk of breaking functionality |
| D-05 | Update all dashboard pages consistently (user + admin) | Unified brand experience |

---

## Definitions of Done

✅ Dashboard visually matches Chase.com's color scheme and design language  
✅ All primary buttons are Chase navy with white text and rounded corners  
✅ All cards have consistent padding (20px), border radius (8px), and shadows  
✅ Typography hierarchy matches Chase standards (font family, sizes, weights)  
✅ Mobile dashboard looks proportionate and doesn't overflow  
✅ Color contrast meets WCAG AA accessibility standards  
✅ No broken functionality; all interactive elements work  
✅ `npm run build` passes without errors  
✅ No unintended style regressions in other pages  

---

## Next: Planning

Plans will address:
- **Plan 1**: Audit current styling and color values
- **Plan 2**: Update dashboard components (colors, buttons, cards)
- **Plan 3**: Mobile optimization and final polish
- **Plan 4** (if needed): Test and verify against Chase.com design

Phase scope: Update Super Banking UI to match Chase.com's visual design language.
