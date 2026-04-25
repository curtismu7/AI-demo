---
status: partial
phase: 231-agent-chip-groups-collapsible-sections-collapse-all-button-p
source: [231-VERIFICATION.md]
started: 2026-04-25T18:30:00Z
updated: 2026-04-25T18:30:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. No inline Learn more toggle or education chips
expected: Log in, open the banking agent in inline mode — the left rail shows only ACTION_GROUPS chips (Account, Transaction, Admin, Testing). No "Learn more" toggle and no education topic chips appear inline.
result: [pending]

### 2. Count badges and collapse-all toolbar render correctly
expected: Each action group header shows a count badge in parentheses, e.g. Account (3), Transaction (4). A right-aligned "Collapse all" / "Expand all" button appears above the first group and toggles all groups at once.
result: [pending]

### 3. Discovery popout opens with correct structure
expected: Click "⊞ All actions" button at the bottom of the chip list — an overlay animates in showing a header (⊞ All actions + ✕ close), a search input, and 5 chip groups: Account, Transaction, Admin, Testing, Learn & Explore.
result: [pending]

### 4. Live search filters chips; empty state shows correctly
expected: Type in the search box — only chips whose labels match the query remain visible. Clear all groups → an empty state message appears ("No matching actions").
result: [pending]

### 5. Escape key two-step close behavior
expected: With the popout open and text in the search box, press Escape — search clears but popout stays open. Press Escape again (or with empty search) — popout closes and focus returns to the "⊞ All actions" button.
result: [pending]

### 6. No ⚡ button in the bottom input row
expected: The bottom input row contains only the text input and the send button. No ⚡ / commands button is visible.
result: [pending]

## Summary

total: 6
passed: 0
issues: 0
pending: 6
skipped: 0
blocked: 0

## Gaps
