# Phase 243 Research - Real MCP gateway in front of the banking MCP server

Date: 2026-04-27

## Objective
Produce an implementation-ready plan for a real MCP Gateway that sits in front of the existing banking MCP server, enforces RFC 9728/OAuth-facing behavior at the gateway boundary, delegates permit/deny decisions to PingOne Authorize, performs next-hop token exchange, and guarantees that tokens never enter the LLM path.

## Current State Findings

1. The MCP server already implements HTTP MCP + protected resource metadata
- `banking_mcp_server/src/server/BankingMCPServer.ts` enables `HttpMCPTransport` by default when `HTTP_MCP_TRANSPORT_ENABLED` is not `false`.
- `HttpMCPTransport` is the current implementation of `POST /mcp` and `GET /.well-known/oauth-protected-resource` for the banking MCP server.
- Conclusion: RFC 9728-aligned behavior exists on the MCP server itself, but that is not the same as a separate gateway tier.

2. There is no standalone MCP gateway service in the repo today
- Architecture docs describe a PingGateway-style MCP gateway pattern.
- Repository inspection did not find a separate runnable gateway service in front of the banking MCP server.
- Conclusion: the repo has gateway concepts and helper logic, but not the standalone gateway runtime the user asked for.

3. The BFF currently owns too much MCP security orchestration
- `banking_api_server/server.js` `POST /api/mcp/tool` resolves the access token, optionally evaluates PingOne Authorize, introspects the session token, and then calls the MCP server directly via WebSocket or HTTP transport.
- The BFF currently behaves as both tool proxy and security boundary for the MCP path.
- Conclusion: Phase 243 must move MCP-specific transport/policy/exchange responsibilities out of the BFF and into the gateway.

4. The UI still enters through the BFF MCP proxy
- `banking_api_ui/src/services/bankingAgentService.js` calls `POST /api/mcp/tool` and expects stable response fields such as `result`, `tokenEvents`, `activeModel`, and `activeProvider`.
- Conclusion: the BFF contract should remain stable to avoid unnecessary UI churn, but its downstream target should become the gateway.

5. The LangChain host has a separate MCP endpoint configuration surface
- `langchain_agent/src/config/settings.py` loads MCP endpoints from env vars in the `MCP_SERVER_{NAME}_ENDPOINT` format.
- `langchain_agent/src/main.py` registers those endpoints with the MCP client manager.
- Conclusion: Phase 243 must explicitly repoint LangChain's MCP configuration to the gateway and ensure LLM-side code never receives bearer tokens.

6. Audience and gateway-validation primitives already exist
- `banking_mcp_server/src/middleware/validateTokenAtGateway.js` already validates claims such as `sub`, `aud`, `act`, and `exp` against an expected audience.
- Multiple repo docs already model audience-per-hop and token-exchange chains.
- Conclusion: the gateway can align with existing audience vocabulary instead of inventing a new token model.

## Recommended Architecture

1. Add a dedicated `banking_mcp_gateway/` service
- Separate runnable process in the repo
- Owns `/.well-known/oauth-protected-resource` and `POST /mcp`
- Upstream target is the existing banking MCP server HTTP transport

2. Make the gateway the sole client-facing protected resource for MCP
- BFF and LangChain call the gateway, not the MCP server directly
- Gateway performs inbound token validation against the current-hop audience
- Gateway calls PingOne Authorize for policy evaluation
- Gateway exchanges for the upstream MCP-server audience and forwards only the exchanged token

3. Keep the MCP server behind the gateway
- The MCP server should accept gateway-issued next-hop tokens and reject caller tokens aimed at the wrong audience
- When gateway mode is enabled, direct public discovery should point at the gateway rather than the MCP server itself

4. Preserve the no-token-to-LLM boundary explicitly
- Tokens may exist in the browser, BFF session/auth stack, gateway, PingOne calls, and MCP-server validation layers
- Tokens must not be inserted into prompt text, model tool-selection context, model-visible traces, or LangChain logs that are derived from prompt/model execution

## Risks and Mitigations

- Risk: Breaking existing BFF agent flows while moving gateway duties out of `server.js`.
  - Mitigation: preserve the outward BFF response contract and change only the downstream hop.

- Risk: Duplicated policy evaluation between BFF and gateway.
  - Mitigation: move PingOne Authorize gating to the gateway and downgrade the BFF to orchestration/telemetry only for the MCP path.

- Risk: Wrong-audience token reuse across hops.
  - Mitigation: add explicit rejection tests for inbound token `aud`, exchanged token `aud`, and direct-to-upstream bypass attempts.

- Risk: Token leakage into model-facing logs or prompt context.
  - Mitigation: add explicit redaction assertions around BFF/LangChain logging and keep token-bearing work inside gateway/BFF auth services only.

## Files Implicated

- Gateway foundation: `banking_mcp_gateway/` (new service)
- BFF cutover: `banking_api_server/server.js`, new gateway client helper(s)
- LangChain cutover: `langchain_agent/src/config/settings.py`, `langchain_agent/src/main.py`, `langchain_agent/src/authentication/oauth_manager.py`
- Upstream server hardening: `banking_mcp_server/src/server/HttpMCPTransport.ts`, `banking_mcp_server/src/middleware/validateTokenAtGateway.js`
- Verification/docs: targeted Jest tests, gateway tests, and token-flow documentation
