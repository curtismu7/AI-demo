---
phase: 282-verticals-storage-and-live-switching
reviewed: 2026-05-29T00:00:00Z
depth: standard
files_reviewed: 28
files_reviewed_list:
  - demo_api_server/services/verticalManifest/schema.js
  - demo_api_server/services/verticalManifest/loader.js
  - demo_api_server/services/verticalManifest/overlay.js
  - demo_api_server/services/verticalManifest/resolver.js
  - demo_api_server/services/verticalManifest/scope.js
  - demo_api_server/services/verticalManifest/events.js
  - demo_api_server/services/verticalManifest/snapshot.js
  - demo_api_server/services/verticalManifest/index.js
  - demo_api_server/services/lmdb/verticalStore.lmdb.js
  - demo_api_server/routes/verticalManifest.js
  - demo_api_server/server.js
  - demo_api_server/config/oauthUser.js
  - demo_api_server/routes/accounts.js
  - demo_api_server/routes/oauthUser.js
  - demo_api_server/services/aguiSseProxy.js
  - demo_api_server/services/bankingAgentLangGraphService.js
  - demo_api_server/services/demoAgentLangGraphService.js
  - demo_api_server/services/geminiNlIntent.js
  - demo_api_server/config/verticals/banking/manifest.json
  - demo_api_ui/src/vertical/VerticalProvider.jsx
  - demo_api_ui/src/vertical/useVertical.js
  - demo_api_ui/src/vertical/applyThemeTokens.js
  - demo_api_ui/src/vertical/AdminEditor/VerticalEditorPage.jsx
  - demo_api_ui/src/vertical/AdminEditor/OverlayBadge.jsx
  - demo_api_ui/src/vertical/AdminEditor/CloneModal.jsx
  - demo_api_ui/src/components/VerticalSwitcher.js
  - demo_api_ui/src/components/VerticalHero.jsx
  - demo_api_ui/src/components/VerticalFeaturePage.jsx
  - demo_api_ui/src/components/BankingChips.jsx
  - demo_api_ui/src/components/UserDashboard.js
  - demo_api_ui/src/components/dashboard/DashboardHero.js
  - demo_api_ui/src/components/dashboard/AccountSummary.js
  - demo_api_ui/src/components/dashboard/ActionHub.js
  - demo_api_ui/src/components/dashboard/MobileDashboard.js
  - demo_api_ui/src/hooks/useAdminTheme.js
  - demo_api_ui/src/context/IndustryBrandingContext.js
  - demo_api_ui/src/App.js
findings:
  critical: 4
  warning: 8
  info: 5
  total: 17
status: issues_found
---

# Phase 282: Code Review Report

**Reviewed:** 2026-05-29
**Depth:** standard
**Files Reviewed:** 28 (read in full or in relevant sections), ~25 (consumer migrations skimmed via grep)
**Status:** issues_found

## Executive summary

The new six-layer server architecture and the SSE-driven client provider are well-structured, the Zod schema matches the spec, and the resolver's cache + array-as-leaf merge semantics are correctly implemented. However, the cutover is incomplete in two load-bearing places: **(a) `POST /api/verticals/active` writes only to LMDB, but three pre-existing server consumers (`routes/accounts.js`, `routes/oauthUser.js`, `data/store.js`) still read `configStore.getEffective('active_vertical')` — switching verticals does not reseed customer accounts or affect any code path that consults configStore**; **(b) the `VerticalSwitcher` reads `data.verticals || []` from a route that now returns a plain array, so the switcher renders `null` and end-users cannot change verticals**. The dashboard consumer migration also silently regressed: `useVertical()` returns `activeId` as a string, but `DashboardHero`/`AccountSummary`/`ActionHub`/`MobileDashboard` access `currentVertical?.id`, `?.name`, `?.icon` — every retail/workforce-specific branch is now dead code. There are also two enum-name regressions in the feature-page/hero renderers (`'pct'` and `'tier'` no longer exist in v3) and a missing `'percent'` case in the hero formatter. Treat the two critical store/switcher items as ship-blockers; the dashboard `?.id` cluster is the third — non-banking verticals appear broken to the user.

## Critical Issues

### CR-01: `POST /api/verticals/active` writes to LMDB but server consumers read `configStore.active_vertical`

