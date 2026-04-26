# Phase 225: retail-theme-toggle - Context

**Gathered:** 2026-04-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Add a runtime `ff_retail_mode` feature flag that switches the app between BX Finance Banking and a Best Buy-style electronics Retail experience. Retail mode swaps the theme (colors, logo), replaces the Dashboard hero and account cards with electronics product cards and cart state (backed by client-side JSON mock data), and re-labels the agent greeting copy. All OAuth, MCP, PingOne Authorize, FIDO2, token chain, and Dev Tools panels remain unchanged and fully functional in both modes. Users can toggle Banking ↔ Retail from the Config UI feature-flags panel and/or a persistent banner toggle.

</domain>

<decisions>
## Implementation Decisions

### Data Layer (discussed)
- **D-01:** Retail product/cart data is **client-side JSON mock only** — a hardcoded electronics product list imported into React. Zero BFF endpoint changes.
- **D-02:** Product catalog is **Best Buy-style mix** — laptops, TVs, phones, headphones, gaming gear (~8–10 products with price, SKU, stock status).
- **D-03:** Retail mode re-skins **Dashboard hero + account cards only**: account cards → product cards (price, stock status, add-to-cart), balance summary → cart total, transaction list → recent orders. Agent area, Admin, Config, Education pages stay as-is.

### Theme Mechanism (Claude's Discretion)
- Add a **"retail" preset to `industryPresets.js`** with Best Buy-style CSS vars (blue `#0046BE` / yellow `#FFE000` brand palette). Uses the existing `IndustryBrandingContext` — no new theme infrastructure needed.
- `ff_retail_mode` ON → `applyIndustryId("retail")` (or equivalent). OFF → restores `bx_finance` preset.
- The feature flag is consumed entirely client-side (same pattern as `ff_webmcp_enabled`): on mount, read `/api/admin/feature-flags`, check `ff_retail_mode`, switch industry preset and data layer accordingly.

### Feature Flag Integration (Claude's Discretion)
- Add `ff_retail_mode` to `FLAG_REGISTRY` in `banking_api_server/routes/featureFlags.js`, category "Retail Demo", `defaultValue: false`.
- Client-side reads via the same `GET /api/admin/config` or `GET /api/admin/feature-flags` pattern already used by WebMcpPanel and Dashboard.

### Toggle Placement (Claude's Discretion)
- **Primary:** Feature flag toggle in the existing Admin feature-flags page (already supports all flags generically — no new UI needed there).
- **Secondary:** A small persistent "🛒 Retail Mode ON / 🏦 Banking Mode" banner toggle on the Dashboard (visible only to logged-in users). This makes the toggle discoverable without needing to go to Config.

### Agent Copy (Claude's Discretion)
- Minimal re-skin: when retail mode is ON, the agent panel greeting changes from "Ask me about your accounts…" to "Ask me about products, prices, and your cart…". No MCP tool label changes (out of scope — tool names are in the MCP server TypeScript and modifying them would risk regressions).

### Claude's Discretion
- Exact CSS var values for the retail preset (Best Buy blue `#0046BE`, yellow `#FFE000`)
- Shopping cart state management: simple `useState` / `useReducer` within the retail data hook — no Redux, no context provider
- Retail logo: use a placeholder text-based logo (e.g., "BX Electronics") — no new image asset needed
- Product card layout: reuse existing card shell CSS, swap content only

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Feature Flag Pattern
- `banking_api_server/routes/featureFlags.js` — FLAG_REGISTRY structure, storageKeyForFlagId, resolveFlag; add `ff_retail_mode` here
- `banking_api_ui/src/components/WebMcpPanel.js` — canonical client-side pattern for reading a feature flag from config and gating component render

### Industry / Theme Branding
- `banking_api_ui/src/config/industryPresets.js` — INDUSTRY_PRESETS array; add "retail" preset here with CSS vars
- `banking_api_ui/src/context/IndustryBrandingContext.js` — `applyIndustryId`, CSS var application via `document.documentElement`
- `banking_api_ui/src/index.css` — `:root` CSS variables baseline (`--chase-navy`, `--brand-dashboard-header-start`, etc.) — retail preset must override these

### Pages That Get Re-Skinned
- `banking_api_ui/src/components/Dashboard.js` — primary consumer; account cards, balance summary, transaction list
- `banking_api_ui/src/components/UserDashboard.js` — check if it surfaces account cards

### Regression Guard
- `REGRESSION_PLAN.md §1` — protected files; confirm Dashboard.js is in the list and follow minimal-diff rule

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `IndustryBrandingContext` + `industryPresets.js`: already handles CSS var theming with `document.documentElement.dataset.industry` — retail is just a third preset
- `ThemeContext`: light/dark toggle — independent of retail mode; both can coexist
- Feature flag pattern in `WebMcpPanel.js`: `useState(false)` + `useEffect` reading `/api/admin/config` → `cfg.ff_retail_mode === "true"` — copy this pattern

### Established Patterns
- CSS vars on `:root` (via IndustryBrandingContext) drive brand colors app-wide; retail preset just overrides the same vars
- Feature flags in `FLAG_REGISTRY` auto-appear in the Admin feature-flags UI — zero new Admin UI code needed
- Client-side mock data (JSON import) is consistent with `DemoDataPage.js` demo scenario pattern

### Integration Points
- `Dashboard.js`: where account cards and balance summary live — the main re-skin target
- `banking_api_server/routes/featureFlags.js` FLAG_REGISTRY: where `ff_retail_mode` is registered
- `banking_api_ui/src/config/industryPresets.js`: where "retail" CSS vars are added

</code_context>

<specifics>
## Specific Ideas

- Best Buy color palette: primary blue `#0046BE`, accent yellow `#FFE000`, background white `#FFFFFF`
- Product examples: Samsung 65" QLED TV ($1,299), MacBook Pro 14" ($1,999), AirPods Pro ($249), Sony WH-1000XM5 ($349), PlayStation 5 ($499), ASUS ROG Gaming Laptop ($1,199), Bose SoundLink Speaker ($149), LG 27" 4K Monitor ($399), iPhone 16 Pro ($999), Garmin Fenix 8 ($799)
- Cart state: items + quantities, subtotal — managed locally (React state, not persisted)
- Banner toggle placement: top of Dashboard, below TopNav, dismissible/persistent

</specifics>

<deferred>
## Deferred Ideas

- MCP tool label re-skinning (tool names in TypeScript MCP server) — too high regression risk; agent greeting copy change is sufficient
- Persistent cart state across sessions (localStorage) — not needed for a demo toggle
- Real product API or inventory backend — client-side mock is sufficient for demo purposes
- Multiple retail "brands" (e.g., Amazon, Target-style) — single Best Buy-style palette is enough

</deferred>

---

*Phase: 225-retail-theme-toggle*
*Context gathered: 2026-04-24*
