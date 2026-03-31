# PingOne: 2-Exchange Delegated Chain — Setup Guide

Step-by-step setup for a **human → AI Agent → MCP → PingOne API** fully-delegated token chain using **two chained RFC 8693 token exchanges**.

**Product scope:** PingOne SaaS (`auth.pingone.com`).

> **See also:** [PINGONE_MAY_ACT_ONE_TOKEN_EXCHANGE.md](PINGONE_MAY_ACT_ONE_TOKEN_EXCHANGE.md) — the simpler 1-exchange demo pattern (what the BX Finance app implements).

---

## When to use this pattern

Use 2 exchanges when:
- The **AI Agent itself must be a named, verifiable identity** in the delegation chain
- **PingOne Authorize (PAZ)** must enforce `act.sub` (MCP) and `act.act.sub` (AI Agent) as policy attributes
- You need a full audit trail: every hop is cryptographically recorded in nested `act` claims
- You are building for regulated or production environments where every actor must be named

Use the [1-exchange pattern](PINGONE_MAY_ACT_ONE_TOKEN_EXCHANGE.md) instead when:
- You are learning `may_act` / `act` delegation basics
- The AI Agent does not need to be a named identity in the `act` chain
- You want minimal PingOne configuration

---

## How It Works

> **What is Token Exchange (RFC 8693)?** An app POSTs an existing access token to PingOne's token endpoint with `grant_type=token-exchange`. PingOne validates the token, checks delegation permissions, and issues a *new* token scoped to a different audience. Each exchange is a synchronous server-to-server call.

### 2-exchange pattern

In this pattern every hop performs a full RFC 8693 exchange. Each exchanger first obtains its own Actor Token via Client Credentials, then presents it alongside the incoming token. The result is a deeply nested `act` claim tracing every delegation hop. PingOne Authorize (PAZ) introspects the final token and enforces `act.sub` and `act.act.sub` as explicit policy attributes before permitting tool access.

```
Human User (Banking App Login)
  │
  │  PKCE Authorization Code login — user authenticates normally
  ▼
Subject Token  [TOKEN 1 — user's session token]
  { sub: "<user-id>",
    aud: ["https://ai-agent.pingdemo.com"],
    scope: "profile email banking:agent:invoke",
    may_act: { "sub": "<AI_AGENT_CLIENT_ID>" } }
              ↑ permits the AI Agent to exchange this token
  │
  │  Token Exchange #1 (RFC 8693)
  │  AI Agent gets its own Actor Token via Client Credentials (aud: https://agent-gateway.pingdemo.com)
  │  Exchanges: subject_token=Subject Token + actor_token=Agent Actor Token
  │  Exchanger: BX Finance AI Agent App (AI_AGENT_CLIENT_ID)
  ▼
Agent Exchanged Token  [TOKEN 2 — agent-delegated token]
  { sub: "<user-id>",
    aud: ["https://mcp-server.pingdemo.com"],
    act: { "sub": "<AI_AGENT_CLIENT_ID>" } }
          ↑ records that the AI Agent performed Exchange #1
  │
  │  Token Exchange #2 (RFC 8693)
  │  MCP Server gets its own Actor Token via Client Credentials (aud: https://mcp-gateway.pingdemo.com)
  │  Exchanges: subject_token=Agent Exchanged Token + actor_token=MCP Actor Token
  │  Exchanger: BX Finance MCP Service App (MCP_CLIENT_ID)
  ▼
MCP Exchanged Token  [TOKEN 3 — fully delegated tool-call token]
  { sub: "<user-id>",
    aud: ["https://resource-server.pingdemo.com"],
    scope: "banking:accounts:read banking:transactions:read banking:transactions:write",
    act: {
      "sub": "<MCP_CLIENT_ID>",         ← outer act: MCP App performed Exchange #2
      "act": {
        "sub": "<AI_AGENT_CLIENT_ID>"   ← inner act: AI Agent performed Exchange #1
      }
    }
  }
  │
  │  PAZ (PingOne Authorize) introspects the MCP Exchanged Token:
  │    ✓ sub is a known user
  │    ✓ aud == resource server URL
  │    ✓ act.sub == MCP_CLIENT_ID
  │    ✓ act.act.sub == AI_AGENT_CLIENT_ID
  │  → DENY if any check fails
  ▼
PERMIT → Banking Tools → PingOne Management API → Resource
```