**File:** `demo_api_server/services/verticalManifest/resolver.js:98-101` (writer), `demo_api_server/routes/accounts.js:233`, `demo_api_server/routes/oauthUser.js:82`, `demo_api_server/data/store.js:491` (readers)
**Issue:** The new system's active-vertical is stored in LMDB (`verticalStore.lmdb` `active` key). Three pre-existing places read `configStore.getEffective('active_vertical') || 'banking'` instead. Result of switching to e.g. `healthcare` via the admin API or `VerticalSwitcher`:
- The agent persona, dashboard chips, and terminology (read via `verticalManifest.resolver.activeId()`) **do** update.
- Customer account auto-provisioning / reseeding (`routes/accounts.js` `/my`, `routes/oauthUser.js` `reseedIfVerticalMismatch`, `data/store.js` `getDefaultAccountsForUser`) **does not** see the change. The customer keeps banking accounts after a switch to healthcare/retail/workforce. This breaks the entire spec-stated demo intent ("`activeId` survives restart … the customer dashboard reseeds on next login").
- A fresh install has LMDB empty: `resolver.activeId()` returns `null`, so `aguiSseProxy`/`bankingAgentLangGraphService`/`demoAgentLangGraphService`/`geminiNlIntent` see no manifest until an admin first clicks Switch. Meanwhile the legacy paths default to `'banking'`. The two paths disagree on day-zero state.

**Fix:** Either (a) bridge the two stores — have `resolver.setActive(id)` also call `configStore.setConfig('active_vertical', id)` and have `resolver.activeId()` fall back to `configStore.getEffective('active_vertical')` when LMDB is empty — or (b) migrate the three legacy reads to `verticalManifest.resolver.activeId() || 'banking'`. Option (a) is the smaller diff and preserves the existing configStore as the on-disk single source of truth for active id.

```js
// resolver.js — option (a)
function setActive(id) {
  store.setActiveId(id);
  try { configStore.setConfig('active_vertical', id); } catch (_) {}
  onEvent('vertical-switched', { activeId: id });
}
function activeId() {
  return store.getActiveId() || configStore.getEffective('active_vertical') || null;
}
```

---

### CR-02: `VerticalSwitcher` reads `data.verticals` but `/api/verticals/list` returns a plain array — switcher never renders

**File:** `demo_api_ui/src/components/VerticalSwitcher.js:17-19, 39`
**Issue:**
```js
fetch('/api/verticals/list', { credentials: 'include' })
  .then(r => r.ok ? r.json() : { verticals: [] })
  .then(data => setVerticals(data.verticals || []))  // route returns ARRAY, not {verticals: [...]}
...
if (verticals.length < 2) return null;
```
The new route returns `loader.list()` directly — a plain array of `{id, displayName}`. So `data.verticals` is `undefined`, `verticals` stays `[]`, `< 2` triggers, and the component renders `null`. End users have no UI to switch verticals. (The admin `VerticalEditorPage` works because it reads the array directly via `setList`.)

**Fix:**
```js
fetch('/api/verticals/list', { credentials: 'include' })
  .then(r => r.ok ? r.json() : [])
  .then(data => setVerticals(Array.isArray(data) ? data : []))
  .catch(() => {});
```
Also drop the `data.verticals` reference, and review the rendering — `v.theme?.primary` and `v.tagline` are no longer in the list-payload shape (list returns only `{id, displayName}`), so the "config" variant's pill styling and tagline are silently broken too.

---

### CR-03: Dashboard components destructure `activeId` (string) but read it as an object — non-banking branches are dead

**Files:**
- `demo_api_ui/src/components/dashboard/DashboardHero.js:9, 61, 74, 87, 232, 269, 272`
- `demo_api_ui/src/components/dashboard/AccountSummary.js:16, 75, 102, 108, 344-346`
- `demo_api_ui/src/components/dashboard/ActionHub.js:10, 21, 122, 128, 136, 197-200, 259-262`
- `demo_api_ui/src/components/dashboard/MobileDashboard.js:22, 172, 198`

**Issue:** All four files do:
```js
const { activeId: currentVertical } = useVertical();
...
switch (currentVertical?.id) { case 'retail': ... case 'workforce': ... default: ... }
```
`activeId` is a **string** (`'retail'`, `'banking'`, etc.) per `scope.js:19`. `'retail'.id` is `undefined`. Every retail/workforce/non-banking branch is unreachable; the rendering always falls through to the banking default. `currentVertical?.name` and `currentVertical?.icon` (used in DashboardHero, MobileDashboard) are also always `undefined`, so the vertical badge text/icon falls back to `'Banking'` or empty.

