# Phase 225: retail-theme-toggle - Research

**Researched:** 2026-04-24
**Domain:** React UI theming, feature flags, client-side mock data
**Confidence:** HIGH

## Summary

This phase adds a `ff_retail_mode` runtime toggle that switches the app between the existing banking
experience and a Best Buy-style electronics retail demo. The implementation is almost entirely
client-side: one new industry preset, one new feature flag, and conditional rendering in
`UserDashboard.js`. No BFF route changes, no new context providers, no new infrastructure.

All the infrastructure needed already exists and is well-understood from the codebase audit:
`IndustryBrandingContext` manages CSS var theming through `applyIndustryId`, `FLAG_REGISTRY` in
`featureFlags.js` auto-wires any new flag to the Feature Flags page UI, and `renderBankingMain()`
in `UserDashboard.js` is the single function that renders the hero, account cards, and transaction
list — the only section that needs conditional swapping.

The primary implementation risk is `UserDashboard.js` itself: it is a 3,435-line file with multiple
regression-plan entries protecting its session, REAUTH, middle-layout, and bottom-dock logic. Any
edits must be strictly additive, targeting only the `renderBankingMain` function body and the
`ff_retail_mode` feature-flag read effect. The `welcomeMessage` function in `BankingAgent.js` needs
a single-line guard to inject retail copy when the preset id is "retail".

**Primary recommendation:** Add `ff_retail_mode` flag to `featureFlags.js`, add "retail" preset to
`industryPresets.js`, read the flag in `UserDashboard.js` with the same `bffAxios.get('/api/admin/config')`
pattern already used for `ff_inject_scopes`, and branch `renderBankingMain()` to show retail product
cards when the flag is on.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Retail product/cart data is **client-side JSON mock only** — a hardcoded electronics product
  list imported into React. Zero BFF endpoint changes.
- **D-02:** Product catalog is **Best Buy-style mix** — laptops, TVs, phones, headphones, gaming gear
  (~8-10 products with price, SKU, stock status).
- **D-03:** Retail mode re-skins **Dashboard hero + account cards only**: account cards → product cards
  (price, stock status, add-to-cart), balance summary → cart total, transaction list → recent orders.
  Agent area, Admin, Config, Education pages stay as-is.

### Claude's Discretion

- Exact CSS var values for the retail preset (Best Buy blue `#0046BE`, yellow `#FFE000`)
- Shopping cart state management: simple `useState` / `useReducer` within the retail data hook — no Redux, no context provider
- Retail logo: use a placeholder text-based logo (e.g., "BX Electronics") — no new image asset needed
- Product card layout: reuse existing card shell CSS, swap content only

### Deferred Ideas (OUT OF SCOPE)

- MCP tool label re-skinning (tool names in TypeScript MCP server) — too high regression risk
- Persistent cart state across sessions (localStorage) — not needed for a demo toggle
- Real product API or inventory backend — client-side mock is sufficient for demo purposes
- Multiple retail "brands" (e.g., Amazon, Target-style) — single Best Buy-style palette is enough
</user_constraints>

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Feature flag storage + serving | API / BFF | — | `FLAG_REGISTRY` in `featureFlags.js`; persisted via `configStore`; read by client on mount |
| Feature flag UI toggle | Browser (React) | — | `FeatureFlagsPage.js` reads `GET /api/admin/feature-flags`; PATCH updates via `PATCH /api/admin/feature-flags`; no new UI code needed |
| Theme / CSS var switching | Browser (React) | — | `IndustryBrandingContext.applyIndustryId` sets CSS vars on `document.documentElement` at runtime |
| Dashboard content switching | Browser (React) | — | `UserDashboard.renderBankingMain()` is the single render gate for hero + accounts + transactions |
| Product mock data | Browser (React) | — | Hardcoded JS/JSON import; no BFF call |
| Cart state | Browser (React) | — | `useState` / `useReducer` local to the retail section; not persisted |
| Agent greeting copy | Browser (React) | — | `welcomeMessage()` function in `BankingAgent.js` reads `brandShortName` from preset |

---

## Standard Stack

### Core (all already installed)