| Token | Audience | How issued | Exchanger |
|-------|----------|------------|-----------|
| **Subject Token** | `https://ai-agent.pingdemo.com` | PKCE login | PingOne (user auth) |
| **Agent Exchanged Token** | `https://mcp-server.pingdemo.com` | RFC 8693 Exchange #1 | BX Finance AI Agent App |
| **MCP Exchanged Token** | `https://resource-server.pingdemo.com` | RFC 8693 Exchange #2 | BX Finance MCP Service App |

> **Nested `act` chain:** Each exchange promotes the previous actor inward. `act.sub` = most recent exchanger (MCP App); `act.act.sub` = the one before (AI Agent). PAZ enforces each level as a named policy attribute.

> **`may_act` → `act` transition:** `may_act` in the Subject Token declares who is *allowed* to perform Exchange #1. After exchange, that identity becomes the outer `act`. Exchange #2 nests a second `act` layer inside.

---

## ⚠️ Critical: Do NOT include `openid` in any scope

| Request | What breaks if `openid` is included |
|---------|-------------------------------------|
| `/authorize` (Subject Token) | `invalid_scope` — `openid` conflicts with custom `resource=` audience |
| Exchange #1 or #2 token requests | `invalid_scope` — token exchange does not support OIDC scopes |
| Client Credentials (actor tokens) | `invalid_scope` — Web App type cannot request `openid` via CC |

**Correct scopes:**

| Step | Scope |
|------|-------|
| `/authorize` | `profile email banking:agent:invoke` |
| Exchange #1 (AI Agent actor CC) | *(audience-only — no scope needed, or minimal app scope)* |
| Exchange #1 result (Agent Exchanged Token) | `banking:accounts:read banking:transactions:read banking:transactions:write` |
| Exchange #2 (MCP actor CC) | *(audience-only — no scope needed, or minimal app scope)* |
| Exchange #2 result (MCP Exchanged Token) | `banking:accounts:read banking:transactions:read banking:transactions:write` |

---

## Reference: Names and Values

| Item | Field | Value |
|------|-------|-------|
| AI Agent Resource Server | Name | `BX Finance AI Agent` |
| AI Agent Resource Server | Audience | `https://ai-agent.pingdemo.com` |
| AI Agent Resource Server | Scope | `banking:agent:invoke` |
| Agent Gateway Resource Server | Name | `BX Finance Agent Gateway` |
| Agent Gateway Resource Server | Audience | `https://agent-gateway.pingdemo.com` |
| MCP Resource Server | Name | `BX Finance MCP Server` |
| MCP Resource Server | Audience | `https://mcp-server.pingdemo.com` |
| MCP Resource Server | Scopes | `banking:accounts:read`, `banking:transactions:read`, `banking:transactions:write` |
| AI Agent App | Name | `BX Finance AI Agent App` |
| AI Agent App | Grant Types | `Token Exchange`, `Client Credentials` |
| MCP Service App | Name | `BX Finance MCP Service` |
| MCP Service App | Grant Types | `Token Exchange`, `Client Credentials` |
| `may_act.sub` on user records | equals | `AI_AGENT_CLIENT_ID` — the client ID UUID of BX Finance AI Agent App |

---

## Part 1 — Resource Servers

> **PingOne Console → Connections → Resources**

---

### 1a. BX Finance AI Agent *(Subject Token audience)*

Same as the 1-exchange pattern — see [PINGONE_MAY_ACT_ONE_TOKEN_EXCHANGE.md § 1a](PINGONE_MAY_ACT_ONE_TOKEN_EXCHANGE.md).

