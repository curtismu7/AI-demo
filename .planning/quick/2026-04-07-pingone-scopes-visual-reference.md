# PingOne Scope Mapping — One-Page Visual Reference

**Quick lookup table for what scopes are on what apps and resource servers.**

---

## PingOne Apps → Their Scopes

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ SUPER BANKING ADMIN APP (WEB_APP - OIDC Client)                             │
├─────────────────────────────────────────────────────────────────────────────┤
│ Purpose: Admin login                                                        │
│ Grant Type: AUTHORIZATION_CODE + PKCE                                       │
│                                                                              │
│ SCOPES REQUESTED ON /AUTHORIZE:                                            │
│  • openid, profile, email, offline_access    ← OIDC standard               │
│  • banking:read, banking:write               ← Banking operations           │
│  • banking:transfer, banking:admin           ← Admin banking                │
│  • banking:agent:invoke                       ← Can trigger AI agent        │
│  • p1:read:user, p1:update:user              ← PingOne API access          │
│                                                                              │
│ RESULT TOKEN INCLUDES: openid + all requested banking + p1 scopes           │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│ SUPER BANKING USER APP (WEB_APP - OIDC Client)                              │
├─────────────────────────────────────────────────────────────────────────────┤
│ Purpose: End-user (customer) login                                          │
│ Grant Type: AUTHORIZATION_CODE + PKCE                                       │
│                                                                              │
│ SCOPES REQUESTED ON /AUTHORIZE (Standard):                                 │
│  • openid, profile, email, offline_access    ← OIDC standard               │
│  • banking:read, banking:write               ← Banking operations           │
│  • banking:transfer                          ← Transfer operations          │
│                                                                              │
│  ❌ NO banking:admin (users aren't admins)                                  │
│  ❌ NO banking:agent:invoke (users use agent via delegation)               │
│  ❌ NO p1:* scopes (users don't manage PingOne)                            │
│                                                                              │
│ SCOPES REQUESTED ON /AUTHORIZE (When ENDUSER_AUDIENCE set):               │
│  • profile, email, offline_access            ← OIDC standard (no openid)   │
│  • banking:agent:invoke                      ← For AI agent delegation      │
│  • resource=https://ai-agent.pingdemo.com    ← Resource indicator (RFC 8707)│
│                                                                              │
│ RESULT TOKEN INCLUDES: profile + requested banking scopes                   │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│ SUPER BANKING MCP TOKEN EXCHANGER (WORKER App)                              │
├─────────────────────────────────────────────────────────────────────────────┤
│ Purpose: RFC 8693 token exchange + PingOne API calls                        │
│ Grant Type: CLIENT_CREDENTIALS (+ TOKEN_EXCHANGE for 2-exchange)           │
│                                                                              │
│ SCOPES REQUESTED ON /TOKEN:                                                │
│  • admin:read, admin:write, admin:delete     ← MCP admin operations         │
│  • users:read, users:manage                  ← User management              │
│  • banking:read, banking:write               ← Banking scopes for MCP       │
│  • p1:read:user, p1:update:user              ← PingOne API access          │
│                                                                              │
│ RESULT TOKEN: cc token with all above (aud: https://mcp-server.pingdemo.com)│
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│ SUPER BANKING AI AGENT APP (WORKER App - 2-Exchange Only)                   │
├─────────────────────────────────────────────────────────────────────────────┤
│ Purpose: Token exchange actor (Exchange #1 in 2-exchange delegation)        │
│ Grant Type: CLIENT_CREDENTIALS                                              │
│                                                                              │
│ SCOPES REQUESTED ON /TOKEN:                                                │
│  • banking:agent:invoke                      ← Only scope                   │
│                                                                              │
│ RESULT TOKEN: cc token with aud: https://agent-gateway.pingdemo.com         │
```

---

## Resource Servers → Their Defined Scopes

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ MAIN BANKING RESOURCE SERVER                                                │
├─────────────────────────────────────────────────────────────────────────────┤
│ Audience: https://resource.pingdemo.com                                     │
│                                                                              │
│ DEFINED SCOPES:                                                             │
│  ✓ banking:read               - Read accounts/transactions                  │
│  ✓ banking:write              - Write banking operations                    │
│  ✓ banking:transfer           - Execute transfers                           │
│  ✓ banking:admin              - Admin operations                            │
│  ✓ banking:agent:invoke       - AI agent permission                         │
│  ✓ banking:read:sensitive     - Sensitive PII (SSN, routing)               │
│                                                                              │
│ APPS THAT USE IT: Admin App √ | User App √ | AI Agent App √                │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│ MCP RESOURCE SERVER                                                         │
├─────────────────────────────────────────────────────────────────────────────┤
│ Audience: https://mcp-server.pingdemo.com                                   │
│                                                                              │
│ DEFINED SCOPES:                                                             │
│  ✓ admin:read                 - Read admin resources                        │
│  ✓ admin:write                - Write admin resources                       │
│  ✓ admin:delete               - Delete admin resources                      │
│  ✓ users:read                 - Read user records                           │
│  ✓ users:manage               - Manage user records                         │
│  ✓ banking:read               - Read operations (exchange output)           │
│  ✓ banking:write              - Write operations (exchange output)          │
│                                                                              │
│  ❌ banking:agent:invoke      - MUST NOT be here! (only on Main RS)         │
│                                                                              │
│ APPS THAT USE IT: MCP Token Exchanger √                                    │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│ PINGONE API RESOURCE SERVER (Built-in)                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│ Audience: https://api.pingone.com                                           │
│                                                                              │
│ DEFINED SCOPES:                                                             │
│  ✓ p1:read:user               - Read PingOne users                          │
│  ✓ p1:update:user             - Update PingOne users (mayAct attribute)    │
│  ✓ p1:read:environment        - Read environment config                     │
│  (others not relevant to this demo)                                         │
│                                                                              │
│ APPS THAT USE IT: Admin App √ | MCP Token Exchanger √                      │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│ SUPER BANKING AI AGENT RESOURCE SERVER (2-Exchange Only)                    │
├─────────────────────────────────────────────────────────────────────────────┤
│ Audience: https://ai-agent.pingdemo.com                                     │
│                                                                              │
│ DEFINED SCOPES:                                                             │
│  ✓ banking:agent:invoke       - AI agent can invoke on behalf of user      │
│                                                                              │
│ APPS THAT USE IT: User App (Exchange #1 subject) √ | AI Agent App √        │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## What Token Gets Returned When?

### User Logs In (Admin App)

```
User → PingOne (/authorize with banking:read, banking:write, ... + p1:*)
         ↓
PingOne checks Admin App resource grants
         ↓
Returns Access Token with:
  • aud: "https://api.pingone.com" + "https://resource.pingdemo.com"
  • scope: "openid profile email offline_access banking:read banking:write 
            banking:transfer banking:admin banking:agent:invoke p1:read:user p1:update:user"
  • may_act: { "sub": "<admin_user_id>" }  ← if set on user
  • exp: 1 hour (default)
```

### User Logs In (User App - Normal)

```
User → PingOne (/authorize with banking:read, banking:write, banking:transfer)
         ↓
PingOne checks User App resource grants
         ↓
Returns Access Token with:
  • aud: "https://resource.pingdemo.com"
  • scope: "openid profile email offline_access banking:read banking:write banking:transfer"
  • may_act: { "sub": "<AI_AGENT_CLIENT_ID>" }  ← if set on user (for 2-exchange)
  • exp: 1 hour (default)
```

### User Logs In (User App - With ENDUSER_AUDIENCE)

```
User → PingOne (/authorize with banking:agent:invoke + resource=https://ai-agent.pingdemo.com)
         ↓
PingOne checks User App resource grants for AI Agent resource
         ↓
Returns Access Token with:
  • aud: "https://ai-agent.pingdemo.com"
  • scope: "profile email offline_access banking:agent:invoke"  ← NO openid
  • may_act: { "sub": "<AI_AGENT_CLIENT_ID>" }
  • exp: 1 hour (default)
```

### MCP App - Client Credentials

```
MCP App → PingOne (/token?grant_type=client_credentials&scope=admin:read+admin:write+...)
            ↓
PingOne returns CC Token with:
  • aud: "https://mcp-server.pingdemo.com"
  • scope: "admin:read admin:write admin:delete users:read users:manage banking:read banking:write p1:read:user p1:update:user"
  • sub: "<MCP_CLIENT_ID>"
  • exp: 1 hour (default)
```

---

## The Rule: Scope Binding

**PingOne Rule:** A scope can ONLY be returned to an app if BOTH:
1. The scope is **defined** on a Resource Server
2. The app **has been granted** that scope on its Resources tab

If `banking:agent:invoke` is defined on Main RS but NOT on MCP RS:
- ✅ Apps with Main RS grant can request and receive it
- ❌ Apps with MCP RS grant CANNOT request it (returns omitted from token)

---

## Checklist: "Did I Configure Scopes Correctly?"

- [ ] Main Banking Resource Server exists with: `banking:read`, `banking:write`, `banking:transfer`, `banking:admin`, `banking:agent:invoke`
- [ ] Admin App has resource grant **to Main Banking RS** with ALL scopes
- [ ] Admin App has resource grant **to PingOne API** with `p1:read:user`, `p1:update:user`
- [ ] User App has resource grant **to Main Banking RS** with ONLY `banking:read`, `banking:write`, `banking:transfer`
- [ ] User App has **NO** `banking:agent:invoke` scope grant (unless doing agent-only flow)
- [ ] MCP Resource Server exists with: `admin:read`, `admin:write`, `admin:delete`, `users:read`, `users:manage`, `banking:read`, `banking:write`
- [ ] MCP Token Exchanger app has resource grant **to MCP RS** with ALL scopes
- [ ] MCP Token Exchanger app has resource grant **to PingOne API** with `p1:read:user`, `p1:update:user`
- [ ] MCP Token Exchanger app has **TOKEN_EXCHANGE** grant type enabled
- [ ] Admin & User OIDC apps have `may_act` attribute mapping in their Attribute Mappings section
- [ ] ⚠️ **If 2-exchange:** AI Agent Resource Server exists with ONLY `banking:agent:invoke`
- [ ] ⚠️ **If 2-exchange:** AI Agent App has resource grant to AI Agent RS with `banking:agent:invoke`
- [ ] ⚠️ **If 1-exchange:** User app login requests include `banking:agent:invoke` as scope

---

**Version:** 2026-04-07  
**Status:** Complete  
**Use this to verify your PingOne configuration →** https://console.pingone.com/connections/resources
