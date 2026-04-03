---
phase: 19
name: "Demo Config page audit — verify all sections work and are necessary"
created: "2026-04-02"
status: ready-for-planning
---

## User Vision

Make sure everything on the Demo Config page (/demo-data) works and is necessary. Three specific decisions below.

## Discovery Summary

Full read of `banking_api_ui/src/components/DemoDataPage.js` (1512 lines).

### Sections inventory (all confirmed working ✅ unless noted)

| Section | Handler / Route | Status |
|---------|----------------|--------|
| Hero banner + persistence note | static / `/api/demo-scenario` | ✅ |
| AI banking assistant (layout) | `AgentUiModeToggle` context | ✅ |
| "Learn: how can AI reach your bank data?" (lesson focus + bearer paste) | localStorage / `GET /api/accounts` | ✅ works, see decision 2 |
| User profile (name, email, username, active) | `handleSubmit` → `saveDemoScenario` | ✅ |
| Step-up MFA threshold (USD) | `handleSubmit` → `saveDemoScenario` | ✅ |
| Accounts (type-slots: checking, savings, investment, car loan, etc.) | `handleSubmit` → `saveDemoScenario` | ✅ |
| Agent scope permissions | `handleSaveScopes` → `POST /api/admin/config` | ✅ |
| Marketing sign-in settings | `handleSaveMarketingLogin` → `POST /api/admin/config` | ✅ |
| PingOne Authorize flags + bootstrap | `handleP1azFlagToggle` + `handleP1azAuthorizeBootstrap` → `POST /api/authorize/bootstrap-demo-endpoints` | ✅ |
| Token Exchange — may_act demo | `handleSetMayAct` → `PATCH /api/demo/may-act` | ✅ |
| Dark mode toggle | local `dashTheme` state — **BUG: duplicates ThemeContext, doesn't use it** | ⚠️ broken |

### Dead code found (4 functions)

Lines 362–433 in `DemoDataPage.js`:
- `getAccountRowKey(a)` (line 363) — never called, suppressed `no-unused-vars`
- `handleAccountChange(rowKey, field, value)` (line 425) — no-op, `// kept for any legacy callers`
- `handleAddAccount()` (line 431) — `@deprecated` empty stub
- `handleRemoveDraft()` (line 433) — `@deprecated` empty stub

### Dark mode bug

`DemoDataPage` declares its own `dashTheme` state and sets `document.documentElement.dataset.theme` directly — duplicating the global `ThemeContext` (in `banking_api_ui/src/context/ThemeContext.js`) which is the canonical source of truth. `globalTheme.css` + `dashboard-theme.css` have 135 dark-mode CSS rules keyed on `html[data-theme='dark']`. The fix is to replace local state with `const { theme, toggleTheme } = useTheme()` from `ThemeContext`.

## Decisions

### Decision 1 — Dead code cleanup
**Remove** all 4 dead functions (lines 362–433):
- `getAccountRowKey`
- `handleAccountChange`
- `handleAddAccount`
- `handleRemoveDraft`

These have `eslint-disable no-unused-vars` suppressions and no callers. Removing them cleans up ~15 lines.

### Decision 2 — "Learn: how can an AI reach your bank data?" section
**Keep but wrap in a `<details>` accordion** — collapsed by default. The section is valuable for demos/teaching but currently takes visual prominence without being an operational control. A `<details>/<summary>` wrapper lets it be expanded when needed.

Target: wrap from `<section className="section demo-data-section demo-data-agent-auth-demo"` down through its closing `</section>` (lines ~694–900) in a `<details>` with summary "🎓 Lesson: how can an AI reach your bank data?"

### Decision 3 — Dark mode toggle
**Wire up properly** — replace `dashTheme` local state with `useTheme()` from `ThemeContext`:
1. Import `useTheme` from `'../context/ThemeContext'`
2. Replace `const [dashTheme, setDashTheme] = useState(...)` + `useEffect` + `handleDashThemeToggle` with `const { theme, toggleTheme } = useTheme()`
3. Replace `dashTheme` → `theme` and `handleDashThemeToggle` → `toggleTheme` in the toolbar button JSX
4. Remove the now-redundant local `dashTheme` localStorage read/write effects

The global `ThemeContext` already handles `localStorage` persistence + `document.documentElement.dataset.theme` updates. No CSS changes needed — all 135 dark rules in `globalTheme.css` and `dashboard-theme.css` already apply.

## Out of Scope

- Redesigning any section's content or labels
- Moving sections to different pages (that is Phase 15 — unified settings)
- Adding new sections
- Dark CSS coverage for DemoDataPage-specific elements beyond what `globalTheme.css` already provides (can be followed up in Phase 16 or a targeted todo)
