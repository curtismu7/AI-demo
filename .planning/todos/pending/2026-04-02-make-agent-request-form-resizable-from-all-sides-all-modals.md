---
created: 2026-04-02T22:21:49.291Z
title: Make AgentConsentModal and all floating modals resizable from all sides (8-direction resize)
area: ui
files:
  - banking_api_ui/src/components/AgentConsentModal.js
  - banking_api_ui/src/components/AgentConsentModal.css
  - banking_api_ui/src/components/TransactionConsentModal.js
  - banking_api_ui/src/hooks/useDraggablePanel.js
---

## Problem

`AgentConsentModal` (the HITL agent request approval form) and other floating modals only support bottom-right corner resize via `useDraggablePanel`. `BankingAgent.js` already has 8-directional resize (N, NE, E, SE, S, SW, W, NW handles). All floating modals/panels should be resizable from all sides for a consistent, polished UX.

Affected components:
- `AgentConsentModal.js` — HITL consent/approval form modal
- `TransactionConsentModal.js` — transaction confirmation modal
- Any other modals that use `useDraggablePanel` with a single resize grip

## Solution

Extend `useDraggablePanel` hook to support 8-direction resize (or add a new `useResizablePanel` utility). Then replace the single `.resize-grip` element in each modal with 8 resize handles (or a CSS-only approach using `resize: both` on all sides).

Reference: `BankingAgent.js` already implements 8-direction resize — extract that pattern into the shared hook or a reusable set of resize handle components.

Note: `useDraggablePanel` was enhanced in Phase 31 (commit 2a1e97e) to fix stale closure and add localStorage persistence. The 8-direction resize enhancement should build on that without breaking existing consumers.
