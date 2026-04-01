---
created: 2026-04-01T21:24:02.479Z
title: Debug OTP step-up flow and fix missing fromAccountId for withdrawal
area: auth
files:
  - banking_api_ui/src/components/BankingAgent.js
  - banking_api_server/server.js
  - banking_api_server/services/agentMcpTokenService.js
  - banking_api_server/routes/oauthUser.js
---

## Problem

Two related failures during UAT Test 2 (withdraw over 500):

1. Validation error: UI shows toast Missing required field: fromAccountId for withdrawal.
   The agent is not passing fromAccountId when constructing the withdrawal tool call params.

2. OTP step-up failure: A consent/OTP screen appeared (CIBA or form_post challenge) but
   OTP verification failed. Transaction did not complete after entering the code.

These may be connected: if fromAccountId is missing the BFF may reject before OTP is
checked, or the OTP route may not forward fromAccountId to the banking API.

## Solution

Full investigation and end-to-end fix:

1. Trace withdraw tool call path -- ensure agent extracts fromAccountId from account
   context and passes it in tool call params (BankingAgent.js + MCP tool schema).
2. Check BFF POST /api/mcp/tool -- validate fromAccountId is forwarded to MCP server.
3. Test OTP end-to-end: initiate withdrawal over 500, verify OTP email, enter OTP,
   confirm transaction completes.
4. Trace oauthUser.js CIBA callback -- confirm tool re-executes after OTP approval.
5. Add regression test covering withdrawal with all required params.
