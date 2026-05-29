---
phase: 282
plan: 01
status: complete
completed_at: "2026-05-29"
commits:
  - 5b187069 chore: add deps for vertical-manifest rewrite (lodash.mergewith, monaco, zod-to-json-schema)
  - 919377ca feat(verticals): add Zod manifest schema with required-field contract
  - 09b2a358 feat(verticals): add LMDB store for overlays, active id, snapshots
  - 9910c2bf feat(verticals): add in-memory seed loader with validation
  - ec873475 feat(verticals): add field-level overlay with validated deep-merge
  - 156501ee feat(verticals): add resolver with deep-merge cache and event-emitting overlay wrapper
  - 48d08590 feat(verticals): add page/agent scope resolver with mock data
  - d653e325 feat(verticals): add SSE event bus with hydration on connect
  - 4bf7013f fix(verticals): atomic SSE write + flushHeaders for proxy compatibility
  - ecfa5907 feat(verticals): add per-user snapshot save/restore
  - 005eec72 feat(verticals): wire all six modules into a singleton
  - f13a6a64 feat(verticals): add GET /me, /list, /stream routes
  - 98f31b0c feat(verticals): add admin write/clone/delete/snapshot routes
  - 2614ff70 feat(verticals): register /api/verticals manifest routes in server
  - adbb4a8f feat(verticals): add v2-to-v3 migration script (all-or-nothing)
  - bc71410a feat(verticals): migrate seed data from v2 to v3 (folder layout)
  - eac48789 feat(verticals-ui): add applyThemeTokens DOM mutator
  - f7054e1f feat(verticals-ui): add VerticalProvider with SSE + useVertical hook
  - 3a160a48 feat(verticals-ui): add OverlayBadge and CloneModal components
  - 6cebbf6e feat(verticals-ui): add VerticalEditorPage with Monaco JSON editing
  - 3b9ec054 feat(verticals)!: cutover to new manifest system; delete legacy contexts
  - fdfd0702 test(verticals): remove orphan tests for deleted verticalConfigService
  - 3bdeaeca chore(verticals): remove one-shot migration script
  - 137589bb test(verticals): add E2E live-switch smoke (two-tab)
  - e68eab25 fix(verticals-ui): unauthenticated /me 401 must not blank the page
---

# Phase 282 Plan 01 — Verticals Storage and Live Switching

## What was done

Clean-sheet rewrite of the verticals configuration system: storage, validation, switching, admin editing, and SSE-driven live propagation to all connected browsers. This phase replaces the legacy `services/verticalConfigService.js` + monolithic `config/verticals/*.json` files + dual `ThemeContext`/`VerticalContext` providers with a six-layer service (`services/verticalManifest/*`), a folder-per-vertical seed layout (`config/verticals/<id>/{manifest,mock-data}.json`), a single reactive React provider (`vertical/VerticalProvider`), and a Monaco-based admin editor at `/admin/verticals`.

Authoritative spec: [`docs/superpowers/specs/2026-05-29-verticals-storage-switching-design.md`](../../../docs/superpowers/specs/2026-05-29-verticals-storage-switching-design.md).
Authoritative plan: [`docs/superpowers/plans/2026-05-29-verticals-storage-switching.md`](../../../docs/superpowers/plans/2026-05-29-verticals-storage-switching.md).

This is **Cycle 1 of 2**. Cycle 2 (deferred — separate spec) rewrites the per-vertical visual content (chip catalog, dashboard layout, mock-data editor, setup-page Themes tab, AI-augmented vertical generation).

### Architecture (six server modules + one client module)

