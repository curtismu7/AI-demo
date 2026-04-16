# Introducing the PingOne MCP Server: Secure AI Agent Banking Integration

*How modern OAuth 2.0 patterns enable safe AI delegation in financial services*

**Reading time:** ~15 minutes
**Audience:** Developers, architects, DevOps engineers

---

**AI agents are no longer hypothetical — they're executing real financial transactions.** But here's the question that keeps security architects awake at night: *How do you safely delegate API access to an AI agent acting on behalf of a user?*

The answer isn't "just give it an API key." API keys are static, over-privileged, and impossible to audit per-user. The answer is **OAuth 2.0 token exchange** — specifically RFC 8693 — combined with a modern tool protocol that AI agents already speak: the **Model Context Protocol (MCP)**.

In this post, we introduce the **PingOne MCP Server**, a production-grade reference implementation that demonstrates three distinct authentication flows for AI agent banking integration: traditional PKCE login, backchannel mobile approval (CIBA), and human-in-the-loop inline consent. Each flow uses PingOne as the identity provider and RFC 8693 token exchange to safely delegate scoped access without ever exposing raw tokens to the AI model.

By the end of this post, you'll understand:
- **Three auth flows** and when to use each
- **RFC 8693 token exchange** patterns (1-exchange vs. 2-exchange)
- **Production deployment** checklists for Vercel and on-premises
- **Lessons learned** from the BX Finance demo — a working banking application you can run today

---

## What is MCP and Why It Matters

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

## Live Demo Walkthrough

### Try It in Under 5 Minutes

The BX Finance banking demo is a fully working application you can run locally. It includes a React SPA, an Express BFF (backend-for-frontend), an MCP server, and a LangChain agent — all wired together with PingOne as the identity provider.

**Quick start:**

```bash
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

Once running, open the UI in your browser. You'll see three authentication flows:

1. **Standard Login** — Authorization Code + PKCE (redirect to PingOne)
2. **CIBA Login** — Enter your username; approve on your mobile device
3. **Agent Chat** — The AI agent with inline HITL authentication

Each flow demonstrates a different pattern for getting a user-scoped token to the MCP server. Try all three — the token chain visualization on the dashboard shows exactly which tokens were exchanged and what scopes were granted.

> **Note:** The demo requires a PingOne environment with specific application configurations. See the repository's `README.md` for the full PingOne setup checklist.

---

## The Three Authentication Flows

AI agents need user-scoped tokens, but users authenticate in different contexts. A user sitting at their laptop has a browser. A user walking through an airport has their phone. An AI agent mid-conversation has neither — it needs to pause, get consent, and resume.

The PingOne MCP Server supports three flows to cover these scenarios. Each produces the same result — a scoped, delegated token — but the user experience and security properties differ.

### Flow 1: Authorization Code + PKCE (Traditional Login)

**When to use:** User is at a browser, initiating the session themselves.

This is the standard OAuth 2.0 Authorization Code flow with PKCE (Proof Key for Code Exchange). The user clicks "Login," gets redirected to PingOne, authenticates, and returns with an authorization code that the BFF exchanges for tokens.

**Why PKCE?** Without PKCE, a malicious app intercepting the redirect could steal the authorization code. PKCE binds the code to the original requestor using a cryptographic challenge.

```javascript
// From banking_api_server/routes/oauthUser.js — Login initiation
const codeVerifier = crypto.randomBytes(32).toString('base64url');
const codeChallenge = crypto
  .createHash('sha256')
  .update(codeVerifier)
  .digest('base64url');

// Store verifier in session and signed cookie (serverless fallback)
req.session.oauthCodeVerifier = codeVerifier;
setPkceCookie(res, { state, codeVerifier, redirectUri, nonce }, isProd());