**Fix:** Either compare on `currentVertical` directly:
```js
const { activeId: currentVertical } = useVertical();
switch (currentVertical) { case 'retail': ... }
```
…or also pull `pageManifest` for display name:
```js
const { activeId, pageManifest } = useVertical();
const verticalName = pageManifest?.identity?.displayName;
```
There's no analogue for `.icon` in the new manifest schema — drop those references or add an `identity.icon` field if needed.

---

### CR-04: Snapshot restore writes overlays via raw store, bypassing `_validateMerged` and the wrapped-overlay event ordering

**File:** `demo_api_server/services/verticalManifest/snapshot.js:28-34`
**Issue:** Comment claims "skip per-field validation; they were valid when saved, schema hasn't changed." Two failure modes this assumption misses:
1. **The seed manifest CAN change between save and restore.** Snapshots persist across server restarts (LMDB), and admins can edit `config/verticals/<id>/manifest.json` on disk. If the seed schema or required-field set changes, the snapshot's overlay may now produce an invalid merged manifest. The next call to `resolver.resolve(id)` runs `ManifestSchema.parse(merged)` and **throws** — the route handler for `POST /snapshot/restore` returns 500 mid-restore, leaving partial state.
2. **The schema itself can change** — Cycle 2 explicitly plans to add fields. Old snapshots become poison pills.

A secondary issue: writing via `store.setOverlay()` bypasses the resolver's `_bump()` version counter. The subsequent `onRestoredId` fires `vertical-edited`, which triggers a client refetch — but if the resolver's cached entry for `id` predates the snapshot write and there was no prior `clearAll` for that id (an id newly introduced by the snapshot, not in current overlays), the cache is never invalidated. Trace: `allIds = union(snap.overlays, currentOverlays)` does include all snapshot ids, so `overlay.clearAll(id)` does run first and bump the version. Cache is invalidated. **Practically safe today** but fragile — the moment snapshot semantics evolve, this becomes a stale-cache bug.

**Fix:** Route restore through the validated overlay API, and ensure the cache is bumped explicitly:
```js
for (const [id, ov] of Object.entries(snap.overlays || {})) {
  try {
    // Use setBatch with one synthetic entry to reuse _validateMerged + cache bump
    // OR re-validate the merged result here before writing.
    store.setOverlay(id, ov);
    resolver._bump(id);  // expose _bump on resolver for this use
  } catch (e) {
    // log and skip this id rather than aborting the whole restore
  }
  onRestoredId(id);
}
```

## Warnings

### WR-01: `VerticalFeaturePage` and `VerticalHero` use the old format enum names (`'pct'`, `'tier'`)

**Files:**
- `demo_api_ui/src/components/VerticalFeaturePage.jsx:17` — checks `fmt === 'pct'`
- `demo_api_ui/src/components/VerticalHero.jsx:13` — `case "tier"`

**Issue:** Per the migration script (`scripts/migrateVerticalsV3.js` — referenced in plan section, file already deleted), `'pct'` was normalized to `'percent'` and `'tier'` was normalized to `'text'`. The manifests on disk all use the new names; the renderer code still tests the old ones. Result: any field with `format: 'percent'` silently falls through to `String(value ?? '')` instead of rendering `12.345%`. `banking/manifest.json` does declare `format: 'percent'` for the hero card `Interest rate` — this regression ships immediately.

`VerticalHero.formatValue` also has no `case "percent"` branch at all; values fall through to the `text` default.

**Fix:**
```js
// VerticalFeaturePage.jsx
function formatValue(value, fmt, currency) {
  if (fmt === 'money')   return fmtMoney(value, currency);
  if (fmt === 'percent') return fmtPct(value);   // was 'pct'
  return String(value ?? '');
}

// VerticalHero.js
case "percent":
  return typeof value === 'number' ? `${value.toFixed(2)}%` : String(value);
// remove case "tier"; not in v3 enum
```

---

### WR-02: `DELETE /api/verticals/:id` and overlay routes do not validate `:id` with `ID_REGEX`

