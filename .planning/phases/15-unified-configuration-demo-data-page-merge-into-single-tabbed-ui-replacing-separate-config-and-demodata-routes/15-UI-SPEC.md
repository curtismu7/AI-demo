# UI-SPEC — Phase 15: Unified Settings Page (Config + Demo Data → Tabs)

> **Status:** Design contract — ready for PLAN phase  
> **Files affected:** `banking_api_ui/src/components/` — new `Settings.js`, `Settings.css`; update `App.js` routes

---

## 1. User Problem

Two separate admin pages (`/config` and `/demo-data`) create friction:

- Presenters bounce between pages to toggle a feature flag vs update a setting.
- `DemoDataPage` has a duplicate "AI banking assistant (layout)" section that Config already has — they diverge.
- Config's nav label ("Application Configuration") and Demo Data's label ("Demo config") have inconsistent naming that confuses new users.

**Goal:** One unified Settings page at `/config` with 4 tabs. `/demo-data` redirects to `/config`.

---

## 2. Route & Navigation Contract

| Before | After |
|--------|-------|
| `/config` → Config.js | `/config` → `Settings.js` (active tab: `pingone` by default) |
| `/demo-data` → DemoDataPage.js | `/demo-data` → `<Navigate to="/config" />` (or to `/config?tab=data`) |
| Nav label: "Application Configuration" | Nav label: "Configuration" |
| Nav label: "Demo Data" | removed (redirects) |

**Tab persistence:** Active tab stored in `localStorage` under key `settingsActiveTab`. On direct `/config` nav, restore last tab. On redirect from `/demo-data`, default to `data` tab.

---

## 3. Tab Architecture

Four pill tabs in the `da-tabs` style (reuse `da-tab` / `da-tab--active` design language from `DelegatedAccessPage.css` but namespaced `cfg-tabs`).

```
┌─────────────────────────────────────────────────────────────────────────┐
│  ⚙️ Configuration                                            [Save all] │
│                                                                         │
│  ┌─────────┬──────────┬───────────┬────────────┐                       │
│  │ 🔑 PingOne│ 🤖 Agent │ 🎭 Demo Data│ 🛠️ Developer│                       │
│  └─────────┴──────────┴───────────┴────────────┘                       │
│                                                                         │
│  [active tab panel content]                                             │
└─────────────────────────────────────────────────────────────────────────┘
```

### Tab 1 — PingOne 🔑
> "Everything you paste from your PingOne dashboard"

Sections (all use existing `CollapsibleCard` — no redesign of inner content):

| Order | Section | Source | Default |
|-------|---------|--------|---------|
| 1 | How to complete this form (setup checklist) | Config S-checklist | closed |
| 2 | PingOne Environment | Config S1 | open |
| 3 | Register these redirect URIs in PingOne | Config redirect helper | open |
| 4 | Admin OAuth App | Config S-admin | open |
| 5 | End-User OAuth App | Config S-user | open |
| 6 | Marketing customer sign-in | Config S-marketing | closed |
| 7 | Session & Roles | Config S4 | closed |

### Tab 2 — Agent 🤖
> "How the AI assistant looks, acts, and authenticates"

Sections:

| Order | Section | Source | Default |
|-------|---------|--------|---------|
| 1 | AI Agent layout | Config `AgentLayoutPreferences` | open |
| 2 | Display Preferences | Config `DisplayPreferences` | open |
| 3 | Lesson focus — how can an AI reach your bank data? | DemoData `demo-data-agent-auth-demo` | open |
| 4 | Step-Up Authentication | Config S5 | closed |
| 5 | Agent MCP Scopes | Config `Agent MCP scopes` card | closed |
| 6 | Agent scope permissions | DemoData `demo-scope-heading` | closed |
| 7 | PingOne Authorize — In-App Authorization | Config S6 | closed |
| 8 | PingOne Authorize flags (live vs simulated, first tool) | DemoData `demo-p1az-flags-heading` | closed |

**Duplicate removal:** The "AI banking assistant (layout)" section in `DemoDataPage.js` (line 677) duplicates Config's `AgentLayoutPreferences` component. In the unified page it only appears once (tab 2 row 1). When `DemoDataPage.js` is eliminated, the duplicate disappears naturally.

### Tab 3 — Demo Data 🎭
> "Your signed-in demo persona — fake banking data only you see"

Content is the existing DemoData form sections, preserved exactly:

| Order | Section | Source |
|-------|---------|--------|
| 1 | Intro hero banner (teaching sandbox description) | DemoData hero |
| 2 | User profile (name, email, username, active) | DemoData `User profile` |
| 3 | Accounts (type slots — checking, savings, car loan, investment) | DemoData `Accounts` |
| 4 | Step-up MFA threshold (USD) | DemoData `Step-up MFA threshold` |
| 5 | Marketing login hints | DemoData `demo-marketing-login-heading` |
| 6 | Token Exchange — may_act demo | DemoData `demo-mayact-heading` |
| 7 | Form save + reset actions | DemoData actions row |

### Tab 4 — Developer 🛠️
> "Tools, self-hosting, branding, and environment reference"

| Order | Section | Source | Default |
|-------|---------|--------|---------|
| 1 | MCP Inspector Setup | Config S-mcp-inspector | open |
| 2 | Industry & branding | Config `Industry & branding` | closed |
| 3 | Advanced (LangChain/MCP URL, debug logging) | Config S7 Advanced | closed |
| 4 | Vercel Config | Config Vercel card | closed |
| 5 | Run Your Own Instance | Config self-hosting card | closed |

