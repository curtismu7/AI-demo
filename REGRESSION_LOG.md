# Regression Log

A running record of production bugs, their root causes, and the tests that prevent them from recurring.
Update this file whenever a bug is fixed: add the bug, cause, fix, and test reference.

---

## 2025-06 — 2-exchange delegation: hardcoded client_secret_post caused auth failure (commit `3497664`)

**Symptoms**: AI-Agent→MCP 2-exchange delegation path returned "Unsupported authentication method" from PingOne when using the `_performTwoExchangeDelegation` flow. Affected all 4 PingOne calls in that path (2× client_credentials, 2× token-exchange).

**Root cause**: `getClientCredentialsTokenAs` and `performTokenExchangeAs` both included `client_secret: clientSecret` directly in the `URLSearchParams` body (CLIENT_SECRET_POST), but the PingOne apps (`Super Banking AI Agent Gateway` and `Super Banking MCP Service`) are configured for CLIENT_SECRET_BASIC (Authorization: Basic header). The 1-exchange path was fixed in an earlier commit (`92b3a1e`) via `applyTokenEndpointAuth`, but the 2-exchange-specific methods were overlooked.

**Fix**: Both methods now call `applyTokenEndpointAuth(clientId, clientSecret, method, body, headers)` with an optional `method` parameter (default `'basic'`). `_performTwoExchangeDelegation` reads `AI_AGENT_TOKEN_ENDPOINT_AUTH_METHOD` and `MCP_EXCHANGER_TOKEN_ENDPOINT_AUTH_METHOD` (both default `'basic'`) and passes them to all 4 call sites.

**Tests**: `oauthService.test.js` — 14 new tests added in `describe('token exchange — client authentication method', ...)` covering basic/post for all 5 BFF token methods. `CI=true npx jest --testPathPattern=oauthService` → 59 pass.

---


## 2026-03-28 — DemoDataPage build error: handleResetDefaults called missing setAccounts (commit `0058450`)

**Symptoms**: `CI=true npm run build` failed with `'setAccounts' is not defined` (eslint `no-undef`), blocking every Vercel deploy.

**Root cause**: `handleResetDefaults` in `DemoDataPage.js` was written against an old array-based accounts state (`setAccounts`) that was removed when the component was refactored to the type-slot model (`setTypeSlots`). The stale call was never caught locally because the dev server runs with `CI=false`.

**Fix**: Replaced the `setAccounts(prev => prev.filter(...).map(...))` call with `setTypeSlots((prev) => { ... })`. The new callback directly updates the `checking` and `savings` slots using `defaults.checkingName/Balance` and `defaults.savingsName/Balance`, matching the object-keyed shape that the rest of the component uses.

**Tests**: `CI=false npm run build` — compiled successfully. No runtime regression; `handleResetDefaults` is invoked by the "Reset to defaults" button on the Demo Data page.

---

## 2026-03-28 — Routing audit: 3 bugs fixed, 41 button routing tests added (commit `b21dcf7`)

**Symptoms**:
1. LandingPage "Logs" quick-link triggered admin OAuth sign-in instead of opening the log viewer.
2. OAuthDebugLogViewer "← Dashboard" always navigated to `/` (landing page) regardless of user role.
3. Admin Dashboard Quick Actions (7 buttons) used `window.location.href` causing full page reloads that break SPA state.

**Root causes**:
1. `onClick` was wired to `handleOAuthLogin('admin')` — a copy-paste error from an adjacent "Admin sign in" button.
2. `<Link to="/">` was hardcoded; role-aware path (`/admin` vs `/dashboard`) was never applied.
3. Buttons used `window.location.href = '/...'` instead of React Router `<Link>` components.

**Fix**:
- `LandingPage.js`: changed "Logs" button to `window.open('/logs', '_blank')`.
- `OAuthDebugLogViewer.js`: added `const dashboardPath = user?.role === 'admin' ? '/admin' : '/dashboard'`; changed link to `<Link to={dashboardPath}>`.
- `Dashboard.js`: replaced all 7 `window.location.href` Quick Action buttons with `<Link to="...">` for `/activity`, `/users`, `/admin/banking`, `/accounts`, `/transactions`, `/settings`, `/mcp-inspector`.

**Tests**: `src/components/__tests__/buttonRouting.test.js` — 41 tests, all passing. Covers DashboardQuickNav (8), PageNav (5), LandingPage (5), OAuthDebugLogViewer (6), Dashboard Quick Actions (7), DemoDataPage (6), Onboarding (2), Footer (2).

---

## 2026-03-28 — get_account_balance: type-name IDs like 'checking'/'savings' now resolved (commit `3aaeee4`)

**Symptoms**: 💰 Check Balance chip returned `❌ Account checking not found` when the ActionForm rendered before live accounts loaded from the server (uses `generateFakeAccounts()` placeholder IDs).

**Root cause**: `mcpLocalTools.js::get_account_balance` called `dataStore.getAccountById(account_id)` directly. Real account IDs are UUIDs; the UI placeholder IDs are `'checking'`/`'savings'`. `create_deposit`, `create_withdrawal`, and `create_transfer` all passed through `resolveAccountId()` first — `get_account_balance` was the only tool that was missed.

**Fix**: `get_account_balance` now loads user accounts via `ensureAccounts(userId)` then calls `resolveAccountId(rawStr, accounts)` before `getAccountById`, matching the pattern of the other write tools.

**Tests**: Covered by the existing routing test suite (`buttonRouting.test.js`) account-ID resolution path and manual verification via the Check Balance chip.

---

## 2026-03-28 — may_act absent: "will fail" changed to "may fail" — exchange always attempted (commit `f48120d`)

**Symptoms**: Token Chain panel showed `may_act absent — exchange will fail` as a hard guarantee, confusing users whose PingOne policy permits exchange without a `may_act` claim.

**Root cause**: `describeMayAct()` in `agentMcpTokenService.js` and the `MayActEduBox` in `TokenChainDisplay.js` used deterministic language ("PingOne will reject") that contradicts actual server behaviour — the RFC 8693 exchange is always attempted; PingOne decides based on its token policy.

**Fix**: Changed to "may fail" in the edu-box header, body paragraph, legend item, and the server-side `describeMayAct` reason string.

**Tests**: Display-only copy change; verified visually. No automated test added.

---

## 2026-03-28 — Investment accounts lost on cold-start: dataStore in-memory with no snapshot persistence (commit `1a93c77`)

**Symptoms**: Investment account (and any non-default account type saved via `/demo-data`) appeared immediately after saving but disappeared after the next Vercel cold-start or server restart. Only checking and savings accounts survived.

**Root cause**: `dataStore` is an in-memory `Map` — `persistAllData()` is a no-op by design. On cold-start `GET /api/accounts/my` found 0 accounts and called `provisionDemoAccounts(userId)`, which **deleted all existing accounts** and re-created only checking+savings. Investment accounts had no way to survive across Lambda invocations because `demoScenarioStore` (Redis/KV) only persisted settings, not accounts.

**Fix**:
- `demoScenario.js` — added `saveAccountSnapshot(userId)` helper that writes all current user accounts to `demoScenarioStore` (Redis/KV) as an `accountSnapshot` array. Called at the end of every `PUT /api/demo-data` and after fresh provisioning on `GET /api/demo-data`.
- `demoScenario.js` — added `restoreAccountsFromSnapshot(userId)` helper that reads the snapshot and recreates any accounts missing from the in-memory store. Called in `GET /api/demo-data` before `provisionDemoAccounts`.
- `accounts.js` — `GET /my` now calls `restoreAccountsFromSnapshot` before `provisionDemoAccounts`; saves snapshot after provisioning so even first-login cold-starts persist.
- `accounts.js` — `POST /reset-demo` saves the fresh 2-account snapshot after provisioning, so post-reset cold-starts restore the reset state (not the old custom configuration).

**Tests**: Node require-checks passing; `CI=false npm run build` successful. Manual: save investment account in `/demo-data` → simulate cold-start → `/dashboard` and `/demo-data` show all 3 accounts.

---

## 2026-03-28 — Bottom dock and admin middle agent lost: EmbeddedAgentDock guard bug (commit `db73404`)

**Symptoms**: Selecting "Bottom" placement showed a floating FAB instead of the full-width bottom dock on `/dashboard`, `/admin`, and `/`. Selecting "Middle" placement on the admin dashboard (`/admin`) showed no agent at all.

**Root cause**: Commit `669bf36` ("bottom-dock agent inside dashboard content") added an `isBankingAgentDashboardRoute(pathname)` guard to `EmbeddedAgentDock.js` intended to prevent the App-level dock from rendering on dashboard routes (since `UserDashboard` was supposed to render it internally). However:
1. The same guard also caused `UserDashboard`'s own `<EmbeddedAgentDock>` render to return null — the dock never showed on any dashboard route.
2. `App.js` suppressed the global float agent for ALL `middle` placements (`agentPlacement !== 'middle'`), including when the admin was on `Dashboard.js` which has no inline middle FAB of its own. Admin in middle mode ended up with no agent at all.

