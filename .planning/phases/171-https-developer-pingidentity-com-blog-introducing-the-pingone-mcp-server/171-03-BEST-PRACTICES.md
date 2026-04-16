# Best Practices and Next Steps

## Key Takeaways

Building secure AI agent integration isn't about adding OAuth to an agent — it's about designing a **delegation architecture** where every token, scope, and consent is intentional. Here are the patterns that matter:

### 1. The Session Custodian Pattern (BFF)

The Backend-for-Frontend is the single most important architectural decision in this stack. It's the session custodian — the only component that holds OAuth tokens.

**The rule:** Tokens never leave the BFF. The browser gets a session cookie. The MCP server gets exchanged tokens. The AI model gets tool results. Nobody gets raw user credentials.

**Why it works:** If the frontend is compromised (XSS), the attacker gets a session cookie — not a bearer token. Session cookies are `httpOnly` (invisible to JavaScript), `Secure` (HTTPS only), and `SameSite` (no cross-origin use). The attacker would need to compromise the BFF itself to extract tokens.

### 2. RFC 8693 Token Exchange: Always Narrow

Never pass a token with more scopes than needed. The token exchange is your **scope narrowing** layer:

- User's session token: `banking:read banking:write banking:admin banking:agent:invoke`
- Tool calls `get_my_accounts`: exchange for `banking:accounts:read` only
- Tool calls `create_transfer`: exchange for `banking:transactions:write` with actor claim

**Anti-pattern:** Exchanging once with all scopes and reusing the token across tools. Each tool call should get a fresh, minimally-scoped token.

### 3. HITL: Pause, Don't Block

Human-in-the-loop doesn't mean the AI agent stops working. It means the agent **pauses the specific operation** that requires consent and can continue with other tasks.

The consent challenge pattern is designed for this:
1. Agent receives 428 → creates a challenge
2. User approves (inline, no navigation)
3. Agent retries with the challenge ID

The 10-minute challenge TTL gives the user time to review without creating permanent dangling state.

### 4. Delegation, Not Impersonation

The `act` claim in 2-Exchange tokens is the difference between delegation and impersonation:
- **Impersonation:** The agent pretends to be the user. Audit logs show the user did everything.
- **Delegation:** The agent acts *on behalf of* the user. Audit logs show the agent acted for the user.

Delegation is auditable, revocable, and scope-limited. Impersonation is none of those.

---

## Common Pitfalls

| Pitfall | Symptom | Fix |
|---------|---------|-----|
| Storing tokens in localStorage | XSS steals all tokens | Use BFF pattern — tokens server-side only |
| Skipping PKCE | Authorization code interception | Always use PKCE, even with confidential clients |
| Static API keys for agents | No per-user scoping, no revocation | Use RFC 8693 token exchange |
| Missing `aud` validation | Token confusion attacks | MCP server must validate `aud` claim |
| Reusing exchanged tokens | Over-privileged tool calls | Exchange per tool call with minimal scopes |
| No HITL for writes | AI autonomously modifies data | Require consent challenge for all state-changing operations |
| `SKIP_TOKEN_SIGNATURE_VALIDATION=true` in prod | Anyone can forge tokens | Remove immediately; exists for dev only |

---

## Resources and References

### RFCs and Standards
- [RFC 8693 — OAuth 2.0 Token Exchange](https://datatracker.ietf.org/doc/html/rfc8693)
- [RFC 7636 — PKCE](https://datatracker.ietf.org/doc/html/rfc7636)
- [OpenID Connect CIBA](https://openid.net/specs/openid-client-initiated-backchannel-authentication-core-1_0.html)
- [Model Context Protocol Specification](https://modelcontextprotocol.io/)

### PingOne Documentation
- [PingOne Authorization](https://docs.pingidentity.com/pingone/latest/authorization/)
- [PingOne Token Exchange](https://docs.pingidentity.com/pingone/latest/developers/token-exchange/)
- [PingOne CIBA](https://docs.pingidentity.com/pingone/latest/developers/ciba/)

### Project Resources
- [BX Finance Banking Demo (GitHub)](https://github.com/curtismu7/banking-demo)
- [PingOne MCP Server Source](https://github.com/curtismu7/banking-demo/tree/main/banking_mcp_server)

---

## Call to Action

Secure AI agent integration is not a future concern — it's a **present requirement**. Every organization building AI-powered tools that access user data needs an answer to the delegation problem.

The PingOne MCP Server provides that answer:
- **Three authentication flows** for different contexts (browser, mobile, inline)
- **RFC 8693 token exchange** for safe, auditable delegation
- **HITL consent challenges** for operations that require human approval
- **Production-ready patterns** with session management, scope enforcement, and monitoring

**Try it yourself:**

```bash
git clone https://github.com/curtismu7/banking-demo.git
cd banking-demo
./run-bank.sh
```

Or explore the code, suggest improvements, and share your own patterns. The delegation problem is too important to solve in isolation.

*Have questions? Found a bug? Want to contribute? Open an issue on [GitHub](https://github.com/curtismu7/banking-demo/issues) or reach out to the PingOne developer community.*