// Redirect to PingOne with challenge
const url = `${authEndpoint}?` + new URLSearchParams({
  response_type: 'code',
  client_id: clientId,
  redirect_uri: redirectUri,
  scope: scopes,
  state: state,
  code_challenge: codeChallenge,
  code_challenge_method: 'S256',
});
res.redirect(url);
```

**Security note:** The code verifier is stored server-side in the session *and* in a signed cookie. The signed cookie is a Vercel/serverless resilience pattern — if the callback hits a different instance, the session might not be available, but the signed cookie travels with the browser.

### Flow 2: CIBA (Client-Initiated Backchannel Authentication)

**When to use:** Agent or service needs to authenticate a user who isn't at a browser — or when you want a "push notification" approval experience.

CIBA flips the traditional flow. Instead of the user initiating login, the *application* initiates it. The user receives a push notification on their registered device and approves or denies the request.

```javascript
// From banking_api_server/routes/ciba.js — Backchannel initiation
router.post('/initiate', authenticateToken, async (req, res) => {
  const { login_hint, scope, binding_message } = req.body;
  
  const result = await cibaService.initiateAuth({
    login_hint,            // User's email or username
    scope,                 // Requested scopes
    binding_message,       // "Approve login for Banking App"
  });

  res.json({
    auth_req_id: result.auth_req_id,
    expires_in: result.expires_in,
    interval: result.interval,
  });
});
```

**Why CIBA for AI agents?** Consider this scenario: an AI agent is processing a batch of account reviews and needs to escalate one to a human for approval. The human is on their phone. CIBA lets the agent trigger a mobile approval without requiring the human to visit a specific URL.

**Security note:** CIBA requires a confidential client (client secret never leaves the BFF). The binding message shown on the mobile device should include transaction context ("Approve $500 transfer to savings") to prevent confused-deputy attacks.

### Flow 3: HITL (Human-In-The-Loop) with Inline Consent

**When to use:** AI agent is mid-conversation and hits an operation requiring explicit user consent — like a money transfer.

The AI agent is chatting with the user, the user asks to transfer money, and the agent needs to pause, get consent, and resume — all inline without page navigation.

```javascript
// From banking_api_server/services/transactionConsentChallenge.js
const CHALLENGE_TTL_MS = 10 * 60 * 1000;  // 10-minute window
const OTP_MAX_ATTEMPTS = 3;

