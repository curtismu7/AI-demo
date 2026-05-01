---
created: 2026-05-01T00:00:00.000Z
title: Agent request flow — move to Monitoring sidenav, user-triggered only
area: ui
files:
  - banking_api_ui/src/components/AgentFlowDiagramPanel.js:153-154
  - banking_api_ui/src/components/BankingAgent.js:3753
  - banking_api_ui/src/App.js:702-708
---

## Problem

The "Agent request flow" panel (shown in the screenshot as the floating card that appears with "COMPLETED WITH ERRORS · GET_MY_ACCOUNTS") currently auto-pops open whenever an agent tool call fires. The auto-open is triggered via a custom event `agent-flow-diagram-open` dispatched in `BankingAgent.js` (~line 3753) and caught by `AgentFlowDiagramPanel.js` (~line 153).

This is disruptive — the panel appears unexpectedly during normal agent use. Users should choose to open it themselves.

Additionally, the panel has no permanent home in the left sidenav under the existing "Monitoring" section (`/monitoring/*` routes are already defined in App.js at line 702).

## Solution

Two changes:

1. **Remove auto-pop:** Delete or gate the `window.dispatchEvent(new CustomEvent("agent-flow-diagram-open"))` dispatch in `BankingAgent.js` (~line 3753) so the panel never auto-opens. The `agent-flow-diagram-open` event listener in `AgentFlowDiagramPanel.js` can remain (it does no harm without the dispatch).

2. **Add sidenav entry under Monitoring:** Add an "Agent Request Flow" nav item in the Monitoring section of the left sidenav (AdminSideNav or the universal sidebar nav, depending on where monitoring items live). Clicking it shows the `AgentFlowDiagramPanel`. The panel should be accessible at a route like `/monitoring/agent-flow` or rendered as a panel within the monitoring layout — whichever is consistent with the existing monitoring page pattern in App.js.
