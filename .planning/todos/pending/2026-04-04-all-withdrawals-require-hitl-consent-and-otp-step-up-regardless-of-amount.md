---
created: 2026-04-04T12:26:42.037Z
title: All withdrawals require HITL consent and OTP step-up regardless of amount
area: auth
files:
  - banking_api_server/services/mcpLocalTools.js
  - banking_api_server/routes/transactions.js
---

## Problem

Currently, step-up MFA and HITL consent are only triggered for transfers and withdrawals
**above a dollar threshold** (STEP_UP_AMOUNT_THRESHOLD=250, HITL_CONSENT_THRESHOLD=500).

This means a $50 withdrawal by the AI agent can complete silently — no consent banner,
no OTP prompt. Withdrawals are inherently higher-risk than balance reads or transfers
between a user's own accounts. Any withdrawal (of any amount) should require explicit
user consent and MFA step-up, because it moves money out of the account entirely.

Observed during Phase 09 UAT: tested a $300 transfer; step-up was not triggered (separate
bug fixed). The policy question remains: should withdrawals have a $0 threshold, i.e.
ALL withdrawals trigger step-up + consent regardless of amount?

## Solution

1. **`mcpLocalTools.js` — `create_withdrawal`**: change threshold check from
   `amount >= STEP_UP_AMOUNT_THRESHOLD` to **always** require step-up for any withdrawal amount.
   The `checkLocalStepUp()` helper added today should accept an `alwaysRequire` flag or just
   be called unconditionally for withdrawals.

2. **`routes/transactions.js`** — same change for the direct BFF transfer route (used when
   MCP server is not in use).

3. **HITL consent gate**: similarly, lower the HITL consent threshold for withdrawals to $0
   (all withdrawals show the "Banking Agent wants to perform a withdrawal — approve?" banner),
   while transfers stay at the existing $500 HITL threshold.

4. **Education panel** — update the "Why it's secure" tab in `MayActPanel.js` or the step-up
   education section to note that withdrawals require MFA regardless of amount.

Threshold env vars to consider:
- `STEP_UP_AMOUNT_THRESHOLD` — currently applies to both transfers and withdrawals
- `HITL_CONSENT_THRESHOLD` — currently applies to both
- Consider adding `WITHDRAWAL_ALWAYS_STEP_UP=true` (default true) so this is configurable
  for demo purposes without breaking the existing threshold logic for transfers.
