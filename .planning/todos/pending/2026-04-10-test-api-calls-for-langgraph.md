---
created: 2026-04-10T14:30:00.000Z
title: Test API calls for LangGraph
area: api
files:
  - banking_api_server/services/agentBuilder.js
  - banking_api_server/services/bankingAgentLangChainService.js
  - banking_api_server/routes/bankingAgent.js
---

## Problem

Phase 99 (LangGraph upgrade) migrated the banking agent from LangChain createAgent to LangGraph StateGraph, but the API endpoint has not been tested to verify the migration works correctly. Need to ensure the /api/banking-agent/message endpoint responds correctly with the new LangGraph implementation.

## Solution

Test the /api/banking-agent/message endpoint with various requests:
1. Test with "Show me my accounts" to verify basic functionality
2. Test with other banking operations to ensure agent responds correctly
3. Verify no breaking changes to the API contract
4. Check that LangGraph state management works as expected

Use curl or Postman to test the endpoint with valid authentication tokens.