| Library | Version | Purpose | Source |
|---------|---------|---------|--------|
| React | 18.2.0 | Component rendering | [VERIFIED: package.json] |
| react-scripts / CRA | 5.0.1 | Build toolchain | [VERIFIED: package.json] |
| axios | 1.4.0 | BFF HTTP calls | [VERIFIED: package.json] |

No new npm packages are needed for this phase. All capabilities are implemented with existing
project dependencies.

---

## Architecture Patterns

### System Architecture Diagram

```
User clicks "Retail Mode ON" toggle (FeatureFlagsPage or Dashboard banner)
        │
        ▼
PATCH /api/admin/feature-flags { updates: { ff_retail_mode: true } }
        │
        ▼ featureFlags.js FLAG_REGISTRY → configStore.setConfig({ ff_retail_mode: "true" })
        │
        ▼ (next UserDashboard mount / explicit re-read)
GET /api/admin/config   ←── Dashboard.js already uses this endpoint
        │
        ▼ cfg.ff_retail_mode === "true"
        │
        ├─► applyIndustryId("retail")
        │       └─► CSS vars on :root → Best Buy blue/yellow
        │
        ├─► setRetailMode(true)           // new local state in UserDashboard
        │
        ▼
renderBankingMain()   (branched)
   ├── if retailMode:
   │     hero     → cart total (sum of cart items)
   │     accounts → product cards (RETAIL_PRODUCTS mock data)
   │     txns     → recent orders (RETAIL_ORDERS mock data)
   │
   └── if banking:
         hero     → total accounts balance  (unchanged)
         accounts → account cards           (unchanged)
         txns     → transactions list       (unchanged)
```

### Recommended Project Structure

No new directories needed. New files are co-located with existing patterns:

```
banking_api_server/routes/
├── featureFlags.js            ← add ff_retail_mode entry to FLAG_REGISTRY

banking_api_ui/src/config/
├── industryPresets.js         ← add "retail" preset object
├── retailMockData.js          ← NEW: RETAIL_PRODUCTS + RETAIL_ORDERS arrays

banking_api_ui/src/components/
├── UserDashboard.js           ← add ff_retail_mode read effect + branch renderBankingMain
├── UserDashboard.css          ← add .retail-product-card + .retail-mode-banner classes
├── RetailModeBanner.js        ← NEW: small persistent banner toggle (secondary toggle)
├── RetailModeBanner.css       ← NEW: banner styles
```

### Pattern 1: Feature Flag in BFF FLAG_REGISTRY

**What:** Add a new object to the `FLAG_REGISTRY` array in `featureFlags.js`. The flag immediately
appears in the Feature Flags page UI. The key used in `configStore` is the flag's `id` string.

**When to use:** Any new boolean feature toggle exposed through the admin UI.

**Example (from featureFlags.js — verified pattern):**
```javascript
// Source: banking_api_server/routes/featureFlags.js (verified in codebase)
{
  id:           'ff_webmcp_enabled',
  name:         'WebMCP — Browser MCP Panel',
  category:     'WebMCP',
  description:  'Show the WebMCP interaction panel...',
  impact:       'OFF (default) = panel hidden. ON = panel visible.',
  type:         'boolean',
  defaultValue: false,
  warnIfEnabled: false,
},
```

New entry follows this exact shape:
```javascript
{
  id:           'ff_retail_mode',
  name:         'Retail Mode — Best Buy-style demo',
  category:     'Retail Demo',
  description:  'Switch the customer dashboard to a Best Buy-style electronics retail experience. '
              + 'Swaps the hero, account cards, and transaction list with product cards, cart total, '
              + 'and recent orders. All OAuth, MCP, PingOne Authorize, FIDO2, and Dev Tools panels '
              + 'are unchanged.',
  impact:       'OFF (default) = standard banking dashboard. ON = retail demo (product cards, cart total).',
  type:         'boolean',
  defaultValue: false,
},
```
[VERIFIED: FLAG_REGISTRY pattern from codebase grep]

### Pattern 2: Client-Side Feature Flag Read (Dashboard pattern)

**What:** Read a feature flag value from `/api/admin/config` in a `useEffect` on mount; store
in component state; use the state to gate rendering.

**When to use:** Any client-side component that needs to read a feature flag without a dedicated
endpoint.

