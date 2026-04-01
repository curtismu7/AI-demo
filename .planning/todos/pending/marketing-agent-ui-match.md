---
id: marketing-agent-ui-match
area: ui
priority: medium
created: "2026-04-01"
source: conversation
---

# Marketing Page — Agent Dock UI Match

## What
The bottom agent dock (`EmbeddedAgentDock`) on the `/marketing` (LandingPage) should visually match the style and tone of the marketing page itself.

Currently the agent dock uses the same styling as it does on the authenticated dashboard, which can feel out-of-place on the public-facing marketing surface.

## Why
The marketing page is the first impression for developers and architects who arrive at the demo. An agent panel that looks like an app-internal tool (not a marketing-friendly invite) breaks the polish and reduces credibility.

## Scope
- `banking_api_ui/src/components/EmbeddedAgentDock.js` — marketing surface variant styling
- `banking_api_ui/src/components/LandingPage.js` — where the dock is rendered on `/marketing`
- `banking_api_ui/src/components/LandingPage.css` — already has `/* Slot for EmbeddedAgentDock */` section to extend
- Typography, color palette, border radius, shadow, and spacing should match LandingPage design language
- The dock should feel like a natural extension of the marketing page, not a dashboard widget dropped in

## Key files
- `banking_api_ui/src/components/EmbeddedAgentDock.js`
- `banking_api_ui/src/components/LandingPage.js`
- `banking_api_ui/src/components/LandingPage.css`
- `banking_api_ui/src/utils/embeddedAgentFabVisibility.js`

## Acceptance
- Dock on `/marketing` uses marketing page colors, fonts, and border style (not dashboard palette)
- No visual regression on the dashboard dock (marketing-only variant — guarded by `isMarketingEmbeddedDockSurface` path)
- `cd banking_api_ui && npm run build` exits 0

## Notes
- User preference: `/marketing` stability — keep changes scoped to the marketing surface; do not touch dashboard layout
- Use `/gsd:ui-phase` + `/gsd:ui-review` when working on this