**File:** `demo_api_server/routes/verticalManifest.js:71-148`
**Issue:** Only the `clone` route's `newId` body field passes through `ID_REGEX.test(newId)`. The URL `:id` in `DELETE /:id`, `POST /:id/overlay`, `POST /:id/overlay/batch`, and `DELETE /:id/overlay` is fed to `path.join(root, id)` and `fs.rmSync(...)`. Express decodes `%2F` to `/` inside `req.params.id`, so `DELETE /api/verticals/banking%2F..%2F..%2Ftmp` could resolve to a directory outside the verticals folder. Practical exploitability today is gated by `loader.get(id)` returning null for any non-cached id and producing a 404 first — so this is **defense-in-depth**, not a known live exploit. But the implicit reliance on the loader's cache as a security boundary is fragile (e.g., a future code change that loads ids on demand would open the hole).

**Fix:** Add a guard at the top of every parameterized handler:
```js
if (!ID_REGEX.test(id)) return res.status(400).json({ error: 'invalid id format' });
```

---

### WR-03: `VerticalEditorPage.save` diffs against the merged manifest, not the seed

**File:** `demo_api_ui/src/vertical/AdminEditor/VerticalEditorPage.jsx:55-67, 79`
**Issue:** Both `editorValue` and `seedValue` are populated from `pageManifest` (line 55-57), which is the **merged** manifest (seed + overlay). The "Save = diff(seed, edited) and overlay" rule from the spec is broken. Concrete consequences:
1. Editing a field back to its true seed value is recorded as an explicit overlay (storing seed defaults — wastes space and noise in `overlay.list(id)`).
2. There's no way for the editor to *clear* an existing overlay by editing the JSON back to seed.
3. The overlay grows monotonically across save/edit cycles instead of pruning unchanged fields.

**Fix:** Fetch the raw seed (e.g., expose `GET /api/verticals/:id/seed` or include `seedManifest` alongside `pageManifest` in `/me`), store it separately from the merged view, and diff against the seed when saving. Until then, `diff(merged, edited)` is at least functional (no broken writes) — but the override panel is empty and reset-via-edit doesn't work.

---

### WR-04: `VerticalEditorPage` overrides panel is hardcoded to `paths={[]}` — feature missing

**File:** `demo_api_ui/src/vertical/AdminEditor/VerticalEditorPage.jsx:175`
**Issue:** Per spec Section 4 (UX rules 4 + 7), the overrides panel must list the current overlay paths (from `overlay.list(id)`) so admins can per-field reset. The implementation passes `paths={[]}` and `onResetField={() => {}}`. The `OverlayBadge` component is well-structured but receives no data. End result: admins cannot see what they've overridden, cannot per-field reset, and have no signal that an overlay even exists on a vertical.

**Fix:** Add `GET /api/verticals/:id/overlay/list` (or include it in `/me`) and wire it through. `overlay.list(id)` already exists server-side.

---

### WR-05: `VerticalEditorPage.save` is not disabled when JSON / Zod validation fails

**File:** `demo_api_ui/src/vertical/AdminEditor/VerticalEditorPage.jsx:61-78, 184-187`
**Issue:** Per spec Section 4 UX rule 3 ("Save disabled when invalid"), the editor must block save on invalid JSON/Zod. The current implementation lets the user click Save with malformed JSON; the catch block surfaces "Invalid JSON: …" after the click. Acceptable as MVP but the spec rule was explicit. No live Zod feedback either.

**Fix:** Add a `useMemo(() => { try { JSON.parse(editorValue); return null; } catch (e) { return e.message; } }, [editorValue])` validator and wire `disabled={!!parseError}` on the Save button. Full Zod validation (per spec, via `zod-to-json-schema` and Monaco's JSON schema integration) is a bigger ask but is in scope for this phase per the spec.

---

### WR-06: `VerticalProvider.useEffect` calls `refetch()` even though SSE sends an initial `vertical-switched` event

**File:** `demo_api_ui/src/vertical/VerticalProvider.jsx:64`
**Issue:** Per spec Section 3 key decision 5 ("Initial `vertical-switched` on stream connect is a hydration optimization — saves one HTTP request per page load"), the server sends the initial event on stream open. The client provider on mount calls `refetch()` immediately, *then* opens the EventSource, *then* receives the initial event which **triggers a second refetch** via `addEventListener('vertical-switched', refetch)`. Trailing throttle collapses bursts, but the leading call runs both — two `/me` round-trips per page load. Not a bug, just defeats the hydration optimization.

**Fix:** Drop the eager `refetch()` call; rely on the initial `vertical-switched` event from the server. If the initial event isn't received (e.g., server didn't set an active id), fall back to fetching after a short timeout:
```js
useEffect(() => {
  let hydrated = false;
  const es = new EventSource('/api/verticals/stream', { withCredentials: true });
  const onAny = () => { hydrated = true; refetch(); };
  es.addEventListener('vertical-switched', onAny);
  es.addEventListener('vertical-edited', onAny);
  es.addEventListener('vertical-list-changed', () => window.dispatchEvent(new CustomEvent('vertical-list-changed')));
  // Fallback: SSE may 401 (logged out) — hydrate empty so we don't blank the page
  const fallback = setTimeout(() => { if (!hydrated) refetch(); }, 1500);
  return () => { clearTimeout(fallback); es.close(); };
}, [refetch]);
```