**Exact pattern verified in Dashboard.js:**
```javascript
// Source: banking_api_ui/src/components/Dashboard.js lines 346-358 (verified)
useEffect(() => {
  bffAxios
    .get("/api/admin/config")
    .then((res) => {
      const cfg = res.data;
      setScopeInjectionEnabled(
        cfg.ff_inject_scopes === "true" || cfg.ff_inject_scopes === true,
      );
    })
    .catch(() => { /* non-critical */ });
}, []);
```

Apply same pattern in `UserDashboard.js`:
```javascript
// New state at top of UserDashboard component (after existing useState calls)
const [retailMode, setRetailMode] = useState(false);

// New useEffect (co-located with the ff_inject_scopes-style effects)
useEffect(() => {
  bffAxios                       // NOTE: UserDashboard uses apiClient for user routes
    .get("/api/admin/config")    // but admin config is accessible publicly (no auth gate)
    .then((res) => {
      const cfg = res.data?.config || res.data;
      setRetailMode(cfg.ff_retail_mode === "true" || cfg.ff_retail_mode === true);
    })
    .catch(() => { /* non-critical */ });
}, []);
```

**IMPORTANT:** Dashboard.js uses `bffAxios`, UserDashboard.js uses `apiClient` for data calls —
but `/api/admin/config` is a public config endpoint accessible to both. Use `apiClient` to stay
consistent with UserDashboard's existing import set.
[VERIFIED: import lists in both files from codebase read]

### Pattern 3: IndustryBrandingContext + industryPresets.js

**What:** Add a new preset object to the `INDUSTRY_PRESETS` array. The context picks it up
automatically via `getIndustryPreset(id)`. Calling `applyIndustryId("retail")` sets CSS vars on
`document.documentElement` and persists the id to localStorage.

**When to use:** Any runtime brand/theme change.

**Exact API (verified from IndustryBrandingContext.js):**
```javascript
const { applyIndustryId } = useIndustryBranding();
// Sets CSS vars + localStorage + React state in one call:
applyIndustryId("retail");    // switch to retail
applyIndustryId("bx_finance"); // restore banking
```

**New preset to add to industryPresets.js:**
```javascript
// Source: extending banking_api_ui/src/config/industryPresets.js (verified structure)
{
  id: "retail",
  label: "BX Electronics (Retail Demo)",
  shortName: "BX Electronics",
  tagline: "Great products, secure checkout",
  description:
    "Best Buy-style electronics retail demo. Blue #0046BE / yellow #FFE000 palette. "
    + "Activated by ff_retail_mode feature flag.",
  logoPath: null,    // no image asset; BrandLogo falls back to shortName text
  cssVars: {
    "--app-primary-red":        "#0046BE",   // Best Buy blue replaces crimson primary
    "--app-primary-red-hover":  "#003ca6",
    "--app-primary-red-mid":    "#0052d9",
    "--app-primary-red-border": "#002f8f",
    "--brand-dashboard-header-start": "#0046BE",
    "--brand-dashboard-header-end":   "#0052d9",
    "--brand-app-shell-hero-start":   "#0046BE",
    "--brand-app-shell-hero-end":     "#0052d9",
  },
},
```
[VERIFIED: cssVars key names from industryPresets.js + index.css :root definitions]

**Logo fallback:** `BrandLogo.js` reads `preset.logoPath`. If null or undefined, `getIndustryPreset`
returns `found || INDUSTRY_PRESETS[0]`, so `logoPath` will never be null at runtime — the preset
must include a `logoPath`. Use `null` is incorrect. Use `""` (empty string) or omit the field and
rely on BrandLogo's own null-check.

Check `BrandLogo.js` behavior:
[ASSUMED: BrandLogo renders a text fallback when logoPath is falsy — needs verification in code]

### Pattern 4: renderBankingMain() Branching

**What:** `renderBankingMain` is a `const` function defined at line 1646 of UserDashboard.js. It
renders `<> ... </>` containing the hero section, quick actions, trust strip, super-pills, profile,
accounts grid, and transaction list. It is called in three layout branches (lines 2500, 2553, 2577).

**Strategy:** Add a retail branch inside `renderBankingMain` using the `retailMode` state. Keep the
existing banking JSX unchanged — wrap it with an `if (retailMode)` that returns a replacement JSX
block. This is strictly additive.