**Fix**:
- `EmbeddedAgentDock.js` — removed the `isBankingAgentDashboardRoute` guard and its import. The component now renders wherever it is mounted (App level or UserDashboard level) as long as the user and placement guards pass.
- `App.js` — added `onUserDashboardRoute` flag (`pathname === '/dashboard'` OR `pathname === '/' && role !== 'admin'`). Used in two places:
  1. App-level `<EmbeddedAgentDock>` is skipped on UserDashboard routes (UserDashboard renders it inside its own layout).
  2. Middle-mode float suppression is scoped to UserDashboard routes only, so the admin Dashboard.js still receives the float agent in middle placement.

**Tests**: `CI=false npm run build` — successful. Manual: bottom dock shows full-width below content on `/dashboard`; admin on `/admin` with middle placement sees the float FAB.

---

## 2026-03-28 — Delegated Access: static Act-as panel replaced with live Token Exchange Simulator

**Symptoms**: The "Act as" panel on `/delegated-access` was purely static — it showed a hard-coded RFC 8693 explainer but did not make any real API call or display actual before/after tokens. There was no way to see the live exchange chain or inspect JWT claims.

**Root cause**: `ActAsPanel` was intentionally a demo-only explainer; no live exchange integration had been wired up.

**Fix**: Replaced `ActAsPanel` with `TokenExchangeSimulator`:
- On open, fires `POST /api/mcp/tool` (→ BFF → RFC 8693 exchange chain → `tokenEvents[]`).
- Left column renders the token chain steps (user-token → exchange-required → agent-actor-token → exchanged-token) with status badges.
- Right column shows selected event's `POST /as/token` request body, JWT claims with `may_act`/`act` highlighting, explanation, and full JWT toggle.
- Retry button, spinner, and error state handle network/auth failures.

**Tests**: `u:components/__tests__/DelegatedAccessPage.test.js` — 17 tests covering: dialog open, `fetch` call params, chain label rendering, auto-select of user-token, row-click panel switch, exchangeRequest body display, error state, empty tokenEvents, retry re-fetch, close, Full JWT toggle, page structure, and tab navigation.

---

## 2026-03-27 — Float panel: compact scrollable chips + free-resize (commits `4d1ea23`, `9cc0654`)

**Symptoms**:
1. Chips and action buttons in the float-mode left rail were too large — overflow was clipped, not scrollable.
2. Dragging the SE / E / S resize handles appeared to work but the panel stopped growing at 560 × 720 px.

**Root causes**:
1. `.banking-agent-panel` base rule had `max-width: 560px` and `max-height: min(85vh, 720px)`. CSS `max-*` properties always win over inline `width`/`height` regardless of specificity, so the JS resize logic was correctly updating `panelSize` but the CSS caps silently clamped the rendered size.
2. The base rule also included `resize: both`, which browsers ignore when `overflow: hidden` is set — dead code contributing to confusion.
3. `handleResize` used `Math.min(560, …)` for width and `Math.min(720, …)` for height — the same hard caps in the JS.
4. When `dragPos` was `null` (panel not yet dragged), `handleResize` did not anchor the panel position before resizing, so the first resize could shift the panel.
5. Float-mode left rail was 148 px wide with full-size chips (font 13 px, padding 8 px 10 px) — too much for the compressed space.

**Fixes**:
- **`BankingAgent.css`** — Removed `max-width`, `max-height`, and `resize: both` from `.banking-agent-panel`. Lowered `min-height` from `260px` to `220px`. Added compact float-mode chip overrides: left rail `width: 130px`, chip `font-size: 11px; padding: 5px 7px`. SE handle redesigned (20 × 20, visible grip `::after` dots); E handle full-height `6px`; S handle full-width `6px`.
- **`BankingAgent.js`** — `handleResize`: replaced `Math.min(560, …)` / `Math.min(720, …)` caps with `Math.floor(window.innerWidth * 0.9)` / `Math.floor(window.innerHeight * 0.9)`. Added `dragPos`-anchor logic: when `dragPos` is null, reads `panelRef.current.getBoundingClientRect()` and calls `setDragPos` synchronously before the first `mousemove`.

**Tests**: `CI=false npm run build` — compiled successfully. Manual: drag SE grip — panel grows beyond old 560/720 limits up to 90 % of viewport; chips in left rail are smaller and the rail scrolls when content overflows.

---

## 2026-03-27 — "Session expired" banner showing when user is signed in (commit `b7e806a`)

**Symptoms**:
User sees a yellow "Your session has expired. Please log in again." banner on the dashboard even though they just signed in via PingOne OAuth.

**Root cause**:
The Vercel serverless deployment (and any cold-start scenario) can restore a session from the signed `_auth` cookie with `accessToken: '_cookie_session'` (a stub). `GET /api/auth/oauth/user/status` returns `authenticated: true` (cookie-based user data is present), but `GET /api/accounts/my` returns `401` because `authenticateToken` finds no real bearer token. `fetchUserData` in `UserDashboard.js` treated any 401 as a genuine session expiry and fired `toastCustomerError` — showing the banner even though the PingOne SSO session was still valid and a silent re-auth would succeed instantly.

**Fix**:
- **`UserDashboard.js`** — on non-silent `401` from `/api/accounts/my` or `/api/transactions/my`, redirect immediately to `/api/auth/oauth/user/login` instead of showing the banner. PingOne's SSO session makes this transparent (no credentials required). A `sessionStorage` guard key (`bx-dashboard-reauth`) prevents redirect loops: if re-auth still yields `401` after one redirect (broken PingOne config), the guard fires and the banner is shown as a fallback so the user can act.
- On successful data fetch, the guard key is cleared so future expiry after a genuinely-expired SSO session still redirects once.

**Tests**: `CI=false npm run build` — compiled successfully. Manual: open dashboard with expired/stub token — browser is silently redirected to PingOne and back, no banner shown; PingOne SSO session expired — banner appears after one redirect attempt.

---

## 2026-03-27 — Float agent not visible + drag broken after expand button

**Symptoms**:
1. Float agent FAB and open panel both disappeared on dashboard routes.
2. After clicking the expand/restore (⊞/⊟) button, dragging the panel no longer moved it.

**Root causes**:
1. `showFloatingAgent` in App.js gated on `agentPlacement === 'none' || agentFab`. If the user had previously set placement to `'bottom'` or `'middle'` with `fab: false` (via the Agent UI Mode toggle), `showFloatingAgent` became `false` and the entire `BankingAgent` component — including the FAB — was never rendered.
2. `handleDragStart` only called `setDragPos` when `dragPos === null` (first drag). After clicking ⊞ expand, `setIsExpanded(true)` is called. `panelStyle` checks `isExpanded` **before** `dragPos`, so the centered/expanded style always won — dragging set `dragPos` but the panel didn't move. The `[dragPos]` dependency on the `useCallback` also caused a stale closure when `dragPos` was already set.

**Fixes**:
- **App.js** — `showFloatingAgent`: removed the `(agentPlacement === 'none' || agentFab)` gate. Float agent now always renders on dashboard routes when the user is signed in. If an inline/dock agent is also active, the FAB coexists as a small corner button.
- **BankingAgent.js** — `handleDragStart`: now always calls `setDragPos({ x: rect.left, y: rect.top })` (unconditionally) and adds `setIsExpanded(false)` to exit expanded mode before applying the drag position. Removed stale `[dragPos]` dep — callback is now `[]`.

**Tests**: `CI=false npm run build` — compiled successfully. Manual: drag panel → click ⊞ → drag again → panel moves correctly. FAB visible even when `agentPlacement` is `'bottom'` or `'middle'` in localStorage.

---

## 2026-03-27 — Floating agent panel closes on page refresh

**Symptoms**:
Floating (FAB) agent panel was always closed after a browser refresh, even if the user had opened it. The panel also defaults to closed on `/dashboard` routes — so a refresh always reset the open state.

**Root causes**:
1. `useState` initializer read `isBankingAgentFloatingDefaultOpen(pathname)` which returns `false` for all dashboard routes — no localStorage fallback existed.
2. Route-change `useEffect([location.pathname, isInline])` fired on initial mount (same pathname) and called `setIsOpen(false)` again, overriding anything the initializer could have set from storage.

**Fixes** — `BankingAgent.js`:
- **`useState` initializer** — now checks `localStorage.getItem('banking-agent-open')` first; falls back to `isBankingAgentFloatingDefaultOpen` only when no saved value exists. Inline mode (`isInline=true`) is excluded and always returns `false`.
- **`hasMountedRef` guard** — a `useRef(false)` flag in the route-change effect skips the first call (initial mount), preserving the localStorage-restored value; subsequent pathname changes still close the panel on dashboard routes as designed.
- **Persist effect** — a new `useEffect([isOpen, isInline])` writes `String(isOpen)` to `localStorage('banking-agent-open')` on every toggle.

**Tests**: `CI=false npm run build` — compiled successfully. Manual: open panel → refresh → panel stays open.

---

## 2026-03-27 — Log viewer: remove nav buttons + light background

**Symptoms**:
1. Standalone `/logs` window had a top nav bar of buttons (Dashboard / Admin / Demo config) cluttering the top of the window.
2. Full dark background (`#1e1e1e`/`#252525`) matched the terminal aesthetic but was hard to read in bright environments.

**Root causes**:
1. `LogViewerPage.js` rendered a `log-page-nav` div with three `Link` buttons above the `LogViewer` component.
2. All CSS was hard-coded to dark palette — header/controls `#252525`, table `#1e1e1e`, text `#ddd`, borders `#333`/`#444`.
3. Refresh, Download, and Clear action buttons in the toolbar were redundant with auto-refresh.

