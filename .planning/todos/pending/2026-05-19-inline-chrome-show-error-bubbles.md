---
created: 2026-05-19T00:00:00Z
title: Decide whether inline-chrome agent should show error message bubbles (not just toasts)
area: banking_api_ui / agent UX
files:
  - banking_api_ui/src/components/BankingAgent.js
---

## Problem

In the post-Phase-4 single-instance agent, the **default placement is `middle`**, so on
`/dashboard` the agent renders **inline** (`mode="inline"` + `splitColumnChrome`, portaled
into `.ud-dashboard-inline-agent-host`).

In inline chrome the message list (`.banking-agent-messages`) only renders `user`,
`assistant`, and `token-event` role messages. A plain **`error`-role** message is
**filtered out** — see the inline message filter at roughly
`BankingAgent.js:8396-8402` (verify exact lines; the code shifts). Net effect:
an MCP/connection failure surfaces only as a `.Toastify__toast--error` toast
("MCP server unreachable — check your server connection"), **never as an in-chat
error bubble**, when the agent is in inline/middle mode.

This is the **shipped, intentional design** (it predates and is unchanged by the
Phase 4 single-instance refactor). It is **not a bug** and is correctly asserted
by the modernized e2e (`banking_api_ui/tests/e2e/banking-agent.spec.js` — the
"MCP 502" test now expects the toast, not a chat bubble). It is flagged here
because it is a **product decision worth a deliberate call**, not an accidental gap:
the float chrome historically showed error bubbles in-chat; inline chrome does not,
so error visibility now differs by placement.

## Decision to make

Should the inline/middle agent ALSO render `error`-role messages as in-chat
bubbles (matching float chrome), or is toast-only the intended UX for the
embedded/inline experience?

- Keep toast-only (current): less in-column clutter; consistent with the
  "embedded assistant" framing; errors are still surfaced (toast).
- Show bubbles in inline too: parity with float chrome; error stays in the
  conversation transcript (better for the teaching/demo narrative where the
  token-chain + failure story is the point).

## Solution (if "show bubbles" is chosen)

1. Locate the inline message-role filter in `BankingAgent.js` (search for the
   role allowlist that excludes `error` when `isInline`; ~line 8396-8402).
2. Allow `error`-role messages through in inline mode (or render a compact
   inline error variant so it does not blow out the split-column height).
3. Keep the toast as well, or suppress the toast when an inline bubble is shown
   (avoid double-surfacing the same error) — decide which.
4. Update the e2e: `banking-agent.spec.js` "MCP 502" test currently asserts the
   toast and *no* chat bubble — flip it to assert the inline error bubble (and
   adjust the toast assertion per step 3). Keep `agent-legacy-bottom-no-duplicate.spec.js`
   untouched.
5. Verify: `cd banking_api_ui && npm run build` (exit 0) and
   `CI=true npx playwright test tests/e2e/banking-agent.spec.js --reporter=list`
   (Playwright manages its own :3000 server — do NOT pass PLAYWRIGHT_SKIP_WEBSERVER).
6. Add a REGRESSION_PLAN.md §4 entry (BankingAgent.js is §1) describing the
   intentional behavior change + the new invariant.

## Notes

- Not a regression and not blocking — surfaced during the Phase 4 e2e
  modernization (commit `48fca2b1`).
- If the decision is "keep toast-only", close this todo with a one-line note;
  no code change needed (the e2e already encodes toast-only correctly).