```javascript
const renderBankingMain = () => {
  if (retailMode) {
    return <RetailDashboardMain
      products={RETAIL_PRODUCTS}
      cart={cart}
      onAddToCart={addToCart}
      onRemoveFromCart={removeFromCart}
      orders={RETAIL_ORDERS}
      onToggleBanking={() => handleRetailToggle(false)}
    />;
  }
  return (
    <>
      {/* existing banking JSX — untouched */}
    </>
  );
};
```

Extracting retail JSX into a `RetailDashboardMain` sub-component keeps UserDashboard's diff small
and avoids deep nesting inside an already large function. The sub-component lives in
`UserDashboard.js` as a local function or a separate `RetailDashboardMain.js` file.

### Pattern 5: Agent Greeting Copy Change

**What:** `welcomeMessage(u, focus, brandShortName)` at line 1012 of BankingAgent.js returns the
greeting string. It already uses `brandShortName` from `industryPreset.shortName`. When retail mode
is ON and `brandShortName === "BX Electronics"`, the end-user greeting auto-changes because the
last line uses the brand name. However the body copy ("check your balances, move money") remains
banking-specific.

**Strategy (minimal):** The greeting body changes automatically because `brandShortName` flows from
the preset. But the specific text "check your balances, move money between accounts" needs to be
conditionalized on the preset id, not the short name:

```javascript
// Source: BankingAgent.js line 1032 (verified)
// CURRENT:
return `👋 Hi ${name}! I can check your balances, move money between accounts, and explain
the OAuth flows happening behind the scenes. What would you like to do?`;

// CHANGE TO:
const isRetail = industryPreset.id === "retail";
return isRetail
  ? `👋 Hi ${name}! I can browse products, check prices, help with your cart, and explain
the OAuth flows securing your checkout. What would you like to do?`
  : `👋 Hi ${name}! I can check your balances, move money between accounts, and explain
the OAuth flows happening behind the scenes. What would you like to do?`;
```

This change is confined to lines 1027-1032 — a low-risk, 5-line diff.
[VERIFIED: line numbers and function structure from BankingAgent.js codebase read]

### Anti-Patterns to Avoid

- **Switching via industryPreset state alone (without a separate `retailMode` boolean):** The
  industryPreset id persists to localStorage and to the server config `ui_industry_preset` field.
  Conflating "retail theme" with "retail data layer" via a single preset check creates coupling —
  a user who manually saves "retail" as their `ui_industry_preset` in Config would get retail data
  without explicitly enabling the flag. Keep `retailMode` as its own boolean derived from
  `ff_retail_mode`, and call `applyIndustryId` as a side effect of that flag being ON.

- **Modifying the existing banking JSX in `renderBankingMain`:** Never rename, reorder, or
  refactor the existing banking sections. Insert the retail branch as a conditional at the top of
  the function and leave the banking branch identical to the current code. This minimizes diff and
  preserves all regression protections.

- **Using `loadPublicConfig` (IndexedDB) to read `ff_retail_mode`:** `loadPublicConfig` only caches
  the fields listed in `PUBLIC_FIELDS` (configService.js). `ff_retail_mode` is not in that list.
  Use the direct `GET /api/admin/config` or `GET /api/admin/feature-flags` call instead.
  [VERIFIED: PUBLIC_FIELDS list from configService.js codebase read]

- **Persisting cart state across mounts:** The CONTEXT.md explicitly defers localStorage cart
  persistence. Keep cart in `useState` / `useReducer` that resets on unmount.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| CSS var theming | Custom theme context or className swap | `applyIndustryId("retail")` via `IndustryBrandingContext` | Already handles `:root` vars, localStorage, React state, and SSR safety |
| Feature flag admin UI | New toggle page or inline toggle | Add to `FLAG_REGISTRY` — FeatureFlagsPage renders all flags automatically | Zero new Admin UI code required |
| Retail data HTTP endpoint | New BFF route for product catalog | Hardcoded JS import `RETAIL_PRODUCTS` array | D-01 decision — BFF changes explicitly out of scope |

**Key insight:** The existing IndustryBrandingContext + FLAG_REGISTRY combination covers 100% of
the theming and toggle infrastructure. The only genuinely new code is the product mock data array,
the product card JSX, and the feature-flag read in UserDashboard.

---

