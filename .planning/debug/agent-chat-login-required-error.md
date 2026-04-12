---
status: awaiting_human_verify
trigger: "agent-chat-login-required-error — 'Could not parse: Please log in to access the banking agent.' on chat input while authenticated"
created: 2026-04-09T00:00:00Z
updated: 2026-04-09T00:02:00Z
symptoms_prefilled: true
goal: find_and_fix
---

## Current Focus

hypothesis: CONFIRMED — three bugs fixed
test: UI build passes (exit 0)
expecting: Authenticated users can now use both text input and suggestion chips to reach the agent
next_action: User verification in browser

## Symptoms

expected: The banking agent processes "Show me my accounts" and returns account data
actual: The agent chat box shows "🏦 Could not parse: Please log in to access the banking agent." even though the user is logged in
errors: "Could not parse: Please log in to access the banking agent."
reproduction: 1. Login as user, 2. Navigate to dashboard/agent, 3. Type "Show me my accounts" in the agent chat input
started: After LangChain agent integration (bankingAgentLangChainService.js + agentBuilder.js)
context: Old direct MCP-tool buttons still work. User IS authenticated. New code = bankingAgentLangChainService.js + agentBuilder.js + bankingAgentRoutes.js

## Eliminated

(none yet)

## Evidence

- timestamp: 2026-04-09T00:01:00Z
  checked: banking_api_server/middleware/agentSessionMiddleware.js line 22-24
  found: checks `req.user && req.user.sub` — but `req.user` is only set by `authenticateToken` middleware, which is NOT applied to the `/api/banking-agent` route
  implication: `req.user` is always undefined for agent routes → always returns 401

- timestamp: 2026-04-09T00:01:00Z
  checked: banking_api_server/server.js line 849
  found: `app.use('/api/banking-agent', bankingAgentRoutes)` — no `authenticateToken` in the middleware chain
  implication: agentSessionMiddleware runs without req.user ever being set

- timestamp: 2026-04-09T00:01:00Z
  checked: agentSessionMiddleware.js line 29-32 vs oauthUser.js line 509
  found: Middleware checks `req.session.oauth_tokens` (snake_case) but OAuth callback sets `req.session.oauthTokens` (camelCase)
  implication: Even if req.user check was fixed, the second check would also fail

- timestamp: 2026-04-09T00:01:00Z
  checked: bankingAgentRoutes.js lines ~22 and ~47
  found: Route handler reads `req.session.agentContext` but middleware sets `req.agentContext`; also uses `userToken` field but agentContext has `accessToken`
  implication: Even if middleware passes, route guards would return secondary 401

- timestamp: 2026-04-09T00:01:00Z
  checked: BankingAgent.js lines 2830-2838 (suggestion chip click handlers)
  found: Call `reportNlFailure(res)` with raw response `{error:'Unauthorized', message:'Please log in...', _status:401}`. `reportNlFailure` only handles `err.statusCode === 401` (not `err._status`), so falls through to `addMessage('assistant', \`Could not parse: ${err.message}\`)`
  implication: "Show me my accounts" suggestion chip (not just text input) produces the observed "Could not parse: Please log in..." message

## Resolution

root_cause: Three compounding bugs in Phase 115 new agent code: (1) agentSessionMiddleware checks req.user (set only by authenticateToken) but bankingAgentRoutes is mounted without authenticateToken, so req.user is always undefined; (2) middleware reads req.session.oauth_tokens (snake_case) but OAuth callback stores oauthTokens (camelCase); (3) route handlers read req.session.agentContext but middleware sets req.agentContext, and use field name userToken when agentContext has accessToken. Additionally, suggestion chip click handlers call reportNlFailure(res) with full response object — reportNlFailure only checked statusCode not _status, so 401 responses fell through to "Could not parse:"
fix: (1) agentSessionMiddleware: replaced req.user check with req.session?.user check; replaced req.session.oauth_tokens with req.session.oauthTokens; fixed agentContext fields (userId from session.user.oauthId||id, accessToken/refreshToken from camelCase fields). (2) bankingAgentRoutes: changed req.session.agentContext to req.agentContext; renamed userToken to accessToken. (3) BankingAgent.js: added err?._status === 401 check to reportNlFailure condition.
verification: npm run build in banking_api_ui → exit 0
files_changed: [banking_api_server/middleware/agentSessionMiddleware.js, banking_api_server/routes/bankingAgentRoutes.js, banking_api_ui/src/components/BankingAgent.js]
