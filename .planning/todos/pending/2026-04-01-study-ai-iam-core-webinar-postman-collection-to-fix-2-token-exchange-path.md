---
created: 2026-04-01T18:30:00.000Z
title: Study AI-IAM-CORE Webinar Postman collection to fix 2-token exchange path
area: auth
files:
  - AI-IAM-CORE Webinar.postman_collection.json
  - banking_api_server/services/agentMcpTokenService.js
  - banking_api_server/services/oauthService.js
---

## Problem

The current 2-token exchange path (`ff_two_exchange_delegation`) is not working correctly with the Vercel / ENDUSER_AUDIENCE configuration. The exchange fails with "At least one scope must be granted" because the subject token only carries `banking:agent:invoke` and not the full banking:* scope set that the MCP resource requires.

The workaround (local fallback on exchange failure) works but bypasses the proper RFC 8693 delegation chain that makes the demo valuable.

## Solution

A Postman collection `AI-IAM-CORE Webinar.postman_collection.json` is checked into the repo root. It demonstrates a working 2-token exchange flow against PingOne from the AI-IAM-CORE webinar.

Steps:
1. Read the Postman collection — identify the exact request shapes, scopes, audiences, grant types, and client credentials used in each exchange leg
2. Compare with the current `_performTwoExchangeDelegation` path in `agentMcpTokenService.js` and `performTokenExchangeAs` in `oauthService.js`
3. Identify what's different (scope sets, resource parameter, may_act shape, auth method, etc.)
4. Update the 2-exchange delegation path to match the working Postman pattern
5. Verify: deposit/withdraw/transfer via agent produces a proper exchange chain with `act` claim in the final MCP token

This should replace the local-fallback workaround with a genuine RFC 8693 token exchange for the ENDUSER_AUDIENCE path.