---

### WR-07: `events.js` emits to closed clients before close handler removes them — `try/catch` is silent

**File:** `demo_api_server/services/verticalManifest/events.js:4-10, 33`
**Issue:** When a client disconnects, the `close` event handler removes them from `clients`. There's a race where `emit()` iterates `clients` and writes to a still-registered-but-closing res. The `try/catch` silently swallows errors. Two issues:
1. The catch comments say "the close handler removes it" — but if the close handler races with emit, you may emit to a closed socket repeatedly across multiple events until close fires. Each write triggers a thrown error, all swallowed. Logging would help diagnose Vercel/proxy edge cases.
2. The heartbeat `try/catch` masks errors that may indicate a stuck connection (e.g., backpressure). 25-second cadence × silent failure could leave zombie clients in the Set indefinitely if the close event never fires for some reason.

**Fix:** Treat thrown writes as definitive close signals:
```js
function _send(res, type, payload) {
  try { res.write(`event: ${type}\ndata: ${JSON.stringify(payload)}\n\n`); }
  catch (e) { clients.delete(res); }
}
```
Same change in the heartbeat callback. Optional: log when forced-removal happens.

---

### WR-08: `verticalStore.listOverlayIds` skips empty-object overlays — `clearOverlay` is the only correct way to remove

**File:** `demo_api_server/services/lmdb/verticalStore.lmdb.js:34-43`
**Issue:** The filter `Object.keys(value).length > 0` hides empty-object overlay records from `listOverlayIds`. But `overlay.clearField` (in `overlay.js`) walks up the path tree deleting empty parent objects (`deletePath` lines 38-42) and then calls `store.setOverlay(id, current)` — when `current` becomes `{}`, it's written back as `{}` rather than removed. The LMDB row stays as `{}` forever, invisible to the list and not represented in any "this vertical has any override" check. Combined with `WR-04` (overrides panel missing), the symptom is subtle today, but it means storage accretes empty rows over time and `reset-all` (which iterates `listOverlayIds`) silently skips ids whose overlays got cleared via repeated `clearField`.

**Fix:** When the merged overlay would be `{}`, call `clearOverlay(id)` instead of `setOverlay(id, {})`:
```js
// overlay.js
function clearField(id, path) {
  const current = get(id);
  if (!deletePath(current, path)) return;
  if (Object.keys(current).length === 0) store.clearOverlay(id);
  else store.setOverlay(id, current);
}
```

## Info

### IN-01: `loader.js` creates a `defaultLoader` singleton that is never used

**File:** `demo_api_server/services/verticalManifest/loader.js:52-53`
**Issue:** `index.js` builds its own `createLoader(root)` instance with `VERTICAL_SEED_ROOT` honored. The exported `loader: defaultLoader` is created at module-require time before any env var has been resolved and is never imported anywhere. Dead.
**Fix:** Drop the singleton; export only `createLoader`.

---

### IN-02: `featurePage.accent*` legacy fallbacks remain in `VerticalFeaturePage.jsx`