**Server (`demo_api_server/services/verticalManifest/`):**
- `schema.js` — Zod manifest + chip + mock-data schemas. Single source of truth for shape (`schemaVersion: 3`).
- `loader.js` — boot-time seed cache; reads `config/verticals/<id>/manifest.json` + `mock-data.json`, validates via Zod.
- `services/lmdb/verticalStore.lmdb.js` — LMDB persistence for `overlay:<id>`, `active`, `snapshot:<userId>` keys. Sibling to `delegationStore.lmdb.js`.
- `overlay.js` — field-level overlay API with `lodash.set` paths, validates merged result before each write.
- `resolver.js` — deep-merges seed + overlay using `lodash.mergeWith` with array-as-leaf customizer, caches per `(id, overlayVersion)`, returns clones to prevent cache poisoning.
- `scope.js` — page/agent split rule (`agentManifest = admin-console` when admin role on `/admin/*`).
- `events.js` — SSE event bus with hydration on connect, atomic single-write per frame, `flushHeaders()` for proxy compatibility.
- `snapshot.js` — per-user save/restore of `{activeId, overlays}` blob.
- `index.js` — barrel that wires all six modules into a `verticalManifest` singleton.
- `routes/verticalManifest.js` — 13 HTTP endpoints: `GET /me /list /stream`; admin `POST /active /reset-all /snapshot /snapshot/restore`, `DELETE /snapshot`; `POST /:id/clone`, `DELETE /:id`; `POST /:id/overlay`, `POST /:id/overlay/batch`, `DELETE /:id/overlay`.

**Client (`demo_api_ui/src/vertical/`):**
- `VerticalProvider.jsx` — opens SSE on mount, owns reactive state, blocks first paint on hydration BUT (per `e68eab25` fix) hydrates with empty state on 401 / network error so landing/login/marketing pages still render.
- `useVertical.js` — derives `agentManifest` from `useLocation().pathname` at render time (no server refetch on route change).
- `applyThemeTokens.js` — writes `manifest.theme.cssVars` to `document.documentElement.style`; tracks its own keys so it doesn't clobber other code's CSS vars.
- `AdminEditor/VerticalEditorPage.jsx` — Monaco JSON editor, diff-against-seed save, clone/delete/reset/snapshot UI.
- `AdminEditor/OverlayBadge.jsx`, `AdminEditor/CloneModal.jsx` — leaf components.

### Deletions (one breaking commit, `3b9ec054`)

- `demo_api_server/services/verticalConfigService.js` (178 lines)
- `demo_api_server/routes/verticalConfig.js` (52 lines)
- `demo_api_server/config/verticalPrimaryTypes.js` (17 lines — replaced by `manifest.terminology.accountTypes[0]`)
- `demo_api_ui/src/context/ThemeContext.js` (262 lines)
- `demo_api_ui/src/context/VerticalContext.js` (21 lines)
- `demo_api_ui/src/components/ThemePicker.{js,css}` (85 lines)
- `demo_api_ui/src/styles/chase-theme.css` (300 lines)
- `demo_api_ui/src/styles/dashboard-theme.css` (253 lines)
- 6 monolithic `demo_api_server/config/verticals/*.json` files (replaced by folder layout)

### Migration (one-shot, `bc71410a`)

`scripts/migrateVerticalsV3.js` transformed all 6 legacy `verticals/*.json` files into the new folder layout in a single all-or-nothing operation:
- `schemaVersion: 2` → `3`
- `id: 'admin'` → `'admin-console'` (folder + manifest id)
- `dashboard.mockData` → separate `mock-data.json` file
- Dropped `featurePage.accent{Bg,Light,Code,Text,AccentText}` (Cycle 2 will derive from `accentColor`)
- Format normalization: `'pct'` → `'percent'`, `'tier'` → `'text'` (legacy enum drift)
- Null-stripping pass: `null`-valued optional fields normalized to absent (Zod `.optional()` rejects `null`)
- Script committed in `adbb4a8f`, executed in `bc71410a`, deleted in `3bdeaeca` (born-to-die)

### Breaking changes

