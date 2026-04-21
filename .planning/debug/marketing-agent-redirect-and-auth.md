---
status: awaiting_human_verify
trigger: "marketing agent redirects to dashboard instead of staying on /marketing; not prompting for PingOne login on 401"
created: 2026-04-20T00:00:00Z
updated: 2026-04-20T00:00:00Z
---

## Current Focus

hypothesis: TWO ROOT CAUSES CONFIRMED — see Resolution
test: Apply fixes and verify build
expecting: Build passes, marketing agent stays on /marketing and triggers PingOne login
next_action: Apply fixes to oauthUser.js and BankingAgent.js

## Symptoms

expected: Agent on /marketing should stay on marketing page, show MCP tool results in agent chat. When auth is needed for MCP tools, should redirect to PingOne for OAuth login, then return to /marketing.
actual: Agent redirects user to dashboard. Not prompting for PingOne login when needed.
errors: Unknown — need to trace the flow
reproduction: Use the agent chat on /marketing page, ask something that triggers an MCP tool call (e.g. "show my accounts")
started: Recent — previous fix hid dashboard nav button but redirect still happens through another path

## Eliminated

## Evidence

- timestamp: 2026-04-20T00:01
  checked: oauthUser.js login route (line 184-186)
  found: When user already authenticated, hardcodes redirect to /dashboard ignoring return_to param
  implication: If marketing agent triggers handleLoginAction('login_user') for a logged-in user, they get sent to /dashboard

- timestamp: 2026-04-20T00:02
  checked: BankingAgent.js NL handler (line 2547)
  found: 401 from /api/banking-agent/message on marketing page treated as session_not_hydrated, triggers scroll-to-login instead of PingOne OAuth
  implication: Marketing guest asking "show my accounts" never gets redirected to PingOne login

- timestamp: 2026-04-20T00:03
  checked: sendAgentMessage return value
  found: BFF returns { need_auth: true } on 401, but NL handler doesn't check response.need_auth — falls into generic session_not_hydrated path
  implication: The need_auth signal from BFF is lost in the NL flow

- timestamp: 2026-04-20T00:04
  checked: handleLoginAction('login_user') flow
  found: Correctly sets return_to=/marketing when on marketing page, but login route ignores it for already-authenticated users
  implication: Combined with bug 1, even when PingOne login is triggered, return_to is dropped

## Resolution

root_cause: TWO bugs: (1) oauthUser.js login route at line 184 hardcodes /dashboard redirect for already-authenticated users, ignoring return_to query param. (2) BankingAgent.js NL handler at line 2547 treats 401/need_auth from marketing guest chat as session_not_hydrated instead of triggering PingOne OAuth login with NL message saved for replay.
fix: (1) Respect return_to in already-authenticated redirect. (2) In NL handler, check response.need_auth on marketing pages and trigger PingOne login with pending NL saved.
verification:
files_changed: [banking_api_server/routes/oauthUser.js, banking_api_ui/src/components/BankingAgent.js]