## Common Pitfalls

### Pitfall 1: `applyIndustryId` vs `setIndustryId` — which persists the preset permanently

**What goes wrong:** Using `applyIndustryId("retail")` saves "retail" to `localStorage` under key
`bx_industry_preset_id`. If the user then turns off `ff_retail_mode`, the next page load will read
the stale localStorage value and re-apply the retail theme before the feature flag check completes.

**Why it happens:** `IndustryBrandingContext` initializes from localStorage synchronously in
`useState(() => readStoredIndustryId())`, before the async config fetch.

**How to avoid:** When `ff_retail_mode` turns OFF, call `applyIndustryId("bx_finance")` to restore
the banking preset and overwrite the localStorage value. The flag read effect must handle both
ON and OFF cases:
```javascript
if (cfg.ff_retail_mode === "true" || cfg.ff_retail_mode === true) {
  setRetailMode(true);
  applyIndustryId("retail");
} else {
  setRetailMode(false);
  applyIndustryId("bx_finance");   // reset theme even if localStorage cached "retail"
}
```
[VERIFIED: IndustryBrandingContext.js localStorage behavior from codebase read]

### Pitfall 2: `res.data` vs `res.data.config` for the config response shape

**What goes wrong:** `GET /api/admin/config` returns `{ config: { ... } }` in some places and
`{ ff_retail_mode: ... }` flat in others, depending on how the BFF route formats the response.
Dashboard.js accesses `res.data` directly (flat), but IndustryBrandingContext accesses
`data?.config?.ui_industry_preset`.

**Why it happens:** The endpoint response shape differs between the BFF's `/api/admin/config`
(returns the full config object) and what Dashboard.js uses (`cfg.ff_inject_scopes`). Dashboard.js
uses `bffAxios.get("/api/admin/config")` and reads `res.data` (not `res.data.config`).

**How to avoid:** Follow the Dashboard.js pattern exactly:
```javascript
const cfg = res.data;           // NOT res.data.config
setScopeInjectionEnabled(cfg.ff_inject_scopes === "true" || ...);
```
[VERIFIED: Dashboard.js lines 346-358 from codebase read]

### Pitfall 3: `BrandLogo` logoPath null crash

**What goes wrong:** `BrandLogo.js` renders `<img src={preset.logoPath} ...>`. If `logoPath` is
`null` in the retail preset, the `<img>` renders `src="null"` (string) and shows a broken image
icon.

**How to avoid:** Set `logoPath: ""` in the retail preset to produce an empty string rather than
null, and rely on BrandLogo's conditional rendering (verify it checks for falsy logoPath). If
BrandLogo does not guard against empty string, add a text fallback logo or use a CSS text-only
approach: set `logoPath` to a data URI for a simple SVG with the "BX Electronics" text.
[ASSUMED: BrandLogo does not crash on empty string — verify by reading BrandLogo.js before implementing]

### Pitfall 4: Snapshot test breakage from INDUSTRY_PRESETS change

**What goes wrong:** `SideNav.snapshot.test.js` mocks `useIndustryBranding` with a hardcoded
preset object. Adding a third preset to `INDUSTRY_PRESETS` will not break the snapshot, but if
`getIndustryPreset` is ever called without a mock, the snapshot output could change.

**Why it happens:** The snapshot test mocks the context, not the config array, so adding a preset
is safe. However, if the SideNav renders preset-sensitive content (e.g., a dropdown of all
industry options), the snapshot will need updating.

**How to avoid:** After adding the "retail" preset, run `npm run test:unit` and update any
broken snapshots with `npm run test:unit -- --updateSnapshot`. Confirm the snapshot diff is only
the new preset option.
[VERIFIED: SideNav.snapshot.test.js mocking pattern from codebase read]

### Pitfall 5: `UserDashboard.js` regression guard — never touch REAUTH_KEY, middleAgentOpen init, or bottom-dock state

**What goes wrong:** UserDashboard has 5+ regression-plan entries for its session handling.
Adding state variables in the wrong location or adding a side effect that runs before
`fetchUserData()` can interfere with the REAUTH guard.

**How to avoid:**
- Place the `retailMode` useState after existing state declarations, before `loadDemoFallback`.
- Place the feature flag `useEffect` near the existing `ff_inject_scopes` effect in Dashboard.js
  (for admin dashboard) or after the initial data-fetching effects in UserDashboard.js.
