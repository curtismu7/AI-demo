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

## Coexistence with 1-Exchange — What to Reuse vs Create

> **Running both modes in the same demo?** No duplication of apps or resource servers is needed. The `ff_two_exchange_delegation` feature flag in the BFF toggles the BFF between the two code paths at runtime. The DemoDataPage **Delegation Mode** radio button sets `mayAct.sub` on the user record to the correct client ID for the selected mode.

| Object | 1-Exchange role | 2-Exchange role | Action |
|--------|-----------------|-----------------|--------|
| **BX Finance AI Agent** (resource server) | Subject Token audience | Subject Token audience | ✅ Reuse — no config change |
| **BX Finance Agent Gateway** (resource server) | Banking App actor token audience | AI Agent actor token audience | ✅ Reuse — no config change |
| **BX Finance MCP Server** (resource server) | Final MCP Token audience | Exchange #1 output audience | ✅ Reuse — same `act` expression works for both; PingOne checks `may_act.sub == actorToken.aud[0]` regardless of which UUID is in each field |
| **BX Finance User** (app) | OIDC login | OIDC login | ✅ Reuse — no change |
| **BX Finance Banking App** (app) | Exchange #1 exchanger | Not in the exchange chain (BFF bypasses it when flag is ON) | ✅ Reuse — keep the app; 2-exchange does not break or remove it |
| **BX Finance MCP Service** (app) | Client Credentials for PingOne API | Exchange #2 exchanger + Client Credentials for PingOne API | ✅ Modify — add `Token Exchange` grant; enable BX Finance MCP Gateway and BX Finance Resource Server scopes |
| **PingOne API** (built-in resource server) | CC token audience | CC token audience | ✅ Reuse — no change |
| **`mayAct` user schema attribute** | Holds Banking App UUID | Holds AI Agent App UUID | ✅ Reuse schema — change the **value** on user records |
| **BX Finance AI Agent App** (app) | — | Exchange #1 exchanger | 🆕 Create new |
| **BX Finance MCP Gateway** (resource server) | — | MCP Service actor token audience | 🆕 Create new |
| **BX Finance Resource Server** (resource server) | — | Final MCP Exchanged Token audience | 🆕 Create new |

**The only per-user change** is `mayAct.sub` — it must point to `AI_AGENT_CLIENT_ID` for 2-exchange (vs Banking App client ID for 1-exchange). The DemoDataPage **Delegation Mode** radio button and **Enable may_act** button set this automatically.

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

> **If you have 1-exchange set up:** This resource server already exists. No configuration changes are needed — the `may_act` expression (`user.mayAct`) is identical. The only runtime difference is the value in `mayAct.sub` on user records: for 2-exchange it must be the **AI Agent App client ID** (`AI_AGENT_CLIENT_ID`).

This resource server gives the Subject Token a meaningful audience URL and injects the `may_act` claim that authorizes the AI Agent to perform Exchange #1.

Click **Add Resource** (or open the existing one) and fill in:

**Overview tab:**

| Field | Value |
|-------|-------|
| **Resource name** | `BX Finance AI Agent` |
| **Audience** | `https://ai-agent.pingdemo.com` |
| **Description** | `Audience resource server for the BX Finance AI Agent. The Subject Token issued at user login is scoped to this resource and carries the may_act claim that authorizes token exchange.` |
| **Access token time to live (seconds)** | `3600` |
| **Token Introspection Endpoint Authentication Method** | `Client Secret Basic` |

Click **Save**.

**Attribute Mappings tab → Add one attribute:**

| Field | Value |
|-------|-------|
| **Attribute name** | `may_act` |
| **Expression** | `user.mayAct` |
| **Required** | ❌ No |

