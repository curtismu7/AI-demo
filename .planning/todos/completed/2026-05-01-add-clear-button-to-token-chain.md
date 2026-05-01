---
created: 2026-05-01T00:00:00Z
title: Add clear button to token chain panel
area: ui
files:
  - banking_api_ui/src/components/BankingAgent.js
  - banking_api_ui/src/components/BankingAgent.css
  - banking_api_ui/src/context/TokenChainContext.js
---

## Problem

The Token Chain panel accumulates events from all prompts in a session. When a user sends a new prompt, they have no way to clear the previous token chain events to focus on just what happened for that new prompt. The chain keeps growing, making it hard to isolate and debug a single interaction.

## Solution

Add a "Clear" button to the Token Chain panel header (in the floating agent and/or pop-out modal). Clicking it clears all token chain events from context/state. The events remain visible until the user explicitly clicks clear — i.e. do NOT auto-clear on new prompts. The button should be styled consistently with other panel controls (close, pop-out, etc.).

Implementation hints:
- `TokenChainContext` should expose a `clearEvents()` action alongside the existing `events` array
- The clear button in `BankingAgent.js` (or `AgentFlowDiagramPanel.js`) calls `clearEvents()`
- Button label: "Clear" or a trash/sweep icon with tooltip "Clear token chain"
