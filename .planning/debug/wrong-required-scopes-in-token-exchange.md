---
status: awaiting_human_verify
trigger: "wrong-required-scopes-in-token-exchange"
created: 2026-04-07T00:00:00Z
updated: 2026-04-07T00:10:00Z
---

## Current Focus
<!-- OVERWRITE on each update - reflects NOW -->

hypothesis: CONFIRMED — pre-check bail-out used wrong scopes and didn't bypass for agent:invoke; modal "How to fix" was also wrong
test: Fix applied to agentMcpTokenService.js and BankingAgent.js; UI build passed
expecting: Human verification that modal now shows agent:invoke as required scope when triggered
next_action: Awaiting human confirmation that the original symptoms no longer occur

## Symptoms
<!-- Written during gathering, then IMMUTABLE -->

expected: Modal "Token Exchange: Missing Required Scopes" should require `agent:invoke` for the agent/MCP path — the scope that authorises the agent to call the MCP server
actual: Modal fires with required scopes = `banking:accounts:read` `banking:read` and user token scopes = `openid offline_access profile email` — user is blocked even when agent:invoke would be present
errors: Modal title "Token Exchange: Missing Required Scopes" — "Required scopes: banking:accounts:read banking:read / Your token has: openid offline_access profile email"
reproduction: Log in, open AI agent panel, trigger any banking action (e.g. view accounts / pending transactions)
started: Regression — was previously fixed to use agent:invoke

## Eliminated
<!-- APPEND only - prevents re-investigating -->

## Evidence
<!-- APPEND only - facts discovered -->

- timestamp: 2026-04-07T00:01:00Z
  checked: agentMcpTokenService.js ~line 490-540 (scopesMissingFromUserToken bail-out block)
  found: |
    `finalScopes` is determined from `toolCandidateScopes` (e.g. `['banking:accounts:read','banking:read']`).
    When user only has OIDC scopes or `banking:agent:invoke`, DELEGATION_ONLY_SCOPES exclusion means
    `fallbackScopes=[]`, so `finalScopes = toolCandidateScopes`.
    Then `scopesMissingFromUserToken = finalScopes.every(s => !userTokenScopes.has(s))` = true.
    Throws `missing_exchange_scopes` with `requiredScopes = 'banking:accounts:read banking:read'`.
  implication: |
    Two problems: (1) user with `banking:agent:invoke` is blocked when they should be let through;
    (2) user without agent:invoke gets the wrong required scopes in the error.

- timestamp: 2026-04-07T00:02:00Z
  checked: agentMcpTokenService.js DELEGATION_ONLY_SCOPES and allowAgentInvokeExchange env var
  found: |
    `DELEGATION_ONLY_SCOPES = new Set(['banking:agent:invoke', 'ai_agent'])`.
    An env-var bypass exists: `process.env.ALLOW_AGENT_INVOKE_EXCHANGE === 'true'` skips the bail-out.
    But this is not auto-detected based on whether the user actually *has* `banking:agent:invoke`.
  implication: The fix should auto-detect `banking:agent:invoke` presence, not require env var.

- timestamp: 2026-04-07T00:03:00Z
  checked: BankingAgent.js modal ~lines 2640-2700
  found: |
    "How to fix" section hardcodes "Add banking:write and banking:read to the app's allowed scopes".
    This is wrong for the agent:invoke path — should say "Add agent:invoke" to user app.
  implication: Modal fix instructions must be updated too.

- timestamp: 2026-04-07T00:04:00Z
  checked: mcpWebSocketClient.js MCP_TOOL_SCOPES
  found: Read tools map to ['banking:accounts:read', 'banking:read'], write tools to ['banking:transactions:write', 'banking:write']. These are correct for the exchange scope selection.
  implication: MCP_TOOL_SCOPES itself is correct; only the pre-check logic is wrong.

## Resolution
<!-- OVERWRITE as understanding evolves -->

root_cause: |
  In `agentMcpTokenService.js`, the `scopesMissingFromUserToken` pre-exchange bail-out:
  (1) Does not detect when user has `banking:agent:invoke` — should bypass bail-out for this path
  (2) Sets `requiredScopes` to tool-level banking scopes (e.g. 'banking:accounts:read banking:read')
      instead of 'agent:invoke' which is the actual pre-requisite scope for the agent/MCP path.
  The modal in `BankingAgent.js` also hardcodes 'banking:write' and 'banking:read' in fix instructions.

fix: |
  1. `agentMcpTokenService.js` bail-out block:
     - Added `userHasAgentInvokeScope` detection (checks 'banking:agent:invoke' OR 'agent:invoke')
     - Condition changed from `if (scopesMissingFromUserToken && !allowAgentInvokeExchange)` to
       `if (scopesMissingFromUserToken && !allowAgentInvokeExchange && !userHasAgentInvokeScope)`
     - `scopeErr.requiredScopes` changed from `finalScopes.join(' ')` to `'agent:invoke'`
     - `scopeErr.missingScopes` changed from banking scopes list to `['agent:invoke']`
     - Error message and tokenEvent explanations updated to reference agent:invoke
  2. `BankingAgent.js` modal:
     - Explanatory paragraph updated (no longer says "RFC 8693 can only narrow")
     - "How to fix" step 2 changed from "Add banking:write and banking:read" to
       "Add agent:invoke (banking:agent:invoke)"
     - Step 3 updated to reference agent:invoke scope

verification: UI build passed (npm run build exit code 0)
files_changed:
  - banking_api_server/services/agentMcpTokenService.js
  - banking_api_ui/src/components/BankingAgent.js
  - REGRESSION_PLAN.md (bug fix log entry added)
