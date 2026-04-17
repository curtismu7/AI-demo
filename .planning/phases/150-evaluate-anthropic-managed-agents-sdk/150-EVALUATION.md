# Phase 150: Evaluate Anthropic Managed Agents SDK

**Date:** 2026-04-17
**Status:** Complete
**Recommendation:** **Skip** — No managed agents SDK exists; current MCP infrastructure is purpose-built and appropriate.

---

## Current Architecture: banking_mcp_server

The custom MCP server (`banking_mcp_server/src/`, ~13,500 lines TypeScript) provides:

| Component | File(s) | Purpose |
|-----------|---------|---------|
| **BankingMCPServer** | `server/BankingMCPServer.ts` | WebSocket server, connection lifecycle, HTTP transport |
| **MCPMessageHandler** | `server/MCPMessageHandler.ts` | JSON-RPC message routing (initialize, tools/list, tools/call) |
| **HttpMCPTransport** | `server/HttpMCPTransport.ts` | HTTP-based MCP transport (server-sent events) |
| **BankingToolRegistry** | `tools/BankingToolRegistry.ts` | Tool definitions with schemas, scope requirements, auth flags |
| **BankingToolProvider** | `tools/BankingToolProvider.ts` | Tool execution handlers (get_accounts, transfer, etc.) |
| **AuthorizationChallengeHandler** | `tools/AuthorizationChallengeHandler.ts` | Missing scope detection, auth challenge response generation |
| **BankingAuthenticationManager** | `auth/BankingAuthenticationManager.ts` | Token validation, session auth |
| **TokenExchangeService** | `auth/TokenExchangeService.ts` | RFC 8693 token exchange (on_behalf_of, scope narrowing) |
| **TokenIntrospector** | `auth/TokenIntrospector.ts` | Token introspection against PingOne |
| **BankingSessionManager** | `storage/BankingSessionManager.ts` | Per-connection session state |
| **BankingAPIClient** | `banking/BankingAPIClient.ts` | Backend API calls to banking services |

### Key Custom Behaviors
1. **PingOne OAuth integration** — PKCE, token exchange, scope-based authorization
2. **Auth challenge flow** — When a tool requires scopes the agent doesn't have, returns structured auth challenge (not a generic error)
3. **Scope-per-tool mapping** — Each tool declares required scopes; enforced before execution
4. **WebSocket + HTTP dual transport** — MCP spec compliance with both transports
5. **Session continuity** — Agent sessions persist across tool calls with token state

---

## Anthropic SDK Assessment

### What Anthropic Provides
The Anthropic **Claude SDK** (Python/TypeScript/Java) provides:
- **Messages API** — Send messages with tool definitions, get tool_use responses
- **Tool use protocol** — Define tools as JSON schemas, Claude returns tool_use blocks
- **Streaming** — Server-sent events for streaming responses
- **Prompt caching** — Cache system prompts and tool definitions
- **Token counting** — Count tokens before sending

### What Anthropic Does NOT Provide (as of April 2026)
- **No "Managed Agents SDK"** — There is no Anthropic-hosted agent loop, session manager, or tool execution runtime
- **No agent loop** — The caller must implement the loop: send message → check for tool_use → execute tool → send result → repeat
- **No session management** — No built-in session state; callers manage their own
- **No tool execution** — Claude returns tool_use intent; the caller executes the actual tool
- **No auth/credential management** — No OAuth, token exchange, or scope enforcement
- **No WebSocket/MCP transport** — Claude API is HTTP-only; MCP protocol is separate

### Third-Party Agent Frameworks
Several frameworks build agent loops on top of Claude's API:
- **LangChain/LangGraph** — Already used in `langchain_agent/` for this demo
- **CrewAI, AutoGen** — Multi-agent orchestration (different problem space)
- **Anthropic Computer Use** — Desktop automation, not API agents

---

## Feature Comparison Matrix

| Capability | banking_mcp_server (Custom) | Anthropic Claude SDK | Gap |
|------------|---------------------------|---------------------|-----|
| Tool registration with schemas | ✅ BankingToolRegistry | ✅ Tool definitions in messages | Equivalent |
| Tool execution | ✅ BankingToolProvider | ❌ Caller must execute | Custom required |
| Agent loop (message → tool → result) | ❌ Not in MCP server (in BFF) | ❌ Not in SDK | Both need custom |
| Session management | ✅ BankingSessionManager | ❌ None | Custom required |
| OAuth/token management | ✅ TokenExchangeService, AuthManager | ❌ None | Custom required |
| Scope-based authorization per tool | ✅ toolScopeMap + AuthChallenge | ❌ None | Custom required |
| Auth challenge flow (HITL) | ✅ AuthorizationChallengeHandler | ❌ None | Custom required |
| MCP protocol compliance | ✅ JSON-RPC, initialize, tools/* | ❌ Not MCP | Custom required |
| WebSocket transport | ✅ BankingMCPServer | ❌ HTTP only | Custom required |
| PingOne integration | ✅ Full OAuth + token exchange | ❌ None | Custom required |

---

## Gap Analysis

**Components the Anthropic SDK covers:** 0 of 10 custom components.

The fundamental disconnect: Anthropic provides an **LLM API** (send prompt, get response). The banking_mcp_server is a **tool execution server** that implements the MCP protocol. These are different layers of the stack:

```
[User] → [BFF (Express)] → [Claude API (Anthropic SDK)] → tool_use response
                          → [banking_mcp_server (Custom)] → execute tool → return result
```

The Anthropic SDK is already used indirectly via LangChain for the LLM interaction. The MCP server handles everything downstream of the LLM's tool_use decision.

---

## Migration Effort: N/A

No migration is possible because there is no equivalent product to migrate to. The MCP server is not an "agent" — it's a tool execution server with OAuth-secured banking operations.

---

## Recommendation: **Skip**

**Rationale:**
1. No "Anthropic Managed Agents SDK" exists as a product
2. The Anthropic Claude SDK is an LLM API client, not an agent runtime
3. The custom MCP server handles a fundamentally different concern (tool execution, auth, sessions)
4. The agent loop already exists in the BFF via LangChain
5. The custom infrastructure provides PingOne-specific OAuth that no generic framework would cover

**What could change this:**
- If Anthropic releases a hosted agent runtime with tool execution, session management, and auth
- If the MCP protocol gets a reference implementation that handles PingOne OAuth
- If LangChain's MCP integration matures enough to replace the custom WebSocket server

**Next Steps:** None required — current architecture is appropriate. Monitor Anthropic's agent offerings for future evaluation.
