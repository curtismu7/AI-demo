---
status: awaiting_human_verify
trigger: "Token exchange still failing with 'At least one scope must be granted' AND dashboard shows may_act absent even after user updated the PingOne user attribute."
created: 2026-04-14T00:00:00Z
updated: 2026-04-14T00:20:00Z
---

## Current Focus
<!-- OVERWRITE on each update - reflects NOW -->

hypothesis: CONFIRMED — Two distinct root causes identified (see Resolution)
test: Implementing code fixes for RC1 + RC2
expecting: With code fixed + PingOne config corrected, exchange succeeds
next_action: Apply code changes; provide PingOne config checklist for RC3/RC4

## Symptoms
<!-- Written during gathering, then IMMUTABLE -->

expected: Token exchange succeeds; user token contains may_act claim
actual: Exchange fails with "At least one scope must be granted"; token chain panel shows "may_act absent"
errors: "Actor token exchange failed: Request failed: At least one scope must be granted"
reproduction: Log in as user → go to PingOne Test page → hit Test on "User Token → MCP Token" exchange
started: Ongoing; may_act was recently added to PingOne user attribute as { "sub": "6380065f-f328-41c2-81ed-1daeec811285" }

## Eliminated
<!-- APPEND only - prevents re-investigating -->

- hypothesis: "Scope name mismatch (compound vs canonical)"
  evidence: MCP_TOKEN_EXCHANGE_SCOPES=banking:read banking:write banking:mcp:invoke is correct canonical form; scope names are not the issue
  timestamp: 2026-04-14

- hypothesis: "audienceURI (mcp-server.pingdemo.com) is wrong"
  evidence: PINGONE_RESOURCE_MCP_SERVER_URI=https://mcp-server.pingdemo.com is set and used consistently in the exchange; audience is not the immediate issue
  timestamp: 2026-04-14

## Evidence
<!-- APPEND only - facts discovered -->

- timestamp: 2026-04-14
  checked: oauthService.js constructor
  found: OAuthService uses this.config = oauthConfig (config/oauth.js) which resolves to admin_client_id = PINGONE_ADMIN_CLIENT_ID = 14cefa5b-d9d6-4e51-8749-e938d4edd1c0
  implication: EVERY call to performTokenExchangeWithActor sends Authorization: Basic with the ADMIN web app credentials, not the MCP Token Exchanger credentials

- timestamp: 2026-04-14
  checked: getAgentClientCredentialsToken() in oauthService.js
  found: Priority order is PINGONE_WORKER_TOKEN_CLIENT_ID (95dc946f = management app) FIRST, then PINGONE_MCP_TOKEN_EXCHANGER_CLIENT_ID (6380065f). Since WORKER_TOKEN is set, all actor tokens are from the management/worker app — not the MCP Token Exchanger.
  implication: Actor token is from wrong app; management worker has no banking scopes from the MCP resource server

- timestamp: 2026-04-14
  checked: .env file and configStore mappings
  found: PINGONE_ADMIN_CLIENT_ID=14cefa5b (admin web app); PINGONE_MCP_TOKEN_EXCHANGER_CLIENT_ID=6380065f (correct app for exchange); PINGONE_WORKER_TOKEN_CLIENT_ID=95dc946f (mgmt worker, wrong for actor); PINGONE_RESOURCE_MCP_SERVER_URI=https://mcp-server.pingdemo.com
  implication: Admin web app (#14cefa5b) almost certainly lacks: (a) token exchange grant type, (b) MCP resource scopes from https://mcp-server.pingdemo.com

- timestamp: 2026-04-14
  checked: performTokenExchangeAs() in oauthService.js
  found: This function already accepts explicit (clientId, clientSecret) — exactly what's needed to authenticate the exchange with MCP Token Exchanger creds instead of admin creds
  implication: Code fix is to call performTokenExchangeAs with MCP Exchanger creds rather than performTokenExchangeWithActor

- timestamp: 2026-04-14
  checked: may_act detection in agentMcpTokenService.js (describeMayAct, appendUserTokenEvent)
  found: Looks for claims.may_act (snake_case). User set mayAct attribute with { "sub": "6380065f..." }. PingOne SPEL is on resource-server.pingdemo.com token policy. may_act will only appear in tokens issued AFTER re-login AND if claim name in PingOne token policy is the snake_case "may_act" (not "mayAct").
  implication: User must (a) re-login after attribute/SPEL setup; (b) verify PingOne claim name is exactly "may_act"

## Resolution
<!-- OVERWRITE as understanding evolves -->

root_cause: |
  RC1 (PRIMARY — scope error): performTokenExchangeWithActor authenticates with admin web app client (14cefa5b)
  via this.config = oauthConfig (config/oauth.js). The admin client almost certainly lacks token exchange grant
  type AND lacks banking:read/write/mcp:invoke scopes from the https://mcp-server.pingdemo.com resource server.
  PingOne returns "At least one scope must be granted" because no requested scope is grantable to this client.

  RC2 (SECONDARY — wrong actor): getAgentClientCredentialsToken() uses PINGONE_WORKER_TOKEN_CLIENT_ID (mgmt app 95dc946f)
  as actor due to priority order, not PINGONE_MCP_TOKEN_EXCHANGER_CLIENT_ID (6380065f). Management worker has no
  banking scopes from the MCP resource server. Even IF the exchange client were correct, the actor token is wrong.

  RC3 (PingOne config only): MCP Token Exchanger app (6380065f) needs banking:read, banking:write, banking:mcp:invoke
  scopes assigned from the https://mcp-server.pingdemo.com resource in PingOne Resources tab.
  Token exchange grant type must also be enabled on it.

  RC4 (may_act): User token lacks may_act because user hasn't re-logged after SPEL/mayAct attribute setup,
  OR the PingOne token policy claim name is "mayAct" (camelCase) not "may_act" (snake_case).

fix: |
  Code fix (RC1+RC2): Add getMcpExchangerToken() to oauthService.js that directly uses
  PINGONE_MCP_TOKEN_EXCHANGER_CLIENT_ID/SECRET (no fallthrough to WORKER_TOKEN).
  In agentMcpTokenService.js + pingoneTestRoutes.js: call getMcpExchangerToken() for actor token
  and call performTokenExchangeAs(userToken, actorToken, exchangerClientId, exchangerSecret, audience, scopes)
  when exchanger creds are available (falls back to performTokenExchangeWithActor otherwise).

  PingOne config fix (RC3): In PingOne console, MCP Token Exchanger app (6380065f) → Resources tab:
  add banking:read, banking:write, banking:mcp:invoke from https://mcp-server.pingdemo.com resource.
  Enable token-exchange grant type on the app.

  PingOne + re-login fix (RC4): Verify token policy claim name is exactly "may_act". User must re-login
  for the new mayAct attribute to appear in their access token.

verification: Code changes applied, syntax verified, UI build passes. Awaiting PingOne config + user verify.
files_changed:
  - banking_api_server/services/oauthService.js (added getMcpExchangerToken())
  - banking_api_server/services/agentMcpTokenService.js (getMcpExchangerToken + performTokenExchangeAs)
  - banking_api_server/routes/pingoneTestRoutes.js (all exchange routes use exchanger creds)
