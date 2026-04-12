---
status: fixing
trigger: "missing-banking-scopes-token-exchange-tests"
created: 2026-04-12T00:00:00Z
updated: 2026-04-12T00:01:00Z
---

## Current Focus

hypothesis: CONFIRMED — GET exchange routes hardcode 'openid' as scope; POST /token-exchange fallback has old scope names; TEST_CONFIG.authzToken.requiredScopes omits banking scopes
test: Applied fixes to pingoneTestRoutes.js and PingOneTestPage.jsx
expecting: Exchange tokens now carry banking:accounts:read etc.
next_action: Apply fix, run build, verify

## Symptoms

expected: Token exchange tests produce MCP tokens that contain banking scopes (banking:accounts:read, banking:transactions:write, etc.). The Authorization Code token should also carry banking scopes since the Super Banking User App has them in PingOne.
actual: None of the token acquisition or exchange tests produce tokens with the banking scopes. Tokens either omit them or only contain openid/profile/email.
errors: No explicit error messages — tests pass but tokens lack required scopes.
reproduction: Log in to PingOne, navigate to /pingone-test, run "Authorization Code Token" test and "User Token → MCP Token" test. Decode the tokens — banking scopes absent.
started: Recently — may have been introduced when TEST_CONFIG scopes were set to just ['openid', 'profile', 'email'] for the authzToken card, and exchange routes may not request banking scopes explicitly.

## Eliminated

(none yet)

## Evidence

- timestamp: 2026-04-12T00:01:00Z
  checked: banking_api_server/routes/pingoneTestRoutes.js GET exchange routes
  found: All three GET exchange routes (exchange-user-to-mcp, exchange-user-agent-to-mcp, exchange-user-to-agent-to-mcp) pass the string 'openid' as the scopes argument to performTokenExchangeWithActor/performTokenExchange
  implication: PingOne issues tokens with exactly the requested scopes; requesting 'openid' means no banking scopes ever appear in exchanged tokens

- timestamp: 2026-04-12T00:01:00Z
  checked: POST /token-exchange fallback (lines 621 and 865)
  found: Both duplicate handlers use fallback 'banking:read banking:write' — old scope names not matching actual PingOne scopes
  implication: Even when MCP_TOKEN_EXCHANGE_SCOPES is unset, the fallback resolves wrong scope names that PingOne ignores

- timestamp: 2026-04-12T00:01:00Z
  checked: TEST_CONFIG.authzToken.requiredScopes in PingOneTestPage.jsx
  found: Only ['openid', 'profile', 'email'] — no banking scopes in the validation check
  implication: The test card "passes" even when banking scopes are absent from the authz token

- timestamp: 2026-04-12T00:01:00Z
  checked: banking_api_server/config/oauthUser.js ENDUSER_AUDIENCE path + scopeAudit.js
  found: When ENDUSER_AUDIENCE is set (it is: https://ai-agent.pingdemo.com), login only requests banking:ai:agent:read. Banking API scopes (banking:accounts:read etc.) are on a different resource server (https://mcp-server.pingdemo.com) — they cannot be added to the login request without triggering PingOne "May not request scopes for multiple resources". Token exchange policy in PingOne can grant banking scopes from exchanger client's own permissions without subject token having them.
  implication: Login scope path is correct by design; fix is only needed on exchange routes

## Eliminated

- hypothesis: Login flow missing banking scopes due to ENDUSER_AUDIENCE branch
  evidence: The ENDUSER_AUDIENCE path intentionally omits banking:accounts:read etc. (different resource server — PingOne would reject mixing). Token exchange policy grants scopes from the exchanger client. Adding banking scopes to login would break PingOne authorize.
  timestamp: 2026-04-12T00:01:00Z

## Resolution

root_cause: GET exchange routes in pingoneTestRoutes.js explicitly passed 'openid' as the scope argument to performTokenExchange/performTokenExchangeWithActor. PingOne issues exactly the requested scopes — so no banking scopes ever appeared in any exchanged token regardless of app configuration. Compounding: POST /token-exchange fallback used old scope names 'banking:read banking:write' (actual names: banking:accounts:read etc.)
fix: Replaced all 'openid' scope literals in GET exchange routes with banking:accounts:read banking:accounts:write banking:transactions:read banking:transactions:write (via MCP_TOKEN_EXCHANGE_SCOPES env var or correct fallback). Agent exchange step1 uses ['banking:ai:agent:read']. Fixed both POST /token-exchange fallbacks. Updated TEST_CONFIG.authzToken.requiredScopes to include banking scopes.
verification: npm run build in banking_api_ui → exit 0. All scope literals confirmed correct via grep.
files_changed: [banking_api_server/routes/pingoneTestRoutes.js, banking_api_ui/src/components/PingOneTestPage.jsx]
