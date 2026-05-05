---
status: partial
phase: 264-do-we-need-a-config-page-for-mcp-gateway-so-show-and-configu
source: [264-VERIFICATION.md]
started: 2026-05-05
updated: 2026-05-05
---

## Current Test

[awaiting human testing]

## Tests

### 1. Wizard tab renders correctly
expected: Step circles, status indicators (✓/⚠/○), and visual layout of the 5-step wizard in the Real PingGateway tab all render without layout breakage. Step 1 shows green check when PingOne env is set, yellow warning when not.
result: [pending]

### 2. Required badge visibility
expected: Yellow "Required" badge appears on the PingOne Resource ID and PingGateway Public URL fields when those inputs are empty. Badge disappears once text is entered.
result: [pending]

### 3. Docs & Setup tab content
expected: 4th tab renders 3 doc cards — "Securing AI Agents with PingOne", "PingGateway + PingOne Authorize (AAM)", "PingGateway Documentation" — each with title, description, and working external link.
result: [pending]

### 4. Live JSON preview reactivity
expected: Typing in Step 2 form fields (PingOne Resource ID, PingGateway Public URL, MCP Scope) updates the live mcp.json preview in real-time without any network request.
result: [pending]

## Summary

total: 4
passed: 0
issues: 0
pending: 4
skipped: 0
blocked: 0

## Gaps
