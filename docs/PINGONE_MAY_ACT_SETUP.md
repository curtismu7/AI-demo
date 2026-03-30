# PingOne: 3-Leg Delegated Token Chain — Setup Guide

Step-by-step setup for a **human → agent → MCP → PingOne API** delegated token chain.

**Product scope:** PingOne SaaS (`auth.pingone.com`).
This is NOT PingOne Advanced Identity Cloud (ForgeRock AM) — those are separate products.

---

## How It Works

> **What is Token Exchange (RFC 8693)?** An app POSTs an existing access token to PingOne's token endpoint with `grant_type=token-exchange`. PingOne validates the token, checks delegation permissions, and issues a *new* token scoped to a different audience. The original token is not modified — a fresh, narrower token is returned. Each exchange is a server-to-server call; the user is never redirected.

> **Design rule:** Keep chains to **3 exchanges or fewer**. Each exchange is a synchronous round-trip to PingOne. This chain uses **2**.

```
Human User (Banking App Login)
  │
  │  PKCE Authorization Code login — user authenticates normally
  ▼
Subject Token  [TOKEN 1 — user's session token]
  { sub: "<user-id>",
    aud: ["https://ai-agent.pingdemo.com"],      ← AI Agent service validates this token
    scope: "openid profile email banking:agent:invoke",
    may_act: { "sub": "https://agent-gateway.pingdemo.com" } }
              ↑ tells PingOne: the banking app server is PERMITTED to exchange this token
  │
  │  Token Exchange #1 (RFC 8693)
  │  Banking app server POSTs the Subject Token to PingOne's /token endpoint.
  │  PingOne checks: may_act.sub == requesting app's audience? → issues MCP Token.
  │  Exchanger: BX Finance Banking App (PINGONE_CORE_CLIENT_ID)
  ▼
MCP Token  [TOKEN 2 — delegated tool-call token]
  { sub: "<user-id>",
    aud: ["https://mcp-server.pingdemo.com"],   ← MCP Server validates this token
    scope: "banking:accounts:read banking:transactions:read banking:transactions:write",
    act: { "sub": "https://agent-gateway.pingdemo.com" } }
          ↑ records WHO performed Exchange #1 — verifiable delegation audit trail
  │
  │  Token Exchange #2 (RFC 8693)
  │  MCP server POSTs the MCP Token to PingOne's /token endpoint.
  │  PingOne issues a PingOne API token.  The full delegation chain is preserved
  │  in nested act claims: banking app → MCP server.
  │  Exchanger: BX Finance MCP Worker (MCP_CLIENT_ID)
  ▼
Resource Token  [TOKEN 3 — narrowest-scope PingOne API token]
  { sub: "<user-id>",
    aud: ["https://api.pingone.com"],             ← PingOne Management API validates this token
    scope: "p1:read:user p1:update:user",
    act: { "sub": "https://mcp-server.pingdemo.com",
           act: { "sub": "https://agent-gateway.pingdemo.com" } } }
                 ↑ nested act = full chain: banking app → MCP server (order = exchanges)
  │
  ▼
PingOne Management API  (/v1/environments/{envId}/users/{userId})
```

> **Every `aud` is different** — each token is scoped to exactly one service. That service's resource server validates the token; all others reject it. This is the core of RFC 8693 audience restriction.

