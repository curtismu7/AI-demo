# 246-02 SUMMARY — JS: header redesign + Actions popout inline JSX

**Phase:** 246-floating-agent-redesign-chips-to-popout-simplified-controls  
**Plan:** 02  
**Commit:** b357027b  
**Status:** ✅ Complete

## What was built

Modified `BankingAgent.js` to deliver the Phase 246 floating agent redesign:

### Task 1 — Rewrote `ba-header-tools`

Removed 5 controls from the header:
- ↗ popup window button  
- `<select>` appearance picker  
- Page theme toggle (☀️/🌙)  
- `!isInline` sign-out button  
- `!isInline` token-chain toggle  

Added:
- **Actions trigger** — `<button ref={discoveryTriggerRef} className="ba-actions-trigger" aria-expanded aria-haspopup="dialog">` — float mode only (D-01, D-02)

Kept (unchanged):
- Expand/restore `⊞/⊟` — float mode only  
- `splitChrome && isLoggedIn` sign-out — inline split-column mode only (D-02)  
- Collapse-to-FAB `▼` — float mode only

### Task 2 — Inserted Actions popout JSX

**CHANGE A — Popout inside `.ba-header`** (after `ba-header-top` closes):
- `showDiscovery && !isInline && (<div className="ba-actions-popout" role="dialog">...`
- `<input className="ba-popout-search" autoFocus />`
- `<div className="ba-popout-body">` containing:
  - **SUGGESTIONS** — IIFE filtering `suggestionList` by `discoverySearch`, renders `ba-suggestion` buttons with full NL handler (including `sessionStorage` pending key, `appendTokenEvents`, `tokenChain.setTokenEvents`)
  - **ACTION GROUPS** — `filteredDiscoveryGroups.map()`: skips `learn`, gates `admin` with `effectiveUser?.role !== "admin"`, TESTING uses `chipGroupsState["testing"]` + `toggleGroupExpanded()`
  - **Empty state** — shown when search has no results
  - **SESSION** — Refresh token + Sign out
  - **VIEW** — `🔗 Token chain` toggle + `⧉ New window` with `calculateOptimalSize()` (D-04, D-04b)
  - **SETTINGS** — `<select>` appearance picker + page theme toggle  
  - **STATUS BAR** — Agent (always) | MCP Gateway (off=red unless connected) | Authorize (warn=yellow unless isConfigured)

**CHANGE B — Backdrop sibling before `.ba-body`**:
- `showDiscovery && !isInline && (<div className="ba-popout-backdrop" onClick={() => setShowDiscovery(false)} aria-hidden="true" />)`

**CHANGE C — Welcome copy**:
- `"Type a message or pick an action on the left."` → `"Type a message or use Actions to explore."`

## Verification

```
grep ba-actions-popout BankingAgent.js → present
grep ba-popout-backdrop BankingAgent.js → present  
grep "⧉ New window" BankingAgent.js → present
grep "use Actions to explore" BankingAgent.js → present
grep ba-agent-appearance-select BankingAgent.js → in popout SETTINGS only
```

Build: `npm run build` → exit 0

## Files modified

- `banking_api_ui/src/components/BankingAgent.js`
