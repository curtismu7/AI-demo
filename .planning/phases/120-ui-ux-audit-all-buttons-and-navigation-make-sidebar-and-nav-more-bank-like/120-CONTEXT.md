# Phase 120: UI/UX Audit — Buttons & Navigation — Context

**Gathered:** 2026-04-10
**Status:** Ready for planning
**Source:** User vision discussion — captured decisions for audit and visual refinement

---

<domain>
## Phase Boundary

Audit all interactive buttons and navigation elements across the app (sidebar, top nav, bottom sections). Verify buttons work, are visible to correct roles (admin-only buttons visible only to admins), and identify missing navigation/actions. Redesign sidebar and top navigation to look more bank-like: tighter spacing, professional line icons (not emoji), prominent section headers, smooth animations, and softer color palette that stays distinct from content.

**In Scope:** Navigation audit, button validation, visual refinement (spacing, icons, colors, active states, animations)
**Out of Scope:** New capabilities/buttons (those belong in other phases)

</domain>

<decisions>
## Implementation Decisions

### D-01: Sidebar Visual Design — Line Icons (Not Emoji)
Replace all emoji icons with professional line icons (React Icons or Heroicons recommended). Rationale: Banking context requires professional appearance; line icons convey authority and clarity better than emoji.
- Current: Emoji icons (🏦, 🔐, 💬, etc.)
- Decision: **Switch to line icons** (bank icon, lock icon, chat icon, etc.)
- Consumer code: SideNav.js ADMIN_NAV and USER_NAV icon assignments

### D-02: Sidebar Spacing — Tighten (Too Loose Currently)
Reduce padding and gaps to make sidebar more compact and professional. Match banking app density standards.
- Current: Likely 16px padding, loose spacing
- Decision: **Tighten spacing** — reduce padding, tighter group gaps
- Where: SideNav.css `.sidenav-link`, `.sidenav-group`, padding values
- Verification: Sidebar fits more items visibly; density matches Chase.com or similar

### D-03: Active State Indicator — Icon Change (Not Just Color)
When a nav item is active, change the icon appearance (solid/filled) in addition to background/color.
- Current: Left border + background color highlight
- Decision: **Add icon change** (solid icon for active, outline for inactive)
- Interaction: Solid icon + Chase blue background on active state
- Verification: Active item clearly distinct visually

### D-04: Section Headers — More Prominent With Different Styling
Group labels (Overview, Management, Configuration, User Management, Developer Tools) should visually stand out more.
- Current: Small muted text
- Decision: **Bolder, maybe different color or uppercase** + visual separator
- Options: Uppercase + bold, light bg color, divider line, icon
- Consumer: SideNav.js `.sidenav-group-label` styling

### D-05: Top Navigation — Full Horizontal Layout Needed
Add/redesign a full horizontal top nav bar. Currently no horizontal nav exists.
- Decision: **Create top nav** with brand, actions, user menu
- Location: Place above main content area or behind hamburger

### D-06: Search Bar Placement — Far Right Under Hamburger
Search bar should be positioned far right, integrated with hamburger menu (mobile-friendly).
- Strategy: Search icon visible on desktop (links to input), hamburger toggles mobile menu
- Implementation: Right side of top nav, dropdown or inline search

### D-07: User Menu — Full Profile, Notifications, Settings
Top nav user menu should include:
- Profile picture/avatar
- Dropdown menu
- Notifications
- Settings/preferences
- Logout
- Rationale: Professional banking UX standard

### D-08: Admin-Only Button Visibility — Enforce Correctly
Admin-specific buttons should only render in admin sidebar. Verify all admin buttons respect role gates.
- Current issue: "Run Scope Check" button exists but doesn't work (route missing or page error)
- Decision: **Audit and fix ALL admin-only buttons**
- Verification: Only admins see admin buttons; buttons route to correct pages

### D-09: Button Audit & Gap Analysis — Inspect Code & Identify Missing
Currently uncertain which buttons don't work or which actions are missing.
- Task: Code inspection needed
  - Check all button clicks route correctly
  - Verify no broken links
  - Identify actions users need but don't have buttons for
- Consumer: Planner will create tasks for verification and fixes