1. Vertical id `'admin'` is now `'admin-console'` (folder + manifest id).
2. Theme is token-driven (`manifest.theme.cssVars` applied to `:root`), not class-driven. No more `theme-banking` / `theme-chase` classes.
3. Dark mode removed entirely (`theme` / `toggleTheme` / `themeId` / `switchTheme`); the agent panel's appearance auto/light/dark toggle removed too.
4. `ThemePicker` widget removed; switching happens via `VerticalSwitcher` or `/admin/verticals` editor.
5. `schemaVersion: 2` no longer parses.
6. `featurePage.accent*` variants dropped (interim visual delta until Cycle 2).

### Server consumer migrations (8 files)

All callers of the deleted `verticalConfigService` switched to the new `verticalManifest` singleton:
- `config/oauthUser.js`, `routes/accounts.js`, `routes/oauthUser.js`, `services/aguiSseProxy.js`, `services/demoAgentLangGraphService.js`, `services/geminiNlIntent.js`, `services/bankingAgentLangGraphService.js`, `server.js`
- `routes/accounts.js` and `routes/oauthUser.js` derive primary `accountType` from `manifest.terminology.accountTypes[0]` instead of the hardcoded `VERTICAL_PRIMARY_TYPE` map.
- `bankingAgentLangGraphService.js` inlines `data/seeds/<id>.js` `require()` for `toolDescriptions` (the seeds directory is a parallel persistence layer kept out of scope for Cycle 1; Cycle 2 may merge into manifests).

### UI consumer migrations (25 files)

All callers of the deleted `ThemeContext` / `VerticalContext` switched to `useVertical()` from `vertical/useVertical`. Dark-mode toggle buttons removed from 8 files. `AgentClinicalHost.jsx` (from the parallel clinical-split branch that merged in after Cycle 1) was patched in the merge commit `2f20b4d7` to use `useVertical` instead of `useTheme`.

### Tests

Total new test coverage: **97 server tests** (11 suites under `tests/verticalManifest/`) + **21 UI tests** (4 suites under `src/vertical/__tests__/`) + **1 E2E test** (`tests/e2e/verticals.live-switch.real.spec.js`, skips when env not set).

## Files in scope for review

### New server source (no tests)

- `demo_api_server/services/verticalManifest/schema.js`
- `demo_api_server/services/verticalManifest/loader.js`
- `demo_api_server/services/verticalManifest/overlay.js`
- `demo_api_server/services/verticalManifest/resolver.js`
- `demo_api_server/services/verticalManifest/scope.js`
- `demo_api_server/services/verticalManifest/events.js`
- `demo_api_server/services/verticalManifest/snapshot.js`
- `demo_api_server/services/verticalManifest/index.js`
- `demo_api_server/services/lmdb/verticalStore.lmdb.js`
- `demo_api_server/routes/verticalManifest.js`

### New client source (no tests)

- `demo_api_ui/src/vertical/VerticalProvider.jsx`
- `demo_api_ui/src/vertical/useVertical.js`
- `demo_api_ui/src/vertical/applyThemeTokens.js`
- `demo_api_ui/src/vertical/AdminEditor/VerticalEditorPage.jsx`
- `demo_api_ui/src/vertical/AdminEditor/OverlayBadge.jsx`
- `demo_api_ui/src/vertical/AdminEditor/CloneModal.jsx`

### Modified server files (consumer migrations)

- `demo_api_server/server.js`
- `demo_api_server/config/oauthUser.js`
- `demo_api_server/routes/accounts.js`
- `demo_api_server/routes/oauthUser.js`
- `demo_api_server/services/aguiSseProxy.js`
- `demo_api_server/services/bankingAgentLangGraphService.js`
- `demo_api_server/services/demoAgentLangGraphService.js`
- `demo_api_server/services/geminiNlIntent.js`

### Modified client files (provider wiring + consumer migrations)

