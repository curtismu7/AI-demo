# Environment Variable Mapping — PingOne → .env → Code

**Single source of truth:** PingOne Console applications and resource servers are the authoritative names and values.

---

## PingOne Applications (OAuth2 / Token Exchange)

| PingOne App Name | Purpose | Client ID | .env Variable | Secret Variable |
|---|---|---|---|---|
| **Super Banking User App** | End-user OIDC login; generates Subject Token | `b2752071-2d03-4927-b865-089dc40b9c85` | `PINGONE_USER_CLIENT_ID` | `PINGONE_USER_CLIENT_SECRET` |
| **Super Banking Admin App** | BFF/Server app; performs RFC 8693 Token Exchange #1; issues MCP Token | `14cefa5b-d9d6-4e51-8749-e938d4edd1c0` | `PINGONE_ADMIN_CLIENT_ID` | `PINGONE_ADMIN_CLIENT_SECRET` |
| **Super Banking MCP Token Exchanger** | Worker app; holds Client Credentials for PingOne Management API access (list/audit resources) | `630b065f-0c28-41c2-81ed-1daee811285` | `PINGONE_CLIENT_ID` | `PINGONE_CLIENT_SECRET` |
| **Super Banking AI Agent App** | (Informational) AI Agent identity in token chain; referenced in `act` claims and `may_act` | `2533a614-fcb6-4ab9-82cc-9ab407f1dbda` | *(Used in delegation logic, not as direct credential)* | *(No direct secret needed; identity only)* |

---

## PingOne Resource Servers (OAuth2 Scopes / Token Audiences)

| PingOne Resource Name | Purpose | Audience URI | .env Variable | Scopes |
|---|---|---|---|---|
| **Super Banking AI Agent** | Subject Token audience; carries `may_act` claim for delegation | `https://ai-agent.pingdemo.com` | `ENDUSER_AUDIENCE` | `banking:agent:invoke` |
| **Super Banking MCP Server** | MCP Token audience; carries `act` claim; validates delegation | `https://mcp-server.pingdemo.com` | `MCP_RESOURCE_URI` | `banking:accounts:read`, `banking:transactions:read`, `banking:transactions:write` |
| **Super Banking Agent Gateway** | Actor token audience for 2-exchange delegation | `https://agent-gateway.pingdemo.com` | `AGENT_GATEWAY_AUDIENCE` | *(none)* |
| **Super Banking Banking API** | API resource server | `https://banking-api.pingdemo.com` | `BFF_RESOURCE_URI` | `banking:accounts:read`, `banking:transactions:read`, `banking:transactions:write` |
| **PingOne API** | Built-in; Management API access (read users, audit resources, etc.) | `https://api.pingone.com` | `PINGONE_API_AUDIENCE` | `p1:read:user`, `p1:update:user` |

---

## .env Structure: Current State vs. Authoritative

### ✅ Correct (Already Aligned)

```bash
# Super Banking User App (end-user login)
PINGONE_USER_CLIENT_ID=b2752071-2d03-4927-b865-089dc40b9c85
PINGONE_USER_CLIENT_SECRET=3NX~XdVZ1PxjQjz3z_f8rCoe-8hK1_vzUmo.9LYqiQ7h7y19L~IKCP0AL5ydVhDR

# Super Banking Admin App (BFF/token exchange)
PINGONE_ADMIN_CLIENT_ID=14cefa5b-d9d6-4e51-8749-e938d4edd1c0
PINGONE_ADMIN_CLIENT_SECRET=x6EeiOL3J-JSoZB8CnXzVVU1J4pvSWrEIl4jckxhN8u0_w8F9a.qA9-j47zfMr0O

# Agent Gateway resource server
AGENT_GATEWAY_AUDIENCE=https://agent-gateway.pingdemo.com

# PingOne auth/environment
PINGONE_ENVIRONMENT_ID=d02d2305-f445-406d-82ee-7cdbf6eeabfd
PINGONE_REGION=com
```

### ❌ Incorrect / Missing (Need Fixes)

