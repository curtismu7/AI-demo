# Blog Sections: Introduction, What is MCP, Live Demo Walkthrough

## Section 1: Introduction

**AI agents are no longer hypothetical — they're executing real financial transactions.** But here's the question that keeps security architects awake at night: *How do you safely delegate API access to an AI agent acting on behalf of a user?*

The answer isn't "just give it an API key." API keys are static, over-privileged, and impossible to audit per-user. The answer is **OAuth 2.0 token exchange** — specifically RFC 8693 — combined with a modern tool protocol that AI agents already speak: the **Model Context Protocol (MCP)**.

In this post, we introduce the **PingOne MCP Server**, a production-grade reference implementation that demonstrates three distinct authentication flows for AI agent banking integration: traditional PKCE login, backchannel mobile approval (CIBA), and human-in-the-loop inline consent. Each flow uses PingOne as the identity provider and RFC 8693 token exchange to safely delegate scoped access without ever exposing raw tokens to the AI model.

By the end of this post, you'll understand:
- **Three auth flows** and when to use each
- **RFC 8693 token exchange** patterns (1-exchange vs. 2-exchange)
- **Production deployment** checklists for Vercel and on-premises
- **Lessons learned** from the BX Finance demo — a working banking application you can run today

---

## Section 2: What is MCP and Why It Matters

### The Protocol Layer for AI Agents

The **Model Context Protocol (MCP)** is a lightweight JSON-RPC 2.0 protocol that standardizes how AI agents discover and invoke tools. Think of it as the USB-C of AI tool integration — a universal connector that works across models and providers.

Before MCP, every AI agent framework invented its own tool-calling convention. LangChain had one, AutoGen another, and custom agents rolled their own. This fragmentation meant building a banking integration once meant rebuilding it for every framework.

MCP changes this. An MCP server exposes tools with typed schemas, and any MCP-compatible client can discover and call them:

```typescript
// From banking_mcp_server/src/tools/BankingToolRegistry.ts
export class BankingToolRegistry {
  private static readonly TOOLS: Record<string, BankingToolDefinition> = {
    get_my_accounts: {
      name: 'get_my_accounts',
      description: 'Retrieve the user\'s bank accounts with full account details...',
      requiresUserAuth: true,
      requiredScopes: ['banking:accounts:read'],
      readOnly: true,
      inputSchema: {
        type: 'object',
        properties: {},
        required: [],
        additionalProperties: false
      }
    },
    // ... more tools
  };
}
```

Each tool declares its **required scopes** and whether it **requires user authentication**. This isn't decoration — the MCP server enforces these at runtime. A tool marked `requiresUserAuth: true` will reject calls without a valid delegated token.

### The Key Insight: Three Layers, Not One

Here's the mental model that makes everything click:

| Layer | Protocol | Role |
|-------|----------|------|
| **Tool Discovery** | MCP (JSON-RPC 2.0) | Agent finds and calls banking tools |
| **Authentication** | OAuth 2.0 / OIDC | User proves identity to PingOne |
| **Delegation** | RFC 8693 Token Exchange | User's access safely delegated to agent |

MCP doesn't replace OAuth — it works alongside it. The MCP server is the *tool layer*; OAuth 2.0 is the *auth layer*; RFC 8693 is the *bridge* that connects them. When an AI agent calls `get_my_accounts`, the MCP server validates the delegated token, checks scopes, and only then executes the banking API call.

This separation of concerns is what makes the architecture production-ready. The AI model never sees raw tokens, never touches the OAuth flow, and can't escalate its own privileges.

---

## Section 3: Live Demo Walkthrough

### Try It in Under 5 Minutes

The BX Finance banking demo is a fully working application you can run locally. It includes a React SPA, an Express BFF (backend-for-frontend), an MCP server, and a LangChain agent — all wired together with PingOne as the identity provider.

**Quick start:**

```bash
# Clone and install
git clone https://github.com/curtismu7/banking-demo.git
cd banking-demo

# Configure PingOne environment (see .env.example for required vars)
cp banking_api_server/.env.example banking_api_server/.env
# Edit .env with your PingOne environment ID, client ID, etc.

# Start all services
./run-bank.sh
```

The `run-bank.sh` script starts four services:

| Service | Port | Role |
|---------|------|------|
| Banking API Server | 3002 | Express BFF — OAuth, sessions, banking APIs |
| Banking UI | 4000 | React SPA with agent chat interface |
| MCP Server | 8080 | WebSocket MCP tool server |
| LangChain Agent | 8888 | Optional AI agent orchestrator |

Once running, open `https://api.pingdemo.com:4000` in your browser. You'll see three authentication flows on the home page:

1. **Standard Login** — Authorization Code + PKCE (redirect to PingOne)
2. **CIBA Login** — Enter your username; approve on your mobile device
3. **Agent Chat** — The AI agent with inline HITL authentication

Each flow demonstrates a different pattern for getting a user-scoped token to the MCP server. Try all three — the token chain visualization on the dashboard shows exactly which tokens were exchanged and what scopes were granted.

> **Note:** The demo requires a PingOne environment with specific application configurations. See the repository's `README.md` for the full PingOne setup checklist.