| Token | Audience URL | Who validates it | Exchanger |
|-------|-------------|------------------|-----------|
| **Subject Token** | `https://ai-agent.pingdemo.com` | BX Finance AI Agent service | — (issued at user login) |
| **MCP Token** | `https://mcp-server.pingdemo.com` | BX Finance MCP Server | BX Finance Banking App |
| **Resource Token** | `https://api.pingone.com` | PingOne Management API | BX Finance MCP Worker |
| *(actor token)* | `https://agent-gateway.pingdemo.com` | *(internal — proves banking app identity for Exchange #1)* | — |

> **`may_act` → `act` transition:** `may_act` in the Subject Token declares who is *allowed* to exchange it. After exchange, that identity becomes the `act` claim. Each subsequent exchange nests a new `act` layer, forming a full delegation chain.

---

## Token Exchange Architecture

Two implementation options exist. **This demo uses Option 1.**

### Option 1: Banking App Server (current)
The banking app's server-side component holds the `PINGONE_CORE_CLIENT_ID` secret and exchanges the Subject Token for the MCP Token. This is secure because secrets stay on the server and tokens never touch the browser.

- **Pros:** Secrets never leave the server; tokens never touch the browser.
- **Cons:** Requires a deployed server-side app.

### Option 2: Client-side / direct
The browser (or agent) performs token exchange directly using a public client. Not used here.

- **Pros:** No server required; works in fully client-side apps.
- **Cons:** Client secrets cannot be safely stored in a browser; higher exposure risk.

---

## Reference: All Names and Values

Use this table as your single source of truth when filling in PingOne forms and your `.env` file.

| Item | Field | Exact value |
|------|-------|-------------|
| Agent Resource Server | Name | `BX Finance AI Agent` |
| Agent Resource Server | Audience | `https://ai-agent.pingdemo.com` |
| Agent Resource Server | Scope | `banking:agent:invoke` |
| MCP Resource Server | Name | `BX Finance MCP Server` |
| MCP Resource Server | Audience | `https://mcp-server.pingdemo.com` |
| MCP Resource Server | Scope 1 | `banking:accounts:read` |
| MCP Resource Server | Scope 2 | `banking:transactions:read` |
| MCP Resource Server | Scope 3 | `banking:transactions:write` |
| Agent Gateway Resource Server | Name | `BX Finance Agent Gateway` |
| Agent Gateway Resource Server | Audience | `https://agent-gateway.pingdemo.com` |
| User OIDC App | Name | `BX Finance User` |
| Banking App (exchanger app) | Name | `BX Finance Banking App` |
| MCP Worker App | Name | `BX Finance MCP Worker` |
| Agent Gateway audience URL | `may_act.sub` value | `https://agent-gateway.pingdemo.com` |
| User Schema Attribute | Attribute name | `mayAct` |
| User Schema Attribute | Type | `JSON` |
| Token Claim | Name | `may_act` |
| Token Claim | Value expression | `((#root.context.requestData.subjectToken.may_act.sub == #root.context.requestData.actorToken.aud[0])?#root.context.requestData.subjectToken.may_act:null)` |
| Env var — Subject Token audience | `ENDUSER_AUDIENCE` | `https://ai-agent.pingdemo.com` |
| Env var — MCP Token audience | `MCP_RESOURCE_URI` | `https://mcp-server.pingdemo.com` |
| Env var — Resource Token audience | `PINGONE_API_AUDIENCE` | `https://api.pingone.com` |
| Env var — Agent Gateway audience | `BFF_RESOURCE_URI` | `https://agent-gateway.pingdemo.com` |

---

## Part 1 — Resource Servers

> **PingOne Console → Applications → Resources**

---

### 1a. Create: BX Finance AI Agent  *(Subject Token audience)*

This resource server gives the Subject Token a meaningful audience URL. The AI Agent service checks that incoming tokens have `aud = https://ai-agent.pingdemo.com` before allowing tool invocations.

Click **Add Resource** and fill in exactly:

**Overview tab:**

| Field | Type in |
|-------|---------|
| **Resource name** | `BX Finance AI Agent` |
| **Audience** | `https://ai-agent.pingdemo.com` |
| **Description** | `Audience resource server for the BX Finance AI Agent The Subject Token issued at user login is scoped to this resource and carries the may act claim that authorizes token exchange` |
| **Access token time to live (seconds)** | `3600` |
| **Token Introspection Endpoint Authentication Method** | `Client Secret Basic` |

Click **Save**.

**Attribute Mappings tab:**

No mappings needed here. The `may_act` claim is configured on the **BX Finance User** application (Step 2a), not on the resource server. Leave this tab unchanged.

**Scopes tab → Add Scope:**

| Field | Type in |
|-------|---------|
| **Scope name** | `banking:agent:invoke` |
| **Description** | `Grants the bearer permission to invoke the BX Finance AI Agent on behalf of the authenticated user Present on the Subject Token validated by the banking app before token exchange` |

Click **Save**.

---

### 1b. Create: BX Finance MCP Server  *(MCP Token audience)*

Click **Add Resource** and fill in exactly:

**Overview tab:**

| Field | Type in |
|-------|---------|
| **Resource name** | `BX Finance MCP Server` |
| **Audience** | `https://mcp-server.pingdemo.com` |
| **Description** | `Audience resource server for the BX Finance MCP Model Context Protocol server MCP Tokens scoped to this resource are used for delegated banking tool calls` |
| **Access token time to live (seconds)** | `3600` |
| **Token Introspection Endpoint Authentication Method** | `Client Secret Basic` |

Click **Save**.

**Attribute Mappings tab:**

No mappings needed here. The MCP Token claims (`sub`, `act`, scopes) are produced entirely by the token exchange flow. Leave this tab unchanged.

**Scopes tab → Add three scopes:**

**Scope 1:**

| Field | Type in |
|-------|---------|
| **Scope name** | `banking:accounts:read` |
| **Description** | `Read access to the authenticated users bank account list and balances` |

**Scope 2:**

| Field | Type in |
|-------|---------|
| **Scope name** | `banking:transactions:read` |
| **Description** | `Read access to the authenticated users transaction history` |

**Scope 3:**

| Field | Type in |
|-------|---------|
| **Scope name** | `banking:transactions:write` |
| **Description** | `Write access to initiate transactions on behalf of the authenticated user Requires step up MFA for amounts above the configured threshold` |

Click **Save** after each scope.

---

### 1c. PingOne API  *(Resource Token audience — already exists, do not create)*

In **Applications → Resources** locate the built-in resource named **"PingOne API"**.

- **Audience**: `https://api.pingone.com` *(set by PingOne — do not modify)*
- Scopes `p1:read:user` and `p1:update:user` already exist — you will enable them on the MCP Worker app in Step 2c.
- **Attribute Mappings tab:** Leave unchanged. PingOne manages claims on this built-in resource.

---

### 1d. Create: BX Finance Agent Gateway  *(banking app actor token audience)*

This resource server exists solely to give the banking app server an audience URI that PingOne can verify during token exchange. When the banking app requests an actor token scoped to `https://agent-gateway.pingdemo.com`, PingOne can confirm the actor is really this app — not an impersonator.

Click **Add Resource** and fill in exactly:

**Overview tab:**

| Field | Type in |
|-------|---------|
| **Resource name** | `BX Finance Agent Gateway` |
| **Audience** | `https://agent-gateway.pingdemo.com` |
| **Description** | `Audience resource server for the BX Finance banking app server The banking app obtains a token scoped to this audience to use as its actor token during RFC 8693 token exchange The may act sub on user profiles must match this audience URI` |
| **Access token time to live (seconds)** | `3600` |
| **Token Introspection Endpoint Authentication Method** | `Client Secret Basic` |

Click **Save**.

**Attribute Mappings tab:**

No mappings needed. Leave this tab unchanged.

**Scopes tab:**

No scopes needed. This resource server is used purely for audience identity, not for granting capabilities.

> The Banking App application must be allowed to request tokens scoped to this audience. Enable **BX Finance Agent Gateway** on the Banking App's Resources tab in Step 2b.

---

## Part 2 — Applications

> **PingOne Console → Applications → Applications**

---

### 2a. Configure: BX Finance User  *(issues Subject Token)*

Open the existing end-user OIDC application. Verify or update:

**Overview tab:**

| Field | Type in |
|-------|---------|
| **Application name** | `BX Finance User` |
| **Description** | `End user web application for BX Finance banking customers Issues Subject Tokens via Authorization Code and PKCE The Subject Token carries may act authorizing the BFF Admin to perform token exchange` |
| **Icon** | *(optional — leave blank or upload a logo)* |
| **Home Page URL** | `https://banking-demo-puce.vercel.app` |
| **Signon URL** | `https://banking-demo-puce.vercel.app` |

**Configuration tab → Grant Types** — check exactly these:

- ✅ `Authorization Code`
- ✅ `Refresh Token`
- ❌ `Token Exchange` — do NOT enable on this app

**Configuration tab — other fields:**

| Field | Value |
|-------|-------|
| **PKCE enforcement** | `S256_REQUIRED` |
| **Token endpoint auth method** | `CLIENT_SECRET_POST` |
| **Redirect URIs** | `https://banking-demo-puce.vercel.app/api/auth/oauthuser/callback` |

**Resources tab → Allowed scopes — enable:**

- ✅ `banking:agent:invoke` from **BX Finance AI Agent**
- ✅ `openid`, `profile`, `email`, `offline_access` *(standard OIDC — already present)*

**Attribute Mappings tab → Add Attribute:**

| Field | Type in |
|-------|---------|
| **PingOne attribute** | `may_act` |
| **Application attribute** | `(#root.user.mayAct != null ? #root.user.mayAct : null)` |

> This reads the user's `mayAct` profile attribute and passes it through as the `may_act` claim on the Subject Token at login. Use the test data below to validate the expression in PingOne's **Build and Test Expression** dialog before saving.
>
> **How to test in PingOne:**
> 1. Click the pencil icon next to the `may_act` mapping → **Build and Test Expression** opens.
> 2. The expression field should contain: `(#root.user.mayAct != null ? #root.user.mayAct : null)`
> 3. In the **Test Data** field, paste:
> ```json
> {
>   "user": {
>     "mayAct": { "sub": "https://agent-gateway.pingdemo.com" }
>   }
> }
> ```
> 4. Click **Test Expression**.
> 5. The **Result** panel will show the full test data object echoed back — this is normal PingOne behaviour:
> ```json
> {
>   "user": {
>     "mayAct": {
>       "sub": "https://agent-gateway.pingdemo.com"
>     }
>   }
> }
> ```
> 6. Confirm **Verification Successful** appears in green in the top-right corner of the dialog. That's your confirmation the expression is valid and PingOne will add `may_act` to the Subject Token at login.
> 7. Click **Save**.

Click **Save**.

---

### 2b. Configure: BX Finance Banking App  *(exchanges Subject Token → MCP Token)*

This is the banking app's server-side component. It holds user sessions and performs Token Exchange #1: trading the user's Subject Token for a narrower MCP-scoped token. Its Client ID is what you store in `mayAct` on each user record.

Open the existing application. Verify or update:

**Overview tab:**

| Field | Type in |
|-------|---------|
| **Application name** | `BX Finance Banking App` |
| **Description** | `Banking app server Authenticates users and performs Token Exchange 1 to get an MCP-scoped token on behalf of the authenticated user The Client ID of this app must be set as the mayAct sub value on all user profiles that use the AI agent` |
| **Icon** | *(optional — leave blank or upload a logo)* |
| **Home Page URL** | `https://banking-demo-puce.vercel.app` |
| **Signon URL** | `https://banking-demo-puce.vercel.app` |

**Configuration tab → Grant Types — enable all of these:**

- ✅ `Authorization Code`
- ✅ `Refresh Token`
- ✅ `Token Exchange` ← **required — this grants permission to exchange Subject Tokens**
- ✅ `Client Initiated Backchannel Authentication (CIBA)` *(required for step-up auth)*

**Configuration tab — other fields:**

| Field | Value |
|-------|-------|
| **PKCE enforcement** | `S256_REQUIRED` |
| **Token endpoint auth method** | `CLIENT_SECRET_POST` |
| **Redirect URIs** | `https://banking-demo-puce.vercel.app/api/auth/oauth/callback` |

**Resources tab → Allowed scopes — enable:**

- ✅ `banking:accounts:read` from **BX Finance MCP Server**
- ✅ `banking:transactions:read` from **BX Finance MCP Server**
- ✅ `banking:transactions:write` from **BX Finance MCP Server**
- ✅ **BX Finance Agent Gateway** — tick the resource row itself (no individual scope to select). This allows the Banking App to request a token with `aud: ["https://agent-gateway.pingdemo.com"]`, which it presents as the *actor token* during Token Exchange #1 so PingOne can verify the exchanger's identity.

> **Why this matters:** Without this, the Banking App cannot obtain an actor token for Token Exchange #1 and the exchange will fail with `unauthorized_client`.

**Attribute Mappings tab → Add Attribute:**

| Field | Type in |
|-------|---------|
| **PingOne attribute** | `may_act` |
| **Application attribute** | `((#root.context.requestData.subjectToken.may_act.sub == #root.context.requestData.actorToken.aud[0])?#root.context.requestData.subjectToken.may_act:null)` |

> **What this expression does:** PingOne evaluates this during Token Exchange #1. It reads `may_act.sub` from the incoming Subject Token and compares it to `aud[0]` of the actor token (the banking app server requesting the exchange). If they match — meaning the user pre-authorized this specific app — `may_act` is carried forward into the MCP Token as the `act` claim. Otherwise `null` is returned and the claim is dropped, blocking the exchange.

Click **Save**. This value is what you must set as `mayAct.sub` on user profiles (Part 3c) and as `PINGONE_CORE_CLIENT_ID` in your env vars.

---

### 2c. Create: BX Finance MCP Worker  *(exchanges MCP Token → Resource Token)*

Click **Add Application**:

**Overview tab:**

| Field | Type in |
|-------|---------|
| **Application name** | `BX Finance MCP Worker` |
| **Description** | `Machine to machine worker application for the BX Finance MCP server Exchanges MCP Tokens for Resource Tokens to call the PingOne Management API on behalf of authenticated users The delegation chain is preserved in the nested act claim on the Resource Token` |
| **Icon** | *(optional — leave blank)* |
| **Home Page URL** | *(leave blank — worker app has no UI)* |
| **Signon URL** | *(leave blank — worker app has no UI)* |
| **Application type** | `Worker` |

**Configuration tab → Grant Types:**

- ✅ `Client Credentials`
- ✅ `Token Exchange` ← **required — this grants permission to exchange MCP Tokens**

**Configuration tab:**

| Field | Value |
|-------|-------|
| **Token endpoint auth method** | `CLIENT_SECRET_POST` |

**Resources tab → Allowed scopes — enable:**

- ✅ `p1:read:user` from **PingOne API**
- ✅ `p1:update:user` from **PingOne API**

**Attribute Mappings tab:**

No mappings needed. The Resource Token's `act` chain is produced by the token exchange flow, not by application attribute definitions. Leave this tab unchanged.

Click **Save**, then copy the **Client ID** and **Client Secret** — these become `MCP_CLIENT_ID` and `MCP_CLIENT_SECRET` on the MCP server.

---

## Part 3 — User Schema and Token Claim

---

### 3a. Add `mayAct` to User Schema

> **Directory → User Schema → Add Attribute**

| Field | Type in |
|-------|---------|
| **Attribute name** | `mayAct` |
| **Display name** | `May Act` |
| **Description** | `JSON object identifying the OAuth client authorized to exchange this users Subject Token Must be set to the audience URI of BX Finance Agent Gateway PingOne validates this claim on every token exchange request` |
| **Type** | `JSON` |
| **Required** | `No` |
| **Unique** | `No` |
| **Multivalued** | `No` |

Click **Save**.

---

### 3b. Verify `may_act` in a Subject Token

After completing Steps 1–3a, log in as the test user from a browser and inspect the Subject Token. Decode it at [jwt.io](https://jwt.io) and confirm the payload contains:

```json
{
  "may_act": { "sub": "https://agent-gateway.pingdemo.com" }
}
```

If `may_act` is absent:
- Confirm the `mayAct` attribute was set on the user record (Step 3c)
- Confirm the Attribute Mapping was added to `BX Finance User` (Step 2a)
- Confirm `banking:agent:invoke` scope is in the authorize request (`ENDUSER_AUDIENCE` is set)

---

### 3c. Set `mayAct` on the User Record

The value must be `https://agent-gateway.pingdemo.com` — the Agent Gateway audience URL. This tells PingOne which app server is permitted to exchange this user's token.

**Option A — PingOne Admin Console:**
1. **Directory → Users** → open the user
2. Find **Custom Attributes → mayAct**
3. Enter:
```json
{ "sub": "https://agent-gateway.pingdemo.com" }
```

**Option B — PingOne Management API:**
```bash
PATCH https://api.pingone.com/v1/environments/{envId}/users/{userId}
Authorization: Bearer <token with p1:update:user>
Content-Type: application/json

{ "mayAct": { "sub": "https://agent-gateway.pingdemo.com" } }
```

**Option C — BX Finance Demo App:**
1. Navigate to `/demo-data`
2. Click **Enable may_act** — the banking app server reads its own `PINGONE_CORE_CLIENT_ID` and writes it to the user's `mayAct` attribute automatically via the Management API.

---

## Part 4 — Environment Variables

### `banking_api_server/.env`  (or Vercel environment variables)

```env
# ── PingOne Environment ────────────────────────────────────────────────────────
PINGONE_ENVIRONMENT_ID=<your-pingone-environment-id>
PINGONE_REGION=com

# ── BX Finance User app (issues Subject Token) ────────────────────────────────
PINGONE_CORE_USER_CLIENT_ID=<Client ID of "BX Finance User">
PINGONE_CORE_USER_CLIENT_SECRET=<Client Secret of "BX Finance User">

# ── BX Finance Banking App (exchanges Subject Token → MCP Token) ──────────────
PINGONE_CORE_CLIENT_ID=<Client ID of "BX Finance Banking App">
PINGONE_CORE_CLIENT_SECRET=<Client Secret of "BX Finance Banking App">

# ── Subject Token audience  (must exactly match "BX Finance AI Agent" Audience)
ENDUSER_AUDIENCE=https://ai-agent.pingdemo.com

# ── MCP Token audience  (must exactly match "BX Finance MCP Server" Audience) ─
MCP_RESOURCE_URI=https://mcp-server.pingdemo.com

# ── Feature flag: keep false so banking:agent:invoke scope is included in /authorize ─────────
# ff_oidc_only_authorize=false
```

### `banking_mcp_server/.env`  (on the MCP server)

```env
# ── BX Finance MCP Worker app (exchanges MCP Token → Resource Token) ──────────
MCP_CLIENT_ID=<Client ID of "BX Finance MCP Worker">
MCP_CLIENT_SECRET=<Client Secret of "BX Finance MCP Worker">

# ── Resource Token audience  (PingOne Management API — fixed value) ───────────
PINGONE_API_AUDIENCE=https://api.pingone.com

# ── PingOne token endpoint ────────────────────────────────────────────────────
PINGONE_ENVIRONMENT_ID=<your-pingone-environment-id>
PINGONE_REGION=com
```

---

## Part 5 — Token Exchange API Reference

### Subject Token → MCP Token  (Token Exchange #1)

Performed by: **BX Finance Banking App** using `PINGONE_CORE_CLIENT_ID` / `PINGONE_CORE_CLIENT_SECRET`

The banking app server calls PingOne's token endpoint, presenting the user's Subject Token as the `subject_token` and its own access token (audience `https://agent-gateway.pingdemo.com`) as the `actor_token`. PingOne checks that `subject_token.may_act.sub` matches `actor_token.aud[0]` before issuing the MCP Token.

```
POST https://auth.pingone.com/{PINGONE_ENVIRONMENT_ID}/as/token
Content-Type: application/x-www-form-urlencoded

client_id=PINGONE_CORE_CLIENT_ID
&client_secret=PINGONE_CORE_CLIENT_SECRET
&grant_type=urn:ietf:params:oauth:grant-type:token-exchange
&subject_token=<Subject Token access_token>
&subject_token_type=urn:ietf:params:oauth:token-type:access_token
&requested_token_type=urn:ietf:params:oauth:token-type:access_token
&audience=https://mcp-server.pingdemo.com
&scope=banking:accounts:read banking:transactions:read banking:transactions:write
```

PingOne validates: `subject_token.may_act.sub` === `actor_token.aud[0]` (`https://agent-gateway.pingdemo.com`) — if they match, issues MCP Token with `act.sub = https://agent-gateway.pingdemo.com`.

### MCP Token → Resource Token  (Token Exchange #2)

Performed by: **BX Finance MCP Worker** using `MCP_CLIENT_ID` / `MCP_CLIENT_SECRET`

The MCP server calls PingOne's token endpoint, presenting the MCP Token as the `subject_token`. PingOne issues a Resource Token scoped to `https://api.pingone.com` with a nested `act` chain recording the full delegation path.

```
POST https://auth.pingone.com/{PINGONE_ENVIRONMENT_ID}/as/token
Content-Type: application/x-www-form-urlencoded

client_id=MCP_CLIENT_ID
&client_secret=MCP_CLIENT_SECRET
&grant_type=urn:ietf:params:oauth:grant-type:token-exchange
&subject_token=<MCP Token access_token>
&subject_token_type=urn:ietf:params:oauth:token-type:access_token
&requested_token_type=urn:ietf:params:oauth:token-type:access_token
&audience=https://api.pingone.com
&scope=p1:read:user p1:update:user
```

---

## Part 6 — Verification

Decode any token at [jwt.io](https://jwt.io) or in terminal:
```bash
echo "<token>" | cut -d. -f2 | tr '_-' '/+' | base64 -d 2>/dev/null | python3 -m json.tool
```

**Subject Token** — issued at login (Token 1 of 3):
```json
{
  "iss": "https://auth.pingone.com/{envId}/as",
  "aud": ["https://ai-agent.pingdemo.com"],
  "sub": "<user-pingone-id>",
  "scope": "openid profile email banking:agent:invoke",
  "may_act": { "sub": "https://agent-gateway.pingdemo.com" }
}
```
`may_act.sub` = the Agent Gateway audience URL. This is the permission slip: only the banking app server holding an actor token with `aud = https://agent-gateway.pingdemo.com` can exchange this token.

**MCP Token** — after Token Exchange #1 (Token 2 of 3):
```json
{
  "aud": ["https://mcp-server.pingdemo.com"],
  "sub": "<user-pingone-id>",
  "scope": "banking:accounts:read banking:transactions:read banking:transactions:write",
  "act": { "sub": "https://agent-gateway.pingdemo.com" }
}
```
`act.sub` = verifiable proof the banking app server performed Exchange #1 on the user's behalf.

**Resource Token** — after Token Exchange #2 (Token 3 of 3):
```json
{
  "aud": ["https://api.pingone.com"],
  "sub": "<user-pingone-id>",
  "scope": "p1:read:user p1:update:user",
  "act": {
    "sub": "https://mcp-server.pingdemo.com",
    "act": { "sub": "https://agent-gateway.pingdemo.com" }
  }
}
```
Nested `act` = full delegation chain. Outermost `act.sub` = MCP server (Exchange #2); inner `act.act.sub` = banking app (Exchange #1).

---

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| Subject Token `aud` is the app client ID, not `https://ai-agent.pingdemo.com` | `ENDUSER_AUDIENCE` not set, or `resource=` missing from `/authorize` | Set `ENDUSER_AUDIENCE=https://ai-agent.pingdemo.com`; ensure `ff_oidc_only_authorize=false` |
| `invalid_scope: banking:agent:invoke` on login | Scope not allowed on `BX Finance User` app | Part 2a — enable `banking:agent:invoke` scope on the Resources tab |
| `may_act` missing from Subject Token | Token claim mapping missing, or user's `mayAct` attribute is null | Part 3b (add claim map) and Part 3c (set attribute on user) |
| `may_act` is a plain string, not an object | `mayAct` schema attribute type is `STRING` | Delete and re-create as type `JSON`; re-set the value on the user |
| Subject Token → MCP Token: `invalid_grant` | `may_act.sub` doesn't match the Agent Gateway audience URL | Set `mayAct` = `{ "sub": "https://agent-gateway.pingdemo.com" }` on the user |
| Subject Token → MCP Token: `unauthorized_client` | `BX Finance Banking App` missing Token Exchange grant type | Part 2b — enable Token Exchange grant |
| MCP Token → Resource Token: `invalid_scope: p1:read:user` | `BX Finance MCP Worker` not allowed that scope | Part 2c — enable `p1:read:user` on the worker app's Resources tab |
| `May not request scopes for multiple resources` on login | `banking:agent:invoke` and `banking:*` scopes mixed in the same `/authorize` | Keep only `banking:agent:invoke` as a non-OIDC scope on the user app; `banking:*` scopes come via exchange, not direct login |

---

*See also: [ACT_CLAIM_VERIFICATION.md](ACT_CLAIM_VERIFICATION.md)*
