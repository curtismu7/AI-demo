# Phase 112: Marketing & Dashboard UI Polish — Consistent Light/Dark Mode - Context

**Gathered:** 2026-04-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Ensure the light/dark theme toggle works consistently across the most visible user-facing pages — marketing (LandingPage + `/marketing` route), both dashboards (UserDashboard, Dashboard), Config/DemoData pages, and key admin pages. Add a persistent global header toggle so users can switch theme from any page. Fix spacing/typography inconsistencies discovered during the dark mode sweep.

**Out of scope:** Chase.com visual redesign (Phase 113), internal debug/postman/setup pages (low traffic), per-page toggle buttons beyond what already exists.

</domain>

<decisions>
## Implementation Decisions

### D-1: Scope of dark mode coverage
- **Prioritize visible surfaces** — fix dark mode on the high-traffic pages: LandingPage, UserDashboard, Dashboard, `/marketing` route, UnifiedConfigurationPage/DemoDataPage, SideNav, and the top ~5 admin pages (Accounts, Transactions, Users, AuditPage, FeatureFlagsPage).
- Leave internal tooling pages (PostmanCollections, SetupPage, VercelConfigTab, ClientRegistrationPage, etc.) for a future sweep — they are low traffic and disruption risk is low.
- Preferred pattern: add `html[data-theme='dark']` CSS overrides in each component's own `.css` file (existing convention), NOT a monolithic `dark-overrides.css`.

### D-2: Dark mode on `/marketing` path
- **Let marketing follow the theme** — remove (or gate) the current `App--marketing-page .main-content { background: white }` hardcode from `App.css`.
- The existing `[data-theme="dark"] .landing-header-actions .landing-theme-toggle` rules in `LandingPage.css` already anticipate this — just need  to remove the force-white override from App.css and add proper dark surface tokens to `LandingPage.css`.
- Chase-inspired design intent is preserved by using the same `--dash-bg` / `--dash-surface` tokens already defined in `dashboard-theme.css`.

