---
status: investigating
trigger: "Token exchange still failing with 'At least one scope must be granted' AND may_act claim is absent from the user token on dashboard"
created: 2026-04-14T00:00:00Z
updated: 2026-04-14T00:00:00Z
---

## Current Focus
<!-- OVERWRITE on each update - reflects NOW -->

hypothesis: Two related issues — (1) may_act absent because SPEL/attribute not injecting into token; (2) token exchange failing because scopes sent don't match what PingOne grants for the target resource
test: Read oauthService.js performTokenExchange, check what resource/scope params are sent; read oauthUser.js for authorize scopes; check token display code for may_act reading
expecting: Likely a mismatch between MCP_TOKEN_EXCHANGE_SCOPES and the resource server the exchanger is allowed to grant; possible audience/resource mismatch in exchange request
next_action: Read oauthService.js, pingoneTestRoutes.js, agentMcpTokenService.js

## Symptoms
<!-- Written during gathering, then IMMUTABLE -->

expected:
  1. User token contains may_act claim after login (SPEL on resource server should inject it)
  2. Token exchange (User Token → MCP Token) succeeds and returns a delegated token

actual:
  1. Dashboard token inspector shows "may_act absent" warning
  2. Token exchange shows "Actor token exchange failed: Request failed: At least one scope must be granted"

errors:
  - "At least one scope must be granted" from PingOne token exchange endpoint
  - may_act absent shown in dashboard token chain panel

reproduction:
  1. Log in as user
  2. Go to dashboard — token chain shows may_act absent
  3. Go to PingOne Test page → run Exchange 1 → FAILED with scope error

started: may_act was never present (SPEL just configured); scope error persists after fixing MCP_TOKEN_EXCHANGE_SCOPES

## Eliminated
<!-- APPEND only - prevents re-investigating -->

## Evidence
<!-- APPEND only - facts discovered -->

## Resolution
<!-- OVERWRITE as understanding evolves -->

root_cause:
fix:
verification:
files_changed: []
