---
created: "2026-04-04T18:04:37.686Z"
title: "Make config page tabs more visually obvious"
area: "ui"
files:
  - banking_api_ui/src/components/Config.js
---

## Problem

The tabs on the `/config` page (Setup Config, Vercel Env, Worker App) are not visually distinct enough. Despite Phase 38 switching to a raised-tab style (blue top border + white background on active), they still feel subtle and users may not immediately recognise them as clickable tabs.

Current state (post Phase 38): raised tab style with `borderTop: 2px solid #2563eb` on active, but inactive tabs have a grey `#f9fafb` background that's hard to distinguish from the page background.

## Solution

Improve tab affordance:
- Give inactive tabs a more distinct background (e.g. `#e5e7eb` or a slight inset shadow)
- Increase padding and font size slightly
- Consider adding a hover state (`background: #e5e7eb` on hover)
- The active tab's white background should contrast more clearly against a slightly grey tab bar background
- Optionally: add a `Config.css` rule instead of inline styles for cleaner maintenance

Reference: `banking_api_ui/src/components/Config.js` lines ~703–740 (tab bar block added in Phase 38).
