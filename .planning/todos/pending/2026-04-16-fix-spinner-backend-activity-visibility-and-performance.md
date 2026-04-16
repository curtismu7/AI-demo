---
created: 2026-04-16T17:15:03.766Z
title: Fix spinner backend activity visibility and performance
area: ui
files:
  - banking_api_ui/src/components/AgentFlowDiagramPanel.js:102
  - banking_api_ui/src/services/spinnerActivityService.js:15
  - banking_api_ui/src/services/spinnerService.js:8
  - banking_api_server/server.js:1288
  - banking_api_server/services/oauthService.js:252
  - banking_api_server/routes/oauthUser.js:146
---

## Problem

The global spinner is still dominated by front-end proxy/BFF request labels instead of the backend work the user actually cares about, such as PingOne token exchange, OAuth redirects, MCP tool calls, and other server-side steps. During agent requests, the overlay can remain visible for too long and the activity feed keeps polling /api/app-events, creating noisy logs and poor perceived performance. The current implementation improved some labeling, but it still does not reliably surface the real backend call chain or make the spinner feel fast and trustworthy.

## Solution

Trace the spinner lifecycle end-to-end and separate blocking requests from background polling so silent requests never keep the overlay alive. Expand backend event instrumentation so the activity feed shows meaningful server-side milestones first, including PingOne authorize/token/userinfo calls, MCP proxy start/finish, and delegated token exchange phases. Review the feed prioritization and display rules so raw proxy calls do not crowd out backend events, and verify the resulting UI with a real agent request path to confirm both visibility and responsiveness improve.
