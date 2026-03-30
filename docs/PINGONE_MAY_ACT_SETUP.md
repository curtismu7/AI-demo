# PingOne: 3-Leg Delegated Token Chain — Setup Guide

Step-by-step setup for a **human → agent → MCP → PingOne API** delegated token chain.

**Product scope:** PingOne SaaS (`auth.pingone.com`).
This is NOT PingOne Advanced Identity Cloud (ForgeRock AM) — those are separate products.

---

## How It Works

```
Human User (Banking App Login)
  │
  │  PKCE Authorization Code login
  ▼
Subject Token
  { sub: "<user-id>",
    aud: ["https://subject.pingdemo.com"],
    scope: "openid profile email banking:agent:invoke",
    may_act: { "sub": "https://bff.pingdemo.com" } }
  │
  │  BFF performs token exchange  (Subject Token → MCP Token)
  │  Exchanger: BX Finance BFF Admin (PINGONE_CORE_CLIENT_ID)
  ▼
MCP Token
  { sub: "<user-id>",
    aud: ["https://mcp-server.pingdemo.com"],
    scope: "banking:accounts:read banking:transactions:read banking:transactions:write",
    act: { "sub": "https://bff.pingdemo.com" } }
  │
  │  MCP server performs token exchange  (MCP Token → Resource Token)
  │  Exchanger: BX Finance MCP Worker (MCP_CLIENT_ID)
  ▼
Resource Token
  { sub: "<user-id>",
    aud: ["https://api.pingone.com"],
    scope: "p1:read:user p1:update:user",
    act: { "sub": "https://mcp-server.pingdemo.com",
           act: { "sub": "https://bff.pingdemo.com" } } }
  │
  ▼
PingOne Management API  (/v1/environments/{envId}/users/{userId})
```

| Token | Issued by | Exchanger | Audience URI |
|-------|-----------|-----------|-------------|
| **Subject Token** | PingOne AS (PKCE login) | — | `https://subject.pingdemo.com` |
| **MCP Token** | PingOne AS (token exchange) | BX Finance BFF Admin | `https://mcp-server.pingdemo.com` |
| **Resource Token** | PingOne AS (token exchange) | BX Finance MCP Worker | `https://api.pingone.com` |

> **`may_act` → `act` transition:** `may_act` in the Subject Token declares who is *allowed* to exchange it. After exchange, that identity becomes the `act` claim. Each subsequent exchange nests a new `act` layer, forming a full delegation chain.

---

## Token Exchange Architecture

Two implementation options exist. **This demo uses Option 1.**

### Option 1: BFF (current)
The existing pattern. A server-side Backend-for-Frontend (BFF) holds the `PINGONE_CORE_CLIENT_ID` secret and exchanges the Subject Token for the MCP Token.

- **Pros:** Secrets never leave the server; tokens never touch the browser.
- **Cons:** Requires a deployed BFF server.

### Option 2: Client-side / direct
The browser (or agent) performs token exchange directly using a public client. Not used here.

- **Pros:** No BFF required; works in fully client-side apps.
- **Cons:** Client secrets cannot be safely stored in a browser; higher exposure risk.

---

## Reference: All Names and Values

Use this table as your single source of truth when filling in PingOne forms and your `.env` file.

| Item | Field | Exact value |
|------|-------|-------------|
| Agent Resource Server | Name | `BX Finance AI Agent` |
| Agent Resource Server | Audience | `https://subject.pingdemo.com` |
| Agent Resource Server | Scope | `banking:agent:invoke` |
| MCP Resource Server | Name | `BX Finance MCP Server` |
| MCP Resource Server | Audience | `https://mcp-server.pingdemo.com` |
| MCP Resource Server | Scope 1 | `banking:accounts:read` |
| MCP Resource Server | Scope 2 | `banking:transactions:read` |
| MCP Resource Server | Scope 3 | `banking:transactions:write` |
| BFF Resource Server | Name | `BX Finance Agent BFF` |
| BFF Resource Server | Audience | `https://bff.pingdemo.com` |
| User OIDC App | Name | `BX Finance User` |
| BFF Admin App | Name | `BX Finance BFF Admin` |
| MCP Worker App | Name | `BX Finance MCP Worker` |
| BFF audience URL | `may_act.sub` value | `https://bff.pingdemo.com` |
| User Schema Attribute | Attribute name | `mayAct` |
| User Schema Attribute | Type | `JSON` |
| Token Claim | Name | `may_act` |
| Token Claim | Value expression | `((#root.context.requestData.subjectToken.may_act.sub == #root.context.requestData.actorToken.aud[0])?#root.context.requestData.subjectToken.may_act:null)` |
| Env var — Subject Token audience | `ENDUSER_AUDIENCE` | `https://subject.pingdemo.com` |
| Env var — MCP Token audience | `MCP_RESOURCE_URI` | `https://mcp-server.pingdemo.com` |
| Env var — Resource Token audience | `PINGONE_API_AUDIENCE` | `https://api.pingone.com` |

---

## Part 1 — Resource Servers

