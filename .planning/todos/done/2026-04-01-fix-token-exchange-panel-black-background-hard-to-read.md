---
created: 2026-04-01T15:46:43.122Z
title: Fix token exchange panel black background hard to read
area: ui
files:
  - banking_api_ui/src/components/education/AgentGatewayPanel.js
  - banking_api_ui/src/components/education/educationContent.js
---

## Problem

The Token Exchange section/panel in the UI has a black background that makes the text hard to read (poor contrast). Visible in the dashboard area near the TOKEN EXCHANGE MODE / Token Chain component. Affects readability during demos and screen sharing.

## Solution

Audit the CSS/inline styles on the Token Chain panel and TOKEN EXCHANGE MODE card. Replace black background with a dark-but-readable surface colour consistent with the rest of the education UI (e.g. `#1e293b` / slate-800 or the existing `edu-code` palette). Ensure text contrast meets WCAG AA.
