---
status: awaiting_human_verify
trigger: "A $300 transfer executed via the banking agent on Vercel production completed without any step-up authentication prompt (no OTP, no CIBA push, no consent banner). The step-up threshold is configured at $250."
created: 2026-04-04T00:00:00Z
updated: 2026-04-04T00:05:00Z
---

## Current Focus
<!-- OVERWRITE on each update - reflects NOW -->

hypothesis: CONFIRMED AND FIXED
test: Applied fix in mcpLocalTools.js and server.js; all mcp-local tests pass (8/8)
expecting: Human verification on Vercel: ask agent to transfer $300 — expect step-up toast, NOT silent completion
next_action: Await human verification

## Symptoms
<!-- Written during gathering, then IMMUTABLE -->

expected: When the banking agent executes a transfer ≥ $250 (STEP_UP_AMOUNT_THRESHOLD=250), the BFF should return a 428 "step_up_required" response, the agent thread should show a step-up message, and the dashboard should show a countdown toast redirecting to PingOne for OTP/MFA re-authentication.
actual: The $300 transfer completed silently — no 428 returned, no step-up toast, no OTP prompt, no consent banner. The transfer just went through.
errors: No visible error.
reproduction: On Vercel (https://banking-demo-puce.vercel.app): log in as a bank user, open the banking agent, ask it to "transfer $300 to savings". The transfer completes without any step-up prompt.
started: April 4, 2026. Step-up was built in Phase 09. The acr_values error was being investigated separately today; as a workaround STEP_UP_ACR_VALUE was cleared. It's possible the step-up check is being bypassed entirely or the 428 path is being caught and swallowed.

## Eliminated
<!-- APPEND only - prevents re-investigating -->

- hypothesis: isExchangeScopeError swallows the 428 from the transfer route
  evidence: On Vercel, the remote MCP WebSocket is always skipped (isLocalDefault && VERCEL → throws useLocal error); code never reaches the transfer route at all. The entire transfer executes inside callToolLocal, which never calls the transactions.js route.
  timestamp: 2026-04-04T00:01:00Z

## Evidence
<!-- APPEND only - facts discovered -->

- timestamp: 2026-04-04T00:01:00Z
  checked: server.js lines 1250-1285 (Vercel code path in /api/mcp/tool)
  found: When VERCEL env var is set and no MCP_SERVER_URL is configured, handler throws {useLocal:true} immediately and falls through to callToolLocal() — bypassing the transactions.js route entirely
  implication: The step-up check in transactions.js is NEVER reached for agent-initiated transfers on Vercel

- timestamp: 2026-04-04T00:01:00Z
  checked: mcpLocalTools.js create_transfer (line 316) and create_withdrawal (line 258)
  found: Both functions have HITL consent check (hitlBlocksLocalWrite) but NO step-up check whatsoever. Function signatures are (params, userId) — no req argument consumed.
  implication: Any transfer via the agent on Vercel bypasses step-up MFA entirely regardless of amount

- timestamp: 2026-04-04T00:01:00Z
  checked: server.js lines 1098, 1128, 1280 — all three callToolLocal() call sites
  found: All three calls omit the 4th req argument: callToolLocal(tool, params || {}, effectiveUserId). The callToolLocal function signature accepts req as 4th arg but it arrives as undefined.
  implication: Even if create_transfer/create_withdrawal checked req.session.user.acr, they'd receive undefined req and never block

- timestamp: 2026-04-04T00:01:00Z
  checked: BankingAgent.js line 1521
  found: UI already handles step_up_required in tool results: normalized.step_up_required === true || normalized.error === 'step_up_required' → fires agentStepUpRequested event
  implication: No UI changes needed; return {step_up_required:true, error:'step_up_required'} from callToolLocal and UI handles it correctly

- timestamp: 2026-04-04T00:01:00Z
  checked: runtimeSettings.js
  found: stepUpTransactionTypes defaults to ['transfer', 'withdrawal']; stepUpEnabled defaults to true; stepUpAcrValue seeded from STEP_UP_ACR_VALUE env or 'Multi_factor'
  implication: Both create_transfer and create_withdrawal must be gated; deposits do NOT need step-up per default config

## Resolution
<!-- OVERWRITE as understanding evolves -->

root_cause: On Vercel, /api/mcp/tool always routes through callToolLocal() (remote WebSocket MCP is unconditionally skipped). The local tool functions create_transfer and create_withdrawal have no step-up MFA gate, so high-value transfers execute silently. Additionally, req is not passed to callToolLocal() in any of the 3 server.js fallback call sites, so even if the functions checked req.session.user.acr they would receive undefined.
fix: (1) Add checkLocalStepUp() helper to mcpLocalTools.js mirroring the gate in transactions.js. (2) Add step-up check to create_transfer and create_withdrawal after the HITL consent check. (3) Pass req as 4th arg to all 3 callToolLocal() calls in server.js.
verification:
files_changed:
  - banking_api_server/services/mcpLocalTools.js
  - banking_api_server/server.js
