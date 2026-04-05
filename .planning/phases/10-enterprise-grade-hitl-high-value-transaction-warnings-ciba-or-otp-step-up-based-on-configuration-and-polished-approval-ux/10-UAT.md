---
status: testing
phase: 10-enterprise-grade-hitl-high-value-transaction-warnings-ciba-or-otp-step-up-based-on-configuration-and-polished-approval-ux
source:
  - 10-01-SUMMARY.md
  - 10-02-SUMMARY.md
  - 10-03-SUMMARY.md
started: 2026-04-04T21:12:00.000Z
updated: 2026-04-04T21:12:00.000Z
---

## Current Test

number: 1
name: Amber warning in FAB consent modal (≥$500)
expected: |
  In float/FAB mode, trigger a high-value agent action (e.g. a $600 transfer).
  The AgentConsentModal should show an amber left-border warning block with copy:
  "⚠ This transaction exceeds $500. Please verify before confirming."
  For amounts below $500, the warning should NOT appear.
awaiting: user response

## Tests

### 1. Amber warning in FAB consent modal (≥$500)
expected: In float/FAB mode, trigger a write action with amount ≥$500. AgentConsentModal shows amber left-border warning "⚠ This transaction exceeds $500. Please verify before confirming." For amounts <$500, no warning.
result: [pending]

### 2. Modal z-index — sits above floating agent panel
expected: When AgentConsentModal is open (FAB mode), it renders visually above the floating agent panel and dim backdrop covers panel content. No z-index overlap.
result: [pending]

### 3. Button labels — "Confirm" and "Cancel"
expected: AgentConsentModal primary button reads "Confirm" and secondary reads "Cancel". Neither says "Authorize" or "Not now".
result: [pending]

### 4. Inline HITL card in middle/inline agent surface
expected: With agent in middle/split layout, triggering a ≥$500 write action shows an inline card inside the chat panel — not a floating modal. Card shows "🔒 Confirm Action", transaction details, and Confirm/Cancel buttons.
result: [pending]

### 5. Bottom-dock HITL shows inline card (not modal)
expected: With agent in bottom-dock placement, triggering a ≥$500 write action shows HITL as an inline card within the chat stream. No floating portal modal overlaying the page.
result: [pending]

### 6. Float/FAB surface still uses portal modal
expected: In float/FAB mode (not embedded dock, not middle layout), the HITL still shows the draggable AgentConsentModal portal — not an inline card.
result: [pending]

### 7. Bottom dock toolbar — icon-only chevron
expected: EmbeddedAgentDock toolbar shows ▾ when expanded and ▴ when collapsed. No text label ("Expand" / "Collapse") visible on the button.
result: [pending]

### 8. Bottom dock toolbar — 44px height and border-bottom
expected: Dock toolbar row is ≥44px tall and has a visible 1px separator line at its bottom edge, between the toolbar and the chat area below.
result: [pending]

## Summary

total: 8
passed: 0
issues: 0
skipped: 0
pending: 8

## Gaps

[none yet]