**Fixes**:
- **`LogViewerPage.js`** — Removed `log-page-nav` div and unused `Link` import. Standalone viewer now fills the full `100vh` window with no nav bar.
- **`LogViewer.js`** — Removed Refresh, Download, and Clear buttons from the controls toolbar. Auto-refresh/auto-scroll checkboxes remain. Added `eslint-disable` comments on `clearLogs`/`downloadLogs` (preserved but not rendered).
- **`LogViewer.css`** — Full light-theme rewrite: backgrounds `#ffffff`/`#f8fafc`/`#f1f5f9`, borders `#e2e8f0`/`#cbd5e1`, text `#0f172a`/`#1e293b`/`#64748b`. Chip buttons, selects, inputs, table headers/rows, footer, scrollbars all updated to light palette. `log-viewer-standalone` height changed to `100vh` (was `calc(100vh - 56px)` to accommodate the removed nav bar).

**Tests**: `CI=false npm run build` — compiled successfully. Manual: open `/logs` — no nav buttons, light background, table rows legible.

---

## 2026-03-27 — API Traffic window: freeze button + light theme

**Symptoms**:
1. Live log kept updating while the user was trying to read an entry — no way to pause/inspect.
2. Dark background (`#0f172a` slate) made the viewer hard to read in bright environments.

**Root causes**:
1. `ApiTrafficPanel` subscribed to the store unconditionally with no freeze mechanism.
2. All CSS colours were hard-coded to dark slate palette.

**Fixes**:
- **`ApiTrafficPanel.js`** — Added `frozen` + `frozenEntries` state. **⏸ Freeze** button snapshots `liveEntries` into `frozenEntries`; list shows the snapshot while frozen. **▶ Resume** clears the snapshot and reverts to live feed. A `FROZEN` amber badge appears in the title bar. Live capture continues in the background regardless.
- **`ApiTrafficPanel.css`** — Full light-theme rewrite: background `#ffffff`/`#f8fafc`, borders `#e2e8f0`, text `#0f172a`/`#334155`. JSON syntax colours updated to dark-on-white (keys `#1d4ed8`, strings `#15803d`, numbers `#b45309`). Token event status badges updated to light variants. Added `.api-traffic-btn--frozen` amber style.

**Tests**: `CI=false npm run build` — compiled successfully. Manual: open `/api-traffic` — light background; click Freeze — list stops updating, badge shows FROZEN; inspect entry; click Resume — live again.

---

## 2026-03-27 — Split3: agent bottom cut off, columns unequal, layout disconnected from header

**Symptoms (3 bugs)**:
1. Agent panel bottom was cut off — input bar / action strip not visible.
2. All three columns were not equal width (token rail was fixed 300 px, the other two divided the rest).
3. 3-column grid appeared visually disconnected from the header (32 px gap, rounded corners on header).

**Root causes**:
1. `.banking-agent-panel` base rule has `max-height: min(85vh, 720px)`. `.ba-mode-inline` never reset it, so taller grids clipped the panel at 720 px.
2. `grid-template-columns: 300px 1fr 1fr` — hardcoded first column, not equal thirds.
3. `height: min(calc(100vh - 130px), 900px)` — wrong magic number (real header is ~165–180 px tall, not 130 px), so the grid always overflowed the viewport by 35–50 px. Also, `dashboard-header-stack` had `margin-bottom: 32px` creating a visual gap. A duplicate property `height: auto` was immediately overridden by the `height: min(…)` below it on the same rule.

**Fixes**:
- **`BankingAgent.css`** — Added `max-height: none; min-height: 0` to `.banking-agent-panel.ba-mode-inline` so container drives the height in inline contexts.
- **`UserDashboard.css`** — Changed `grid-template-columns` from `300px 1fr 1fr` to `1fr 1fr 1fr` everywhere (base rule + `ud-body--2026` override + `@media (max-width:1280px)`).
- **`UserDashboard.css`** — Dropped the magic-number `height: min(calc(100vh - 130px), 900px)` and `min-height: 500px`. The `.user-dashboard--split3` wrapper is now `height: 100vh; display: flex; flex-direction: column; overflow: hidden` so the 3-col grid receives `flex: 1 1 0%` and fills exactly the remaining viewport.
- **`UserDashboard.css`** — In split3 mode `dashboard-header-stack` gets `margin-bottom: 0` + no bottom border-radius so it connects flush to the grid edge → one cohesive page.

**Commits**: `8a8d1b4`, `0f91ffa`

**Tests**: `CI=false npm run build` — compiled successfully. Manual: Middle split — all 3 columns equal width; agent chat input visible; no overflow; header and grid appear as one unit.

---

## 2026-03-27 — Split3: flush columns, wider token rail, integrated bottom dock, quick nav everywhere

**Symptoms (multiple)**:
1. Token chain column too narrow (220 px) — RFC labels and flow text cramped.
2. Visual gap / whitespace between agent column and customer data column in Middle split view.
3. Bottom dock (Bottom Agent UI mode) looked like a detached floating widget (rounded corners, gradient shadow).
4. Quick nav rail (Home / Dashboard / API / Logs) disappeared on `/demo-data`, `/config`, `/mcp-inspector`, `/logs`, `/activity`.
5. Left-rail padding (`App--has-quick-nav`) intermittently missing — content overlapped FAB buttons.

**Root causes**:
1. `grid-template-columns` hard-coded `220px` for token rail.
2. `.ud-agent-column` had `padding: 10px 10px 0` — shrinking the agent panel away from its right neighbour. `.ba-split-column` had `border-radius: 10px 10px 0 0` leaving corner gaps.
3. `.global-embedded-agent-dock-wrap` had `border-radius: 12px 12px 0 0`, gradient `box-shadow`, isolated background.
4. `isDashboardQuickNavRoute()` only covered `/`, `/admin`, `/dashboard`, `/admin/banking`.
5. `AppRouteChrome` added `App--has-quick-nav` via `classList.toggle()`; React re-renders overwrote `className`, stripping it.

**Fixes**:
- **`UserDashboard.css`**: token rail `220px → 300px`; outer split3 container `border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden`; agent column `padding: 0` (was `10px 10px 0`).
- **`BankingAgent.css`**: `.ba-split-column` `border-radius: 0; width: 100%` — fills column flush.
- **`App.css`**: dock wrapper — removed gradient shadow and border-radius; toolbar has blue left accent + section-label title.
- **`embeddedAgentFabVisibility.js`**: `isDashboardQuickNavRoute` expanded to include `/demo-data`, `/config`, `/mcp-inspector`, `/logs`, `/activity`.
- **`App.js`**: removed `AppRouteChrome`; `showQuickNav` + `isOnDashboard` computed inline and included in declarative `className`.

**Tests**: `CI=false npm run build` — compiled successfully. Manual: Middle split — 3 columns flush, no whitespace between agent and accounts; Bottom dock visually part of page; nav rail on all signed-in pages.

---

## 2026-03-27 — Agent UI placement (Middle/Bottom/Float) + bottom dock integration

**Symptom**: Agent UI toggle only offered Floating/Embedded/Both with no clear distinction between "agent in middle column" vs "agent pinned at the bottom"; bottom dock had a visible gap between page content and the panel, with rounded corners that made it look detached.

**Root cause**: `AgentUiModeContext` stored a flat `mode` string with no separation of placement vs FAB overlay. `EmbeddedAgentDock` rendered the resize handle between the toolbar and the agent body (not at the top), and `padding-bottom: 12px` on `.user-dashboard--embed-agent` created a gap before the dock.

**Fix**: `AgentUiModeContext` — state is now `{ placement: 'middle'|'bottom'|'none', fab: boolean }`, persisted as `banking_agent_ui_v2`. `AgentUiModeToggle` — **Middle / Bottom / Float** buttons; **+ FAB** checkbox when placement is middle or bottom (not all three at once). `EmbeddedAgentDock` — resize handle moved to first child (acts as the seam); no `margin-top`; rounded corners only when collapsed; `padding-bottom: 0` on dashboard wrapper. Split3 token-chain column reduced to `160–200px`. `demoScenario.js` GET handler — `bankingAgentUi` now computed via `effectiveBankingAgentUi` before use in response payload.

**Tests**: `AgentUiModeContext.test.js`, `embeddedAgentFabVisibility.test.js`, `demo-scenario-api.test.js`. Manual: toggle between Middle/Bottom/Float; verify dock flush-joins content; verify token rail stays slim in split view.

---

## 2026-03-27 — Split-column agent: SecureBank-style chrome, scroll regions, education hamburger

**Symptom**: Split-dashboard middle column needed a compact assistant look (navy header, bubbles, **Send**), independent scrolling for transcript vs chips/actions, and **Education** / agent UI controls could not sit in a full-width bar beside the token rail.

**Root cause**: Inline **`BankingAgent`** in the three-column grid used the same two-column body as other embeds; **`.ba-split-column`** visual tokens were incomplete; **EducationBar** was a horizontal strip.

**Fix**: **`BankingAgent.css` / `BankingAgent.js`** — **`splitColumnChrome`** styling (header session, **Sign out**, message/input/send, **`ba-split-suggestions-row`**), flex **`order`** so chat + input sit above the tray, overflow on messages and tray. **`EducationBar`** — top-right hamburger + panel (offset from **`UIDesignNav`**). **`UserDashboard.css`** — agent column flex height for embedded panel. **`docs/PINGONE_AUTHORIZE_PLAN.md`**, **`MCP_GATEWAY_PLAN.md`**, **`PingOneAuthorizePanel.js`** — Authorize/decision-endpoint cross-links.

