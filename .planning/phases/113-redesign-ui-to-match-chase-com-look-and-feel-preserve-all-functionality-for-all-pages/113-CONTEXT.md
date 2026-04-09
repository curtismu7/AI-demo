# Phase 113: Chase.com UI Redesign — Context

**Gathered:** 2026-04-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Apply Chase.com visual design language to the high-traffic user-facing pages — LandingPage, UserDashboard, admin Dashboard, and the AdminSubPageShell (Accounts, Transactions, Users, AuditPage) — while preserving all OAuth, MCP agent, token exchange, admin, and education functionality exactly as-is.

**In scope:** LandingPage, UserDashboard, Dashboard (admin), AdminSubPageShell-wrapped pages (~12 component CSS files total), SideNav Chase styling, new `chase-theme.css`.

**Out of scope:** Internal tooling pages (PostmanCollections, SetupPage, ClientRegistrationPage, OAuthDebugLogViewer, McpInspector, LogViewerPage), education panels, agent/MCP UI, dark mode theme system (Phase 112 — do not touch ThemeContext or `--dash-*` tokens).

</domain>

<decisions>
## Implementation Decisions

### D-1: Scope
- **High-traffic core only** — Target ~12 CSS files: `LandingPage.css`, `UserDashboard.css`, `Dashboard.js` inline styles, `SideNav.css`, `appShellPages.css`, `AuditPage.css`, `FeatureFlagsPage.css`, and `UserDashboard.css`.
- Internal tooling (SetupPage, PostmanCollections, ClientRegistrationPage, OAuthDebugLogViewer, McpInspector) excluded.
- All changes must also work with `html[data-theme='dark']` — dark mode rules established in Phase 112 take precedence.

### D-2: Typography
- **System font stack** — Use `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif` throughout. No external font dependencies (no Google Fonts). Apply via `body` rule in `chase-theme.css`.
- Chase-matching font weights: `400` (body), `600` (subheadings), `700` (headings/CTAs).

### D-3: Navigation pattern
- **Partial top nav replacement** — Add a new `ChaseTopNav` component that renders a horizontal top navigation bar styled to match Chase.com (navy background, white links, Chase logo mark).
- `ChaseTopNav` replaces the inline header in **LandingPage, UserDashboard, and Dashboard** only.
- **Admin/config subpages (Accounts, Transactions, Users, AuditPage, FeatureFlagsPage) keep the existing SideNav** with Chase navy styling applied (Phase 85 already did this partially).
- **Important:** `SideNav.js` currently has zero imports in the app — it exists but is not rendered. Admin pages rely on `AdminSubPageShell.js` for layout. `ChaseTopNav` is a new component; `SideNav` gets phase-85-style Chase treatment for future use or as a standalone panel nav.
- `ChaseTopNav` must preserve: user greeting, logout link/button, theme toggle, role-switch (user↔admin), and any education panel triggers present in the current inline headers.

### D-4: Landing page hero
- **Chase styling on current structure** — Keep the existing HTML structure of the hero section in `LandingPage.js`. Apply Chase color tokens and typography only — no structural/HTML changes to the hero.
- CTA buttons: Chase navy (`--chase-navy`) primary, white outline secondary.
- Background: Chase navy gradient or solid `--chase-navy`. Remove current pink/gradient brand color.

### D-5: Component styling approach
- **New `chase-theme.css`** — Create `banking_api_ui/src/styles/chase-theme.css` with all Cross-component Chase overrides in one file. Import it in `index.js` after `App.css`.
- Component-level `.css` files get updated only for layout-specific overrides that can't be done from `chase-theme.css` without specificity hacks.
- The existing `--chase-*` CSS variables in `index.css` are the source of truth for colors — do not duplicate them.

### Agent's Discretion
- Exact spacing/padding adjustments to match Chase.com visual rhythm — executor picks consistent values.
- Whether `ChaseTopNav` uses a new CSS file (`ChaseTopNav.css`) or is covered by `chase-theme.css`.
- Exact HTML structure of `ChaseTopNav` — should mirror Chase.com's nav bar top-level layout (logo left, links center/right, user actions right).
- Box shadow depth on nav bar (`0 1px 4px rgba(0,0,0,0.15)` is a reasonable default).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing Chase Token System
- `banking_api_ui/src/index.css` — Lines 18–45: `--chase-navy`, `--chase-navy-dark`, `--chase-navy-light`, `--chase-blue`, `--chase-white`, `--chase-light-gray`, `--chase-medium-gray`, `--chase-dark-gray`. These are mapped to `--app-primary-blue`, `--brand-*` aliases. Use these vars — do NOT hardcode hex values.
- `banking_api_ui/src/styles/dashboard-theme.css` — Dark mode tokens (`--dash-bg`, `--dash-surface`, `--dash-text`, `--dash-muted`, `--dash-border`). Chase redesign must NOT break `html[data-theme='dark']` overrides here.

