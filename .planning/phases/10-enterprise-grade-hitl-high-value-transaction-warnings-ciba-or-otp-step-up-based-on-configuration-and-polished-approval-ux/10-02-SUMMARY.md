# Phase 10 — Plan 02 Summary

**Plan:** Surface-adaptive HITL rendering — HitlInlineCard for middle/dock, AgentConsentModal for float
**Status:** ✅ Complete
**Commit:** eb3ef67

## What was built

Added `HitlInlineCard` — a new inline component rendered inside the chat panel when the agent is in middle/inline or bottom-dock mode. This prevents the floating portal modal from obscuring dashboard tiles.

**Surface routing:**
- `isInline || isBottomDock` → `HitlInlineCard` (in-panel card, no portal)
- float/FAB mode → `AgentConsentModal` (existing portal modal, unchanged)

Both paths trigger the same `POST /api/transactions/consent-challenge` flow via a shared `handleHitlConfirm` local function in the HITL render block.

### HitlInlineCard features

- Shows amber left-border warning when `amount >= threshold`
- Cancel / Confirm ✓ buttons (44px min height)
- Submitting state: "Processing…" on Confirm click
- Dark/light CSS variables compatible (`--ba-surface`, `--ba-text`)

## Files modified

- `banking_api_ui/src/components/BankingAgent.js` — HitlInlineCard component + surface-adaptive render
- `banking_api_ui/src/components/BankingAgent.css` — `.ba-inline-consent-card` and related rules

## Verification

`npm run build` → exit 0.
