---
created: 2026-04-03T00:30:24.812Z
title: Fix floating agent popout window to match agent height and width
area: ui
files:
  - banking_api_ui/src/components/BankingAgent.js
  - banking_api_ui/src/components/BankingAgent.css
---

## Problem

The small popout/detached window for the floating banking agent does not match the agent's current dimensions. When the agent is expanded or resized, the popout window stays at a fixed (smaller) size — it should be at least as tall as the agent panel and at least as wide as the agent panel. This creates a jarring size mismatch when switching between inline and popout modes.

## Solution

- Read the agent's computed height and width at the moment of popout launch (via ref or `getBoundingClientRect`)
- Apply the same dimensions to the popout window container (min-height / min-width constraints)
- If using `window.open()` for a real browser popout, pass `width` and `height` in the `windowFeatures` string derived from the agent's current size
- If the popout is a CSS overlay/modal within the page, sync the dimensions via state or CSS custom properties
- Add a resize observer on the main agent so the popout also updates if the agent is resized while the popout is open