### Phase 112 Dark Mode (DO NOT BREAK)
- `banking_api_ui/src/context/ThemeContext.js` — Theme system source of truth.
- All dark overrides use `html[data-theme='dark']` selector — chase-theme.css must use the same selector for any dark corrections.

### Navigation (Target Files)
- `banking_api_ui/src/components/SideNav.js` + `SideNav.css` — Exists, currently not imported by any app component (not rendered). Keep Chase-navy background styling from Phase 85. Do NOT remove it — may be used in future phases.
- `banking_api_ui/src/components/UserDashboard.js` — Lines 1679–1730: inline `dashboard-header-stack` containing logo, title, user greeting, breadcrumbs. `ChaseTopNav` replaces/wraps this section.
- `banking_api_ui/src/components/Dashboard.js` — Admin equivalent. Same inline header pattern to be replaced by `ChaseTopNav`.
- `banking_api_ui/src/components/LandingPage.js` + `LandingPage.css` — Chase hero styling applied on current HTML structure.

### App Shell
- `banking_api_ui/src/styles/appShellPages.css` — Shared styles for `AdminSubPageShell`-wrapped pages (Accounts, Transactions, Users, AuditPage). Already has Phase 112 dark overrides. Apply Chase variables here.
- `banking_api_ui/src/components/AdminSubPageShell.js` — Layout wrapper for admin subpages. Does not use SideNav.

### Existing Phase 85 Work
- Phase 85 (chase-dashboard-styling) already applied `--chase-navy` to the dashboard header and some badge/status colors. The new `chase-theme.css` should BUILD ON this, not duplicate it.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `--chase-*` CSS variables in `index.css` — Full Chase palette already defined. Use these everywhere.
- `BrandLogo.js` — Existing logo component; use inside `ChaseTopNav`.
- `useTheme()` from `ThemeContext.js` — Must be called in `ChaseTopNav` for the theme toggle button.
- `useIndustryBranding()` from `IndustryBrandingContext.js` — Provides `preset.shortName` for the brand label in nav.
- `Header.js` + `Header.css` — Existing session-timer header component; may be composable within `ChaseTopNav`.

### Established Patterns
- Dark mode: `html[data-theme='dark'] .component-class { }` blocks appended to `.css` files (Phase 112 pattern).
- CSS variables: `--app-primary-blue`, `--brand-*` already alias `--chase-*` — safe to use either set.
- Authentication: UserDashboard and Dashboard each handle their own auth state locally. `ChaseTopNav` receives `user` and `onLogout` as props (same as SideNav signature).

### Integration Points
- `UserDashboard.js` — Replace `<div className="dashboard-header-stack">...</div>` with `<ChaseTopNav user={user} onLogout={onLogout} ... />`.
- `Dashboard.js` — Same pattern for admin dashboard header.
- `LandingPage.js` — Apply Chase styles to existing `.landing-header` and `.landing-hero` sections; no new component needed.
- `index.js` — Add `import './styles/chase-theme.css'` after existing imports.

</code_context>

<specifics>
## Specific Ideas

- Chase.com top nav visual reference: navy bar with white "CHASE" wordmark left, horizontal links center (Products, Explore, Customer Service), and user/sign-in actions right. Mobile: hamburger menu.
- Chase hero: full-width image/color block, large white headline, subheadline, 1-2 CTA buttons (navy primary, white-outline secondary).
- Keep the BX Finance demo label visible — don't remove the demo identity. The `preset.shortName` from IndustryBrandingContext drives this.

</specifics>

<deferred>
## Deferred Ideas

- Full 64-file CSS sweep (all tooling pages) — lower traffic, not worth the risk in this phase.
- Switching to Tailwind CSS — architectural change, warrants its own phase if needed.
- Mobile hamburger menu for ChaseTopNav — can be added as a follow-on once desktop nav is stable.
- SideNav activation (actually rendering it in Admin pages) — currently orphaned; wiring it up is a separate mini-task that could be its own small phase or appended to 113 if executor finds it trivial.

</deferred>

---

*Phase: 113-redesign-ui-to-match-chase-com-look-and-feel-preserve-all-functionality-for-all-pages*
*Context gathered: 2026-04-09*