**Tests**: **`cd banking_api_ui && CI=true npm run build`**. Manual: **`/dashboard`** Split view — scroll chat and lower tray; **Classic** + **Embedded** — bottom dock; **Floating** FAB on dashboard routes when mode allows.

---

## 2026-03-27 — Customer split dashboard; agent modes (Floating / Embedded / Both); HITL consent popup

**Symptom**: Users lost the top-of-screen agent mode switch on `/dashboard`; they wanted token chain left, embedded assistant center, banking content right, with a way to revert to the previous layout. High-value HITL navigated away to a full consent page.

**Root cause**: `/dashboard` did not render the same education/toolbar affordances as home; layout was single-column banking + floating zone. Consent flow used **`navigate('/transaction-consent?challenge=…')`** only.

**Fix**: **`dashboardLayout.js`** + **`DashboardLayoutToggle`** — **`split3`** (default) vs **`classic`** in **`localStorage`**, event **`banking-dashboard-layout`** for **`App.js`** to re-evaluate FAB/dock vs inline agent. **`UserDashboard`** — three-column grid when **`split3`**, **`BankingAgent`** **`mode="inline"`** in center column. **`AgentUiModeContext`** + **`demoScenario.js`** — restore **`both`** (FAB + bottom dock) when not on split3 ( **`customerSplit3Dashboard`** suppresses duplicate chrome). **`TransactionConsentModal`** — modal + checkbox authorizing the assistant; **`openConsentFlowForPayload`** sets **`consentChallengeId`** instead of navigating; **`TransactionConsentPage`** thin route wrapper for deep links. **`App.js`** — hooks before loading return; **`split3Customer`** memo with **`dashboardLayoutTick`**.

**Tests**: **`CI=true npm run build`** (`banking_api_ui`); **`AgentUiModeContext.test.js`**, **`embeddedAgentFabVisibility.test.js`**, **`demo-scenario-api.test.js`**. Manual: **`docs/runbooks/regression/post-deploy.md`** §2 (consent popup, Split/Classic, agent toggle).

---

## 2026-03-26 — Embedded agent on `/config` (setup focus); Demo config page matches 2026 dashboard shell

**Symptom**: Application Configuration had no embedded bottom dock when Agent UI mode was embedded; the dock copy and shortcuts were banking-centric everywhere. **`/demo-data`** still used the older **`app-page-shell`** layout (gradient hero + **`PageNav`**) instead of the customer **`UserDashboard`** header stack and toolbar.

**Root cause**: **`isBankingAgentDashboardRoute`** gated **`EmbeddedAgentDock`** and **`App--has-embedded-dock`** to **`/`** / **`/admin`** / **`/dashboard`** only — **`/config`** was excluded. **`BankingAgent`** had no “application setup” variant for the dock. **`DemoDataPage`** did not import **`UserDashboard.css`** or reuse **`dashboard-header-stack`** / **`dashboard-toolbar`**.

**Fix**: **`embeddedAgentFabVisibility.js`** — **`isEmbeddedAgentDockRoute(pathname)`** includes **`/config`**; floating FAB still uses **`isBankingAgentDashboardRoute`** only (no FAB on **`/config`**). **`App.js`** — **`hasEmbeddedDockLayout`** uses **`isEmbeddedAgentDockRoute`**. **`EmbeddedAgentDock`** — show on embedded dock routes; on **`/config`**, dock title/lead and **`embeddedFocus="config"`** on **`BankingAgent`**. **`BankingAgent`** — prop **`embeddedFocus`** **`'banking'`** | **`'config'`**; config mode: setup title/subtitle, **`SUGGESTIONS_CONFIG_*`**, actions limited to **MCP tools** + **Log out**, updated welcome copy. **`DemoDataPage`** — **`user-dashboard user-dashboard--2026`**, same header/toolbar pattern as **`UserDashboard`** (breadcrumbs, education shortcuts, theme toggle); **`section` / **`ud-hero`** for intro; **`useEducationUI`**; removed **`PageNav`** / **`appShellPages`** for this page.

**Tests**: **`embeddedAgentFabVisibility.test.js`** (**`isEmbeddedAgentDockRoute`**, FAB hidden on **`/config`** when floating); **`DemoDataPage.test.js`** mocks **`EducationUIContext`**. Manual: embedded mode — dock on **`/config`** with setup copy; **`/demo-data`** matches dashboard chrome.

---

## 2026-03-27 — Banking Agent: dashboard-only floating UI; HITL routes; floating panel sizing; consent GET

**Symptom**: Floating agent appeared on marketing and tool routes; panel was too small to read chips and suggestions; HITL consent page and admin banking ops were not routed; `DashboardQuickNav` crashed (`isBankingAgentDashboardRoute` referenced without import).

**Root cause**: `showFloatingAgent` used `!user || agentUiMode === 'floating'` (agent everywhere when signed in); default panel size and expanded height used `min(80vh, 260px)`; server lacked **`GET /api/transactions/consent-challenge/:challengeId`** for the consent UI snapshot.

**Fix**: **`App.js`** — `Router` wraps **`AppWithAuth`**; floating agent only when **signed in**, **floating mode**, and **`isBankingAgentDashboardRoute(pathname)`** (`/`, `/admin`, `/dashboard`); **`App--has-embedded-dock`** only on those routes. **`BankingAgent.js` / `BankingAgent.css`** — larger defaults, fixed expand dimensions, resize limits, results panel offset. **`routes/transactions.js`** — register **GET** consent challenge before **`GET /:id`**. **Routes**: **`/admin/banking`**, **`/transaction-consent`**; **`UserDashboard`** — on **`consent_challenge_required`**, create challenge and navigate to consent; return-state toasts. **`DashboardQuickNav`** — use **`isDashboardQuickNavRoute(pathname, user)`**. **`embeddedAgentFabVisibility`** — **`shouldShowGlobalFloatingBankingAgentFab`** matches dashboard-only rule. **Logo SVGs** — explicit **`#ffffff`** text fills; landing **`.brand-name`** white.

**Tests**: `embeddedAgentFabVisibility.test.js`; `App.session.test.js` mock includes **`Router`**; `banking-agent.spec.js` — no FAB on unauthenticated `/`; title assertion on `/dashboard`; `npm test` in `banking_api_server` (consent). Manual: **`docs/runbooks/regression/post-deploy.md`**.

---

## 2026-03-27 — Dashboard shell UX: quick nav scope, rail layout, admin lookup, agent mode toggle

**Symptom**: Left-rail controls overlapped main content and headers; quick nav appeared on marketing and config routes; users wanted CIBA/CIMD-style blocks with alternating colors; admin needed customer lookup with PingOne-enriched profile and accounts/transactions.

**Root cause**: `DashboardQuickNav` mounted for all routes with `App--has-quick-nav` always on; no `padding-left` on `.App` reserved space for the fixed stack; link-styled `<Link>` rows; admin lookup returned transactions only from local seed.

**Fix**: **`DashboardQuickNav`** only when **signed in** and path is **`/`**, **`/admin`**, or **`/dashboard`** (`isBankingAgentDashboardRoute`); **`AppRouteChrome`** toggles **`App--has-quick-nav`** for content inset; base **`--stack-fab-top-demo`** when quick nav off vs full stack when on; **`pingOneUserLookupService`** + **`POST /api/admin/transactions/lookup`** merges PingOne directory fields when worker token can read users; **`AgentUiModeToggle`** on landing nav, learn bar, and Config; alternating red/teal quick-nav buttons; static mocks under **`public/design/`** updated.

**Tests**: `embeddedAgentFabVisibility` / demo-scenario tests where touched; manual per **`docs/runbooks/regression/post-deploy.md`**.

---

## 2026-03-27 — Playwright BankingAgent E2E specs out of sync with current UI

**Symptom**: `tests/e2e/banking-agent.spec.js` failed (collapse control, action-row clicks, form assertions). Examples: collapse locator matched **two** `role="button"` nodes (header drag handle + collapse icon); `/Transfer/i` matched **suggestion** chips and **action** rows; **`ActionForm`** uses **Account** `<select>`s and labels like **Amount ($)** / **From Account**, not free-text “Account ID” or the old input order.

**Root cause**: Tests were written for an older BankingAgent layout and form schema; Playwright **accessible name** matching is not unique for `getByRole('button', { name: 'Collapse agent' })` when another `role="button"` exists in the panel header.

**Fix**: Scope **collapse** to `.ba-header-tools button[aria-label="Collapse agent"]` ; scope **MCP action** clicks to `.ba-action-item` under the panel; assert **core** banking actions by label instead of a fixed `.ba-action-item` count (Session / Learn rows added more buttons); align balance/deposit/withdraw/transfer tests with **`#field-accountId`**, **`#field-amount`**, etc., and dynamic MCP `account_id` / transfer IDs from the selected options.

**Tests**: `cd banking_api_ui && npm run test:e2e:agent` (or `npx playwright test tests/e2e/banking-agent.spec.js`).

---

## 2026-03-26 — UI notifications: centralized toasts (success / error / warning)

