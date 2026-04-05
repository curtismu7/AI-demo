---
status: awaiting_human_verify
trigger: "agent-request-flow-drag-constrained-to-browser-page"
created: 2026-04-04T00:00:00Z
updated: 2026-04-04T00:00:00Z
---

## Current Focus

hypothesis: CONFIRMED - The drag hook uses document-level mousemove which stops when the cursor exits the browser viewport. No Math.max/Math.min clamping exists. Fix: switch to pointer events with setPointerCapture so drag events continue across viewport boundary.
test: Implement pointer capture in useDraggablePanel; update all consumers from onMouseDown → onPointerDown.
expecting: After fix, panel can be dragged off-screen by continuing to receive pointermove events even after cursor exits the viewport.
next_action: Apply pointer capture fix to useDraggablePanel.js and update all 5 consumer components

## Symptoms

expected: The Agent Request Flow panel can be freely dragged anywhere, including partially off-screen, with no hard boundary constraint.
actual: The panel cannot be dragged off the browser page — it hits an invisible wall at the viewport edge and stops.
errors: No JS error — purely a UX constraint issue.
reproduction: Open Agent Request Flow panel, try dragging to viewport edge or off-screen — it stops at the boundary.
started: Reported April 4, 2026 during Phase 09 UAT.

## Eliminated

- hypothesis: Math.max/Math.min position clamping in useDraggablePanel.js
  evidence: Full source read - hook only clamps resize minimum dimensions, not drag position. Drag is setPos({ x: ev.clientX - offX, y: ev.clientY - offY }) with no bounds check.
  timestamp: 2026-04-04

- hypothesis: CSS overflow constraint on panel or ancestors
  evidence: Full AgentFlowDiagramPanel.css read (331 lines) — no position/overflow constraints. Panel portals to document.body, escaping all ancestor overflow rules including app-shell-body overflow-x:clip.
  timestamp: 2026-04-04

- hypothesis: External PingOne CSS (end-user-nano.css) interfering
  evidence: All rules scoped under .end-user-nano selector — cannot affect portaled .afd-panel which is not inside any .end-user-nano container.
  timestamp: 2026-04-04

- hypothesis: BankingAgent or another component adding drag constraint
  evidence: BankingAgent has separate drag system with explicit comment "Allow dragging off-page - no constraints". AgentFlowDiagramPanel is the correct "Agent request flow" component.
  timestamp: 2026-04-04

## Evidence

- timestamp: 2026-04-04
  checked: useDraggablePanel.js (full source, 120 lines)
  found: No position clamping. Hook explicitly documented "No viewport clamping". Drag onMove: setPos({ x: ev.clientX - offX, y: ev.clientY - offY }). Only Math.max used for resize minimum dimensions.
  implication: Code constraint does not exist. Issue is browser behavioral.

- timestamp: 2026-04-04
  checked: AgentFlowDiagramPanel.js + AgentFlowDiagramPanel.css + draggablePanel.css
  found: Panel portals to document.body, uses position:fixed with inline left/top from pos state. No CSS position constraints found.
  implication: CSS not causing the boundary. Natural browser behavior (cursor stops at OS screen edge → mousemove stops → panel stops).

- timestamp: 2026-04-04
  checked: git history for useDraggablePanel.js (2 commits only) and BankingAgent clamping history
  found: BankingAgent previously had Math.max(0, Math.min(window.innerWidth-50, ...)) clamping removed in commit 4db71ec. useDraggablePanel never had clamping.
  implication: The drag hook was correctly designed from day one. The perceived "wall" is the OS cursor boundary.

- timestamp: 2026-04-04
  checked: public/index.html, App.css body/html rules
  found: No transform, overflow:hidden, or will-change on body/html elements that would contain position:fixed elements.
  implication: position:fixed portal truly escapes all ancestors. Root cause is document.mousemove stopping at viewport boundary.

- timestamp: 2026-04-04
  checked: Root cause analysis complete
  found: document.addEventListener('mousemove') stops receiving events when cursor exits browser window. No pointer capture = drag locks at viewport edge. Fix: switch to pointer events + setPointerCapture on drag handle element.
  implication: Pointer capture allows pointermove events to continue even when cursor exits viewport, enabling true off-screen dragging.

## Resolution

root_cause: The useDraggablePanel hook uses document-level mousemove events for drag tracking. Once the OS cursor reaches the browser viewport boundary, no more mousemove events are dispatched, making the panel appear to hit an "invisible wall." There is zero Math.max/Math.min position clamping — the drag is unconstrained in code but physically limited by cursor scope.
fix: Replace document mousemove/mouseup with element-level pointermove/pointerup + setPointerCapture on the drag handle. Pointer capture keeps events flowing to the captured element even when the pointer exits the viewport. Update all consumer components from onMouseDown to onPointerDown on the drag handle.
verification: Build passes (npm run build exit 0, +136 B gzip). Fix switches handleDragStart from document mousemove/mouseup to element-level pointermove/pointerup with setPointerCapture, eliminating the viewport cursor-boundary wall. All 5 consumer components updated to onPointerDown. Interactive-element guard added to prevent accidental drag on button/input clicks.
files_changed: [banking_api_ui/src/hooks/useDraggablePanel.js, banking_api_ui/src/components/AgentFlowDiagramPanel.js, banking_api_ui/src/components/AgentConsentModal.js, banking_api_ui/src/components/TokenChainDisplay.js, banking_api_ui/src/components/LogViewer.js, banking_api_ui/src/components/DelegatedAccessPage.js]
