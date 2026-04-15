# .env Audit Against Phase 146 Scope Vocabulary

**Date:** 2026-04-14  
**Purpose:** Verify all .env entries align with canonical scope vocabulary and resource server URIs from Phase 146

---

## Critical Issues Found

### ❌ ISSUE #1: ENDUSER_AUDIENCE Configured Incorrectly

**Current State:**
```ini
ENDUSER_AUDIENCE=https://ai-agent.pingdemo.com
```

**Problem:**
- `ENDUSER_AUDIENCE` should be the audience for **user login tokens** (subject tokens in RFC 8693 exchange)
- These tokens carry **banking scopes** (`banking:read`, `banking:write`, `banking:admin`, `banking:ai:agent`)
- Per SCOPE_VOCABULARY.md: Main Banking API resource server is where `banking:*` scopes are defined
- **Current value** (`ai-agent`) is the AI Agent resource server, NOT the banking API
- This causes audience validation to FAIL when tokens have `aud=https://resource-server.pingdemo.com`

**Expected:**
```ini
ENDUSER_AUDIENCE=https://resource-server.pingdemo.com
```

**Reference:** SCOPE_VOCABULARY.md § Main Banking API
- Audience URI should be the Main Banking API resource server
- This is where user tokens are issued with `banking:*` scopes

---

### ❌ ISSUE #2: Missing Main Banking API Resource Server Audience Variable

**Problem:**
- Phase 146 SCOPE_VOCABULARY.md defines Main Banking API as a resource server
- No .env variable captures the Main Banking API audience URI
- The auth middleware needs a way to know which audience corresponds to banking scopes
- Currently hardcoded logic checks `ENDUSER_AUDIENCE` but comments describe it as "Super Banking AI Agent"

**Missing Entry:**
```ini
# PingOne Resource: Super Banking (Main Banking API)
# Audience for user login tokens carrying banking:* scopes
BANKING_API_AUDIENCE=https://resource-server.pingdemo.com
```

**Why It Matters:**
- Scopes are defined per resource server in OAuth 2.0
- `banking:read`, `banking:write`, etc. belong to the Main Banking API resource server
- The audience in the token MUST match the resource server that issued the scopes

---

### ⚠️ ISSUE #3: Scope Mismatch in oauthUser.js

**Current Code (line 48):**
```javascript
return ['profile', 'email', 'offline_access', 'banking:ai:agent:read'];
```

**Problem:**
- Requests `banking:ai:agent:read` (old scope name)
- Phase 146 canonical scope is `banking:ai:agent` (without `:read` suffix)
- This is a leftover from the old naming convention (Phase 146 D-02 deprecated these)

**Expected:**
```javascript
return ['profile', 'email', 'offline_access', 'banking:ai:agent'];
```

**Reference:** SCOPE_VOCABULARY.md § Canonical Scope List + Deprecation Path
- Old: `banking:ai:agent:read`, `banking:ai:agent:write`
- New: `banking:ai:agent` (unified)

---

### ⚠️ ISSUE #4: Missing Resource Server URIs in .env

**Missing Variables:**
```ini
# Main Banking API resource server (where banking:* scopes are defined)
BANKING_API_RESOURCE_URI=https://resource-server.pingdemo.com

# Optional: If using separate resource servers for admin/sensitive operations
# BANKING_ADMIN_RESOURCE_URI=https://banking-admin.pingdemo.com (not currently needed)
# BANKING_SENSITIVE_RESOURCE_URI=https://banking-sensitive.pingdemo.com (not currently needed)
```

**Why:**
- Makes scope-to-resource mapping explicit in configuration
- Allows future multi-resource scenarios
- Aligns with RFC 7662 introspection which includes resource info

---

## Resource Server Mapping (Per Phase 146 SCOPE_VOCABULARY.md)