// 1. Create challenge → captures transaction snapshot
// 2. User confirms → OTP sent via PingOne MFA  
// 3. User enters OTP → challenge marked 'confirmed'
// 4. Agent retries with consentChallengeId → transfer executes
```

**Why not just re-authenticate?** Re-authentication proves identity but doesn't prove *intent*. The consent challenge captures a snapshot of the transaction details (amount, recipient, account) at creation time. If the AI agent modifies the amount between consent and execution, the snapshot comparison fails and the transfer is rejected.

**Security note:** As of the latest release, **all transfers require HITL consent** regardless of amount. This is a deliberate security decision: transfers move money between accounts and should always require explicit human approval when initiated by an AI agent.

### Choosing the Right Flow

| Criteria | PKCE | CIBA | HITL |
|----------|------|------|------|
| **User location** | At browser | Any device | In agent chat |
| **Initiator** | User | Application/Agent | Agent (mid-operation) |
| **UX** | Redirect to IdP | Push notification | Inline consent |
| **Latency** | Fast (seconds) | Variable (user response) | Fast (inline) |
| **Best for** | Initial login | Batch processing, mobile | Transaction consent |

These flows are not mutually exclusive. A typical session might start with PKCE login, then use HITL for a transfer, and later use CIBA for a step-up approval on a different device.

---

## RFC 8693 Token Exchange in Action

### The Problem: How Do Tokens Get to the AI Agent?

A user is logged into the banking app (they have an access token in their BFF session). They ask the AI agent to check account balances. The MCP server needs a token to call the banking API on the user's behalf.

**The wrong answer:** Pass the user's access token directly to the MCP server. This violates the principle of least privilege — the user's token has all their scopes, and the MCP server only needs `banking:accounts:read`.

**The right answer:** RFC 8693 Token Exchange. The BFF exchanges the user's token for a new, narrowly-scoped token targeted at the MCP server's audience. The original token never leaves the BFF.

### Pattern 1: Single Exchange (User Context Only)

The BFF exchanges the user's access token for an MCP-scoped token. No agent identity in the resulting token.

**When to use:** Read-only operations, user-initiated actions, simple tool calls.

```javascript
// From banking_api_server/services/oauthService.js
async performTokenExchange(subjectToken, audience, scopes) {
  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
    subject_token: subjectToken,
    subject_token_type: 'urn:ietf:params:oauth:token-type:access_token',
    requested_token_type: 'urn:ietf:params:oauth:token-type:access_token',
    audience: audience,         // 'https://mcp-server.pingdemo.com'
    scope: scopes.join(' '),    // 'banking:accounts:read'
    client_id: this.config.clientId,
  });

  const response = await axios.post(this.config.tokenEndpoint, body.toString());
  return response.data.access_token;
}
```

**Resulting token:** `sub` = user, `aud` = MCP server, `scope` = narrowed. No `act` claim.

### Pattern 2: Double Exchange (User + Agent Context)

Two tokens go in — the user's access token (subject) and the agent's client-credentials token (actor). The resulting token carries `act` claims identifying which agent is operating.

**When to use:** Write operations, transfers, any action requiring per-agent audit trails.

```javascript
// From banking_api_server/services/oauthService.js
async performTokenExchangeWithActor(subjectToken, actorToken, audience, scopes) {
  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
    subject_token: subjectToken,
    subject_token_type: 'urn:ietf:params:oauth:token-type:access_token',
    actor_token: actorToken,
    actor_token_type: 'urn:ietf:params:oauth:token-type:access_token',
    requested_token_type: 'urn:ietf:params:oauth:token-type:access_token',
    audience: audience,
    scope: scopes.join(' '),
  });

  const response = await axios.post(this.config.tokenEndpoint, body.toString());
  return response.data.access_token;
}
```

**Resulting token includes `act` claim:**

```json
{
  "sub": "user-uuid-1234",
  "aud": "https://mcp-server.pingdemo.com",
  "scope": "banking:accounts:read banking:transactions:write",
  "act": {
    "sub": "agent-client-id-5678",
    "client_id": "banking-ai-agent"
  }
}
```

The `act` claim makes every API call auditable: "Agent X accessed User Y's accounts at time Z."

### When to Use Which

| Pattern | Actor Identity | `act` Claim | Use Case |
|---------|---------------|-------------|----------|
| **1-Exchange** | None | No | Read-only tools, simple queries |
| **2-Exchange** | Agent CC token | Yes | Write operations, auditable actions |

**Rule of thumb:** If it modifies data or moves money, use 2-Exchange. If it reads data, 1-Exchange is sufficient.

---

## BX Finance Case Study: Putting It All Together

### The Architecture

BX Finance is a three-tier banking demo that puts every pattern from this post into a working application:

```
┌─────────────────────────────────────────────┐
│          Browser (React SPA)                │
│   Dashboard │ Admin │ Agent Chat UI         │
└──────────────────┬──────────────────────────┘
                   │ Session cookie (httpOnly)