Key difference: `may_act.sub` on user records must be the **AI Agent App client ID** (`AI_AGENT_CLIENT_ID`), not the Banking App client ID.

**Attribute Mappings tab:**

| Field | Value |
|-------|-------|
| **Attribute name** | `may_act` |
| **Expression** | `user.mayAct` |
| **Required** | ❌ No |

> Test: `{ "user": { "mayAct": { "sub": "<AI_AGENT_CLIENT_ID>" } } }` → Result: `{ "sub": "<AI_AGENT_CLIENT_ID>" }`

---

### 1b. BX Finance Agent Gateway *(AI Agent actor token audience)*

This is the audience the AI Agent requests a Client Credentials token for, to use as its `actor_token` in Exchange #1.

| Field | Value |
|-------|-------|
| **Resource name** | `BX Finance Agent Gateway` |
| **Audience** | `https://agent-gateway.pingdemo.com` |

No attribute mappings or scopes needed.

---

### 1c. BX Finance MCP Server *(Agent Exchanged Token audience + Exchange #2 output)*

**Overview tab:**

| Field | Value |
|-------|-------|
| **Resource name** | `BX Finance MCP Server` |
| **Audience** | `https://mcp-server.pingdemo.com` |

**Attribute Mappings tab — `act` claim for Exchange #1 output:**

| Field | Value |
|-------|-------|
| **Attribute name** | `act` |
| **Expression** | `(#root.context.requestData.subjectToken?.may_act?.sub != null && #root.context.requestData.subjectToken?.may_act?.sub == #root.context.requestData.actorToken?.aud?.get(0))?#root.context.requestData.subjectToken?.may_act:null` |
| **Required** | ✅ Yes |

> **How to test:** See [PINGONE_MAY_ACT_ONE_TOKEN_EXCHANGE.md § 1b](PINGONE_MAY_ACT_ONE_TOKEN_EXCHANGE.md) for full test data and expected result — same expression, same pattern. Replace `PINGONE_CORE_CLIENT_ID` with `AI_AGENT_CLIENT_ID`.

**Scopes tab:** `banking:accounts:read`, `banking:transactions:read`, `banking:transactions:write`

---

### 1d. BX Finance MCP Gateway *(MCP actor token audience for Exchange #2)*

The MCP Service requests a Client Credentials token scoped to this audience to use as its `actor_token` in Exchange #2.

| Field | Value |
|-------|-------|
| **Resource name** | `BX Finance MCP Gateway` |
| **Audience** | `https://mcp-gateway.pingdemo.com` |

No attribute mappings or scopes needed.

---

### 1e. BX Finance Resource Server *(final MCP Exchanged Token audience)*

This is the protected resource the MCP Exchanged Token grants access to.

| Field | Value |
|-------|-------|
| **Resource name** | `BX Finance Resource Server` |
| **Audience** | `https://resource-server.pingdemo.com` |

**Attribute Mappings tab — `act` claim for Exchange #2 output:**

| Field | Value |
|-------|-------|
| **Attribute name** | `act` |
| **Expression** | `(#root.context.requestData.subjectToken?.act?.sub != null && #root.context.requestData.actorToken?.aud?.get(0) == #root.context.requestData.subjectToken?.act?.sub) ? {'sub': #root.context.requestData.actorToken?.aud?.get(0), 'act': #root.context.requestData.subjectToken?.act} : null` |
| **Required** | ✅ Yes |

> **Expression explained:** This nests the incoming `act` from the Agent Exchanged Token as `act.act` in the new token, and sets the outer `act.sub` to the MCP actor's identity (`actorToken.aud[0]`). The result is `{ "sub": "<MCP_CLIENT_ID>", "act": { "sub": "<AI_AGENT_CLIENT_ID>" } }`.