> **Expression syntax:** Use bare SpEL — no `${}` wrapper, no `#root.` prefix. `user.mayAct` reads the `mayAct` JSON attribute from the user profile. If the attribute is null, PingOne omits the claim (because Required is off).
>
> **How to test in PingOne:**
> 1. Click the pencil icon next to the `may_act` row → **Build and Test Expression** opens.
> 2. Expression field: `user.mayAct`
> 3. Click **Edit JSON** in the Test Data panel and paste — replacing `<AI_AGENT_CLIENT_ID>` with the AI Agent App client ID UUID:
> ```json
> {
>   "user": {
>     "mayAct": { "sub": "<AI_AGENT_CLIENT_ID>" }
>   }
> }
> ```
> 4. Click **Test Expression** — Result panel shows `{ "sub": "<AI_AGENT_CLIENT_ID>" }` — **Verification Successful**.
> 5. Remove `mayAct` from the test data and re-test — result should be `null` (claim omitted, no error).
>
> **Common mistake:** `${user.mayAct}` and `#root.user.mayAct` are both invalid. Use `user.mayAct` with no wrapper.

Click **Save**.

**Scopes tab → Add Scope:**

| Field | Value |
|-------|-------|
| **Scope name** | `banking:agent:invoke` |
| **Description** | `Grants permission to invoke the BX Finance AI Agent on behalf of the authenticated user. Present on the Subject Token.` |

Click **Save**.

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
| **Expression** | `#root.context.requestData.subjectToken?.act?.sub != null ? #root.context.requestData.subjectToken?.act : null` |
| **Required** | ✅ Yes |