### D-3: Toggle placement
- **Global header toggle only** — one theme toggle lives in the app shell header/top nav (SideNav or App-level header), accessible from every page.
- LandingPage already has its own toggle (keep it — it's the hero surface).
- UserDashboard already has a toggle (keep it — it's in the dashboard header).
- No new per-page toggles added to pages that don't already have one.
- The SideNav component (`SideNav.js`) should expose the toggle so it's reachable from every authenticated page.

### D-4: Polish scope
- **Dark mode + spacing/typography inconsistencies** — while sweeping for dark mode coverage, fix obvious padding/font-size/color breakages discovered on the target pages (e.g., hardcoded `#fff` or `color: black` values that should use CSS variables).
- Fix is scoped to issues found on the D-1 target pages only. Do NOT refactor pages outside the priority list.

### Agent's Discretion
- Which specific `--dash-*` CSS variables to use for the new dark overrides — planner/executor pick consistent values from `dashboard-theme.css` `:root` block.
- Whether to also fix `index.css` body background for dark mode — small tweak, executor can include if obvious.
- Exact ordering/placement of toggle in SideNav — keep consistent with existing nav item hierarchy.

### Folded Todos
- **"Add dark/light mode toggle to all pages"** (area: ui, score: 0.9) — Folded into Phase 112 scope. This is the primary driver. The decision above narrows it to prioritized surfaces rather than a universal sweep.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Theme System
- `banking_api_ui/src/context/ThemeContext.js` — Authoritative theme source: `useTheme()`, `toggleTheme()`, `THEME_STORAGE_KEY`; `data-theme` is set on `document.documentElement`
- `banking_api_ui/src/styles/dashboard-theme.css` — CSS custom property tokens for `--dash-bg`, `--dash-surface`, `--dash-text`, etc. Both `:root` (light) and `html[data-theme='dark']` blocks defined here — use these variables for all new dark overrides

### Pages in Scope (D-1 priority surfaces)
- `banking_api_ui/src/components/LandingPage.js` + `LandingPage.css` — already has dark toggle; add dark surface overrides for remaining hardcoded light colors
- `banking_api_ui/src/components/UserDashboard.js` + `UserDashboard.css` — already uses `useTheme`; verify completeness
- `banking_api_ui/src/components/Dashboard.js` — CSS-variable driven (no `useTheme` needed); verify `html[data-theme='dark']` coverage
- `banking_api_ui/src/components/SideNav.js` — needs global toggle added
- `banking_api_ui/src/components/Accounts.js`, `Transactions.js`, `Users.js` — key user-facing admin pages
- `banking_api_ui/src/components/AuditPage.js`, `FeatureFlagsPage.js` — important admin pages

### App Shell
- `banking_api_ui/src/App.css` — contains `App--marketing-page` white override to REMOVE/update (line ~231-237)
- `banking_api_ui/src/App.js` — routing reference; do not change routes

No external specs — requirements fully captured in decisions above.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `ThemeContext.js` → `useTheme()` hook: returns `{ theme, setTheme, toggleTheme }` — use directly for any new toggle button
- `dashboard-theme.css` CSS vars: `--dash-bg`, `--dash-surface`, `--dash-surface-2`, `--dash-text`, `--dash-muted`, `--dash-border`, `--dash-shadow` — use these instead of hardcoded colors
- LandingPage toggle button implementation (`.landing-theme-toggle`) — reusable pattern for adding toggle to SideNav

### Established Patterns
- Dark mode CSS pattern: `html[data-theme='dark'] .component-class { --var: value; color: var(--dash-text); background: var(--dash-bg); }` — add to component's own `.css` file
- NOT the approach: modifying individual component JS to check `theme === 'dark'` inline — CSS-only preferred
- `data-theme` attribute lives on `document.documentElement` (set by ThemeContext) — CSS scope works globally

### Integration Points
- SideNav renders on all authenticated pages → ideal location for global toggle
- `App.css` App--marketing-page override is the blocker for D-2 — must be removed/replaced
- Pages that hardcode `color: #000` or `background: #fff` in their component CSS will break in dark mode — these are the "spacing/typography" issues to catch during sweep (D-4)

### CSS Files with Existing Dark Mode Coverage
Already done: `App.css` (partial), `dashboard-theme.css`, `LandingPage.css`, `UserDashboard.css`, `AgentLayout.css`, `ChatInterface.css`, `AgentTokens.css`, `LogoutPage.css`, `UIDesignNav.css`, `BankingAgent.css`, `globalTheme.css`

Need attention: `Accounts.css` (if exists), `Transactions.css` (if exists), `SideNav.css` (if exists), + the D-1 priority list pages

</code_context>

<specifics>
## Specific Ideas

- User wants marketing to follow theme (dark = dark everywhere) — this is a deliberate UX choice, not laziness
- SideNav is the right home for the global toggle since it's always visible on authenticated pages
- Fix is CSS-first, not JS-first — no component sprawl

</specifics>

<deferred>
## Deferred Ideas

- Full sweep of ALL ~40 pages with dark mode gaps (Postman, Setup, Vercel config tabs, etc.) — deferred to a future low-priority cleanup phase. Not Phase 113.
- Chase.com visual redesign for all pages — Phase 113 (already planned).

### Reviewed Todos (not folded)
- **"Implement Chase.com UI redesign across all pages (Phase 85 follow-up)"** (score: 0.7) — deferred; Phase 113 owns this.
- **"Run UI audit on Phase 4 education-content and mark Phase 3 N/A"** (score: 0.6) — out of scope for Phase 112; planning task, not UI polish.

</deferred>

---

*Phase: 112-marketing-and-dashboard-ui-polish-ensure-consistent-light-and-dark-mode*
*Context gathered: 2026-04-09*
