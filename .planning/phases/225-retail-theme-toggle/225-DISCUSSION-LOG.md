# Phase 225: retail-theme-toggle - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-24
**Phase:** 225-retail-theme-toggle
**Areas discussed:** Data layer approach

---

## Data layer approach

### Q1: Where should the retail product/cart data live?

| Option | Description | Selected |
|--------|-------------|----------|
| Client-side JSON mock | Hardcoded electronics products + cart state in React. Zero BFF changes. | ✓ |
| New BFF endpoints | /api/retail/products and /api/retail/cart routes in Express | |
| Extend demoScenarioStore | Add retail scenarios to the existing demo scenario system | |

**User's choice:** Client-side JSON mock
**Notes:** Fastest path, no BFF surface changes, consistent with demo-mode philosophy

---

### Q2: What electronics product catalog should the mock data include?

| Option | Description | Selected |
|--------|-------------|----------|
| Best Buy-style mix | Laptops, TVs, phones, headphones, gaming gear ~8-10 products | ✓ |
| Single category (laptops only) | Simpler catalog, easier to demo | |
| You decide the product list | Claude picks products and prices | |

**User's choice:** Best Buy-style mix
**Notes:** Matches the "Best Buy-like" vision from the original feature request

---

### Q3: What banking UI components swap to retail equivalents when retail mode is ON?

| Option | Description | Selected |
|--------|-------------|----------|
| Dashboard hero + account cards only | Account cards → product cards, balance → cart total, transactions → orders | ✓ |
| Full user-facing pages | Dashboard + UserDashboard + account detail pages | |
| Dashboard hero only (minimal) | Only hero section and app name swap | |

**User's choice:** Dashboard hero + account cards only
**Notes:** Agent area, Admin, Config, Education pages stay as-is

---

## Claude's Discretion

- Theme mechanism: Use existing IndustryBrandingContext (add "retail" preset to industryPresets.js)
- Toggle placement: Feature flags page (primary) + Dashboard banner toggle (secondary)
- Agent copy: Minimal greeting text change only, no MCP tool label changes
- CSS vars: Best Buy palette (blue #0046BE, yellow #FFE000)

## Deferred Ideas

- MCP tool label re-skinning — too high regression risk
- Persistent cart state across sessions
- Real product API or inventory backend
- Multiple retail brand variants