**Symptom**: Mixed patterns (`alert()`, inline banners, direct `toast.*`) made outcomes inconsistent; **`Transactions.js`** called **`setError`** without state (silent failure); **`OAuthDebugLogViewer`** called **`setError`** without state; **`BankingAdminOps`** used **`toast.error`** without importing **`toast`**.

**Root cause**: No single convention for user-visible feedback; some components predated **`appToast`** helpers.

**Fix**: **`banking_api_ui/src/utils/appToast.js`** — **`notifySuccess` / `notifyError` / `notifyWarning` / `notifyInfo`**; **`dashboardToast.js`** for session messages with **Sign in** actions. Migrated **Dashboard**, **UserDashboard**, **BankingAgent**, **Config**, **DemoDataPage**, **ActivityLogs**, **AgentUiModeToggle**, **ClientRegistrationPage**, **SecuritySettings**, **Transactions**, **OAuthDebugLogViewer**, **BankingAdminOps**. **UserDashboard** step-up (428) uses a **persistent warning toast** with CIBA / email verify (**`toastId: customer-step-up`**). **`McpInspector`**: JSX spacing fix for ESLint **`no-undef`**. **`EmbeddedAgentDock`**: CSS custom property style object lint.

**Tests**: **`cd banking_api_ui && CI=true npm run build`**; manual checks per **`docs/runbooks/regression/post-deploy.md`** (§4 step-up toast).

---

## 2026-03-26 — HITL consent HTTP routes missing; scope tests out of sync with GET /api/transactions/my

**Symptom**: `transaction-consent-challenge.test.js` and `step-up-gate.test.js` failed (404 on `/api/transactions/consent-challenge`; high-value `POST /api/transactions` returned **201** without a consent flow). OAuth scope suites expected **200** on **`GET /api/transactions/my`** when the token only had **`banking:accounts:read`** or **`banking:write`**.

**Root cause**: **`transactionConsentChallenge`** existed (and MCP/local tools used it), but **`routes/transactions.js`** did not register **`POST /consent-challenge`** / **`POST /.../confirm`** or call **`verifyAndConsumeChallenge`** on **`POST /`**. Tests assumed **`/transactions/my`** behaved like **`/accounts/my`** (scope-independent).

**Fix**: Register consent routes **before** **`GET /:id`**; after balance checks, require a consumed session challenge for non-admin **deposit** / **withdrawal** / **transfer** when **amount > $500**. Align Jest expectations with **`requireScopes(['banking:transactions:read', 'banking:read'])`** on **`GET /my`**.

**Tests**: `cd banking_api_server && npm test -- --forceExit`; `transaction-consent-challenge.test.js`, `step-up-gate.test.js`, `oauth-scope-integration.test.js`, `scope-integration.test.js`, `oauth-e2e-integration.test.js`.

---

## 2026-03-26 — Customer dashboard blank / no accounts or transactions

**Symptom**: Dashboard looked **empty** or failed to show accounts and activity even when the user was signed in.

**Root cause**: **`GET /api/accounts/my`** and **`GET /api/transactions/my`** were requested together — **`/transactions/my`** requires **banking read scopes**; a **403** failed the **entire** request so accounts never applied. Some API rows used **`created_at`** or missing **`balance`**, which broke rendering. No **fallback** when OAuth session was missing or loads failed.

**Fix**: **Separate** fetches; on transaction **403**, show **sample** activity with an info toast; **normalize** account/transaction fields; **`cloneDemoAccounts` / `cloneDemoTransactions`** when API returns no accounts, on soft **401**, session error, or hard errors; **“No transactions yet”** row when accounts exist but history is empty.

**Tests**: Manual.

---

## 2026-03-26 — Duplicate “session expired” toasts while still signed in

**Symptom**: Two stacked toasts: “Your session has expired. Please log in again.” with **Sign in**, despite an active session.

**Root cause**: **`/api/accounts/my`** / **`/api/transactions/my`** can return **401** while **`/api/auth/oauth/*/status`** still shows authenticated (JWT/session lag, rate limits, or races). The UI treated every **401** as hard expiry. **Parallel** agent refreshes and **react-toastify** without a stable **`toastId`** could stack identical session toasts.

**Fix**: **Retry** banking GETs on **401** with backoff; **`resolveSessionUser()`** — if a user still exists, **one** soft **`toast.warn`** (`toastId`) instead of expiry; only when no user: **`toastCustomerError`** + **`toastId: customer-auth-required`**. Agent refresh: **single** delayed fetch.

**Tests**: Manual.

---

## 2026-03-26 — Dashboard did not update after agent transfer (hosting window + agent results)

**Symptom**: After a transfer (or deposit/withdraw) via the Banking Agent, **Recent Transactions** on the main dashboard and the agent results panel did not show the new activity.

**Root cause**: **`UserDashboard`** had **no** `window` listener for **`banking-agent-result`**, so nothing refetched **`/api/accounts/my`** / **`/api/transactions/my`**. **`BankingAgent`** only dispatched that event in **full-page** display mode, and MCP write responses use **`success` / `operation` / nested `transaction`** shapes without top-level **`transaction_id`**, so the results panel often skipped updates until a manual “Recent Transactions” run.

**Fix**: **`UserDashboard`**: listen for **`banking-agent-result`**, apply optimistic row updates where applicable, and **silent `fetchUserData`** on a short delay; allow overlapping **silent** refreshes so agent double-fire is not dropped. **`BankingAgent`**: **`inferAgentResultTypeAndData`**, always dispatch **`banking-agent-result`** for panel + full page, and after **transfer/deposit/withdraw** call **`get_my_transactions`** so the side panel lists fresh rows.

**Tests**: Manual (agent transfer while on `/` or `/dashboard`).

---

## 2026-03-26 — MCP token exchange “skipped”; `get_account_balance` “Account optional not found”; floating agent scroll / expand layout

**Symptom**: Token Chain / toasts said token exchange was **skipped** (`MCP_RESOURCE_URI` unset) and the user token was forwarded; NL “Check my account balance” failed with **`Account optional not found`**; floating Banking Agent could not scroll chat; clicking **expand (⊞)** left the **Recent Transactions** results panel in the wrong place (still bottom-right while the agent centered).

**Root cause**: (1) **`resolveMcpAccessTokenWithEvents`** returned the **user access token** when `mcp_resource_uri` was unset — no RFC 8693, no audience/scope narrowing. (2) Groq/Gemini NL prompts used **`"accountId":"optional"`** as schema documentation; models copied the literal **`optional`** as `account_id`, producing **`Account optional not found`**. (3) Flex layout: left rail **`min-height: auto`** let the column dictate row height so **`.banking-agent-messages`** never got a bounded scroll area. (4) Results panel CSS assumed a **docked** agent width; **expanded** mode centers the agent but results still used the old **`right:`** position.

**Fix**: **Mandatory** `mcp_resource_uri` / `MCP_RESOURCE_URI` for MCP — **no passthrough**; **≥ `MIN_USER_SCOPES_FOR_MCP_EXCHANGE`** (default 5) distinct scopes on the user JWT before exchange; **admin + user OAuth** `scopes` now include **banking scopes** from `getScopesForUserType` so authorize requests enough scopes to narrow. NL prompts/sanitizer + **`mcpLocalTools.get_account_balance`** ignore placeholder **`optional`**. **BankingAgent.css**: flex **`min-height: 0`** on columns, **`touch-action: pan-y`** on messages. **BankingAgent.js**: **`useMemo`** positions **`ResultsPanel`** when **`isExpanded`** (left of centered agent). **`server.js` / `mcpInspector`**: return **`err.httpStatus`**, **`err.code`**, **`err.tokenEvents`** on resolution failures.

**Tests**: `agentMcpTokenService.test.js`, `nlIntentSanitize.test.js`; `npm test` subsets for MCP + NL.

---

## 2026-03-26 — HOME rail opened dashboard instead of marketing landing

**Symptom**: **HOME** navigated to **`/admin`** / **`/dashboard`** (same as the dashboard FAB), not the public marketing page.

**Root cause**: **`homeFabPath`** was set to the same paths as the second dashboard button for “nested splat” reliability.

**Fix**: **`homeFabPath`** → **`/welcome`** when signed in; route **`/welcome`** renders **`LandingPage`**; **Admin** / **Dashboard** FABs unchanged.

**Tests**: Manual.

---

## 2026-03-26 — “Session expired” toast while still signed in; Banking Agent panel too large

**Symptom**: Red toast “Your session has expired…” appeared during normal use; floating/embedded Banking Agent UI dominated the screen.

**Root cause**: `UserDashboard.fetchUserData` retried **401** on accounts but not before the final failure path; **`GET /api/transactions/my`** could return **401** during JWT/session lag while the BFF still reported an authenticated user via `/api/auth/oauth/user/status`. Admin dashboard showed the same toast on **401** after retries without re-checking admin session.

**Fix**: Retry **401** up to three times with backoff; **401** after retries calls **`resolveSessionUser()`** — if a user is still returned, show a **warning** (refresh / agent token) instead of the session-expired toast; **pending refetch** after a soft 401 remains allowed. Admin dashboard: same check before **`toastAdminSessionError`**. Banking Agent default size **halved** (e.g. **260×210** float, **320×260** expanded, narrower left column and results panel; embedded dock default/max heights halved in `App.js`).

**Tests**: Manual / existing `accountsHydration` unit tests.

---

## 2026-03-26 — Demo config save shows `invalid_token` toast