**File:** `demo_api_ui/src/components/VerticalFeaturePage.jsx:29-43`
**Issue:** Per spec, `accentBg`/`accentLight`/`accentCode`/`accentText`/`accentAccentText` were dropped in v3 (Cycle 2 will derive from `accentColor`). The renderer still reads `fp?.accentBg` etc.; they will always be `undefined` → falls to the hex-color defaults. Inert today (no manifest sets them, no schema rejects them as unknown — schema isn't `strict`), but signals "stale code path".
**Fix:** Either drop the reads entirely (use only `accentColor` + derived shades) or document them as intentional Cycle 2 placeholders.

---

### IN-03: Resolver's `JSON.parse(JSON.stringify(...))` clone on every `resolve()` is gratuitous on cache hit

**File:** `demo_api_server/services/verticalManifest/resolver.js:67, 82`
**Issue:** The clone-on-return defense is sound (prevents cache poisoning by mutating callers), but it runs on every call, including cache hits. For `GET /me` this is cheap, but per-request `verticalManifest.resolver.resolve(...)` is called from agent services and may be called many times in a tool execution loop. Not a correctness issue. Out of v1 scope (perf) but worth noting.
**Fix:** Acceptable as-is; consider `structuredClone()` for marginally faster clones, or freeze the cached object and skip cloning on hit (callers would need to copy before mutating).

---

### IN-04: `OverlayBadge` button has no `type="button"` for the reset-all (it does — confirmed) but error message refers to "Reset all overrides"

**File:** `demo_api_ui/src/vertical/AdminEditor/OverlayBadge.jsx:34-38`
**Issue:** Cosmetic — "Reset all overrides" button on the badge calls the same handler as the editor header's "Reset this vertical to seed". With the badge wired to `paths={[]}` (WR-04), the badge never renders the non-empty branch anyway. Confusing button label duplication once WR-04 is fixed.
**Fix:** Rename to "Reset all fields on this vertical" or remove (use the editor header button only).

---

### IN-05: `module-level `_lastKeys` in `applyThemeTokens.js` is fine in production but leaks between Jest tests / HMR cycles

**File:** `demo_api_ui/src/vertical/applyThemeTokens.js:1`
**Issue:** Module-level mutable state. The test file imports `_resetThemeTokens` which is why tests work today. Not a bug — but two `VerticalProvider`s mounted in the same JSDOM run (e.g., parallel test cases without `beforeEach` resets) would clobber each other.
**Fix:** Acceptable. Optional: scope into the provider via `useRef`. Skip for now.

## Coverage notes

**Read in full (or in the relevant sections):**
- All 8 new server modules in `services/verticalManifest/`
- `services/lmdb/verticalStore.lmdb.js`
- `routes/verticalManifest.js`
- All 6 new client files in `src/vertical/` (provider, hook, theme tokens, editor + 2 modals)
- `App.js` (provider wiring + editor route registration)
- `server.js` (init + mount path with auth middleware)
- Modified server consumers: `config/oauthUser.js`, `routes/accounts.js`, `routes/oauthUser.js`, `services/aguiSseProxy.js`, `services/bankingAgentLangGraphService.js`, `services/demoAgentLangGraphService.js`, `services/geminiNlIntent.js`
- `config/verticals/banking/manifest.json` (sample seed for enum-name verification)
- Client consumers: `VerticalSwitcher`, `VerticalHero`, `VerticalFeaturePage`, `BankingChips`, `UserDashboard`, all 4 dashboard/* files, `useAdminTheme`, `IndustryBrandingContext`

**Skimmed via grep (looking for the `currentVertical?.id` / `?.name` / `?.icon` regression pattern and old destructure fallbacks):**
- `TopNav.js`, `SideNav.js`, `Admin.jsx`, `Dashboard.js`, `EmbeddedAgentDock.js`, `Accounts.js`, `Config.js`, `ActivityLogs.js`, `ApiTrafficPage.js`, `BankingAgent.js`, `DemoSetupPanel.js`, `DemoDataPage.js`, `SetupPage.js`, `Configuration/UnifiedConfigurationPage.tsx` — these destructure `{ pageManifest }` or `{ activeId: vertical }` and either use the manifest fields directly (correct) or use `vertical` as the id string (correct). No regressions found in this set.

**Not read:**
- `scripts/migrateVerticalsV3.js` (deleted in `3bdeaeca` per SUMMARY — out of repo).
- Tests in `tests/verticalManifest/` and `src/vertical/__tests__/` — review is of production code per `<critical_rules>`; tests are referenced only to corroborate behavior.
- Mock-data JSON files for non-banking verticals — only `banking/manifest.json` was sampled (confirmed `percent` format used; sufficient to corroborate WR-01).
- Bootstrap script (Task 16). Path-only change; not asserted by phase verification claims.

## Out of scope confirmations

- **`feat/clinical-split-integration` branch (commits `a72c3fb4`, `ae83f79a`, merge `2f20b4d7`)**: not reviewed. `AgentClinicalHost.jsx`'s `useTheme → useVertical` migration is in scope per the SUMMARY but was not inspected in this review beyond confirming the file imports `useVertical` per the plan.
- **Parallel-misc commit `bfe319ec`** (README/REGRESSION_PLAN/simulatedAuthorize/etc.): not reviewed.

---

_Reviewed: 2026-05-29_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