- Never clear `sessionStorage.getItem(REAUTH_KEY)` in any new effect.
[VERIFIED: UserDashboard.js regression-plan entries in REGRESSION_PLAN.md]

---

## Code Examples

Verified patterns from official codebase sources:

### FLAG_REGISTRY entry shape (verified from featureFlags.js)
```javascript
{
  id:           'ff_retail_mode',
  name:         'Retail Mode — Best Buy-style demo',
  category:     'Retail Demo',
  description:  'Switch the customer dashboard to a Best Buy-style electronics retail experience. '
              + 'Swaps hero, account cards, and transaction list. All auth panels unchanged.',
  impact:       'OFF (default) = banking dashboard. ON = retail product cards + cart total.',
  type:         'boolean',
  defaultValue: false,
}
```

### Retail product mock data (client-side only, no BFF call)
```javascript
// banking_api_ui/src/config/retailMockData.js (new file)
export const RETAIL_PRODUCTS = [
  { id: "p1",  sku: "BB-65QLED",   name: 'Samsung 65" QLED TV',         price: 1299, stock: "In Stock",       category: "TV" },
  { id: "p2",  sku: "BB-MBP14",    name: "MacBook Pro 14\"",             price: 1999, stock: "In Stock",       category: "Laptop" },
  { id: "p3",  sku: "BB-APP3",     name: "AirPods Pro",                  price:  249, stock: "In Stock",       category: "Audio" },
  { id: "p4",  sku: "BB-WH1000",   name: "Sony WH-1000XM5",              price:  349, stock: "In Stock",       category: "Audio" },
  { id: "p5",  sku: "BB-PS5",      name: "PlayStation 5",                price:  499, stock: "Low Stock",      category: "Gaming" },
  { id: "p6",  sku: "BB-ROGLTOP",  name: "ASUS ROG Gaming Laptop",       price: 1199, stock: "In Stock",       category: "Laptop" },
  { id: "p7",  sku: "BB-BOSE-SL",  name: "Bose SoundLink Speaker",       price:  149, stock: "In Stock",       category: "Audio" },
  { id: "p8",  sku: "BB-LG27",     name: 'LG 27" 4K Monitor',            price:  399, stock: "In Stock",       category: "Monitor" },
  { id: "p9",  sku: "BB-IP16PRO",  name: "iPhone 16 Pro",                price:  999, stock: "Limited Stock",  category: "Phone" },
  { id: "p10", sku: "BB-GRM-F8",   name: "Garmin Fenix 8",               price:  799, stock: "In Stock",       category: "Wearable" },
];

export const RETAIL_ORDERS = [
  { id: "o1", product: "AirPods Pro",    sku: "BB-APP3",   amount: 249, status: "Delivered",  date: "2026-04-20" },
  { id: "o2", product: "MacBook Pro 14\"", sku: "BB-MBP14", amount: 1999, status: "Shipped",  date: "2026-04-22" },
  { id: "o3", product: "Bose SoundLink", sku: "BB-BOSE-SL", amount: 149, status: "Processing", date: "2026-04-23" },
];
```

### RetailModeBanner component structure (new component)
```javascript
// banking_api_ui/src/components/RetailModeBanner.js
import React from "react";
import "./RetailModeBanner.css";

/**
 * Persistent banner at top of UserDashboard that shows the current mode and
 * provides a one-click toggle. Only visible when user is on the dashboard.
 */
export default function RetailModeBanner({ isRetail, onToggle }) {
  return (
    <div className={`retail-mode-banner ${isRetail ? "retail-mode-banner--retail" : "retail-mode-banner--banking"}`}>
      <span className="retail-mode-banner__label">
        {isRetail ? "Retail Mode" : "Banking Mode"}
      </span>
      <button
        type="button"
        className="retail-mode-banner__btn"
        onClick={onToggle}
      >
        {isRetail ? "Switch to Banking" : "Switch to Retail"}
      </button>
    </div>
  );
}
```

The `onToggle` handler in UserDashboard calls
`PATCH /api/admin/feature-flags { updates: { ff_retail_mode: !isRetail } }` then updates
local `retailMode` state and calls `applyIndustryId`.

