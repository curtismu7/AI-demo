# Phase 138 — CONTEXT.md

## Phase Goal

Audit and fix all placeholder, stub, and incomplete content across the **entire app** — UI components, server middleware, and routes. Fold in the Chase.com UI redesign pass across all pages. Fix everything inline; do not produce a separate report phase.

---

## Scope

**Full stack — UI + server. All pages. Fix inline.**

### What counts as "placeholder" in this phase

All four categories apply:

- **E — TODO/FIXME comments blocking real functionality** — e.g. `agentSessionMiddleware.refreshOAuthSession` stub
- **F — Hardcoded mock data rendered to the screen** — e.g. `UserDashboard` "Demo placeholder" pills (Insights, Goals, Payments hub)
- **G — UI elements wired but doing nothing** — e.g. no-op click handlers, disabled buttons with no future, dead nav items
- **H — Server endpoints returning empty `[]`/`{}` when they should return real data** — any route that short-circuits with an empty payload when it could read real config/session

### Fix strategy

**Audit + fix inline.** Find it → fix it in this phase. No intermediate report.

---

## Decisions

### D-01 — Server: Fix `agentSessionMiddleware` refreshOAuthSession stub

**File:** `banking_api_server/middleware/agentSessionMiddleware.js`

The `refreshOAuthSession` function at the top of this file is a stub (Phase 116-02 placeholder). The real refresh logic exists in `banking_api_server/middleware/tokenRefresh.js` (`refreshIfExpiring`) and `banking_api_server/routes/mfa.js` (inline refresh using `oauthService.refreshAccessToken`).

Replace the stub with a proper implementation that:
1. Reads `req.session.oauthTokens.refreshToken`
2. Calls `oauthUserService.refreshAccessToken(refreshToken)` (same pattern as `tokenRefresh.js:51`)
3. Updates `req.session.oauthTokens` with the new access + refresh tokens and new `expiresAt`
4. Saves `req.session`

Remove the `TODO` comment and `console.warn` stub entirely.

### D-02 — UI: Fix UserDashboard "Demo placeholder" pills

**File:** `banking_api_ui/src/components/UserDashboard.js` lines ~1301-1304

The `ud-super-pills` row has three `<span>` elements with `title="Demo placeholder"`:
- **Insights** — replace with a real link/button to the token chain display (`/dashboard?tab=insights` or equivalent) or, if no route exists, wire to the Security Center page
- **Goals** — remove entirely (no corresponding feature exists in this demo)
- **Payments hub** — replace with a real link to the Transactions page (`/transactions`)

Remove `title="Demo placeholder"` from anything that becomes real.

### D-03 — Server: `demoScenario.js` lastMigration TODO

**File:** `banking_api_server/routes/demoScenario.js` line ~757

`lastMigration: null // TODO: Track migration timestamp`

Replace `null` with `new Date().toISOString()` set when the migration/reset action completes, stored in the scenario object. If the scenario object comes from KV/store, persist it; otherwise set it in-memory on the response.

### D-04 — Chase UI redesign — full page pass (ALL pages)

Apply Chase.com-inspired visual consistency across all major pages. The reference designs are the static mocks already in the repo:
- `banking_api_ui/public/design/customer-dashboard-2026.html`
- `banking_api_ui/public/design/customer-dashboard-2026-agent-ui.html`
- `banking_api_ui/public/design/admin-dashboard-2026.html`

**Pages to update (in priority order):**

| Page / Component | File | Focus |
|---|---|---|
| User Dashboard | `UserDashboard.js` | Hero section, account cards, quick-action row, nav consistency |
| Navigation (top + side) | `ChaseTopNav.js`, `SideNav.js`, `TopNav.js` | Chase nav bar style: deep-blue `#00294D`, white links, consistent brand |
| Login | `Login.js` | Chase-branded login card, PingOne badge placement |
| Transactions | `Transactions.js`, `UserTransactions.js` | Table layout, action buttons, filter bar |
| Profile | `Profile.js` | Card layout, section headers |
| Security Center | `SecurityCenter.js` | Card-based layout matching admin dashboard mock |
| Admin pages | `AdminSubPageShell.js`, `BankingAdminOps.js` | Match admin-dashboard-2026 mock structure |

**What "Chase style" means for this pass:**
- Primary blue: `#00294D` (nav/headers), `#005EB8` (CTAs)
- Background: `#F5F5F5` (page), `#FFFFFF` (cards) with `border-radius: 8px` and `box-shadow: 0 2px 8px rgba(0,0,0,0.08)`
- Typography: system font stack, `font-weight: 600` for headings
- Account balance cards: dark navy card with white balance amount, account type subtitle
- No placeholder icons (use text labels or real SVG icons already in the repo)
- Remove any remaining generic/Bootstrap-looking button styles — use the `.btn-primary` / `.btn-secondary` classes from the existing CSS system

**Do NOT redesign:** `/configure` (just rebuilt in Phase 137), MCP Inspector, education panels, or any OAuth debug/token inspector panels.

### D-05 — BankingAgent.js: Remove "Reserved for future" comment

**File:** `banking_api_ui/src/components/BankingAgent.js` line ~2112

`* Reserved for future NL-router integration — not yet wired to submission handler.`

Either wire it or remove the dead code block entirely. Do not leave "not yet wired" comments in production code.

---

## Deferred

- Marketing/landing page (`LandingPage.js`) — excluded from Chase redesign per CLAUDE.md non-negotiable
- OAuth debug/token inspector panels — intentionally technical, no Chase styling needed
- Education panels — intentionally distinct from banking UI chrome
- MCP Inspector — dev tool, no visual redesign
- `RFC9728Content.js` "not implemented" comments — these are documentation labels in an education panel, not real stubs

---

## Constraints

- **No breaking changes to OAuth/session flows** — middleware changes in D-01 must preserve the existing session shape
- **`npm run build` must exit 0** after every plan
- **Do not add new npm packages** — use existing CSS variables, existing icon system, existing utilities
- **Chase redesign is CSS/className/JSX structure only** — no new state management, no new API calls
- **Static mocks in `/public/design/` are reference only** — do not delete or modify them

---

## Files In Scope (primary)

### Server
- `banking_api_server/middleware/agentSessionMiddleware.js`
- `banking_api_server/routes/demoScenario.js`

### UI — stubs/placeholders
- `banking_api_ui/src/components/UserDashboard.js`
- `banking_api_ui/src/components/BankingAgent.js`

### UI — Chase redesign
- `banking_api_ui/src/components/ChaseTopNav.js`
- `banking_api_ui/src/components/SideNav.js`
- `banking_api_ui/src/components/TopNav.js`
- `banking_api_ui/src/components/Login.js`
- `banking_api_ui/src/components/UserDashboard.js`
- `banking_api_ui/src/components/Dashboard.js`
- `banking_api_ui/src/components/Transactions.js`
- `banking_api_ui/src/components/UserTransactions.js`
- `banking_api_ui/src/components/Profile.js`
- `banking_api_ui/src/components/SecurityCenter.js`
- `banking_api_ui/src/components/AdminSubPageShell.js`
- `banking_api_ui/src/components/BankingAdminOps.js`
- Corresponding `.css` files for all of the above

---

## Claude's Discretion

- Exact CSS token values for Chase colours: use `#00294D` / `#005EB8` unless a value in existing CSS is very close and consistent (within 5%)
- Whether to introduce a shared `chase-tokens.css` or inline per-component — whichever creates fewer diffs
- Ordering of sub-tasks within each plan
- Whether admin page redesign warrants its own plan or can share with user-facing pages