| Resource Server | Audience URI | Scopes | .env Variable |
|-----------------|--------------|--------|---------------|
| **Main Banking API** | `https://resource-server.pingdemo.com` | `banking:read`, `banking:write`, `banking:admin`, `banking:sensitive`, `banking:ai:agent` | ❌ MISSING |
| **Agent Gateway** (2-exchange Exchange #1 actor) | `https://agent-gateway.pingdemo.com` | `ai_agent` | ✅ AGENT_GATEWAY_AUDIENCE |
| **MCP Server** (1-exchange or Exchange #2 final) | `https://mcp-server.pingdemo.com` | Narrowed subset of main banking scopes | ✅ PINGONE_RESOURCE_MCP_SERVER_URI |

---

## Detailed Findings by Section

### Token Audience Configuration (.env lines 40–49)

| Variable | Current Value | Expected Value | Status | Notes |
|----------|--------------|-----------------|--------|-------|
| ENDUSER_AUDIENCE | `https://ai-agent.pingdemo.com` | `https://resource-server.pingdemo.com` | ❌ WRONG | Should match Main Banking API, not agent gateway |
| AI_AGENT_AUDIENCE | `https://mcp-server.pingdemo.com` | `https://mcp-server.pingdemo.com` | ✅ OK | Correct: MCP server audience after exchange |
| AI_AGENT_SCOPE | `ai_agent` | `ai_agent` | ✅ OK | Legacy OIDC scope identifier |
| AGENT_GATEWAY_AUDIENCE | `https://agent-gateway.pingdemo.com` | `https://agent-gateway.pingdemo.com` | ✅ OK | Correct: Actor CC audience for 2-exchange |

### Token Exchange Configuration (.env lines 51–70)

| Variable | Current Value | Expected Value | Status | Notes |
|----------|--------------|-----------------|--------|-------|
| PINGONE_RESOURCE_MCP_SERVER_URI | `https://mcp-server.pingdemo.com` | `https://mcp-server.pingdemo.com` | ✅ OK | Used as MCP token audience in auth.js:507 |
| PINGONE_RESOURCE_MCP_GATEWAY_URI | `https://mcp-gateway.pingdemo.com` | `https://mcp-gateway.pingdemo.com` | ✅ OK | Actor audience for 2-exchange (confusing name: should be agent-gateway) |
| PINGONE_RESOURCE_TWO_EXCHANGE_URI | `https://resource-server.pingdemo.com` | `https://resource-server.pingdemo.com` | ✅ OK | Final token audience in 2-exchange ✓ Matches Main Banking API |

---

## Code-Level Mismatches

### banking_api_server/config/oauthUser.js

```javascript
// Line 48 — DEPRECATED SCOPE NAME
return ['profile', 'email', 'offline_access', 'banking:ai:agent:read'];
         ^^^^^^ OLD SCOPE (Phase 146 D-02 now: 'banking:ai:agent')
```

**Fix:**
```javascript
// Request canonical scopes per Phase 146 D-02
return ['profile', 'email', 'offline_access', 'banking:ai:agent'];
```

### banking_api_server/middleware/auth.js

**Line 507 — Audience Validation:**
```javascript
const knownAudiences = [ENDUSER_AUDIENCE, AI_AGENT_AUDIENCE, MCP_RESOURCE_URI].filter(Boolean);
```

**Currently reads:**
```javascript
// If ENDUSER_AUDIENCE=https://ai-agent.pingdemo.com (WRONG)
// knownAudiences = [
//   'https://ai-agent.pingdemo.com',           ← User tokens DON'T have this audience
//   'https://mcp-server.pingdemo.com',
//   undefined (MCP_RESOURCE_URI read from process.env below)
// ]
```

**Token reality:**
- User tokens from PingOne have `aud=https://resource-server.pingdemo.com` (Main Banking API)
- **NOT** `https://ai-agent.pingdemo.com`
- This causes validation to fail with: `Token audience [...resource-server...] does not match any known audience`

---

## Audience Terminology Confusion

### Current Problem:
- `.env` variable named `ENDUSER_AUDIENCE` but set to `https://ai-agent.pingdemo.com`
- The **name** says "enduser" (user login tokens) but the **value** is the agent gateway
- This reversed logic breaks audience validation

### Correct Mapping (per Phase 146 SCOPE_VOCABULARY.md):
| Token Type | Issued By | Audience Value | .env Variable |
|------------|-----------|-----------------|---------------|
| **User Token** (subject token) | PingOne after user login | `https://resource-server.pingdemo.com` (Main Banking API) | Should use: `ENDUSER_AUDIENCE` |
| **Agent Token** (after exchange) | BFF via RFC 8693 | `https://mcp-server.pingdemo.com` (MCP Server) | Currently: `AI_AGENT_AUDIENCE` ✓ Correct |
| **Actor CC Token** (for 2-exchange) | Agent's client credentials | `https://agent-gateway.pingdemo.com` (Agent Gateway) | Currently: `AGENT_GATEWAY_AUDIENCE` ✓ Correct |

---

## Recommended .env Corrections

### Phase 1: Fix Critical Audience Mismatch

**File:** `banking_api_server/.env`  
**Lines 40–49:**

```diff
  # TOKEN AUDIENCES — maps directly to PingOne Resource Server audience URIs
  # PingOne Console → Applications → Resources
  # =============================================================================
- # PingOne Resource: Super Banking AI Agent  (audience of the Subject Token — issued at user login)
- ENDUSER_AUDIENCE=https://ai-agent.pingdemo.com
+ # PingOne Resource: Super Banking (Main Banking API) — audience of the Subject Token (issued at user login)
+ # This is where banking:read, banking:write, banking:ai:agent scopes are defined
+ ENDUSER_AUDIENCE=https://resource-server.pingdemo.com
  
  # PingOne Resource: Super Banking MCP Server  (audience of the MCP Token — issued after RFC 8693 token exchange)
  AI_AGENT_AUDIENCE=https://mcp-server.pingdemo.com
  AI_AGENT_SCOPE=ai_agent
  
  # PingOne Resource: Super Banking Agent Gateway  (actor CC audience for Exchange #1)
  AGENT_GATEWAY_AUDIENCE=https://agent-gateway.pingdemo.com
```

### Phase 2: Add Missing Resource Server Variables

**File:** `banking_api_server/.env`  
**Add after line 49:**

```ini
# =============================================================================
# RESOURCE SERVER CONFIGURATION — Maps scopes to resource servers
# =============================================================================
# Main Banking API: Custom resource server where banking:* scopes live
BANKING_API_RESOURCE_URI=https://resource-server.pingdemo.com

# Optional: Agent Gateway resource server (currently same as AGENT_GATEWAY_AUDIENCE)
# AGENT_GATEWAY_RESOURCE_URI=https://agent-gateway.pingdemo.com
```

**Why:** Makes explicit which resource server each scope family belongs to

### Phase 3: Update Deprecated Scope Names

**File:** `banking_api_server/config/oauthUser.js`  
**Line 48:**

```diff
  // Simplified OIDC + single banking scope to avoid PingOne's
  // "May not request scopes for multiple resources" error
- return ['profile', 'email', 'offline_access', 'banking:ai:agent:read'];
+ return ['profile', 'email', 'offline_access', 'banking:ai:agent'];
```

**Why:** `banking:ai:agent:read` is deprecated per Phase 146 D-02; canonical scope is `banking:ai:agent`

---

## Verification Checklist

After applying fixes:

- [ ] **Audience validation passes:** User tokens with `aud=https://resource-server.pingdemo.com` accepted by auth.js
- [ ] **Scope injection works:** ff_inject_scopes injects `banking:read`/`banking:write` (canonical names)
- [ ] **Token exchange completes:** User token → MCP token with correct audience narrowing
- [ ] **PingOne test page shows correct scopes:** Uses canonical scope names, not deprecated ones
- [ ] **No "Token audience does not match" errors:** in API logs
- [ ] **Dashboard warning banner displays:** (if ff_inject_scopes enabled)
- [ ] **Build succeeds:** `npm run build --prefix banking_api_ui` exits 0

---

## Related Documentation

- **Phase 146 Decisions:** [SCOPE_VOCABULARY.md](../banking_api_server/SCOPE_VOCABULARY.md) § D-02
- **Canonical Scopes:** [SCOPE_VOCABULARY.md](../banking_api_server/SCOPE_VOCABULARY.md) § Canonical Scope List
- **Resource Server Mapping:** [SCOPE_VOCABULARY.md](../banking_api_server/SCOPE_VOCABULARY.md) § Resource Server Mapping
- **OAuth 2.0 RFC 6749:** https://tools.ietf.org/html/rfc6749#section-3.3
- **RFC 8693 Token Exchange:** https://tools.ietf.org/html/rfc8693#section-2.1

---

## Next Steps

1. **Immediate:** Fix ENDUSER_AUDIENCE in .env (Phase 1 above)
2. **Immediate:** Update oauthUser.js to use canonical scope name (Phase 3 above)
3. **Optional:** Add BANKING_API_RESOURCE_URI variable for clarity (Phase 2 above)
4. **Verify:** Restart BFF and retest token exchange workflow
5. **Document:** Update REGRESSION_PLAN.md § Bug Fix Log with these corrections
