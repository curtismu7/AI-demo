# Phase 213-02 Summary — Banking Agent Results Side Card Restoration

## What was built

### `banking_api_ui/src/components/BankingAgent.js` (patched)

**Root cause 1 fixed — displayMode guard removed (3 sites):**
- Chip/action path (~line 2442): removed `const displayMode = localStorage.getItem('agentDisplayMode') || 'panel'` and `if (displayMode === 'panel')` guard. `setResultPanel()` now called unconditionally when `resultType` is set.
- NL path (~line 3126): same fix.
- NL write-refresh path (~line 3140): same fix. `setResultPanel({ type: 'transactions', ... })` called unconditionally after write ops.

**Root cause 2 fixed — inline mode `resultsPanelStyle` fallback:**
- Replaced `if (isInline) return undefined;` with a synchronous `panelRef.current?.getBoundingClientRect()` read
- If rect available: computes `left = max(8, rect.left - rpW - 12)`, `top = max(8, rect.top)` — correctly anchors to the left of the inline agent column
- If rect not yet available (pre-mount): returns `{ position: 'fixed', left: -9999, top: -9999, zIndex: -1 }` to prevent CSS flash at wrong position
- Once ResizeObserver fires and sets `agentBounds`, the correct position takes over

### `banking_api_ui/src/components/BankingAgent.css` (patched)

- `.banking-agent-results-panel` CSS fallback changed from `right: calc(28px + 400px + 16px)` to `left: 8px; top: 72px`
- JS inline style from `resultsPanelStyle` always overrides — CSS is only an emergency fallback
- Prevents the card from appearing at 444px from the right (behind/overlapping the agent) when JS hasn't computed bounds

## Verification
- `npm run build` → exit 0 ✅
- `agentDisplayMode` no longer referenced in `BankingAgent.js` (0 occurrences)
- `left: -9999` present as off-screen fallback (1 occurrence)