---

## Runtime State Inventory

This is not a rename/refactor phase. No runtime state inventory is required.

---

## Environment Availability

This phase is purely client-side React + one BFF flag registry entry. No external tools or services
beyond the existing running dev server are needed.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node / npm | Build verification | Yes | (project standard) | — |
| `npm run build` (CRA) | Mandatory per CLAUDE.md | Yes | react-scripts 5.0.1 | — |

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Jest + React Testing Library (react-scripts 5.0.1) |
| Config file | `package.json` → `"jest"` key |
| Quick run command | `cd banking_api_ui && npm run test:unit -- --watchAll=false` |
| Full suite command | `cd banking_api_ui && npm run test:unit -- --watchAll=false` |

### Phase Requirements → Test Map

| ID | Behavior | Test Type | Automated Command | File Exists? |
|----|----------|-----------|-------------------|-------------|
| — | `ff_retail_mode` flag entry renders in FeatureFlagsPage | manual smoke | browse /feature-flags | N/A |
| — | Retail preset CSS vars applied when flag ON | manual smoke | check computed styles | N/A |
| — | Banking mode restored when flag OFF | manual smoke | toggle flag off | N/A |
| — | `npm run build` exits 0 | build gate | `cd banking_api_ui && npm run build` | N/A |
| — | SideNav snapshot not regressed | unit | `cd banking_api_ui && npm run test:unit -- --watchAll=false --testPathPattern=SideNav` | Yes |
| — | DemoDataPage tests not regressed | unit | `cd banking_api_ui && npm run test:unit -- --watchAll=false --testPathPattern=DemoDataPage` | Yes |

### Sampling Rate

- **Per task commit:** `cd banking_api_ui && npm run build` (mandatory per CLAUDE.md)
- **Per wave merge:** `cd banking_api_ui && npm run test:unit -- --watchAll=false`
- **Phase gate:** Build clean + unit tests green before `/gsd-verify-work`

### Wave 0 Gaps

None — existing test infrastructure covers the project. No new test files are required for this
phase. After implementation, snapshot tests should be run and updated if the SideNav renders a
preset picker that now includes "retail".

---

## Security Domain

This phase adds a feature flag (no auth surface) and client-side mock data (no server data).

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | — |
| V3 Session Management | No | — |
| V4 Access Control | Low | `FLAG_REGISTRY` already restricts flag writes to admin routes — no change needed |
| V5 Input Validation | No | Mock data is hardcoded constants; no user input to validate |
| V6 Cryptography | No | — |

No new threat patterns introduced. The banner toggle calls `PATCH /api/admin/feature-flags` which
already has the same access controls as all other flag writes.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `BrandLogo.js` renders text fallback or safely no-ops when `logoPath` is falsy | Architecture Patterns — Pitfall 3 | Broken image icon in retail mode nav; fix by providing SVG data URI as logoPath |
| A2 | `GET /api/admin/config` response shape is flat (`res.data.ff_retail_mode`) matching Dashboard.js pattern | Pattern 2 | Feature flag read never resolves; retail mode never activates |
| A3 | The banner toggle's `PATCH /api/admin/feature-flags` call is accessible without admin session (or user session suffices) | RetailModeBanner implementation | Banner toggle silently fails for non-admin users; may need to add session check |

**A2 and A3 must be verified** by reading `adminConfig.js` BFF route and checking its auth
middleware before implementing the banner toggle.

---

## Open Questions

1. **Does `BrandLogo.js` handle a falsy `logoPath` gracefully?**
   - What we know: `BrandLogo.js` reads `preset.logoPath`; existing presets always set a real path.
   - What's unclear: Whether it renders an `<img>` unconditionally or checks for falsy.
   - Recommendation: Read `BrandLogo.js` before implementing the retail preset. If no null guard,
     set `logoPath` to a data-URI SVG with "BX Electronics" text, or add a guard.

2. **Is `PATCH /api/admin/feature-flags` accessible to non-admin (customer) sessions?**
   - What we know: The endpoint exists; `DemoDataPage.js` calls it; the banner toggle needs to
     call it from the customer dashboard.
   - What's unclear: Whether the route has `authenticateToken` with admin-role guard.
   - Recommendation: Read `featureFlags.js` route registration in `server.js` to confirm auth
     middleware. If admin-only, the banner toggle must be omitted for non-admin users, or the
     toggle must use a different mechanism (e.g., client-side-only state, not persisted to server).

