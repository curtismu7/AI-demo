---
created: 2026-04-04T12:31:37.037Z
title: Agent request flow button in chip bar does not open the panel
area: ui
files:
  - banking_api_ui/src/components/AgentFlowDiagramPanel.js:32-40
  - banking_api_ui/src/services/agentFlowDiagramService.js:204-210
  - banking_api_ui/src/components/EducationBar.js:86-93
---

## Problem

The "🔀 Agent request flow" button/chip in the banking agent chip bar does not open the
Agent Request Flow floating panel when clicked. Nothing visible happens.

## Root Cause (suspected)

`AgentFlowDiagramPanel.js` listens to the **`agent-flow-diagram-open` window custom event**
to show itself (lines 32–40). The `EducationBar.js` correctly dispatches this event
(`window.dispatchEvent(new CustomEvent('agent-flow-diagram-open'))`), so the button in the
≡ menu works fine.

However, the chip in the agent chip bar (wherever it is rendered — likely `BankingAgent.js`
or `UserDashboard.js`) probably calls `agentFlowDiagram.open()` directly, which sets
`state.visible = true` via the service — but the panel only renders when the window event
fires, not when the service state changes directly. The panel uses `useEffect` on the event,
not on `snap.visible` from subscribe.

## Solution

Two options:

**Option A (preferred — consistent):** Change the chip's onClick to dispatch the same window
event that EducationBar uses:
```js
onClick={() => window.dispatchEvent(new CustomEvent('agent-flow-diagram-open'))}
```

**Option B:** Change `AgentFlowDiagramPanel.js` to also subscribe to `agentFlowDiagram` state
and show when `snap.visible === true`, removing the window event dependency. The panel already
has `useEffect(() => agentFlowDiagram.subscribe(setSnap), [])` — just remove the `if (!snap.visible) return null` guard and the separate `agent-flow-diagram-open` handler, relying only on the service state.

Option A is a one-line fix and is consistent with how EducationBar opens the panel.

Also confirm: after fixing, test that the ↺ reset button and × close button inside the panel
still work (they call `agentFlowDiagram.reset()` and `agentFlowDiagram.close()` directly, which
should still work regardless of how the panel was opened).