**Symptom**: Saving demo configuration showed **invalid_token** toasts (regression; save had worked before).

**Root cause**: `authenticateToken` validated the OAuth access token from `session.oauthTokens` when no `Authorization` header was present; an **expired or JWKS-invalid** access token produced **401** even when the BFF session cookie and `session.user` were still valid.

**Fix**: When token validation fails but `req.session.user` exists and the route is not blocked, attach **`req.user`** from session (with `sessionAccessTokenInvalid: true`) and **`next()`** — same trust model as `_cookie_session`. **`DemoDataPage`** maps **`invalid_token`** to a short user-facing hint (refresh token in Banking Agent or sign in again).

**Tests**: `banking_api_server` — `demo-scenario-api.test.js` and auth-related Jest suites pass.

---

## 2026-03-26 — Session BFF contract tests + `test:session` script

**Symptom**: Risk of regressions in `GET /api/auth/session` (`sessionStoreHealthy` / `sessionStoreError`) and session debugging without a dedicated test or npm script.

**Fix**: `banking_api_server` adds `npm run test:session` (Jest subset). `authSession.test.js` includes a **production-shaped** middleware block that sets `req._sessionStoreHealthy` / `req._sessionStoreError` before auth routes, asserting the JSON contract. `banking_api_ui/tests/e2e/session-regression.spec.js` adds Playwright API smoke for `/api/auth/session` and `/api/auth/debug`. Runbook: `docs/runbooks/session-regression.md`.

**Tests**: `banking_api_server/src/__tests__/authSession.test.js` — `session store ping contract`; `npm run test:session`; `npm run test:e2e:session` or `npm run test:e2e:api` in `banking_api_ui` (with API server up).

---

## 2026-03-26 — OAuth callback redirected to dashboard when session save failed

**Symptom**: After PingOne login the browser reached `?oauth=success` while `/api/auth/debug` could still show `accessTokenStub: true` — user appeared “logged in” but MCP/NL and token-backed routes failed.

**Root cause**: `req.session.save()` errors in the OAuth **callback** were treated as non-fatal: the code still set the signed `_auth` cookie and redirected to `/dashboard` or `/admin`, so the UI looked successful even when persistence did not complete.

**Fix**: On `saveErr`, call `req.session.destroy()`, `clearAuthCookie()`, and redirect to `/login?error=session_persist_failed` (end-user and admin OAuth callbacks). Login shows a dedicated message. **Note:** `UpstashSessionStore.set()` and the wire `faultTolerantStore` still invoke `cb(null)` when Redis SET fails, so many persistence failures never surface as `saveErr`; server logs remain important.

**Tests**: `banking_api_server/src/__tests__/oauth-e2e-integration.test.js` — still green; callback success paths unchanged when save succeeds.

---

## 2026-03-26 — Banking Agent blamed “unhealthy Redis” when Upstash was healthy (stub token)

**Symptom**: Session debug showed `sessionStoreHealthy: true` and `sessionStoreError: null`, but `accessTokenStub: true` and MCP/NL failed. The Banking Agent copy implied the session **store** was broken.

**Root cause**: Cookie-restore injects `oauthTokens.accessToken === '_cookie_session'`. With no `sessionStoreError`, the agent’s “not hydrated” message defaulted to generic “unhealthy store” wording instead of “tokens missing for this session / cookie restore.”

**Fix**: `buildSessionNotHydratedChat` branches on healthy store vs quota vs errors; `/api/auth/session` returns `sessionStoreHealthy`; `/api/auth/debug` adds `oauthTokenSummary`, `diagnosisHints`, `sessionInMemoryCache`, `sessionCircuitLastError`, and optional `?deep=1` Redis row probe (`getPersistenceDebug`). Banking Agent “Open session debug” uses `/api/auth/debug?deep=1`.

**Tests**: `banking_api_server/src/__tests__/upstashSessionStore.test.js` — `getPersistenceDebug()` suite.

---

## 2026-03-26 — AI agent FAB: opens then immediately closes (flash)

**Symptom**: Clicking the floating banking agent to expand showed the panel briefly, then it collapsed again (or felt like it “flashed”).

**Root cause**: `isBankingAgentOpenByDefaultForPath` was stubbed to always return `false`, but several `useEffect` hooks still called `setIsOpen(isBankingAgentOpenByDefaultForPath(...))` whenever **`user`** resolved, on **mount session discovery**, and on every **`userAuthenticated`** event. After the user opened the panel, the next auth sync forced **`isOpen` back to `false`**.

**Fix**:

- Introduce `isBankingAgentFloatingDefaultOpen(pathname)` in `banking_api_ui/src/utils/bankingAgentFloatingDefaultOpen.js` (collapsed on dashboard homes, open on other routes — aligned with `isBankingAgentDashboardRoute`).
- **Only** apply that default when **`location.pathname` changes** (and for initial `useState`), not when `user` / session / `userAuthenticated` updates.
- Remove `setIsOpen` from user/session/`userAuthenticated` effects; keep welcome-message and `checkSelfAuth` behavior.

**Tests**: `banking_api_ui/src/utils/__tests__/bankingAgentFloatingDefaultOpen.test.js`

---

## 2026-03-26 — Customer dashboard: no account rows after login

**Symptom**: After customer login, the dashboard showed “No account data” / empty table even though the demo should auto-provision accounts.

**Root causes (combined)**:

- **401 / session drift** — OAuth status could show authenticated before `GET /api/accounts/my` accepted the token (partially addressed elsewhere by `refreshIfExpiring` on `/api/auth/oauth`).
- **Transient 5xx / 503** — the UI retried some 5xx but **excluded 503**, so cold-start style responses were not retried.
- **Empty list** — no client-side retry when the first response returned **200 with `accounts: []`** (provision race).

**Fix**:

- `banking_api_ui/src/services/accountsHydration.js` — `fetchMyAccountsWithResilience`: bounded retries with backoff for **401**, **5xx including 503**, and **empty** lists; respects `userLoggedOut`.
- `UserDashboard.js` — uses the helper for hydration; empty-state copy + **Retry loading accounts** button.
- Transient classification for this flow: **429** is not retried in the helper (rate-limit UX unchanged).

**Tests**: `banking_api_ui/src/__tests__/accountsHydration.test.js`

**Ops**: `docs/runbooks/customer-account-hydration.md`

---

## 2026-03-26 — API traffic log spam (oauth status / session loop)

**Symptom**: Api Traffic showed endless `GET /api/auth/oauth/status`, `/api/auth/oauth/user/status`, and `/api/auth/session` in quick succession (all 200).

**Root cause**: `BankingAgent`’s `checkSelfAuth()` dispatched `userAuthenticated` after **every** successful self-check. `App.js` listens and runs `checkOAuthSession()` (same three endpoints). The agent also listens and runs `checkSelfAuth()` again → dispatch again → infinite loop.

**Fix**: Stop dispatching `userAuthenticated` from `checkSelfAuth` (mount and OAuth-retry paths still dispatch once when they first discover a session). Narrowed `userAuthenticated` listener effect deps and used a ref for welcome copy so `sessionUser` updates do not re-bind the listener unnecessarily.

**Tests**: `banking_api_ui/src/__tests__/App.session.test.js` — pass.

---

## 2026-03-26 — Could not transfer from savings / only one transfer

**Symptom**: Transfers from savings failed or only one transfer seemed possible.

**Root cause**: `POST /api/transactions` enforced **Transfer amount must be at least $50** (and the same check in `transactionConsentChallenge.validateIntent`, MCP `create_transfer`, and local inspector tools). After moving a large amount out of savings, the **remaining balance was often below $50**, so further transfers from savings were rejected. Small transfers under $50 from savings were also rejected.

**Fix**: Drop the transfer-specific $50 floor; keep **positive amount** and **insufficient balance** checks. UI: hint under transfer amount and `min="0.01"` on the amount input. Small transfers under $50 from savings are allowed.

**Tests**: `banking_mcp_server/tests/tools/BankingToolRegistry.test.ts` — `create_transfer` amount `minimum` is `0.01`.

---

## 2026-03-26 — Recent transactions blank after transfer

**Symptom**: After completing a transfer, the Recent Transactions list went empty or looked blank.

**Root causes**:

1. **Client**: `setTransactions` used `data?.transactions ?? []` — any non-array / missing payload cleared the list. Full `fetchUserData()` after a write set `loading` to true and replaced the whole dashboard with the loading screen.
2. **Server**: `provisionDemoAccounts` deleted **all** user transactions whenever it ran, including when `getAccountsByUserId` returned **no rows** (e.g. race or cold instance). That could wipe history before re-seeding sample data.

**Fix**:

- **UI**: Only call `setTransactions` / `setAccounts` when the response is an actual array; after transfer/deposit/withdraw (and after high-value consent return), refresh with `fetchAccountsOnly` + `fetchTransactionsOnly` (no full-page loading).
- **API**: Delete transactions in `provisionDemoAccounts` only when they reference **deleted** account IDs — do not mass-delete when no accounts were removed.

**Tests**: Manual verification; no new automated test.

---

## 2026-03-26 — Had to log out twice

**Symptom**: After clicking Log out, the app still behaved as signed in (or session came back) until logging out again.

