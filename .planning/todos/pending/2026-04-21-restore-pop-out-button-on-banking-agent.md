---
created: 2026-04-21T22:07:58.410Z
title: Restore pop-out button on Banking Agent
area: ui
files:
  - banking_api_ui/src/components/BankingAgent.js
---

## Problem

The Banking Agent chat panel previously had a pop-out (↗) button that let the user detach it into a separate window. After the DevTools Dashboard pop-out refactor (FloatingPanel.jsx rewrite using createPortal), the agent pop-out behavior was lost or broken. Users can no longer pop out the agent panel.

## Solution

Check BankingAgent.js for its existing pop-out mechanism (likely a `window.open` or FloatingPanel wrapper). If it used FloatingPanel, confirm it still works after the createPortal rewrite. If the button was removed, re-add it using the same createPortal pattern implemented in FloatingPanel.jsx.