> **PingOne Console → Applications → Resources**

---

### 1a. Create: BX Finance AI Agent  *(Subject Token audience)*

Click **Add Resource** and fill in exactly:

| Field | Type in |
|-------|---------|
| **Resource name** | `BX Finance AI Agent` |
| **Audience** | `https://subject.pingdemo.com` |
| **Description** | `Audience resource server for the BX Finance AI Agent The Subject Token issued at user login is scoped to this resource and carries the may act claim that authorizes token exchange` |
| **Access token time to live (seconds)** | `3600` |
| **Token Introspection Endpoint Authentication Method** | `Client Secret Post` |

Click **Save**, then open the resource and go to **Scopes → Add Scope**:

| Field | Type in |
|-------|---------|
| **Scope name** | `banking:agent:invoke` |
| **Description** | `Grants the bearer permission to invoke the BX Finance AI Agent on behalf of the authenticated user Present on the Subject Token validated by the BFF before token exchange` |

Click **Save**.

> Attribute mapping for `may_act` is configured on the **BX Finance User** application in Step 2a, not on the resource server.

---

### 1b. Create: BX Finance MCP Server  *(MCP Token audience)*

Click **Add Resource** and fill in exactly:

| Field | Type in |
|-------|---------|
| **Resource name** | `BX Finance MCP Server` |
| **Audience** | `https://mcp-server.pingdemo.com` |
| **Description** | `Audience resource server for the BX Finance MCP Model Context Protocol server MCP Tokens scoped to this resource are used for delegated banking tool calls` |
| **Access token time to live (seconds)** | `3600` |
| **Token Introspection Endpoint Authentication Method** | `Client Secret Post` |

Click **Save**, then add three scopes:

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

> No attribute mappings are needed on this resource server. The MCP Token claims (`sub`, `act`, scopes) are produced by the token exchange flow, not by resource-server attribute definitions.

---

### 1c. PingOne API  *(Resource Token audience — already exists, do not create)*

In **Applications → Resources** locate the built-in resource named **"PingOne API"**.

- **Audience**: `https://api.pingone.com` *(set by PingOne — do not modify)*
- Scopes `p1:read:user` and `p1:update:user` already exist — you will enable them on the MCP Worker app in Step 2c.

---

### 1d. Create: BX Finance Agent BFF  *(BFF actor token audience)*

Click **Add Resource** and fill in exactly:

| Field | Type in |
|-------|---------|
| **Resource name** | `BX Finance Agent BFF` |
| **Audience** | `https://bff.pingdemo.com` |
| **Description** | `Audience resource server for the BX Finance BFF admin application The BFF obtains a token scoped to this resource to use as its actor token during RFC 8693 token exchange The may act sub on user profiles must match this audience URI` |
| **Access token time to live (seconds)** | `3600` |
| **Token Introspection Endpoint Authentication Method** | `Client Secret Post` |

Click **Save**. No scopes needed on this resource server.

> The BFF Admin application must be allowed to request tokens scoped to this audience. Enable **BX Finance Agent BFF** on the BFF Admin app's Resources tab in Step 2b.

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
> **Test data** — paste into the Test Data field:
> ```json
> {
>   "user": {
>     "mayAct": { "sub": "https://bff.pingdemo.com" }
>   }
> }
> ```
> **Expected result:** `{ "sub": "https://bff.pingdemo.com" }`
>
> If the expression is invalid, try clicking **View Documentation** in the dialog for the supported SpEL syntax in your PingOne environment.

Click **Save**.

---

### 2b. Configure: BX Finance BFF Admin  *(exchanges Subject Token → MCP Token)*

Open the existing Backend-for-Frontend (BFF) admin application. Verify or update:

**Overview tab:**

| Field | Type in |
|-------|---------|
| **Application name** | `BX Finance BFF Admin` |
| **Description** | `BFF admin application Authenticates admin users and exchanges Subject Tokens for MCP Tokens on behalf of banking customers The Client ID of this app must be set as the mayAct sub value on all user profiles that use the AI agent` |
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
- ✅ **BX Finance Agent BFF** *(audience resource — no scopes needed; enables `aud: ["https://bff.pingdemo.com"]` on the actor token used during exchange)*

**Attribute Mappings tab → Add Attribute:**

| Field | Type in |
|-------|---------|
| **PingOne attribute** | `may_act` |
| **Application attribute** | `((#root.context.requestData.subjectToken.may_act.sub == #root.context.requestData.actorToken.aud[0])?#root.context.requestData.subjectToken.may_act:null)` |

> **What this expression does:** PingOne evaluates this during token exchange. It reads `may_act.sub` from the incoming Subject Token and compares it to `aud[0]` of the actor token (the BFF client requesting the exchange). If they match, `may_act` is carried forward into the MCP Token; otherwise `null` is returned and the claim is dropped. This enforces that only the client declared in the user's `mayAct` profile attribute can perform the exchange.

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
| **Description** | `JSON object identifying the OAuth client authorized to exchange this users Subject Token Must be set to the sub Client ID of BX Finance BFF Admin PingOne validates this claim on every token exchange request` |
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
  "may_act": { "sub": "https://bff.pingdemo.com" }
}
```

If `may_act` is absent:
- Confirm the `mayAct` attribute was set on the user record (Step 3c)
- Confirm the Attribute Mapping was added to `BX Finance User` (Step 2a)
- Confirm `banking:agent:invoke` scope is in the authorize request (`ENDUSER_AUDIENCE` is set)

---

### 3c. Set `mayAct` on the User Record

The value must be `https://bff.pingdemo.com` (the BFF audience URL).