**Root cause**: The startup `useEffect` removed `userLoggedOut` from `localStorage` immediately while `fetch('/api/auth/clear-session')` was still in flight. A second effect run (e.g. React Strict Mode remount or `checkOAuthSession` reference update) could run `checkOAuthSession` before cookies were cleared, restoring the user.

**Fix**: Remove `userLoggedOut` only in the `clear-session` `finally` callback; treat `/logout` as a post-logout landing path; `history.replaceState` to `/` after cleanup. Module-level `_didLogOut` still guards in-session re-runs.

**Tests**: `banking_api_ui/src/__tests__/App.session.test.js` — `userLoggedOut` flag cleared after `fetch` completes; no `/api/auth/*` GETs during logout path.

---

## 2026-03-26 — Vercel production UI build failed (ESLint)

**Symptom**: `cd banking_api_ui && npm run build` exited with 1 on Vercel (`CI=true` treats warnings as errors).

**Root cause**: `import/first` — `axios.defaults.withCredentials = true` sat between import statements in `App.js`. `no-unused-vars` — unused `subscribe` import in `ApiTrafficPage.js`.

**Fix**: Move the axios default below all imports; remove unused import.

**Tests**: CI build; no new unit test.

---

## 2026-03-26 — Admin token exchange ignored “Client Secret Post”

**Symptom**: PingOne returned `invalid_client` / “Unsupported authentication method” on the admin OAuth callback when the PingOne app expected `client_secret_post`.

**Root cause**: `refreshAccessToken` used configurable basic/post auth, but `exchangeCodeForToken` still always sent `Authorization: Basic` after a partial refactor.

**Fix**: Single helper `applyAdminTokenEndpointClientAuth`; config `admin_token_endpoint_auth_method` / env `PINGONE_ADMIN_TOKEN_ENDPOINT_AUTH` (`post` | `basic`).

**Tests**: `banking_api_server/src/__tests__/oauthService.test.js` — PKCE + confidential client sends secret in body when `tokenEndpointAuthMethod` is `post`.

---

## 2026-03-26 — 429 on `/api/demo-scenario` and dashboard hydration

**Symptom**: `GET /api/demo-scenario` returned 429 (Too Many Requests) on Vercel; dashboard loads could fail alongside other `/api/*` calls.

**Root cause**: The global IP rate limiter applied to almost every API route. Paths such as `/api/demo-scenario`, `/api/tokens/*`, and session/OAuth status endpoints were **not** excluded (unlike `/api/accounts/my` / `/api/transactions/my`). Shared IPs or a low `RATE_LIMIT_MAX` exhausted the 15‑minute window during normal SPA hydration.

**Fix**: `shouldSkipGlobalRateLimit()` in `server.js` now excludes `/api/demo-scenario`, `/api/tokens`, `/api/auth/session`, `/api/auth/oauth/status`, and `/api/auth/oauth/user/status`. The UI coalesces concurrent `fetchDemoScenario()` calls to avoid duplicate GETs (e.g. React Strict Mode).

**Tests**: No dedicated rate-limit unit test; behavior verified in production. Client dedupe is in `demoScenarioService.js`.

---

## 2026-03-26 — 401 on `/api/accounts/my` while OAuth status looked signed-in

**Symptom**: After login, `GET /api/auth/oauth/user/status` could show `authenticated: true` while `GET /api/accounts/my` returned 401.

**Root cause**: `refreshIfExpiring` (RFC 6749 silent refresh) ran only on routes like `/api/accounts` and **not** on `/api/auth/oauth/*`. The OAuth status handlers only checked that a non–`_cookie_session` access token **existed**, not that it was still valid. `authenticateToken` on data routes validates the JWT with PingOne — expired tokens failed there first.

**Fix**: Apply `refreshIfExpiring` to the `/api/auth/oauth` path prefix in `server.js` so tokens refresh before OAuth status and related handlers run.

**Tests**: Existing `tokenRefresh` / OAuth integration coverage; manual verification on Vercel.

---

## 2026-03-25 — Redis cold-start 500 on `/api/accounts/my`

**Symptom**: "Failed to load your account information" banner after login.  
**Error log**: `{"error":"server_error","error_description":"An internal server error occurred","path":"/api/accounts/my"}`

**Root cause**:  
`RedisStore.get()` was calling `cb(err)` when Upstash had not yet completed its TLS handshake.
`express-session` propagated that error to Express's `next(err)`, which `oauthErrorHandler` converted to a 500.

**Fix**:  
Wrapped `RedisStore.get/set/destroy` in `services/faultTolerantStore.js`.
`get` errors return `cb(null, null)` (empty session → 401); `set`/`destroy` errors are logged and `cb(null)` is called.

**Tests**:  
`src/__tests__/session-store-resilience.test.js` — `faultTolerantStore wrapper` suite.

---

## 2026-03-25 — `?error=session_error` on customer sign-in

**Symptom**: Clicking "Customer Sign-In" on the homepage redirected to `/login?error=session_error` instead of PingOne.

**Root cause**:  
`oauthUser.js /login` called `req.session.save()` to persist the PKCE state.
When Redis was slow on a cold start the save callback received `err`, and the route responded with `res.redirect('/login?error=session_error')` before the user reached PingOne.
The PKCE state was already stored in a signed cookie (the fallback), so the session save was not essential.

**Fix**:  
Changed the `session.save()` callback in `/login` to log a `console.warn` and redirect to PingOne regardless of the error.
Applied the same non-fatal pattern to `session.regenerate()` and `session.save()` in the `/callback` routes of both `oauthUser.js` and `oauth.js`.

**Tests**:  
`src/__tests__/oauth-login-resilience.test.js` — `oauthUser /login — session.save() resilience` suite.

---

## 2026-03-25 — Eager Redis connect race condition

**Symptom**: Even with fault-tolerant store wrappers, the first cold-start request would block for ~8 s waiting for Redis to connect, and subsequent requests raced against a connect that had not started yet.

**Root cause**:  
`redisClient.connect()` was called lazily inside `awaitSessionRedisReady` (the first request middleware), meaning every cold start incurred the full TLS handshake latency on the hot path.

**Fix**:  
`redisClient.connect()` is now called **eagerly at module load time** in `server.js`, storing the promise as `_redisConnectPromise`.
`awaitSessionRedisReady` simply awaits the already-in-flight promise rather than issuing a new connect.
This allows the TLS handshake to overlap with the remaining Express startup cost.

**Tests**:  
`src/__tests__/session-store-resilience.test.js` — `awaitSessionRedisReady middleware` suite.

---

## 2026-03-25 — `userEmail: null` in session debug

**Symptom**: `/api/auth/debug` returned `"userEmail": null` even though the user had an email in PingOne.

**Root cause**:  
PingOne's `/userinfo` endpoint did not return the `email` claim because the attribute mapping had not been configured in the PingOne application.
`oauthService.createUserFromOAuth()` only looked at `userInfo.email`, so the email was null.

**Fixes applied**:
1. `oauthUser.js` callback decodes the ID token and merges its claims into `userInfo` before calling `createUserFromOAuth`, providing a fallback when `/userinfo` is incomplete.
2. `oauthService.createUserFromOAuth()` also checks `userInfo.email_address` (PingOne alternate claim) before giving up.
3. User configured the PingOne attribute mapping (permanent fix at the IdP level).

**Tests**:  
`src/__tests__/oauthService.test.js` — `createUserFromOAuth — email / name fallbacks` suite.

---

## 2026-03-25 — E2E scope tests incorrectly asserted 403 on `/my` dashboard routes

**Symptom**: CI failures: two tests in `oauth-e2e-integration.test.js` expected 403 on `/api/accounts/my` and `/api/transactions/my` when called with a write-only or accounts-read-only token.

**Root cause**:  
The tests were written assuming scope enforcement applied to all routes.
The `/my` routes are intentionally **scope-free** (BFF dashboard pattern): any authenticated user can read their own data regardless of which scopes are in the Bearer token.
Scope enforcement is only applied to admin/collection endpoints (`GET /api/transactions`, `GET /api/accounts`, etc.).

**Fix**:  
Updated the two tests to:
- Assert 200 on `/api/accounts/my` and `/api/transactions/my` for any valid token.
- Assert 403 on `GET /api/transactions` (collection endpoint) to verify that scope enforcement still works.

**Tests**:  
`src/__tests__/oauth-e2e-integration.test.js` — `Scope-based Access Control in E2E Flow` suite.

---

## Rule: Test Every Bug Fix

When fixing a production bug:
1. Add an entry here describing the symptom, root cause, and fix.
2. Write (or update) a focused unit test that reproduces the bug and verifies the fix.
3. Run the full suite (`npm test` in `banking_api_server/`) before committing.
4. The PR description must reference the test file and test name.

---

## 2026-03-27 — `/consent-url` missing PKCE caused token exchange 400

**Symptom**: Clicking "Grant agent permission" would redirect to PingOne, but the callback would fail with an `invalid_grant` or `400 Bad Request` because the `code_verifier` sent at token exchange had no matching `code_challenge` registered.

**Root cause**:  
`GET /api/auth/oauth/user/consent-url` built the authorization URL manually using `URLSearchParams` and omitted `code_challenge` and `code_challenge_method: S256`. Additionally it was missing the `setPkceCookie` call, so Vercel serverless callbacks running on a different instance had no PKCE recovery path. A missing `validateRedirectUriOrigin` check was also identified.

