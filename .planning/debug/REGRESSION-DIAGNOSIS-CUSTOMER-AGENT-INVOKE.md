---
id: regression-customer-agent-invoke
title: "REGRESSION DIAGNOSIS: Customer user missing agent:invoke scope in token"
created: 2026-04-09
severity: CRITICAL
---

# Regression Analysis: Missing agent:invoke Scope

## The Problem

**Symptom:** Customer/user getting modal "Token Exchange: Missing Required Scopes: agent:invoke"  
**Token has:** `openid offline_access profile email` (OIDC only, NO agent:invoke)  
**Expected:** Token should have `agent:invoke` OR should have `banking:read banking:write`

## Where Code Determines Scopes

**File:** `banking_api_server/config/oauthUser.js` (User app OAuth config)

```javascript
get scopes() {
  const oidcOnly = configStore.getEffective('ff_oidc_only_authorize') === 'true';
  const base = ['openid', 'profile', 'email', 'offline_access'];
  
  // FLAG CHECK: If OIDC-only is ON, return just base scopes (NO agent:invoke!)
  if (oidcOnly) return base;  // ← THIS IS THE LIKELY CULPRIT
  
  // DELEGATION MODEL: If ENDUSER_AUDIENCE env var is set, use delegation model
  const enduserAudience = process.env.ENDUSER_AUDIENCE;
  if (enduserAudience) {
    return ['profile', 'email', 'offline_access', 'banking:agent:invoke'];  // ← SHOULD GET THIS
  }
  
  // STANDARD MODEL: Otherwise use banking scopes
  const banking = getScopesForUserType('customer');  // Gets banking:read, banking:write, etc.
  return [...new Set([...base, ...banking])];  // ← OR THIS
}
```

## Two Possible Causes

### Hypothesis 1: `ff_oidc_only_authorize` Flag is ON ⚠️

**If enabled:** Customer gets OIDC-only scopes, missing agent:invoke entirely  
**Result:** Token exchange is impossible  
**Fix:** Disable `ff_oidc_only_authorize` in Feature Flags or Admin Config

### Hypothesis 2: Neither Condition Met (Worst Case)

**If:**  
- `ff_oidc_only_authorize` = false/off  
- `ENDUSER_AUDIENCE` env var = NOT SET (empty or undefined)

**Then:** Code tries to use `getScopesForUserType('customer')` BUT customer app in PingOne might not be configured with `banking:agent:invoke` scope

**Result:** Token has only basic banking scopes, not agent:invoke  
**Fix:** Configure customer app in PingOne with `banking:agent:invoke` scope

## Phase 101 Status

✅ Phase 101 plans (101-01-PLAN.md, 101-02-PLAN.md) EXIST  
✅ Phase 101 execution summaries EXIST  
✅ Token exchange scope fix (commit 7158e5a) IS ON MAIN  
✅ Agent:invoke check logic IS DEPLOYED  

**But:** Phase 101-02 is **PARTIALLY COMPLETE** — integration into AgentFlowDiagramPanel blocked on file editing

## Root Cause Verification Needed

**For CUSTOMER/USER who sees the modal:**

1. Check feature flag status:
   ```bash
   # Admin Console: Feature Flags → search "ff_oidc_only_authorize"
   # If ON, that's the problem
   ```

2. Check environment variables:
   ```bash
   # Server: echo $ENDUSER_AUDIENCE
   # If empty/undefined with ff_oidc_only_authorize=false, check PingOne app config
   ```

3. Check PingOne customer app configuration:
   - Go to PingOne Console → Applications → Super Banking User App
   - Check "Allowed Scopes" — should have `banking:agent:invoke`
   - If missing, that's the problem

## Fix Strategy

**Option A (DELEGATION MODEL - Recommended):**
- Set `ENDUSER_AUDIENCE=https://ai-agent.pingdemo.com` (or your resource server)
- Disable `ff_oidc_only_authorize`
- Ensure customer app has `banking:agent:invoke` scope

**Option B (STANDARD MODEL - Legacy):**
- Leave `ENDUSER_AUDIENCE` unset
- Disable `ff_oidc_only_authorize`
- Ensure customer app has `banking:read`, `banking:write`, and related banking scopes

**Option C (Bypass - For Testing Only):**
- Enable `ff_skip_token_exchange` in Feature Flags (skips exchange entirely)
- NOT recommended for production

## Who Deployed Phase 101?

Phase 101 was executed on **2026-04-08** (commits 7158e5a on Apr 7, ab9d1ee on Apr 8).  
It correctly changed the scope requirement to `agent:invoke` for the delegation model.  
But PingOne app configuration or env var setup may not have been completed.