> **How to test:**
> ```json
> {
>   "context": {
>     "requestData": {
>       "subjectToken": {
>         "act": { "sub": "<AI_AGENT_CLIENT_ID>" }
>       },
>       "actorToken": {
>         "aud": ["<MCP_CLIENT_ID>"]
>       }
>     }
>   }
> }
> ```
> Expected result:
> ```json
> {
>   "sub": "<MCP_CLIENT_ID>",
>   "act": { "sub": "<AI_AGENT_CLIENT_ID>" }
> }
> ```

---

## Part 2 — Applications

> **PingOne Console → Applications → Applications**

---

### 2a. BX Finance User *(issues Subject Token)*

Same as the 1-exchange pattern — see [PINGONE_MAY_ACT_ONE_TOKEN_EXCHANGE.md § 2a](PINGONE_MAY_ACT_ONE_TOKEN_EXCHANGE.md).

Key difference: the user's `mayAct` attribute must be set to `{ "sub": "<AI_AGENT_CLIENT_ID>" }` — the AI Agent App's client ID, not the Banking App.

---

### 2b. Create: BX Finance AI Agent App *(performs Exchange #1)*

This app:
1. Gets its own Actor Token via Client Credentials (audience: `https://agent-gateway.pingdemo.com`)
2. Exchanges: `subject_token` = Subject Token + `actor_token` = Agent Actor Token → Agent Exchanged Token

**Configuration tab → Grant Types:**
- ✅ `Token Exchange`
- ✅ `Client Credentials`

**Resources tab:**
- ✅ `banking:accounts:read`, `banking:transactions:read`, `banking:transactions:write` from **BX Finance MCP Server**
- ✅ *(audience scope)* from **BX Finance Agent Gateway**

Copy the **Client ID** → this is `AI_AGENT_CLIENT_ID`. Set it as `mayAct.sub` on all test user records.

---

### 2c. BX Finance MCP Service *(performs Exchange #2)*

This app:
1. Gets its own Actor Token via Client Credentials (audience: `https://mcp-gateway.pingdemo.com`)
2. Exchanges: `subject_token` = Agent Exchanged Token + `actor_token` = MCP Actor Token → MCP Exchanged Token

**Configuration tab → Grant Types:**
- ✅ `Token Exchange`
- ✅ `Client Credentials`

**Resources tab:**
- ✅ `banking:accounts:read`, `banking:transactions:read`, `banking:transactions:write` from **BX Finance Resource Server**
- ✅ *(audience scope)* from **BX Finance MCP Gateway**
- ✅ `p1:read:user`, `p1:update:user` from **PingOne API** *(for Management API calls)*

---

## Part 3 — Token Exchange #1 API Reference

**Performed by: BX Finance AI Agent App**

Step 1 — Get Actor Token (Client Credentials):
```
POST https://auth.pingone.com/{envId}/as/token
Content-Type: application/x-www-form-urlencoded

client_id=AI_AGENT_CLIENT_ID
&client_secret=AI_AGENT_CLIENT_SECRET
&grant_type=client_credentials
&audience=https://agent-gateway.pingdemo.com
```

Step 2 — Exchange Subject Token for Agent Exchanged Token:
```
POST https://auth.pingone.com/{envId}/as/token
Content-Type: application/x-www-form-urlencoded

client_id=AI_AGENT_CLIENT_ID
&client_secret=AI_AGENT_CLIENT_SECRET
&grant_type=urn:ietf:params:oauth:grant-type:token-exchange
&subject_token=<Subject Token>
&subject_token_type=urn:ietf:params:oauth:token-type:access_token
&actor_token=<Agent Actor Token>
&actor_token_type=urn:ietf:params:oauth:token-type:access_token
&requested_token_type=urn:ietf:params:oauth:token-type:access_token
&audience=https://mcp-server.pingdemo.com
&scope=banking:accounts:read banking:transactions:read banking:transactions:write
```

PingOne validates: `subject_token.may_act.sub == actor_token.aud[0]` — both must equal `AI_AGENT_CLIENT_ID`.

---