**Option A — PingOne Admin Console:**
1. **Directory → Users** → open the user
2. Find **Custom Attributes → mayAct**
3. Enter (substituting your real Client ID):
```json
{ "sub": "https://bff.pingdemo.com" }
```

**Option B — PingOne Management API:**
```bash
PATCH https://api.pingone.com/v1/environments/{envId}/users/{userId}
Authorization: Bearer <token with p1:update:user>
Content-Type: application/json

{ "mayAct": { "sub": "https://bff.pingdemo.com" } }
```

**Option C — BX Finance Demo App:**
1. Navigate to `/demo-data`
2. Click **Enable may_act** — the Backend-for-Frontend (BFF) reads its own `PINGONE_CORE_CLIENT_ID` and writes it to the user's `mayAct` attribute automatically via the Management API.

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

# ── BX Finance BFF Admin app (exchanges Subject Token → MCP Token) ────────────
PINGONE_CORE_CLIENT_ID=<Client ID of "BX Finance BFF Admin">
PINGONE_CORE_CLIENT_SECRET=<Client Secret of "BX Finance BFF Admin">

# ── Subject Token audience  (must exactly match "BX Finance AI Agent" Audience)
ENDUSER_AUDIENCE=https://subject.pingdemo.com

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

### Subject Token → MCP Token

Performed by: **BX Finance BFF Admin** using `PINGONE_CORE_CLIENT_ID` / `PINGONE_CORE_CLIENT_SECRET`

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

PingOne validates: `subject-token.may_act.sub` === `PINGONE_CORE_CLIENT_ID` — if they match, issues MCP Token.

### MCP Token → Resource Token

Performed by: **BX Finance MCP Worker** using `MCP_CLIENT_ID` / `MCP_CLIENT_SECRET`

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

**Subject Token** — issued at login:
```json
{
  "iss": "https://auth.pingone.com/{envId}/as",
  "aud": ["https://subject.pingdemo.com"],
  "sub": "<user-pingone-id>",
  "scope": "openid profile email banking:agent:invoke",
  "may_act": { "sub": "https://bff.pingdemo.com" }
}
```

**MCP Token** — after first exchange:
```json
{
  "aud": ["https://mcp-server.pingdemo.com"],
  "sub": "<user-pingone-id>",
  "scope": "banking:accounts:read banking:transactions:read banking:transactions:write",
  "act": { "sub": "https://bff.pingdemo.com" }
}
```

**Resource Token** — after second exchange:
```json
{
  "aud": ["https://api.pingone.com"],
  "sub": "<user-pingone-id>",
  "scope": "p1:read:user p1:update:user",
  "act": {
    "sub": "https://mcp-server.pingdemo.com",
    "act": { "sub": "https://bff.pingdemo.com" }
  }
}
```

---

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| Subject Token `aud` is the app client ID, not `https://subject.pingdemo.com` | `ENDUSER_AUDIENCE` not set, or `resource=` missing from `/authorize` | Set `ENDUSER_AUDIENCE=https://subject.pingdemo.com`; ensure `ff_oidc_only_authorize=false` |
| `invalid_scope: banking:agent:invoke` on login | Scope not allowed on `BX Finance User` app | Part 2a — enable `banking:agent:invoke` scope on the Resources tab |
| `may_act` missing from Subject Token | Token claim mapping missing, or user's `mayAct` attribute is null | Part 3b (add claim map) and Part 3c (set attribute on user) |
| `may_act` is a plain string, not an object | `mayAct` schema attribute type is `STRING` | Delete and re-create as type `JSON`; re-set the value on the user |
| Subject Token → MCP Token: `invalid_grant` | `may_act.sub` doesn't match the BFF audience URL | Set `mayAct` = `{ "sub": "https://bff.pingdemo.com" }` on the user |
| Subject Token → MCP Token: `unauthorized_client` | `BX Finance BFF Admin` missing Token Exchange grant type | Part 2b — enable Token Exchange grant |
| MCP Token → Resource Token: `invalid_scope: p1:read:user` | `BX Finance MCP Worker` not allowed that scope | Part 2c — enable `p1:read:user` on the worker app's Resources tab |
| `May not request scopes for multiple resources` on login | `banking:agent:invoke` and `banking:*` scopes mixed in the same `/authorize` | Keep only `banking:agent:invoke` as a non-OIDC scope on the user app; `banking:*` scopes come via exchange, not direct login |

---

*See also: [ACT_CLAIM_VERIFICATION.md](ACT_CLAIM_VERIFICATION.md)*
