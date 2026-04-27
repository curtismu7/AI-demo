# Phase 243: Real MCP Gateway in front of the MCP server - Context

**Gathered:** 2026-04-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Create a real, runnable MCP Gateway as a separate layer in front of the existing banking MCP server.

The gateway must become the MCP-facing protected resource for clients, own the RFC 9728 metadata and HTTP ingress surface, evaluate access with PingOne Authorize, exchange tokens for the upstream MCP server, and keep bearer tokens out of any LLM path.

In scope:
- New standalone gateway runtime in the repo
- RFC 9728 protected resource metadata and MCP HTTP ingress on the gateway
- PingOne Authorize-led allow/deny evaluation at the gateway
- RFC 8693 token exchange from inbound caller token to next-hop MCP-server token
- Enforcing per-hop `aud` so every token only targets the next hop
- BFF and LangChain cutover from direct MCP-server access to gateway access
- Upstream MCP-server hardening so gateway is the supported front door

Out of scope:
- Replacing PingOne Authorize with custom policy logic
- Passing raw bearer tokens into prompts, model calls, or model-visible traces
- Rewriting the banking tool catalog or tool semantics
- Marketing-page or non-MCP UI redesign
</domain>

<decisions>
## Decisions

### D-01: A real standalone gateway must exist
This phase must create an actual runnable MCP Gateway layer in front of the MCP server, not just document the pattern and not just add another route shim inside the existing BFF.

### D-02: The gateway itself must implement RFC 9728-facing behavior
The gateway must own the protected-resource metadata and HTTP MCP ingress surface that clients discover and call.

### D-03: The gateway handles communication, token passing, and token exchange to the MCP server
Clients call the gateway. The gateway validates the inbound token, evaluates policy, exchanges for the next-hop MCP-server audience, and forwards upstream.

### D-04: No tokens should ever get to the LLM
Bearer tokens, exchanged tokens, and token-bearing headers must not reach prompt construction, model invocation, or model-visible logs/traces.

### D-05: Every token audience must map only to the next hop
The gateway must reject tokens whose `aud` is not the current hop's expected audience. Do not reuse a downstream token at an upstream hop or vice versa.

### D-06: PingOne Authorize should do the policy work
The gateway should call PingOne Authorize for permit/deny decisions and keep custom gateway logic focused on transport, validation, exchange, and enforcement.

### Claude's Discretion
- Exact package/service placement for the new gateway runtime
- Whether the gateway talks to the MCP server over HTTP MCP only or supports a narrow compatibility path during migration
- Specific test-file naming and local-dev port assignment
</decisions>

<specifics>
## Specific Ideas

- The current MCP server already exposes RFC 9728-style metadata and HTTP transport via `banking_mcp_server/src/server/HttpMCPTransport.ts`, but that is the protected resource itself, not a separate gateway.
- The current BFF still owns MCP token resolution, optional PingOne Authorize gating, and direct MCP invocation in `banking_api_server/server.js`.
- The current UI path is `banking_api_ui/src/services/bankingAgentService.js` -> `POST /api/mcp/tool` on the BFF.
- The LangChain host discovers MCP endpoints from env in `langchain_agent/src/config/settings.py`, so Phase 243 must include a gateway cutover there as well.
- Existing audience-validation logic in `banking_mcp_server/src/middleware/validateTokenAtGateway.js` should inform, not be bypassed by, the gateway implementation.
</specifics>

<deferred>
## Deferred Ideas

- Replacing the Node-based implementation with a deployed PingGateway product configuration in this phase
- Broad refactors of unrelated OAuth flows outside the MCP path
- New user-facing educational panels beyond what is needed to verify gateway behavior
</deferred>

---

*Phase: 243-build-a-real-mcp-gateway-in-front-of-the-mcp-server-with-rfc*
*Context gathered: 2026-04-27*