## Part 4 — Token Exchange #2 API Reference

**Performed by: BX Finance MCP Service**

Step 1 — Get Actor Token (Client Credentials):
```
POST https://auth.pingone.com/{envId}/as/token
Content-Type: application/x-www-form-urlencoded

client_id=MCP_CLIENT_ID
&client_secret=MCP_CLIENT_SECRET
&grant_type=client_credentials
&audience=https://mcp-gateway.pingdemo.com
```

Step 2 — Exchange Agent Exchanged Token for MCP Exchanged Token:
```
POST https://auth.pingone.com/{envId}/as/token
Content-Type: application/x-www-form-urlencoded

client_id=MCP_CLIENT_ID
&client_secret=MCP_CLIENT_SECRET
&grant_type=urn:ietf:params:oauth:grant-type:token-exchange
&subject_token=<Agent Exchanged Token>
&subject_token_type=urn:ietf:params:oauth:token-type:access_token
&actor_token=<MCP Actor Token>
&actor_token_type=urn:ietf:params:oauth:token-type:access_token
&requested_token_type=urn:ietf:params:oauth:token-type:access_token
&audience=https://resource-server.pingdemo.com
&scope=banking:accounts:read banking:transactions:read banking:transactions:write
```

---

## Part 5 — Verification

Decode any token at [PingIdentity JWT Decoder](https://developer.pingidentity.com/en/tools/jwt-decoder.html) or in terminal:
```bash
echo "<token>" | cut -d. -f2 | tr '_-' '/+' | base64 -d 2>/dev/null | python3 -m json.tool
```

**Subject Token** (Token 1):
```json
{
  "aud": ["https://ai-agent.pingdemo.com"],
  "sub": "<user-id>",
  "scope": "profile email banking:agent:invoke",
  "may_act": { "sub": "<AI_AGENT_CLIENT_ID>" }
}
```

**Agent Exchanged Token** (Token 2 — after Exchange #1):
```json
{
  "aud": ["https://mcp-server.pingdemo.com"],
  "sub": "<user-id>",
  "scope": "banking:accounts:read banking:transactions:read banking:transactions:write",
  "act": { "sub": "<AI_AGENT_CLIENT_ID>" }
}
```

**MCP Exchanged Token** (Token 3 — after Exchange #2):
```json
{
  "aud": ["https://resource-server.pingdemo.com"],
  "sub": "<user-id>",
  "scope": "banking:accounts:read banking:transactions:read banking:transactions:write",
  "act": {
    "sub": "<MCP_CLIENT_ID>",
    "act": {
      "sub": "<AI_AGENT_CLIENT_ID>"
    }
  }
}
```

`act.sub` = MCP Service (performed Exchange #2). `act.act.sub` = AI Agent (performed Exchange #1). PAZ enforces both.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| Exchange #1: `invalid_grant` | `may_act.sub` on user ≠ AI Agent client ID | Set `mayAct = { "sub": "<AI_AGENT_CLIENT_ID>" }` on user (not Banking App UUID) |
| Exchange #1: `unauthorized_client` | Token Exchange grant not enabled on AI Agent App | Part 2b — enable Token Exchange grant |
| Exchange #2: `invalid_grant` | Agent Exchanged Token has no `act` claim | Check `act` expression on BX Finance MCP Server resource server (Step 1c) |
| Exchange #2: `unauthorized_client` | Token Exchange grant not enabled on MCP Service App | Part 2c — enable Token Exchange grant |
| Final token missing `act.act.sub` | `act` expression on BX Finance Resource Server is wrong | Check Step 1e expression — must nest incoming `act` as `act.act` |
| PAZ denies all requests | `act.sub` or `act.act.sub` not matching policy values | Check PAZ policy — values must be the client ID UUIDs, not URLs |

---

*See also: [PINGONE_MAY_ACT_ONE_TOKEN_EXCHANGE.md](PINGONE_MAY_ACT_ONE_TOKEN_EXCHANGE.md)*