> **Expression explained:** This forwards the `act` claim from the Agent Exchanged Token (Exchange #1 output) into the final MCP Exchanged Token. The result is `{ "sub": "<AI_AGENT_CLIENT_ID>" }` — showing that the AI Agent initiated the delegation chain on behalf of the user.
>
> **PingOne SpEL limitation:** PingOne does not support inline object/map construction (`{'key': value}` syntax) in attribute expressions. As a result, the fully nested RFC 8693 §5.4 structure `{ "sub": "<MCP_CLIENT_ID>", "act": { "sub": "<AI_AGENT_CLIENT_ID>" } }` is not achievable as a single expression. The expression above returns the AI Agent's identity as `act.sub`, which preserves the delegation proof. The BFF's `two-ex-final-token` tokenEvent log records both actors separately.

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
> { "sub": "<AI_AGENT_CLIENT_ID>" }
> ```

---

## Part 2 — Applications

> **PingOne Console → Applications → Applications**

---

### 2a. BX Finance User *(issues Subject Token)*

> **If you have 1-exchange set up:** This app already exists. No grant type or redirect URI changes are needed. Confirm `banking:agent:invoke` is enabled on the Resources tab (it should be from 1-exchange setup). No attribute mapping changes needed.

Open (or create) the end-user OIDC application:

**Overview tab:**

| Field | Value |
|-------|-------|
| **Application name** | `BX Finance User` |
| **Home Page URL** | `https://banking-demo-puce.vercel.app` |
| **Signon URL** | `https://banking-demo-puce.vercel.app` |

**Configuration tab → Grant Types — check exactly these:**

- ✅ `Authorization Code`
- ✅ `Refresh Token`
- ❌ `Token Exchange` — do NOT enable on this app

| Field | Value |
|-------|-------|
| **PKCE enforcement** | `S256_REQUIRED` |
| **Token endpoint auth method** | `CLIENT_SECRET_POST` |
| **Redirect URIs** | `https://banking-demo-puce.vercel.app/api/auth/oauthuser/callback` |

**Resources tab → Allowed scopes — enable:**

- ✅ `banking:agent:invoke` from **BX Finance AI Agent**
- ✅ `profile`, `email`, `offline_access` *(standard — already present)*
- ❌ Do **NOT** enable `openid` — it causes `invalid_scope` when `resource=https://ai-agent.pingdemo.com` is present in the authorize request

**Attribute Mappings tab:** Leave unchanged. The `may_act` claim in the access token is produced by the expression on the **BX Finance AI Agent resource server** (Step 1a) — not here. Application attribute mappings only deliver to UserInfo and ID Token, not access tokens.

Click **Save**.

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

### 2c. Configure: BX Finance MCP Service *(performs Exchange #2 + PingOne API calls)*

> **If you have 1-exchange set up:** This app already exists with `Client Credentials` grant and `p1:read:user`/`p1:update:user` scopes. You need to: (1) add `Token Exchange` grant on the Configuration tab, (2) enable scopes from **BX Finance MCP Gateway** and **BX Finance Resource Server** on the Resources tab.

This app performs two roles in the 2-exchange chain:
1. Gets its own Actor Token via Client Credentials (audience: `https://mcp-gateway.pingdemo.com`) to use as `actor_token` in Exchange #2
2. Exchanges: `subject_token` = Agent Exchanged Token + `actor_token` = MCP Actor Token → MCP Exchanged Token
3. Gets a separate Client Credentials token for PingOne Management API calls (`p1:read:user`, `p1:update:user`)

**Configuration tab → Grant Types:**
- ✅ `Token Exchange`
- ✅ `Client Credentials`

| Field | Value |
|-------|-------|
| **Token endpoint auth method** | `CLIENT_SECRET_POST` |

**Resources tab → Allowed scopes — enable:**

- ✅ `banking:accounts:read`, `banking:transactions:read`, `banking:transactions:write` from **BX Finance Resource Server**
- ✅ *(audience scope — no named scope needed)* from **BX Finance MCP Gateway**
- ✅ `p1:read:user`, `p1:update:user` from **PingOne API** *(for Management API calls)*

Copy the **Client ID** → `AGENT_OAUTH_CLIENT_ID` env var. Copy the **Client Secret** → `AGENT_OAUTH_CLIENT_SECRET` env var.

---

## Part 3 — User Schema and mayAct Setup

> **If you have 1-exchange set up:** The `mayAct` schema attribute already exists. Skip Step 3a. For Step 3b, you only need to change the value — replace the Banking App UUID with `AI_AGENT_CLIENT_ID`. The DemoDataPage **Delegation Mode** radio → **Enable may_act** handles this automatically.

---

### 3a. Add `mayAct` to User Schema

> **PingOne Console → Directory → User Schema → Add Attribute**

| Field | Value |
|-------|-------|
| **Attribute name** | `mayAct` |
| **Display name** | `May Act` |
| **Description** | `JSON object identifying the OAuth client authorized to exchange this user's Subject Token. Must match the client ID UUID of the authorized exchanger app.` |
| **Type** | `JSON` |
| **Required** | `No` |
| **Unique** | `No` |
| **Multivalued** | `No` |

Click **Save**.

---

### 3b. Set `mayAct` on the User Record

The value must be the **client ID UUID of BX Finance AI Agent App** (`AI_AGENT_CLIENT_ID`). PingOne compares this against `actorToken.aud[0]` during Exchange #1 — they must match exactly.

**Option A — PingOne Admin Console:**
1. **Directory → Users** → open the user
2. Find **Custom Attributes → mayAct**
3. Enter:
```json
{ "sub": "<AI_AGENT_CLIENT_ID>" }
```

**Option B — PingOne Management API:**
```bash
PATCH https://api.pingone.com/v1/environments/{envId}/users/{userId}
Authorization: Bearer <token with p1:update:user>
Content-Type: application/json

{ "mayAct": { "sub": "<AI_AGENT_CLIENT_ID>" } }
```

**Option C — BX Finance Demo App (recommended):**
Navigate to `/demo-data` → **Token Exchange — may_act demo** section → select **2-Exchange — AI Agent Client ID** radio button → click **Enable may_act**.

> **Common mistake:** Using a URL (e.g. `https://agent.example.com`) as `mayAct.sub` instead of the UUID. PingOne compares against `actorToken.aud[0]` which is the UUID — they will not match. Always use the client ID UUID.

---

### 3c. Verify `may_act` in a Subject Token

After logging in, decode the Subject Token at [PingIdentity JWT Decoder](https://developer.pingidentity.com/en/tools/jwt-decoder.html) and confirm:

```json
{
  "may_act": { "sub": "<AI_AGENT_CLIENT_ID>" }
}
```

`may_act.sub` must be the **UUID** of BX Finance AI Agent App — not a URL.

If `may_act` is absent:
- Confirm `mayAct` attribute was set on the user record (Step 3b)
- Confirm the `may_act` Attribute Mapping is on **BX Finance AI Agent** resource server (Step 1a)
- Confirm `banking:agent:invoke` scope is enabled and present in the authorize request

---

## Part 4 — Token Exchange #1 API Reference

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

## Part 5 — Token Exchange #2 API Reference

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

## Part 6 — Verification

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