| Current .env | Issue | Correct Value | Reason |
|---|---|---|---|
| `AI_AGENT_CLIENT_ID` | Confusing name; appears to be a credential but `AI_AGENT_CLIENT_ID: 2533a614-fcb6-4ab9-82cc-9ab407f1dbda` is actually the Super Banking AI Agent App identity reference (not a usable credential) | **REMOVE** or rename to `AI_AGENT_APP_ID` (reference only, not a secret) | Super Banking AI Agent App is referenced in token claims (`act.sub`, `may_act.sub`), not used as an exchanging client. The credential needing .env is the **Super Banking MCP Token Exchanger** (630b065f-0c28-41c2-81ed-1daee811285) |
| `AI_AGENT_CLIENT_SECRET` | Paired with above; confusing | **REMOVE** | Same reason |
| `MCP_RESOURCE_URI` | Current value: `https://ai-agent.pingdemo.com` ← **WRONG** | `https://mcp-server.pingdemo.com` | MCP tokens must have audience = Super Banking **MCP Server**, not AI Agent server |
| `AGENT_OAUTH_CLIENT_ID` | Redundant; same value (`6380065f-f328-41c2-81ed-1daeec811285`) appears to be Super Banking Agent Gateway but purpose unclear | Clarify usage or consolidate | Possible duplicate of another app ID; needs audit |
| *(missing)* | No Management API credentials to call PingOne for resource/scope audit | Add `PINGONE_CLIENT_ID` and `PINGONE_CLIENT_SECRET` | Required for Feature: PingOne Configuration Audit (resourceValidationService, scopeAuditService) |
| *(missing)* | No reference to Super Banking MCP Token Exchanger credentials | Add `PINGONE_CLIENT_ID` + `PINGONE_CLIENT_SECRET` | The MCP Token Exchanger app (`630b065f-0c28-41c2-81ed-1daee811285`) holds Client Credentials for Management API calls |
| `ENDUSER_AUDIENCE` | Current value: `banking_api_enduser` ← **WRONG** | `https://ai-agent.pingdemo.com` | Must match Super Banking AI Agent resource server audience |

---

## Code References: What Maps to What

### Services / Routes Using .env Variables

**`banking_api_server/services/resourceValidationService.js`**
- Reads: `configStore.getEffective('pingone_client_id')` → Maps to `.env: PINGONE_CLIENT_ID`
- Reads: `configStore.getEffective('pingone_client_secret')` → Maps to `.env: PINGONE_CLIENT_SECRET`
- **Purpose:** Authenticate to PingOne Management API using Super Banking MCP Token Exchanger credentials
- **PingOne App:** Super Banking MCP Token Exchanger (`630b065f-0c28-41c2-81ed-1daee811285`)

**`banking_api_server/services/scopeAuditService.js`**
- Same as above; also uses Management API credentials
- **Purpose:** List and audit scopes on PingOne resource servers
- **PingOne App:** Super Banking MCP Token Exchanger (same)

**`banking_api_server/services/delegationClaimsService.js`** (token exchange, delegation validation)
- Validates: `may_act.sub == PINGONE_ADMIN_CLIENT_ID` (Super Banking Admin App)
- Validates: `act.sub` contains Super Banking Admin App client ID or nested actor chain
- **PingOne Apps:** Super Banking Admin App + Super Banking AI Agent App

**`banking_api_server/routes/oauthRoutes.js`** (user login, token exchange)
- Uses: `PINGONE_USER_CLIENT_ID` / `PINGONE_USER_CLIENT_SECRET` → Super Banking User App
- Uses: `PINGONE_ADMIN_CLIENT_ID` / `PINGONE_ADMIN_CLIENT_SECRET` → Super Banking Admin App
- **Purpose:** User OIDC login + RFC 8693 token exchange

**`banking_api_ui/src/services/configService.js`** (frontend audience/scopes)
- References: `ENDUSER_AUDIENCE` → must be Super Banking AI Agent audience (`https://ai-agent.pingdemo.com`)
- References: `MCP_RESOURCE_URI` → must be Super Banking MCP Server audience (`https://mcp-server.pingdemo.com`)
- **Purpose:** Token validation and scope enforcement in React components

---

## How to Verify Alignment (Checklist)

1. **PingOne Console → Applications:**
   - [ ] Super Banking User App: `b2752071-2d03-4927-b865-089dc40b9c85` exists
   - [ ] Super Banking Admin App: `14cefa5b-d9d6-4e51-8749-e938d4edd1c0` exists
   - [ ] Super Banking MCP Token Exchanger: `630b065f-0c28-41c2-81ed-1daee811285` exists with Client Credentials grant enabled
   - [ ] Super Banking AI Agent App: `2533a614-fcb6-4ab9-82cc-9ab407f1dbda` exists (reference only)