- `demo_api_ui/src/index.js`
- `demo_api_ui/src/App.js`
- `demo_api_ui/src/components/Accounts.js`
- `demo_api_ui/src/components/ActivityLogs.js`
- `demo_api_ui/src/components/Admin.jsx`
- `demo_api_ui/src/components/ApiTrafficPage.js`
- `demo_api_ui/src/components/BankingAgent.js`
- `demo_api_ui/src/components/BankingChips.jsx`
- `demo_api_ui/src/components/Config.js`
- `demo_api_ui/src/components/Configuration/UnifiedConfigurationPage.tsx`
- `demo_api_ui/src/components/Dashboard.js`
- `demo_api_ui/src/components/DemoDataPage.js`
- `demo_api_ui/src/components/DemoSetupPanel.js`
- `demo_api_ui/src/components/EmbeddedAgentDock.js`
- `demo_api_ui/src/components/SetupPage.js`
- `demo_api_ui/src/components/SideNav.js`
- `demo_api_ui/src/components/TopNav.js`
- `demo_api_ui/src/components/UserDashboard.js`
- `demo_api_ui/src/components/VerticalFeaturePage.jsx`
- `demo_api_ui/src/components/VerticalHero.jsx`
- `demo_api_ui/src/components/VerticalSwitcher.js`
- `demo_api_ui/src/components/dashboard/AccountSummary.js`
- `demo_api_ui/src/components/dashboard/ActionHub.js`
- `demo_api_ui/src/components/dashboard/DashboardHero.js`
- `demo_api_ui/src/components/dashboard/MobileDashboard.js`
- `demo_api_ui/src/context/IndustryBrandingContext.js`
- `demo_api_ui/src/hooks/useAdminTheme.js`

## Out of scope for review

These changes happened in the same time window but belong to separate work streams; they are not part of Phase 282:

- `feat/clinical-split-integration` branch (commits `a72c3fb4` + `ae83f79a`, merged via `2f20b4d7`): scaffolded `agent-clinical/` components + the `ff_agent_clinical_split` feature flag wiring. The clinical-split integration handoff is documented in [`docs/superpowers/plans/2026-05-29-agent-clinical-split-integration-handoff.md`](../../../docs/superpowers/plans/2026-05-29-agent-clinical-split-integration-handoff.md). One Phase 282-related edit: `AgentClinicalHost.jsx` was migrated from `useTheme` to `useVertical` during the merge.
- Parallel-misc work (commit `bfe319ec`): `README.md` directory rename (`banking_*` → `demo_*`), `REGRESSION_PLAN.md` updates, `simulatedAuthorizeService.js` enhancements, `pingOneAuthorizeService.js` edit, token-flow architecture diagram.

## Verification (all checks pass at time of phase close)

- `cd demo_api_server && npx jest tests/verticalManifest` → 97 passed, 11 suites (after `migrate.test.js` removal in `3bdeaeca`)
- `cd demo_api_ui && npm run build` → exit 0
- `cd demo_api_ui && npx react-scripts test --watchAll=false src/__tests__/App.structure.test.js` → 27 passed
- `cd demo_api_ui && npx react-scripts test --watchAll=false src/vertical/__tests__/` → 21 passed (19 + 2 added for the 401 / network-error regression in `e68eab25`)
- Server smoke load (`node -e "require('./server.js')"`) → "server.js loads OK"
- `GET /api/verticals/list` unauthenticated → 401 (route mounted, auth gate active)
- Manual UI smoke: blank-page regression found during step 1 of the manual checklist, fixed in `e68eab25` and shipped (full manual smoke not yet completed by user)

## Known follow-ups (not in this phase)

- Full manual smoke checklist (Section 6 of the spec) has not been run end-to-end yet by a human; the automated portion passed.
- Cycle 2 backlog logged in spec's "Cycle 2 TODOs" section + spec's deviation log (Themes tab in setup wizard, ergonomic mock-data editor, per-section editor, AI-augmented vertical generation, chip catalog rebuild, dashboard visual rebuild, `featurePage.accent*` derivation).
