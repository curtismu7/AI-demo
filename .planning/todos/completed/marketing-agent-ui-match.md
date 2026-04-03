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

---

## UX / Customer Usability (added 2026-04-01)

Beyond visual styling, the dock on `/marketing` has friction points that make it hard for a first-time visitor (customer / developer) to use effectively. These should be audited and fixed:

**Suspected issues to investigate and fix:**
1. **Discovery** — Is the dock visible without scrolling? Does the page scroll indicator or CTA ("Banking assistant" anchor link) work reliably on all viewports?
2. **Open state on first visit** — The dock auto-expands for marketing surface (`setCollapsed(false)` in useEffect), but does this happen before the page has rendered? Any flash of collapsed → expanded?
3. **Input focus** — After expanding, does focus land in the chat input so the user can immediately type? Or do they have to click again?
4. **Placeholder / onboarding text** — Does the chat input have a compelling placeholder that tells a non-technical visitor what to ask? ("Ask me about this demo…" vs a generic placeholder)
5. **Mobile layout** — At viewport < 640px, does the dock overflow or overlap page content? Is the input/send reachable with a thumb?
6. **Send button affordance** — Is the send button visually obvious? Does it have a tooltip / aria-label?
7. **Loading state** — When the agent is thinking, is there a visible indicator? Does the input get disabled to prevent double-sends?
8. **Error state** — If the agent call fails (no session, OAuth not configured), is the error message understandable to a non-technical visitor or is it a raw JSON error?
9. **Collapse/expand button** — Is the toggle button large enough (≥ 44×44px touch target)?
10. **Z-index / stacking** — Does the dock sit above page sections correctly? No overlap with sticky nav or CTA buttons?

**Deliverables:**
- Audit each issue above (mark fixed / not applicable / deferred)
- Fix all issues reachable without architectural changes
- Ensure `cd banking_api_ui && npm run build` exits 0 after changes
- No regressions on the dashboard dock (marketing surface is guarded by `isMarketingEmbeddedDockSurface`)

**Reference:** `banking_api_ui/src/components/EmbeddedAgentDock.js` → `marketingDockSurface` path (lines ~97–180)