2. **PingOne Console → Resources (Resource Servers):**
   - [ ] Super Banking AI Agent: audience = `https://ai-agent.pingdemo.com`
   - [ ] Super Banking MCP Server: audience = `https://mcp-server.pingdemo.com`
   - [ ] Super Banking Agent Gateway: audience = `https://agent-gateway.pingdemo.com`
   - [ ] Super Banking Banking API: audience = `https://banking-api.pingdemo.com`

3. **.env file:**
   - [ ] `PINGONE_USER_CLIENT_ID` = `b2752071-2d03-4927-b865-089dc40b9c85` (Super Banking User App)
   - [ ] `PINGONE_ADMIN_CLIENT_ID` = `14cefa5b-d9d6-4e51-8749-e938d4edd1c0` (Super Banking Admin App)
   - [ ] `PINGONE_CLIENT_ID` = `630b065f-0c28-41c2-81ed-1daee811285` (Super Banking MCP Token Exchanger)
   - [ ] `ENDUSER_AUDIENCE` = `https://ai-agent.pingdemo.com` (Super Banking AI Agent resource)
   - [ ] `MCP_RESOURCE_URI` = `https://mcp-server.pingdemo.com` (Super Banking MCP Server resource)
   - [ ] `AGENT_GATEWAY_AUDIENCE` = `https://agent-gateway.pingdemo.com` (Super Banking Agent Gateway resource)

4. **Code (grep to verify):**
   ```bash
   grep -r "PINGONE_CLIENT_ID\|PINGONE_CLIENT_SECRET" banking_api_server/services/ banking_api_server/routes/
   # Should find: resourceValidationService, scopeAuditService only
   
   grep -r "PINGONE_USER_CLIENT_ID" banking_api_server/routes/
   # Should find: oauthRoutes.js (user login)
   
   grep -r "PINGONE_ADMIN_CLIENT_ID" banking_api_server/
   # Should find: oauthRoutes.js (token exchange), services/ (delegation validation)
   
   grep -r "MCP_RESOURCE_URI" banking_api_server/ banking_api_ui/
   # Should find: configService, token validation paths
   ```

---

## Environment Variable Naming Convention

All PingOne-related .env variables follow this pattern:

```
PINGONE_{APP_OR_SERVICE}_{TYPE}
  PINGONE_ADMIN_CLIENT_ID           ← PingOne application name: Super Banking Admin App
  PINGONE_USER_CLIENT_ID            ← PingOne application name: Super Banking User App
  PINGONE_CLIENT_ID                 ← PingOne application name: Super Banking MCP Token Exchanger
                                       (shortened to PINGONE_ prefix, as it's primary/default Management API client)

{RESOURCE_OR_SERVICE}_AUDIENCE / _URI
  ENDUSER_AUDIENCE                  ← Maps to PingOne resource: Super Banking AI Agent
  MCP_RESOURCE_URI                  ← Maps to PingOne resource: Super Banking MCP Server
  AGENT_GATEWAY_AUDIENCE            ← Maps to PingOne resource: Super Banking Agent Gateway
  BFF_RESOURCE_URI                  ← Maps to PingOne resource: Super Banking Banking API
```

**Principle:**
- Application credentials → `PINGONE_{APP_NAME}_CLIENT_{ID|SECRET}`
- Resource server audiences → `{SERVICE}_AUDIENCE` or `{SERVICE}_RESOURCE_URI` or `{SERVICE}_URI`

---

## Summary

**Before Fix:**
- ❌ `AI_AGENT_CLIENT_ID` pointing to identity reference (not usable credential)
- ❌ `MCP_RESOURCE_URI` pointing to wrong resource (`ai-agent` instead of `mcp-server`)
- ❌ Missing Management API credentials (`PINGONE_CLIENT_ID/SECRET`)
- ❌ No clear mapping between PingOne and .env files

**After Fix:**
- ✅ All .env variables directly traceable to PingOne Console applications and resources
- ✅ Clear comments in .env showing PingOne app name for each credential
- ✅ Consistent naming convention across all audience/URI variables
- ✅ Management API credentials available for audit feature
- ✅ Code references match .env variable names exactly
