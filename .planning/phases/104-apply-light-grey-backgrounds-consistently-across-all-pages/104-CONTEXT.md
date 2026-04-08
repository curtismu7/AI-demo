# Phase 104: Apply Light Grey Backgrounds Consistently Across All Pages

**Phase Number:** 104
**Depends On:** Phase 103 (establishes /marketing page template, color variables in use)
**Scope:** Audit all authenticated and public-facing pages; apply light grey background (#F5F5F5) consistently for visual cohesion and professional appearance. Establish background color conventions for all page types.

---

## Phase Vision

**Problem:** Inconsistent background colors across pages (some white, some colored, some missing context) dilutes the professional appearance and makes the demo UI feel fragmented.

**Solution:** Single-source-of-truth light grey background (`--chase-light-gray: #F5F5F5`) applied to all full-page content areas, with clear exceptions documented (modals, floating panels, hero sections).

**Outcome:** Unified visual experience across admin dashboard, user customer view, public /marketing, and all internal pages.

---

## Design Decisions (Locked)

| ID | Decision | Rationale |
|---|----------|-----------|
| **D-104-01** | Primary page background: `--chase-light-gray (#F5F5F5)` at `.app-page-shell` level | Inherited by all child pages; single override point |
| **D-104-02** | Exceptions: hero sections (brand color), modals (white), floating panels (white) | Maintain visual hierarchy and focus |
| **D-104-03** | Dark mode: adjust light grey to darker shade (~#2a2a2a or theme-aware var) | Maintain readability and brand consistency |
| **D-104-04** | Audit EVERY page route listed in codebase, document findings | Comprehensive coverage; no missed pages |
| **D-104-05** | Update CSS variables in index.css if needed; no hardcoded color values | Maintainability and future theme changes |

---

## Requirements

- **BG-01:** All authenticated pages (.admin-dashboard, .customer-dashboard, .user-dashboard, etc.) use `--chase-light-gray` background
- **BG-02:** All public/unauthenticated pages (/marketing, /login, /error, 404, etc.) use `--chase-light-gray` background
- **BG-03:** Internal pages (/admin/*, /feature-flags, /demo-data, /mcp-inspector, etc.) use `--chase-light-gray` background
- **BG-04:** Dark mode automatically adapts background for readability
- **BG-05:** No visual regression (all pages render correctly with new background)
- **BG-06:** Cards, panels, modals remain white for contrast
- **BG-07:** No console errors; all text readable on light grey (color contrast ≥ 4.5:1 for text)

---

## Scope Boundaries

**IN SCOPE:**
- Page-level background colors
- Update CSS variables and global styles
- Document background policy in design system
- Verify all 15+ page routes

**OUT OF SCOPE:**
- Individual component styling (cards, buttons stay as-is unless background conflict)
- Typography (handled in Phase 66)
- Spacing changes (handled in Phase 66)
- Animations (handled elsewhere)
- Dark mode comprehensive audit (beyond background adaptation)

---

## Deferred Ideas

- Custom background patterns per user role (future design refinement)
- Animated background gradients (Low ROI; skip)
- Per-page background themes (not needed; single color is cleaner)

---

## Claude's Discretion

- CSS class naming: use `.page-background` or add directly to `.app-page-shell`
- Determine if dark mode background should be theme CSS variable or computed
- Order of implementation: start with dashboard, then public pages, then internal admin pages

---

## Research Needed

- Current state of all page backgrounds (audit existing CSS)
- Dark mode CSS variables setup
- List of all route paths to audit
- Analyze card/modal visibility on light grey (ensure sufficient contrast)

---

## Notes

- Light grey variable already exists: `--chase-light-gray: #F5F5F5;` (Phase 85)
- Dashboard already using it in some places (UserDashboard.css); extend pattern
- This is largely CSS refactoring/auditing, not new features
- Expected time: ~1-2 hours for audit + implementation
- Low risk of regressions if done carefully with incremental commits
