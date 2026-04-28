# 246-01 SUMMARY — CSS: left-rail guard + all phase-246 CSS classes

**Phase:** 246-floating-agent-redesign-chips-to-popout-simplified-controls  
**Plan:** 01  
**Commit:** b357027b  
**Status:** ✅ Complete

## What was built

Added all Phase 246 CSS to `BankingAgent.css`:

1. **`.ba-header { position: relative; }`** — anchor for absolute-positioned popout  
2. **Left-col float-mode guard** — changed existing `.banking-agent-panel:not(.ba-mode-inline) .ba-left-col` rule to `display: none` (D-03)  
3. **All new phase-246 CSS classes** appended after existing `.ba-discovery-*` block:
   - `.ba-actions-trigger` — accent-blue pill button with hover/active/focus-visible/disabled states
   - `.ba-actions-popout` — absolute overlay: `top: calc(100% + 4px)`, `right: 14px`, `width: 320px`, `max-height: 380px`, slide-in animation, `z-index: 100061`
   - `.ba-popout-backdrop` — transparent full-panel click-dismiss, `z-index: 100060`
   - `.ba-popout-search` — compact search input
   - `.ba-popout-body`, `.ba-popout-section`, `.ba-popout-section-label`, `.ba-popout-section-toggle`
   - `.ba-popout-chip-row` — `flex-wrap: wrap; gap: 6px`
   - `.ba-popout-empty`, `.ba-popout-empty-heading`
   - `.ba-popout-status-bar` — bottom dot-indicator bar
   - `.ba-server-chip--warn` and `.ba-server-chip--off` color states for status chips
   - Light-mode overrides for trigger + popout

## Verification

```
grep -c "ba-actions-trigger|ba-actions-popout|ba-popout-backdrop|..." BankingAgent.css
→ 8 (all classes present)
```

Build: `npm run build` → exit 0 (warnings in MCPToolsEducation.tsx are pre-existing)

## Files modified

- `banking_api_ui/src/components/BankingAgent.css`
