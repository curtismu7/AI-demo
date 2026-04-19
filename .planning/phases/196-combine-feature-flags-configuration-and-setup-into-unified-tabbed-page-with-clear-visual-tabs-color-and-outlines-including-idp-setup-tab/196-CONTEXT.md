# Phase 196: Unified Configuration & Setup Page - Context

**Gathered:** 2026-04-19
**Status:** Ready for planning
**Source:** Direct user specification

---

<domain>

## Phase Boundary

Create a single unified page that consolidates all feature flags, configuration settings, and setup instructions into a tabbed interface with clearly distinguished visual tabs. Include a dedicated tab for IDP (Identity Provider) setup.

**Consolidate from existing locations:**
- Feature flags (currently scattered across multiple pages)
- Configuration settings (settings, admin panels)
- Setup instructions (for agents, MCP server, demo flows)
- IDP setup instructions (new dedicated section)

**Geographic scope:** React UI (`banking_api_ui/src/components/`), likely at a route like `/config` or `/admin/config`

**Educational context:** This is a demo application showing OAuth/OIDC flows, so all configuration should be transparent and readable (showing actual values, not sensitive but educational).

</domain>

<decisions>

## Implementation Decisions

### D-01: Tabbed Interface
- Use clear, visually distinct tabs with color and outlines
- Tab selection should be obvious (color changes, border highlights)
- Tabs must be keyboard accessible
- Typical tabs: Feature Flags, Configuration, Setup, IDP Setup

### D-02: Visual Clarity
- Each tab must have clear visual styling (color and outlines) per user request
- Use consistent spacing, typography, and card-based layouts
- Color-code tabs or use background colors to distinguish them
- Outline borders should be prominent on active tabs

### D-03: IDP Setup Tab (Required)
- Dedicated section for Identity Provider configuration
- Should document: PingOne environment, OAuth client setup, PKCE settings
- Include current . env values for reference (non-sensitive educational display)
- Show step-by-step setup instructions

### D-04: Educational Transparency
- Display current values (feature flags, config) so users can see what's enabled
- Show why each setting matters (tooltips, descriptions)
- Non-sensitive configuration safe to display (no keys/secrets, but URLs and client IDs are OK for demo)

### D-05: Page Route & Access
- Accessible from admin menu or system tools
- Likely accessible to logged-in admins only
- Route path TBD during planning (could be `/config`, `/admin/config`, `/setup`)

### the agent's Discretion

- Tab implementation library (React tabs library choice, e.g., `react-tabs`, headless UI, custom tabs)
- Exact layout of each tab (cards vs tables vs lists)
- Whether to persist tab selection in localStorage
- Whether to include search/filter across all config
- Color scheme choices (blue/green for active, etc.)
- Whether to include "Copy to Clipboard" buttons for values

</decisions>

<canonical_refs>

## Canonical References

**Downstream perforces MUST read these before planning or implementing.**

### UI Patterns & Existing Pages
- `banking_api_ui/src/components/AdminPage.jsx` — Example admin page structure and styling patterns
- `banking_api_ui/src/components/DemoConfigPage.jsx` — Demo configuration page (reference for config display patterns)
- `banking_api_ui/src/components/AdminSideNav.jsx` — Admin sidebar (navigate to this new page from here)

### Component Conventions
- `banking_api_ui/src/App.js` — Route definitions (where to add `/config` route)
- `banking_api_ui/src/components/` — React component directory structure and naming conventions
- `banking_api_ui/src/services/bffAxios.js` — API call pattern (use for any config fetches)

### Project Documentation  
- `.CLAUDE.md` — Project non-negotiables (run `npm run build` after UI changes, don't edit /marketing, follow regression-plan)
- `banking_api_server/.env` — Current feature flags and config (reference for what to display)
- `banking_api_ui/.env` — Frontend configuration (reference for IDP URLs, etc.)

</canonical_refs>

<specifics>

## Specific Requirements from User

**Exact request:** "Let's combine all Feature flags, configuration, setup into 1 page with tabs. Make the page tabs clear (use color and outlines). Include IDP setup as a tab."

**Tabs:**
1. Feature Flags - display enabled/disabled features
2. Configuration - general app settings
3. Setup - instructions or steps for demo flows
4. IDP Setup - Identity Provider setup guide and current PingOne config

## Visual Requirements

- Tabs must use color to be visually distinct
- Tabs must have clear outlines
- Active tab state must be obvious
- Responsive design (mobile-friendly tabs)

</specifics>

<deferred>

## Deferred Ideas

**NOT included in this phase** (can be future work if needed):
- Search/filter across all configuration
- Export configuration as JSON
- Edit configuration values directly from this page (read-only display only)
- Dark mode specific tab styling
- Tab persistence across sessions

</deferred>

---

*Phase: 196 — Unified Config & Setup Page*
*Context source: Direct user specification + project conventions*
