# BX Finance Case Study: Putting It All Together

## The Architecture

BX Finance is a three-tier banking demo that puts every pattern from this post into a working application. Here's how the pieces connect:

```
┌─────────────────────────────────────────────────────────┐
│                    Browser (React SPA)                   │
│                                                          │
│  ┌──────────┐  ┌──────────┐  ┌─────────────────────┐   │
│  │ Dashboard │  │  Admin   │  │    Agent Chat UI     │   │
│  │  (user)   │  │ (admin)  │  │  (FAB + panel)       │   │
│  └──────────┘  └──────────┘  └─────────────────────┘   │
│       ▲              ▲              ▲                     │
└───────┼──────────────┼──────────────┼────────────────────┘
        │              │              │
        │         Session cookie (httpOnly, Secure, SameSite)
        │              │              │
┌───────┼──────────────┼──────────────┼────────────────────┐
│       ▼              ▼              ▼                     │
│            Banking API Server (Express BFF)               │
│                                                          │
│  ┌──────────┐  ┌──────────┐  ┌─────────────────────┐   │
│  │  OAuth   │  │  Banking │  │  Token Exchange      │   │
│  │  Routes  │  │   APIs   │  │  (RFC 8693)          │   │
│  │ (PKCE,   │  │ (accounts│  │  performTokenExchange│   │
│  │  CIBA)   │  │  txns)   │  │  ...WithActor        │   │
│  └──────────┘  └──────────┘  └──────────┬────────────┘   │
│       │              │                   │               │
│       │              │                   │               │
│       ▼              │                   ▼               │
│  ┌──────────┐        │          ┌─────────────────────┐ │
│  │ PingOne  │        │          │   MCP Server         │ │
│  │  AuthZ   │        │          │   (WebSocket)        │ │
│  │  Server  │        │          │   Banking Tools      │ │
│  └──────────┘        │          │   Scope Enforcement  │ │
│                      │          └─────────────────────┘ │
└──────────────────────┼──────────────────────────────────┘
                       │
               ┌───────▼───────┐
               │   Data Store  │
               │   (SQLite /   │
               │    in-memory) │
               └───────────────┘
```

**Key architectural decisions:**

| Decision | Rationale |
|----------|-----------|
| **BFF pattern** | Tokens never reach the browser. The Express server holds all OAuth tokens in server-side sessions. |
| **WebSocket for MCP** | JSON-RPC 2.0 over WebSocket gives persistent connections with low latency for tool calls. |
| **Scope-per-tool** | Each MCP tool declares `requiredScopes` in its registry entry. The server validates scopes before execution. |
| **Session cookie only** | The browser gets an opaque session cookie — no JWTs, no access tokens, no refresh tokens. |

## Scenario 1: Analyze Spending (Read-Only, 1-Exchange)

**User story:** "Show me my spending for the last month."

This is a read-only operation. The agent needs `banking:transactions:read` scope and nothing more.

**Token flow:**

1. User is already logged in (PKCE flow completed earlier → session has access token)
2. User types "Show me my spending" in the agent chat
3. Agent calls MCP tool `get_my_transactions`
4. BFF performs **1-Exchange**: user access token → MCP-scoped token with `banking:transactions:read`
5. MCP server validates token audience and scope
6. MCP server calls banking API, returns transaction data
7. Agent formats and presents the spending summary

**What the user sees:** A natural language summary of their transactions, categorized by type. No authentication prompt — they're already logged in.

**What happens under the hood:**
```
User Session Token        →  RFC 8693 Exchange  →  MCP Token
(all banking scopes)         (narrows scope)       (transactions:read only)
                                                    ↓
                                                 MCP Server validates
                                                 audience + scope
                                                    ↓
                                                 Banking API called
                                                 with scoped token
```

## Scenario 2: Execute Transfer with HITL (2-Exchange + Consent Challenge)

**User story:** "Transfer $500 from checking to savings."

This is a write operation that moves money. It requires:
- **2-Exchange** token (user + agent identity) for audit trail
- **HITL consent challenge** because all transfers require explicit human approval
- **OTP verification** to confirm the user's identity

**Token and consent flow:**

1. User types "Transfer $500 from checking to savings"
2. Agent calls MCP tool `create_transfer`
3. BFF returns HTTP **428** `consent_challenge_required` — the transfer needs human approval
4. Agent pauses and presents inline consent UI (no page navigation)
5. User reviews transfer details (amount, from, to) and ticks consent checkbox
6. BFF creates consent challenge, captures transaction snapshot
7. User enters OTP (sent via PingOne MFA)
8. BFF verifies OTP, marks challenge as `confirmed`
9. Agent retries transfer with `consentChallengeId`
10. BFF performs **2-Exchange**: user token + agent CC token → MCP token with `act` claim
11. Transfer executes, audit log records: "Agent X transferred $500 for User Y"

**What the user sees:** The agent asks for confirmation, shows a consent dialog with transfer details, requests their OTP, then completes the transfer. The entire flow happens inline — no redirects, no page reloads.

**What happens under the hood:**
```
Agent: "Transfer $500"
  ↓
BFF: 428 consent_challenge_required
  ↓
UI: Inline consent dialog (amount, from, to)
  ↓
User: Consents + enters OTP
  ↓
BFF: Verifies OTP, marks challenge confirmed
  ↓
Agent: Retries with consentChallengeId
  ↓
BFF: 2-Exchange (user AT + agent CC → delegated token with act{} claim)
  ↓
MCP Server: Validates act claim, executes transfer
  ↓
Audit: "Agent banking-ai-agent transferred $500 for user-1234 at 2024-01-15T10:30:00Z"
```

## Why the Architecture Matters

The BX Finance demo isn't just a proof of concept — it's a pattern library. Each piece solves a specific security problem:

| Pattern | Security Problem Solved |
|---------|------------------------|
| BFF (tokens server-side) | XSS can't steal tokens |
| RFC 8693 1-Exchange | Principle of least privilege per tool call |
| RFC 8693 2-Exchange | Agent identity in audit trail |
| HITL consent challenge | AI can't autonomously move money |
| Transaction snapshot | Prevents amount tampering between consent and execution |
| Scope-per-tool registry | Tools can't exceed declared permissions |

The goal isn't to demonstrate that OAuth is complex — it's to show that **each layer exists for a reason**, and when composed correctly, they enable AI agents to do genuinely useful work without compromising security.
