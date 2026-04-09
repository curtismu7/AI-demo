---
issue_slug: scope_audit_compliance-not-followed
status: investigating
created: 2026-04-08
---

# Debug: Scope Configuration Not Following SCOPE_AUDIT_REPORT.md Documentation

## Issue Summary

**Problem:** The codebase is not following the scope documentation in SCOPE_AUDIT_REPORT.md

**Key Discrepancy:** 
- SCOPE_AUDIT_REPORT.md documents what scopes SHOULD be configured (per PINGONE_MAY_ACT_ONE_TOKEN_EXCHANGE.md)
- Actual PingOne configuration appears to be missing critical applications and scopes

## Critical Gaps Identified

### ❌ **Missing Applications**

1. **MCP Server Application**
   - **Required by docs:** Client credentials app with specific scopes
   - **Purpose:** Token exchange (Step 6)
   - **Current status:** NOT CREATED in provisioning
   - **Impact:** Step 6 client credentials flow will fail

2. **Worker Application**
   - **Required by docs:** Management API worker app
   - **Scopes needed:** `p1:read:user p1:update:user`
   - **Current status:** NOT CREATED in provisioning
   - **Impact:** Management API operations will fail

### ⚠️ **Verification Gaps**

3. **Admin App Token Exchange Configuration**
   - **Required:** RFC 8693 token exchange capabilities enabled
   - **Current status:** NEEDS VERIFICATION
   - **Impact:** Admin operations may fail

4. **Resource Server Audience Configuration**
   - **Required:** Audiences must match documentation
   - **Current status:** NEEDS VERIFICATION
   - **Impact:** Scope enforcement may fail

## Expected vs Actual

| Application | Required Scopes | Current Status | Gap |
|---|---|---|---|
| User App | `profile email banking:ai:agent:read banking:general:read banking:accounts:read banking:transactions:read banking:transactions:write` | ✅ Present | ✅ None |
| Admin App | All resource server scopes | ⚠️ Partial | ⚠️ Token exchange verification needed |
| **MCP Server** | `banking:ai:agent:read banking:accounts:read banking:transactions:read banking:general:read admin:read p1:read:user` | ❌ Missing | ❌ App not created |
| **Worker** | `p1:read:user p1:update:user` | ❌ Missing | ❌ App not created |

## Investigation Progress

### Areas to Check
- [ ] Provisioning service code (which apps does it create?)
- [ ] PingOne console (verify actual app configuration)
- [ ] Token exchange flow code (where do scopes come from?)
- [ ] SCOPE_AUDIT_REPORT.md vs actual implementation alignment
- [ ] Which scopes are actually being requested vs which should be

### Key Questions
1. Should the provisioning service create MCP Server and Worker apps automatically?
2. Are we manually creating these apps in PingOne console?
3. Is the SCOPE_AUDIT_REPORT.md the source of truth, or is it outdated?
4. Is the implementation intentionally different from the documented approach?

### Findings
(To be filled in)

## Solution
(To be determined - may require provisioning updates, PingOne setup, or docs clarification)

## Debug Findings

### What SCOPE_AUDIT_REPORT.md Says MUST Exist

Per the documentation (source of truth), these apps should be configured in PingOne:

1. **User App** — ✅ Found in code
   - Client ID: `5df1fbdb-0f2e-46b1-a5bb-86f456e83620` (in pingoneBackendDefaults.js)
   - Scopes: `profile email banking:ai:agent:read banking:general:read banking:accounts:read banking:transactions:read banking:transactions:write`

2. **Admin App** — ✅ Found in code
   - Client ID: `949a748e-4dd0-44a3-944e-721ee1e3ca16` (in pingoneBackendDefaults.js)
   - Scopes: All resource server scopes

3. **MCP Exchanger (MCP Server)** — ❌ NOT FOUND IN CODE
   - Type: Client credentials (machine-to-machine)
   - Required Scopes: `banking:ai:agent:read banking:accounts:read banking:transactions:read banking:general:read admin:read p1:read:user`
   - Audiences: `https://api.pingone.com` + `https://resource.pingdemo.com`
   - Status: NO client ID in pingoneBackendDefaults.js

4. **Worker App** — ❌ NOT FOUND IN CODE
   - Type: Client credentials (machine-to-machine)
   - Required Scopes: `p1:read:user p1:update:user`
   - Audience: `https://api.pingone.com`
   - Status: NO client ID in pingoneBackendDefaults.js