3. **Is `applyIndustryId("bx_finance")` the correct restore call, or should it be `DEFAULT_INDUSTRY_ID`?**
   - What we know: `DEFAULT_INDUSTRY_ID = "bx_finance"` (verified from industryPresets.js).
   - What's unclear: Nothing — `applyIndustryId(DEFAULT_INDUSTRY_ID)` is the safe, future-proof call.
   - Recommendation: Use `import { DEFAULT_INDUSTRY_ID } from "../config/industryPresets"` and call
     `applyIndustryId(DEFAULT_INDUSTRY_ID)` on flag-off to avoid hardcoding strings.

---

## Project Constraints (from CLAUDE.md)

- **After any `banking_api_ui` edit:** `npm run build` must exit code 0.
- **Minimal diff rule:** Name the component/element being changed; do not refactor unrelated code.
- **REGRESSION_PLAN.md §1:** UserDashboard.js has 5+ protected rows — REAUTH_KEY guard, middleAgentOpen
  init, bottom-dock behavior, split vs classic layout, and session banner. Any edit must be strictly
  additive inside `renderBankingMain()`. Do not touch session/auth logic.
- **Plan mode:** 3+ steps / cross-cutting → must have written plan before coding.
- **Bug fixes:** add to REGRESSION_PLAN.md §4 Bug Fix Log.
- **Marketing stability:** Do not touch `/marketing` routes.
- **BFF + security:** Tokens stay server-side; this phase makes zero BFF token/session changes.

---

## Sources

### Primary (HIGH confidence)

- `banking_api_ui/src/config/industryPresets.js` — full file read; verified INDUSTRY_PRESETS array shape, cssVars keys, DEFAULT_INDUSTRY_ID
- `banking_api_ui/src/context/IndustryBrandingContext.js` — full file read; verified `applyIndustryId`, localStorage behavior, CSS var application
- `banking_api_server/routes/featureFlags.js` — full file read; verified FLAG_REGISTRY shape, `storageKeyForFlagId`, `resolveFlag`
- `banking_api_ui/src/components/WebMcpPanel.js` — lines 27-60; verified client-side feature flag read pattern with `loadPublicConfig`
- `banking_api_ui/src/components/Dashboard.js` — lines 346-358; verified `bffAxios.get("/api/admin/config")` flag read pattern
- `banking_api_ui/src/components/UserDashboard.js` — multiple sections read; verified `renderBankingMain` location (line 1646), `isDemoMode`, state declarations, account card JSX (line 1880), transaction list (line 2345), `renderBankingMain` call sites (2500, 2553, 2577)
- `banking_api_ui/src/components/BankingAgent.js` — lines 1008-1033; verified `welcomeMessage` function, `brandShortName` usage
- `banking_api_ui/src/index.css` — lines 1-80; verified `:root` CSS variable definitions
- `banking_api_ui/src/services/configService.js` — full file; verified `PUBLIC_FIELDS` list (ff_retail_mode absent, confirming IndexedDB cache bypass needed)
- `banking_api_ui/src/components/__tests__/SideNav.snapshot.test.js` — full file; verified mock pattern for IndustryBrandingContext

### Secondary (MEDIUM confidence)

- `REGRESSION_PLAN.md §1` — verified protected areas for UserDashboard.js (REAUTH_KEY, middleAgentOpen, bottom-dock)
- `banking_api_ui/src/components/DashboardLayoutToggle.js` — verified toggle component pattern as reference for RetailModeBanner

### Tertiary (LOW confidence)

- A3 (banner toggle admin access) — not yet verified; requires reading server.js route registration

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — verified from package.json; no new packages needed
- Architecture: HIGH — all integration points verified from source files
- Pitfalls: HIGH — REAUTH pitfall from regression plan (verified); localStorage pitfall from context source (verified); logoPath and banner auth are ASSUMED
- Mock data: HIGH — product list specified in CONTEXT.md specifics section

**Research date:** 2026-04-24
**Valid until:** 2026-05-24 (stable codebase; changes only if UserDashboard or IndustryBrandingContext are heavily refactored)