---

## 4. Visual Design Contract

### Page chrome
```
app-page-shell
  app-page-shell__title  →  "⚙️ Configuration"   (was "⚙️ Application Configuration")
  [no subtitle / breadcrumb change needed]

Sticky tab bar:
  position: sticky; top: 0; z-index: 10;
  background: #fff; border-bottom: 1px solid #e2e8f0;
  padding: 12px 0 0;
  margin-bottom: 24px;
```

### Tab strip (`cfg-tabs`)
Reuse the `da-tabs` visual design exactly — pill tabs with `#1e40af` active background, `#64748b` inactive text. New CSS namespace `cfg-` to avoid cascade bleed.

```css
.cfg-tabs {
  display: flex;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 4px;
  gap: 2px;
  width: fit-content;        /* don't stretch full width */
}

.cfg-tab {
  padding: 8px 20px;
  border-radius: 9px;
  border: none;
  background: transparent;
  font-size: 0.875rem;
  font-weight: 600;
  color: #64748b;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
  white-space: nowrap;
}

.cfg-tab:hover:not(.cfg-tab--active) {
  background: #e2e8f0;
  color: #1e40af;
}

.cfg-tab--active {
  background: var(--app-primary-blue);   /* #1d4ed8 */
  color: #fff;
  box-shadow: 0 1px 4px rgba(29, 78, 216, 0.25);
}
```

### Tab panel animation
Fade-in on tab switch — no slide. Keeps layout stable.

```css
.cfg-tab-panel {
  animation: cfg-fade-in 0.15s ease;
}
@keyframes cfg-fade-in {
  from { opacity: 0; transform: translateY(4px); }
  to   { opacity: 1; transform: translateY(0); }
}
```

### Responsive (≤ 600px mobile)
```css
@media (max-width: 600px) {
  .cfg-tabs { width: 100%; }
  .cfg-tab  { flex: 1; justify-content: center; padding: 8px 12px; font-size: 0.8rem; }
}
```

---

## 5. Component Structure

New: `Settings.js` + `Settings.css` — wraps existing inner content.

```
Settings
  ├── page chrome (h1, save all button)
  ├── CfgTabBar  (4 buttons, activeTab state)
  └── tab panel switch:
       ├── tab === "pingone"    → <PingOneTab>    (collapsibles from Config)
       ├── tab === "agent"      → <AgentTab>      (Config + DemoData agent sections)  
       ├── tab === "data"       → <DemoDataTab>   (DemoData form)
       └── tab === "developer"  → <DeveloperTab>  (Config advanced sections)
```

**State management approach:**
- `activeTab` — local state + `localStorage`
- All server- and session-state from existing components are **lifted into Settings** (one `loadConfig()`, one `fetchUserData()`, one `handleSubmit()`)
- Existing `Config.js` and `DemoDataPage.js` become **dead files** once Settings is complete — delete them and their routes in `App.js`

**No shared-save button required right now.** Each tab's inner save/submit buttons call the APIs already wired in the source components. The "Save all" placeholder in the chrome is cosmetic — scope that to Phase 15+1 if desired.

---

## 6. Route Changes (App.js)

```jsx
// REMOVE:
<Route path="/config"      element={<Config />} />
<Route path="/demo-data"   element={<DemoDataPage />} />

// ADD:
<Route path="/config"     element={<Settings />} />
<Route path="/demo-data"  element={<Navigate to="/config" replace />} />
```

Optionally add `?tab=data` on the redirect so `/demo-data` bookmarks land on the Data tab.

---

## 7. Outstanding Duplication to Resolve

| Duplicate | Page A | Page B | Resolution |
|-----------|--------|--------|------------|
| AI Agent layout toggle | Config `AgentLayoutPreferences` (line 243) | DemoData `demo-data-agent-layout` (line 677) | Keep Config version (Tab 2 row 1), remove DemoData version |
| Agent display mode (panel vs fullpage) | Config `DisplayPreferences` (line 184) | — | Keep as-is, Tab 2 row 2 |
| Feature flags | Config S6 / S7 partially | DemoData P1 Authorize flags (line 1170) | DemoData version → Tab 2 row 8; Config version → Tab 1 S6 (authorize accordion) |

---

## 8. Acceptance Criteria

- [ ] Single URL `/config` serves a page with 4 labelled pill tabs
- [ ] `/demo-data` navigates to `/config` (no 404, no extra click required)
- [ ] Active tab survives page reload (localStorage persistence)
- [ ] All existing Config.js save/test/reset actions still functional on PingOne tab
- [ ] All existing DemoData form submit actions still functional on Data tab
- [ ] "AI banking assistant (layout)" appears only once (Tab 2 — Agent)
- [ ] Agent tab includes the "Lesson focus" radio (OAuth PKCE vs delegation) from DemoData
- [ ] `npm run build` exits 0
- [ ] No regressions: admin login, user login, agent FAB, CIBA flow unaffected

---

## 9. Out of Scope for Phase 15

- Cross-tab "Save All" button (future)
- URL-hash deep linking to a specific section within a tab (future)
- Any change to inner section content (forms, inputs, labels) — preserve exactly
- Marketing pages
