---
phase: 110
slug: fix-demo-data-page-layout-add-may-act-demo-button-fix-config-button-overflow-improve-discoverability
decisions_locked: true
---

# Phase 110 Context — Demo Data Page Layout Fixes

## Goal

Fix four concrete UX problems on the Demo Data page (`DemoDataPage.js`, 1,673 lines):

1. `may_act` controls are buried at line ~1590 — add a prominent quick-action shortcut near the top
2. The toolbar "PingOne config" button label overflows/wraps on narrower screens
3. The page is too long to navigate — add a sticky section-anchor nav (jump-to)
4. Fold in pending todo: "Token Endpoint Auth Method Selector on Demo Data Page"

---

## Decisions (locked — downstream agents act on these)

### D-1: may_act Quick-Action at Top of Page

**Decision:** Add a `may_act` quick-action strip/card in the **hero area or immediately below it** — above the main sections. It should show:
- Current status pill (`may_act present in token` ✅ / `may_act absent` ❌ / loading state)
- Enable button + Clear button (same handlers as existing `mayActEnabled` state)
- Link/scroll anchor to the full `may_act` section below for advanced controls (Diagnose, delegation mode)

**Do NOT remove or replace** the existing full may_act section lower on the page — the quick-action is an additive shortcut.

**Pattern to follow:** Look at the existing hero section (`demo-data-page__hero`) and the existing `mayActEnabled` state — wire the same state/handlers into the new shortcut.

---

### D-2: Config Button Overflow Fix

**Decision:** Fix the **toolbar "PingOne config" `<Link>` button** label overflow. The toolbar (`dashboard-toolbar`) uses `flex-wrap: wrap` with 8 buttons — on narrower screens the "PingOne config" label line-breaks or gets clipped.

**Fix options (agent's discretion):**
- Shorten label to `Config` or `⚙ Config` with a `title` tooltip
- OR add `white-space: nowrap` / `overflow: hidden; text-overflow: ellipsis; max-width: Xpx` to the specific button
- Ensure all toolbar buttons wrap gracefully at mobile widths (the CSS already has `flex-wrap: wrap`)

**Files:** `DemoDataPage.js` (the `<Link to="/config">` element) + possibly `UserDashboard.css` or `DemoDataPage.css`

---

### D-3: Sticky Section-Anchor Jump-To Nav

**Decision:** Add a **sticky left-side or top "jump to" navigation** so users can quickly reach major sections without scrolling through 1,673 lines of content.

**Sections to include as anchors** (derive from existing `aria-labelledby` / section headings):
- may_act demo
- Agent placement
- Feature flags
- Exchange mode
- Account / PingOne claims
- Token validation
- Storage / audit

**Implementation approach (agent's discretion):**
- Sticky pill-tabs or a compact vertical list on the left at desktop width
- Collapses or hides on mobile (toolbar already wraps, don't double-nav)
- Clicking scrolls page to the corresponding section (`scrollIntoView` or `#anchor` link)
- Active section highlights as user scrolls (IntersectionObserver)

**Existing pattern:** Check `DemoDataPage.css` and `UserDashboard.css` for any existing sticky/nav patterns to reuse. If none, add a `DemoDataPageNav.js` or inline as a component within `DemoDataPage.js`.

---

### D-4: Token Endpoint Auth Method Selector (folded from todo)

**Decision:** Add a **Token Endpoint Auth Method selector** to the Demo Data page.

**Source todo:** `2026-04-01-token-endpoint-auth-method-selector-on-demo-data-page.md`

**What it is:** A UI control to select `client_secret_post` vs `client_secret_basic` per-client (BFF App, AI Agent App, MCP Token Exchanger) — useful for demos where PingOne app is configured with non-default auth method. Currently the env vars `AI_AGENT_TOKEN_ENDPOINT_AUTH_METHOD` / `MCP_EXCHANGER_TOKEN_ENDPOINT_AUTH_METHOD` control this; the UI should let the demo operator override at runtime via BFF config store (persisted via existing `/api/demo-scenario` or `/api/config` pattern).

**Where to place it:** In the "Feature flags / demo config" section — alongside the existing `ff_two_exchange_delegation` and `ff_inject_may_act` toggles.

**Agent notes:**
- Backend: BFF needs a config key for each client's auth method (e.g., `ai_agent_token_endpoint_auth_method`, `mcp_exchanger_token_endpoint_auth_method`)
- Read at token-exchange time from config store (fallback to env var)
- UI: Two `<select>` controls or radio-button pairs — one per client that uses token exchange

---

## Canonical Refs

- `banking_api_ui/src/components/DemoDataPage.js` — main page (1,673 lines)
- `banking_api_ui/src/components/DemoDataPage.css` — page styles
- `banking_api_ui/src/components/UserDashboard.css` — toolbar / shared button styles (`.dashboard-toolbar`, `.dashboard-toolbar-btn`)
- `banking_api_ui/src/styles/dashboard-theme.css` — 2026 dashboard theme overrides
- `banking_api_ui/src/components/AgentUiModeToggle.js` — placement buttons (Phase 109, just fixed)
- `banking_api_server/` — BFF routes for `/api/demo-scenario` and `/api/config` (for D-4 backend)

---

## Scope Boundary

**In scope:** DemoDataPage layout, toolbar, may_act shortcut, sticky nav, token endpoint auth method selector.

**Out of scope (deferred):**
- "Finish /configure?tab=pingone-config page and fix CSS word overlap" — that's the PingOne Config tab *content*, separate from the toolbar button label. Track as Phase 111+.
- Section status badges (Phase 110 scoping decision — keep this phase focused)
- Search/filter on Demo Data page (too large a feature for this pass)

---

## Implementation Notes

- **DemoDataPage.js is 1,673 lines** — surgical edits only. Don't refactor the whole component.
- **may_act state already exists** (`mayActEnabled`, `mayActSaving`, `handleMayActToggle`) — the quick-action shortcut just needs to render near the top using the existing state.
- **No new context providers** — wire everything via existing local state or existing hooks.
- **Build must pass** — `cd banking_api_ui && npm run build` → exit 0 required.