### Current Code State

**pingoneBackendDefaults.js** only has:
```javascript
admin_client_id:  '949a748e-4dd0-44a3-944e-721ee1e3ca16'
user_client_id:   '5df1fbdb-0f2e-46b1-a5bb-86f456e83620'
```

**Missing from config:**
- `mcp_client_id` (MCP Exchanger)
- `worker_client_id` (Worker app)

### Impact Analysis

**Missing MCP Exchanger App:**
- Step 6 (client credentials token exchange) will fail
- Token exchange flow cannot complete
- Agent cannot get properly scoped tokens

**Missing Worker App:**
- Management API operations will fail
- User profile updates won't work
- Cannot manage user MFA, attributes, etc.

## Next Action

Map out where these apps should be created:
1. Are they supposed to be created via PingOne console manually?
2. Are they supposed to be created by provisioning script (if exists)?
3. Which environment variables should hold their client IDs and secrets?
4. Should they be added to pingoneBackendDefaults.js?

---

## 🔍 DISCOVERY: Screenshots Reveal Apps Exist in PingOne

**Date: 2026-04-08**

### ✅ CONFIRMED: Apps DO Exist in PingOne Console

From screenshots of PingOne application list:

| App Name | Client ID | Status |
|----------|-----------|--------|
| Super Banking Admin App | 14cefa5b-d9d6-4e51-8749-e938d4edd1c0 | ✅ In code |
| Super Banking User App | b2752071-2d03-4927-b865-089dc40b9c85 | ✅ In code |
| **Super Banking Worker Token** | **95dc946f-5e0a-4a8b-a8ba-b587b244e005** | ⚠️ **NOT in code config** |
| Super Banking AI Agent App | 2533a614-fcb6-4ab9-82cc-9ab407f1dbda | ⚠️ Partial |
| **Super Banking MCP Token Exchanger** | **6380065f-f328-41c2-81ed-1daeec811285** | ⚠️ **NOT in code config** |

### Root Cause: Configuration Drift

**THE PROBLEM:**
- MCP Exchanger app exists in PingOne (ID: `6380065f-f328-41c2-81ed-1daeec811285`)
- Worker Token app exists in PingOne (ID: `95dc946f-5e0a-4a8b-a8ba-b587b244e005`)
- But their client IDs are **NOT** referenced anywhere in the codebase

### Where These IDs Should Be

**MCP Exchanger Client ID should be in:**
1. `banking_api_server/config/pingoneBackendDefaults.js` → `mcp_client_id: '6380065f-f328-41c2-81ed-1daeec811285'`
2. Environment: `PINGONE_MCP_TOKEN_EXCHANGER_CLIENT_ID` or `AGENT_OAUTH_CLIENT_ID`
3. Used by: `agentMcpTokenService.js` (line 912: `const mcpExchangerClient = process.env.AGENT_OAUTH_CLIENT_ID`)

**Worker Token Client ID should be in:**
1. `banking_api_server/config/pingoneBackendDefaults.js` → `worker_client_id: '95dc946f-5e0a-4a8b-a8ba-b587b244e005'`
2. Environment: `PINGONE_AUTHORIZE_WORKER_CLIENT_ID`
3. Used by: `pingOneAuthorizeService.js` (line 71: worker client from env var)

### Next Actions (To Fix)

**Phase 111 - "Add Missing OAuth App Client IDs to Code Configuration"**

Tasks:
1. Add MCP Exchanger client ID to `pingoneBackendDefaults.js`
   - Field: `mcp_client_id: '6380065f-f328-41c2-81ed-1daeec811285'`
   - Fallback: `process.env.PINGONE_MCP_TOKEN_EXCHANGER_CLIENT_ID || process.env.AGENT_OAUTH_CLIENT_ID`

2. Add Worker Token client ID to `pingoneBackendDefaults.js`
   - Field: `worker_client_id: '95dc946f-5e0a-4a8b-a8ba-b587b244e005'`
   - Fallback: `process.env.PINGONE_AUTHORIZE_WORKER_CLIENT_ID`

3. Update `configStore.js` to expose these new public IDs

4. Verify token exchange flow uses correct client ID

5. Run full test suite + manual token exchange verification

**Status:** Ready for phase creation
