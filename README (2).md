# I4AI Reference Architecture

This repository contains a reference architecture for securing Digital Assistants leveraging Ping Identity's Agent Core. It is intended as a starting point for teams designing secure, delegated access patterns for AI agents.

This is the first use case in the series — additional use cases will follow.

## Repository Contents

| File | Description |
|---|---|
| [i4ai-ref-arch.mmd](i4ai-ref-arch.mmd) | Mermaid sequence diagram source |

---

## Viewing and Editing the Diagram

The diagram is authored in [Mermaid](https://mermaid.js.org/) format (`.mmd`).

**VS Code:** Install the [Mermaid Preview](https://marketplace.visualstudio.com/items?itemName=bierner.markdown-mermaid) extension (or search for "Mermaid" in the Extensions panel) to render and edit the diagram directly in VS Code.

---

## Token Operations by Participant

### Token Exchange (RFC 8693)

Token exchange is performed when a participant needs to obtain a new token scoped to the next actor in the delegation chain.

| Participant | Exchanges For | Resulting Token |
|---|---|---|
| **Agent (Digital Assistant)** | Agent Gateway | `aud: mcp-gw`, `sub: user`, `act: {sub: agent1}` |
| **Agent Gateway** | MCP | `aud: mcp`, `sub: user`, `act: {sub: agent1}` |
| **MCP** | Resource Server | `aud: resource-server`, `sub: user`, `act: {sub: agent1}` |

The `act` claim is intentionally kept flat across all exchanges: `sub` is always the user and `act` is always the originating agent. Full intermediary chain auditability will be provided by Transaction Tokens (Txn-Token draft) in a future iteration.

---

### Token Introspection

Token introspection is performed when a participant needs to retrieve token claims from the Authorization Server to make an authorization or policy decision. This is required when the token is opaque, or when real-time revocation checking is needed for a JWT.

| Participant | Introspects | Purpose |
|---|---|---|
| **Ping Authorize** | Agent token | Retrieve claims to evaluate which tools the agent is permitted to see (`tools/list`) |
| **Ping Authorize** | TX token | Retrieve claims (`sub`, `act`, `aud`, `scope`) to validate and permit the tool call |
| **Resource Server** | RS token | Retrieve claims to validate delegation chain before serving protected data |

---

### Token Validation

Token validation is lightweight local verification — checking the token signature, expiry, and `aud` claim without calling the Authorization Server. Performed by participants that receive a token but delegate the authorization decision elsewhere.

| Participant | Validates | Notes |
|---|---|---|
| **Agent Gateway** | TX token | Validates before forwarding to Ping Authorize for policy evaluation |
| **MCP** | MCP token | Validates before performing the token exchange for the Resource Server |

---

## Delegation Chain

The `act` claim is kept flat across all token exchanges. `sub` always represents the end user; `act` always represents the originating agent:

```json
{
  "sub": "user",
  "act": {
    "sub": "agent1"
  }
}
```

This applies to the TX token, MCP token, and RS token equally. Intermediaries (Gateway, MCP) are not added to the `act` chain. Full intermediary chain auditability — capturing each hop — is deferred to Transaction Tokens (Txn-Token draft).

---

## Standards Referenced

| Standard | Purpose |
|---|---|
| OAuth 2.1 | Authorization framework |
| RFC 8693 | Token Exchange — delegation and impersonation |
| RFC 8707 | Resource Indicators — `resource` parameter in authorization requests |
| RFC 7662 | Token Introspection |
| MCP (Model Context Protocol) | Agent-to-tool communication via JSON-RPC 2.0 |
| [Txn-Token (draft-ietf-oauth-transaction-tokens-08)](https://datatracker.ietf.org/doc/draft-ietf-oauth-transaction-tokens/08/) | Transaction Tokens — full intermediary chain auditability (planned) |
