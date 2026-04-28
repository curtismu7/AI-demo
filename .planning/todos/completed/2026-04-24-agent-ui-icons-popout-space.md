---
created: 2026-04-24T00:00:00.000Z
title: Remove icons from agent panel; fix pop-out agent taking too much space
area: ui
---

## Problem

Two agent UI issues:
1. The agent panel displays icons that should be removed — the agent header/toolbar has icon elements that add visual noise.
2. When the agent is popped out, it takes up too much space — the pop-out window/panel size is too large and needs to be reduced or made more compact.

## Solution

Audit the agent panel component (BankingAgent.js or equivalent) for icon elements and remove them. Investigate the pop-out agent container sizing (FloatingPanel or dedicated pop-out wrapper) and reduce default width/height or change layout to use less screen real estate.