### D-10: Color Palette — Softer, Distinct From Content
Sidebar background should use softer Chase colors, maintain visual distinction from content area.
- Current: Chase navy (#004687), Chase blue accents
- Decision: **Keep distinct but soften edges**
  - Option: Lighter navy or muted blue instead of full navy #004687
  - Active state: Lighter blue instead of bright #0066CC
  - Rationale: Professional banking look, less harsh contrast
- CSS vars: Update `--sn-bg`, `--sn-bg-active` to softer palette

### D-11: Active State Animation — Icon Change (Smooth Transition)
When nav items become active, icon and background transition smoothly.
- Decision: **Moderate animations** (not subtle, not overdone)
- Duration: 0.15s–0.22s ease (match existing nav transitions)
- Effect: Icon fills/solidifies, background color shifts

### D-12: Loading States — Show Spinner
If nav fetches data or pages load, show spinner/loading indicator.
- Location: Nav items or sidebar loading regions
- Decision: **Spinner** (not skeleton, not silent)
- Visibility: User knows action is in progress

</decisions>

<specifics>
## Specific References & Examples

### Current Sidebar State
- File: `banking_api_ui/src/components/SideNav.js`
- Styling: `SideNav.css`
- Admin Nav Groups: Overview, Management, Configuration, User Management, Developer Tools
- Current Icons: Emoji (🏦, 🔐, 💬, 👥, ⊞, 🔍, etc.)
- Width: 220px, collapsible to 60px
- Background: Chase navy #004687

### Broken Button: Run Scope Check
- Location: Developer Tools group in ADMIN_NAV
- Current: `{ label: '▶ Run Scope Check', icon: '🔐', action: 'runScopeAudit' }`
- Handler: `handleNavAction()` in SideNav.js navigates to `/scope-audit`
- Issue: Route `/scope-audit` exists, but page may not load or render correctly
- Fix needed: Verify ScopeAuditPage is wired correctly in App.js routes

### Icon Library Recommendation
- React Icons (large, free, well-maintained) — `react-icons` package
  - Bank icons: `GiBankAccount` (Filiberto), `FaBank` (Font Awesome)
  - Lock: `MdLock`, `FaLock`
  - Chat: `TbMessage`, `HiOutlineChat`
  - Settings: `AiOutlineSetting`, `FiSettings`
  - Other: Extensive coverage for nav items
- Alternative: Heroicons (Tailwind community, very clean)

### Banking App References (for softer color palette)
- Chase.com uses: Navy #003f87 + light blue accents, subtle shadows
- Goldman Sachs uses: Dark navy with cool grays, minimal color
- Recommended for Phase 120: Consider navy → #1a3a52 (softer) or #2c3e50 (cooler gray-navy)

</specifics>

<deferred>
## Deferred Ideas

- **Search functionality within the app** — Full search across pages/documents (new capability, own phase)
- **Favorites/pinning nav items** — Personalizing sidebar (new capability, own phase)
- **Collapsible menu sections** — Groups collapse/expand (can be added later)
- **Mobile-specific nav drawer with swipe** — Enhanced mobile UX (nice-to-have, own phase)
- **Dynamic nav based on user permissions matrix** — Role-based nav (infrastructure, own phase)
- **Nav analytics/tracking which items users use** — Observability (own phase)

</deferred>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Design & Branding
- `CLAUDE.md` — Project instructions, non-negotiables
- `banking_api_ui/src/components/SideNav.js` — Current sidebar implementation
- `banking_api_ui/src/components/SideNav.css` — Current styling

### Banking UI References
- `docs/ARCHITECTURE.md` — App structure, where nav integrates
- `banking_api_ui/src/App.js` — Route definitions, component wiring

### Related Phases
- Phase 113: Redesign UI to match Chase.com look and feel (establishes design patterns, color schemes)
- Phase 112: Marketing and dashboard UI polish (establishes light/dark mode support)

### Icon & Color Assets
- React Icons documentation: https://react-icons.github.io/react-icons
- Chase.com color audit (from Phase 105, 113): Navy #004687, Blue #0066CC
- Current CSS variables: `src/index.css` (--chase-navy, --chase-blue, etc.)

</canonical_refs>

---

*Phase: 120-ui-ux-audit-all-buttons-and-navigation-make-sidebar-and-nav-more-bank-like*
*Context gathered: 2026-04-10 via /gsd-discuss-phase*