┌──────────────────▼──────────────────────────┐
│       Banking API Server (Express BFF)       │
│  OAuth Routes │ Banking APIs │ Token Exchange │
│                              │               │
│                    ┌─────────▼─────────┐     │
│                    │    MCP Server      │     │
│                    │  (WebSocket)       │     │
│                    │  Banking Tools     │     │
│                    │  Scope Enforcement │     │
│                    └───────────────────┘     │
└─────────────────────────────────────────────┘
```

**Key architectural decisions:**

| Decision | Rationale |
|----------|-----------|
| **BFF pattern** | Tokens never reach the browser |
| **WebSocket for MCP** | Persistent connections, low latency tool calls |
| **Scope-per-tool** | Each tool declares and enforces `requiredScopes` |
| **Session cookie only** | Browser gets opaque cookie — no JWTs exposed |

### Scenario 1: Analyze Spending (Read-Only)

User types "Show me my spending." The agent calls `get_my_transactions` via MCP.

**Token flow:** User session token → **1-Exchange** → MCP token with `banking:transactions:read` → MCP server validates → banking API returns transactions → agent presents summary.

No authentication prompt. No consent challenge. The user is already logged in, and reading transactions is a safe, read-only operation.

### Scenario 2: Execute Transfer (Write + HITL)

User types "Transfer $500 from checking to savings." This triggers the full security chain:

1. Agent calls `create_transfer` via MCP
2. BFF returns **428** `consent_challenge_required`
3. Agent presents inline consent UI
4. User reviews details, confirms, enters OTP
5. Agent retries with `consentChallengeId`
6. BFF performs **2-Exchange** (user + agent tokens)
7. Transfer executes with `act` claim for audit
8. Audit log: "Agent banking-ai-agent transferred $500 for user-1234"

Every piece of the architecture has a job: the 428 enforces HITL, the consent challenge prevents tampering, the OTP proves identity, the 2-Exchange enables audit, and the scope enforcement ensures the agent can't exceed its permissions.

---

## Deploy to Production

Moving from demo to production means tightening every layer.

### PingOne Configuration Checklist

| Setting | Production Value |
|---------|-----------------|
| **App type** | Web App (confidential client) |
| **PKCE** | Required (always) |
| **Redirect URIs** | Production domain only (remove localhost) |
| **Token lifetimes** | Access: 15 min, Refresh: 8 hours |
| **Token exchange** | Enabled with audience restrictions |

### Session Security

Use Redis (or Upstash for serverless) as the session store. Configure cookies:

```javascript
cookie: {
  httpOnly: true,        // JavaScript can't access
  secure: true,          // HTTPS only
  sameSite: 'lax',       // CSRF protection
  maxAge: 8 * 60 * 60 * 1000,
}
```

### Token Rules (Non-Negotiable)

1. **Tokens stay server-side.** No access tokens in the browser.
2. **Exchange before forwarding.** Always use RFC 8693 — never pass raw tokens.
3. **Validate audience.** MCP server must check the `aud` claim.
4. **Short lifetimes.** Exchanged tokens: 5-15 minutes.
5. **Log everything.** Every exchange, refresh, and revocation.

### Hard Guard

`SKIP_TOKEN_SIGNATURE_VALIDATION` bypasses JWT signature verification. It exists for local development only. In production, this **must** be `false`. The MCP server logs a warning at startup if enabled.

### Monitoring

| Metric | Alert If |
|--------|----------|
| Token exchange failure rate | > 5% over 5 min |
| 428 consent challenges | Spike > 3x baseline |
| Invalid `aud` rejections | Any occurrence |
| Signature validation disabled | Any occurrence in prod |

---

## Best Practices

### The Patterns That Matter

1. **Session Custodian (BFF):** The BFF is the only component holding tokens. Browser gets a session cookie. MCP server gets exchanged tokens. AI model gets tool results.

2. **Always Narrow Scopes:** Each tool call gets a fresh, minimally-scoped token via RFC 8693. Don't exchange once and reuse across tools.

3. **HITL: Pause, Don't Block:** The agent pauses the specific operation requiring consent and can continue with other tasks. The 10-minute challenge TTL provides review time without permanent dangling state.

4. **Delegation, Not Impersonation:** The `act` claim in 2-Exchange tokens is the difference. Delegation is auditable, revocable, and scope-limited.

### Common Pitfalls

| Pitfall | Fix |
|---------|-----|
| Tokens in localStorage | Use BFF pattern — server-side only |
| Skipping PKCE | Always use PKCE, even with confidential clients |
| Static API keys for agents | Use RFC 8693 token exchange |
| Missing `aud` validation | MCP server must validate audience |
| Reusing exchanged tokens | Exchange per tool call, minimal scopes |
| No HITL for writes | Require consent for state-changing operations |

---

## Try It Yourself

Secure AI agent integration is not a future concern — it's a **present requirement**. Every organization building AI-powered tools that access user data needs an answer to the delegation problem.

The PingOne MCP Server provides that answer with three authentication flows, RFC 8693 token exchange, HITL consent challenges, and production-ready deployment patterns.

```bash
git clone https://github.com/curtismu7/banking-demo.git
cd banking-demo
./run-bank.sh
```

Explore the code, suggest improvements, and share your own patterns. The delegation problem is too important to solve in isolation.

---

### References

- [RFC 8693 — OAuth 2.0 Token Exchange](https://datatracker.ietf.org/doc/html/rfc8693)
- [RFC 7636 — PKCE](https://datatracker.ietf.org/doc/html/rfc7636)
- [OpenID Connect CIBA](https://openid.net/specs/openid-client-initiated-backchannel-authentication-core-1_0.html)
- [Model Context Protocol Specification](https://modelcontextprotocol.io/)
- [PingOne Developer Documentation](https://docs.pingidentity.com/pingone/)
- [BX Finance Banking Demo (GitHub)](https://github.com/curtismu7/banking-demo)

*Have questions? Found a bug? Open an issue on [GitHub](https://github.com/curtismu7/banking-demo/issues) or reach out to the PingOne developer community.*