**Fix**:  
- Replaced manual `URLSearchParams` builder with `oauthService.generateAuthorizationUrl()` which includes PKCE S256 automatically.  
- Added `setPkceCookie(res, { state, codeVerifier, redirectUri, nonce }, _isProd())` for cold-start recovery.  
- Added `validateRedirectUriOrigin` guard matching the login route.

**Files**: `banking_api_server/routes/oauthUser.js`

---

## 2026-03-27 — In-app consent replaced PingOne ACR gate

**Symptom**: The agent consent gate required the PingOne admin to create an "Agent Consent" agreement, an "Agent-Consent-Login" auth policy, and attach it to the web app — blocking demos where PingOne config was unavailable or out of scope.

**Root cause**:  
The original design relied on `acr: "Agent-Consent-Login"` in the user's access token (issued only after PingOne shows the consent agreement screen). Missing `acr` caused the MCP token exchange to throw `AGENT_CONSENT_REQUIRED`, leaving the agent permanently blocked.

**Fix**:  
Replaced the PingOne ACR gate entirely with an in-app consent flag stored in the BFF session:
- `POST /api/auth/oauth/user/consent` sets `req.session.agentConsentGiven = true` after the user accepts the in-app modal.
- `DELETE /consent` revokes for demo reset.
- `agentMcpTokenService.js` now checks `req.session.agentConsentGiven === true` instead of comparing `acr` to `AGENT_CONSENT_ACR`.
- `SKIP_AGENT_CONSENT=true` env var disables the gate entirely for automated testing.
- New `AgentConsentModal.js` / `AgentConsentModal.css` renders a consent agreement modal without any PingOne dependency.

**Files**: `banking_api_server/routes/oauthUser.js`, `banking_api_server/services/agentMcpTokenService.js`, `banking_api_ui/src/components/AgentConsentModal.js`, `banking_api_ui/src/components/BankingAgent.js`

---

## 2026-03-28 — Dead Upstash database; sessions not shared across Vercel Lambdas (commits `4b66502`)

**Symptom**: Every login produced a working PingOne token but `GET /api/accounts/my` returned 401. Dashboard briefly showed "Session expired" on every cold page load, even immediately after signing in.

**Root cause**:  
Upstash database `steady-yeti-84614.upstash.io` no longer resolved in DNS (deleted/expired free-tier DB). `upstashSessionStore.set()` suppressed the Redis error by calling `cb(null)` unconditionally, so the OAuth callback thought the session was saved. Each Vercel Lambda had its own empty in-memory session; the shared Redis key was never written, so a different Lambda handling `/api/accounts/my` saw no session at all and returned 401.

**Fix**:  
- `upstashSessionStore.set()` now calls `cb(err)` on failure, surfacing Redis write errors to `req.session.save()` in the OAuth callback. Login now redirects to `/login?error=session_persist_failed` instead of silently continuing with a broken session.
- Ran `update-upstash.sh` to provision new database `select-dinosaur-85186.upstash.io` and update `KV_REST_API_URL` + `KV_REST_API_TOKEN` in Vercel production.

**Files**: `banking_api_server/services/upstashSessionStore.js`, `update-upstash.sh`

**Regression check**: After sign-in call `GET /api/auth/debug?deep=1` → verify `sessionStoreHealthy: true` and `redisKeyPresent: true`.

---

## 2026-03-28 — Token audience mismatch: all API calls return 401 after login (commit `82b4213`)

**Symptom**: Console: `Token audience [https://api.pingone.com] does not match any known audience for this service.` Every `/api/accounts/my` and `/api/transactions/my` returned 401 despite a valid PingOne access token.

**Root cause**:  
`auth.js` had hardcoded fallback defaults `ENDUSER_AUDIENCE = 'banking_jk_enduser'` and `AI_AGENT_AUDIENCE = 'banking_mcp_01_JK'` for environments where the env vars were not set. Standard PingOne environments without a custom resource server issue tokens with `aud: 'https://api.pingone.com'`. Neither hardcoded string matched, so the audience check failed on every request.

**Fix**:  
- Removed hardcoded defaults; both vars are now `null` when the env var is absent (skips strict audience check for that role).
- Added `https://api.pingone.com` as an always-accepted fallback audience regardless of `ENDUSER_AUDIENCE` / `AI_AGENT_AUDIENCE`.

**Files**: `banking_api_server/middleware/auth.js`

**Regression check**: Sign in → accounts and transactions load. For custom resource server installs, set `ENDUSER_AUDIENCE` in Vercel env to the resource server audience value.

---

## 2026-03-28 — Infinite 401 redirect loop to PingOne (commits `28f2438`, `6c726c5`)

**Symptom**: After login the browser looped between `/dashboard/accounts` and the PingOne login page indefinitely. Console showed `Data fetch 401 — server reason: ... | REAUTH_KEY: 1`, then redirect, then 401 again.

**Root causes**:  
1. `App.js` was calling `sessionStorage.removeItem('bx-dashboard-reauth')` when `?oauth=success` appeared in the URL. This cleared the one-shot guard the moment after it was set, so the next 401 triggered another redirect unconditionally.
2. `/api/auth/oauth/user/status` was returning `authenticated: true` for sessions with expired tokens (only checked that the token existed, not `expiresAt`). `fetchUserData` called accounts/my → 401 → set key → redirect → status still authenticated → loop.

**Fix**:  
- Removed the `sessionStorage.removeItem` call from `App.js`. The guard is only cleared inside `fetchUserData`'s success code path.
- Both status endpoints (`routes/oauthUser.js`, `routes/oauth.js`) now check `Date.now() < expiresAt` before returning `authenticated: true`.

**Files**: `banking_api_ui/src/App.js`, `banking_api_server/routes/oauthUser.js`, `banking_api_server/routes/oauth.js`

**Regression check**: Sign in → land on dashboard → accounts load without redirect loop. Let token expire → status returns `authenticated: false` → demo mode shown, no infinite redirect.

---

## 2026-03-28 — `session-preview` 401 noise on every dashboard mount (commit `0860bcb`)

**Symptom**: `GET /api/tokens/session-preview 401` appeared in the browser console on every dashboard page load before the user was authenticated.

**Root cause**:  
`TokenChainDisplay` called `fetchSessionPreview()` unconditionally on component mount. Because the component mounts before auth state is confirmed, the request always fired unauthenticated.

**Fix**:  
Added `didAuthRef` boolean ref. Component skips `fetchSessionPreview` on initial mount. Actual first fetch is triggered by the `userAuthenticated` custom event (dispatched after successful login), which also sets `didAuthRef.current = true`.

**Files**: `banking_api_ui/src/components/TokenChainDisplay.js`

---

## 2026-03-28 — /demo-data may_act section: static-mode notice + dynamic explainer (commit `5ecf83e`)

**Change**: The `/demo-data` may_act toggle section now clearly reflects that `may_act` is always present in the token when using the static PingOne attribute mapping expression.

**What was added:**
- Amber notice banner (🔒) at the top of the section: "Static mapping active — `may_act` is always present in your token via the PingOne attribute mapping expression."
- Status messages updated to say "mayAct attribute set/cleared on user record" (no longer implies the token changes).
- `<details>` explainer (collapsed by default): step-by-step instructions for switching from the static hardcoded expression to the dynamic `${user.mayAct}` expression in PingOne → Applications → bankingAdmin → Attribute Mappings.
- CSS: `.demo-data-static-notice`, `.demo-data-dynamic-explainer`, `.demo-data-code-block`.

**Background**: PingOne rejects `${user.mayAct}` as an expression even though the `mayAct` JSON attribute exists in the user schema. Keeping a static hardcoded expression (e.g. `${"client_id": "<app-client-id>"}`) ensures `may_act` always appears in every token issued by the bankingAdmin app, making the Token Chain `✅ may_act valid` state reliable without user-attribute manipulation.

**Files**: `banking_api_ui/src/components/DemoDataPage.js`, `banking_api_ui/src/components/DemoDataPage.css`

**Regression check**: Go to `/demo-data` → may_act section must show amber notice banner; Enable/Clear buttons still fire `PATCH /api/demo/may-act` (call succeeds, no error); `<details>` expander opens and shows PingOne steps.

---

## 2026-03-28 — Admin role detection: 4-signal resolution

**Problem**: The previous logic only preserved admin role if the user **already existed** in the dataStore with role `admin`. A first-time admin login always got `customer`. The only workaround was to manually edit the dataStore JSON.

**Fix**:  
Replaced the single-signal check with four independent signals. Any one being true is sufficient to grant `admin`:
1. **Username allowlist** (`admin_username` config) — comma-separated `preferred_username` values that always receive admin.
2. **Population ID** (`admin_population_id` config) — PingOne population ID; members receive admin without any schema changes.
3. **Custom claim** (`admin_role_claim` + `admin_role` config) — any userinfo/ID-token claim compared against the configured admin role value; supports string and array (group membership).
4. **Existing record** — preserves admin granted in a previous session (prevents downgrade).

New config fields added: `admin_username`, `admin_population_id`, `admin_role_claim` in `configStore.js` with corresponding UI fields in `Config.js`.

**Files**: `banking_api_server/routes/oauthUser.js`, `banking_api_server/services/configStore.js`, `banking_api_ui/src/components/Config.js`

**Regression check**: Log in as a user not in the allowlist → gets `customer`. Add their username to `admin_username` → next login grants `admin`. Existing admin users are not downgraded.
