---
title: PingOne Scope Configuration Fix - Manual Console Guide
date: 2026-04-08
priority: 🔴 CRITICAL
source: scope-audit-compliance-not-followed.md
---

# PingOne Scope Configuration Manual Fix Guide

**Status**: 🔴 CRITICAL — Fixes required to enable RFC 8693 token exchange

## Quick Reference

| App | Action | Scopes to Add | Scopes to Remove |
|-----|--------|---------------|------------------|
| **User App** | 🔴 FIX | 7 scopes (missing `banking:ai:agent:read`) | None |
| **Admin App** | 🔴 FIX | 18 scopes (missing all banking/admin) | `openid` |
| **MCP Exchanger** | 🔴 FIX | Add 4, Remove 5 | See details |
| **Worker App** | ⚠️ VERIFY | Verify has exactly 2 | Remove any extras |

---

## Step-by-Step Console Instructions

### Prerequisites
- [ ] You have access to PingOne Console as Master User or Admin
- [ ] Bookmark: https://console.pingone.com
- [ ] Have this guide open in another window

---

## ✅ Step 1: User App - Add Missing Banking Scopes

**App**: Super Banking User App  
**ID**: b2752071-2d03-4927-b865-089dc40b9c85  
**Status**: 🔴 **CRITICAL** — Missing `banking:ai:agent:read` breaks delegation

### A. Navigate to App

1. Go to https://console.pingone.com
2. Select your environment (top left)
3. Left sidebar → **Connections** → **Applications**
4. Search for or click **Super Banking User App**

### B. Current State (What you'll see)

Currently has these scopes:
- ✅ agent:invoke (Super Banking Agent Gateway)
- ✅ email (OpenID Connect)
- ✅ offline_access (OpenID Connect)
- ✅ openid (OpenID Connect)
- ✅ profile (OpenID Connect)

### C. Add Required Scopes

Click the **Resources** tab

Under "Allowed Scopes", click **Grant Scopes** or **+ Add** button

**Find and grant these 7 scopes:**

```
1. profile (OpenID Connect) — Already granted ✓
2. email (OpenID Connect) — Already granted ✓
3. banking:ai:agent:read (Super Banking API) — ADD THIS ⚠️
4. banking:general:read (Super Banking API) — ADD THIS ⚠️
5. banking:accounts:read (Super Banking API) — ADD THIS ⚠️
6. banking:transactions:read (Super Banking API) — ADD THIS ⚠️
7. banking:transactions:write (Super Banking API) — ADD THIS ⚠️
```

**For each scope to add:**
- Click **Grant Scopes** button
- Search for scope name (e.g., "banking:ai:agent:read")
- Select it and click **Save**

### D. Verification

After adding all 5 missing banking scopes, your User App should have:
```
✅ agent:invoke
✅ email
✅ offline_access (keep this)
✅ openid
✅ profile
✅ banking:ai:agent:read         ← NEW
✅ banking:general:read          ← NEW
✅ banking:accounts:read         ← NEW
✅ banking:transactions:read     ← NEW
✅ banking:transactions:write    ← NEW
```

**Count**: 10 scopes total (was 5, now 10)

---

## ✅ Step 2: Admin App - Add All Missing Scopes

**App**: Super Banking Admin App  
**ID**: 14cefa5b-d9d6-4e51-8749-e938d4edd1c0  
**Status**: 🔴 **CRITICAL** — Only has `openid`; completely non-functional

### A. Navigate to App

1. Go back to **Connections** → **Applications**
2. Search for or click **Super Banking Admin App**

### B. Current State (What you'll see)

Currently has:
- ✅ openid (OpenID Connect)

That's it. Nothing else.

### C. Remove Current Scope

Admin app should NOT have `openid` (it's for user login, not admin operations).

Click **Resources** tab and find `openid` in "Allowed Scopes"  
Click the **X** or **Revoke** button to remove it

### D. Add All Required Banking + Admin Scopes

Click **Grant Scopes** button

**Add these 18 scopes in this order:**

#### Banking API Main Scopes (9)
```
1. banking:accounts:read (Super Banking API)
2. banking:accounts:write (Super Banking API)
3. banking:accounts:admin (Super Banking API)
4. banking:transactions:read (Super Banking API)
5. banking:transactions:write (Super Banking API)
6. banking:transactions:admin (Super Banking API)
7. banking:general:read (Super Banking API)
8. banking:general:write (Super Banking API)
9. banking:general:admin (Super Banking API)
```

#### Banking AI Agent Scopes (3)
```
10. banking:ai:agent:read (Super Banking API)
11. banking:ai:agent:write (Super Banking API)
12. banking:ai:agent:admin (Super Banking API)
```

#### Legacy Banking Scope (1)
```
13. banking:admin (Super Banking API)
```

#### MCP Server Scopes (5)
```
14. admin:read (Super Banking MCP Server)
15. admin:write (Super Banking MCP Server)
16. admin:delete (Super Banking MCP Server)
17. users:read (Super Banking MCP Server)
18. users:manage (Super Banking MCP Server)
```

**Tip**: Add 3-4 at a time to avoid overloading the UI. Click **Grant Scopes** multiple times.

### E. Verification

After completing, Admin App should have exactly these 18 scopes:

```
✅ banking:accounts:read, :write, :admin
✅ banking:transactions:read, :write, :admin
✅ banking:general:read, :write, :admin
✅ banking:ai:agent:read, :write, :admin
✅ banking:admin
✅ admin:read, :write, :delete
✅ users:read, :manage
```

**Count**: 18 scopes total

---

## ✅ Step 3: MCP Exchanger - Add Missing + Remove Extra Scopes

**App**: Super Banking MCP Token Exchanger  
**ID**: 6380065f-f328-41c2-81ed-1daeec811285  
**Status**: 🔴 **CRITICAL** — Missing `banking:ai:agent:read` prevents token exchange

### A. Navigate to App

1. Go back to **Connections** → **Applications**
2. Search for or click **Super Banking MCP Token Exchanger**

### B. Current State (What you'll see)

Currently has:
- ✅ agent:invoke (Super Banking Agent Gateway)
- ✅ banking:accounts:read (Super Banking Banking API)
- ✅ banking:agent:invoke (Super Banking AI Agent Service)
- ✅ banking:transactions:write (Super Banking Banking API)
- ✅ openid (OpenID Connect)
- ✅ p1:read:user (PingOne API)
- ✅ p1:update:user (PingOne API)

### C. Remove These Scopes First

Click **Resources** tab

**Find and remove these 5 scopes:**
```
1. agent:invoke — REMOVE
2. banking:agent:invoke — REMOVE (use banking:ai:agent:read instead)
3. banking:transactions:write — REMOVE (change to :read only)
4. openid — REMOVE (not needed for client credentials)
5. p1:update:user — REMOVE (keep only p1:read:user)
```

For each scope, click the **X** or **Revoke** button

### D. Add These Required Scopes

After removing the 5 above, click **Grant Scopes**

**Add these 6 scopes:**
```
1. banking:ai:agent:read (Super Banking API) — CRITICAL for delegation
2. banking:transactions:read (Super Banking API) — Read transactions
3. banking:general:read (Super Banking API) — Read general data
4. admin:read (Super Banking MCP Server) — Admin operations
5. p1:read:user (PingOne API) — Already exists, but verify
6. p1:update:user (PingOne API) — Already exists, but verify
```

### E. Verification

After changes, MCP Exchanger should have exactly these 6 scopes:

```
✅ banking:ai:agent:read         ← ADDED (CRITICAL)
✅ banking:accounts:read         ← Kept (already correct)
✅ banking:transactions:read     ← ADDED
✅ banking:general:read          ← ADDED
✅ admin:read                    ← ADDED
✅ p1:read:user                  ← Kept
```

**Count**: 6 scopes total (was 7 with wrong ones, now 6 with correct ones)

**Removed**: agent:invoke, banking:agent:invoke, banking:transactions:write, openid, p1:update:user

---

## ✅ Step 4: Worker App - Verify Configuration

**App**: Super Banking Worker Token Oracle  
**ID**: 95dc946f-5e0a-4a8b-a8ba-b587b244e005  
**Status**: ⚠️ **VERIFY** — Should have exactly 2 scopes

### A. Navigate to App

1. Go back to **Connections** → **Applications**
2. Search for or click **Super Banking Worker Token**

### B. Verify Configuration

Click **Resources** tab

**Must have exactly these 2 scopes (no more, no less):**
```
✅ p1:read:user (PingOne API) — REQUIRED
✅ p1:update:user (PingOne API) — REQUIRED
```

### C. If Configuration is Wrong

**If has more than 2 scopes:** Click X to remove extras

**If missing any of the 2:** Click **Grant Scopes** and add:
- p1:read:user (PingOne API)
- p1:update:user (PingOne API)

### D. Confirmation

✅ Worker app should have **exactly 2 scopes** — no more, no less

---

## ✅ Step 5: Verification Checklist

After making all changes, run through this checklist:

### User App (b2752071-2d03-4927-b865-089dc40b9c85)
- [ ] Has 10 scopes total
- [ ] Includes `banking:ai:agent:read` ← CRITICAL
- [ ] Includes `banking:transactions:read`, :write
- [ ] Includes `banking:general:read`, `banking:accounts:read`

### Admin App (14cefa5b-d9d6-4e51-8749-e938d4edd1c0)
- [ ] Has 18 scopes total
- [ ] Removed `openid`
- [ ] Includes all 3 banking:ai:agent:* scopes
- [ ] Includes all banking read/write/admin scopes
- [ ] Includes all MCP server admin/users scopes

### MCP Exchanger (6380065f-f328-41c2-81ed-1daeec811285)
- [ ] Has 6 scopes total
- [ ] Includes `banking:ai:agent:read` ← CRITICAL
- [ ] Removed: agent:invoke, banking:agent:invoke, banking:transactions:write, openid, p1:update:user
- [ ] Kept: p1:read:user

### Worker App (95dc946f-5e0a-4a8b-a8ba-b587b244e005)
- [ ] Has exactly 2 scopes
- [ ] p1:read:user and p1:update:user only

---

## ✅ Step 6: Next Steps After Console Changes

### A. Code Configuration (Phase 111)

After scope changes are complete in PingOne, run Phase 111:

```bash
cd /Users/cmuir/P1Import-apps/Banking
/gsd-execute-phase 111
```

This adds the app client IDs to code configuration so the BFF uses correct credentials.

### B. Test Token Exchange Flow

After Phase 111 completes:

1. **Test 1-exchange (user token → MCP token):**
   ```
   1. Login as user in UI
   2. Open Agent
   3. Run a read-only tool (view accounts)
   4. Should succeed with MCP token displayed
   ```

2. **Test 2-exchange (user + agent → MCP delegated token):**
   ```
   1. Toggle to "2-Exchange" mode in token exchange settings
   2. Run same tool again
   3. Should show `act` claim in token inspector
   ```

3. **Test Management API:**
   ```
   1. Check user profile update works (Authorize window should show User ID)
   2. No 401 errors from Management API
   ```

### C. Validation

All scopes now align with SCOPE_AUDIT_REPORT.md ✓  
RFC 8693 delegation enabled ✓  
Token exchange flow end-to-end ✓

---

## 🔍 Troubleshooting

### Issue: "Scope not available in dropdown"

**Cause**: Scope doesn't exist on the resource server  
**Fix**: First verify the scope exists:
- Go to **Resources** (left sidebar)
- Click the resource server (Super Banking API, MCP Server, or PingOne API)
- Check if the scope is listed under **Scopes** section
- If not, you may need to create it

### Issue: Changes not taking effect

**Cause**: Browser cache or UI lag  
**Fix**: 
1. Close and reopen app details
2. Refresh page (F5)
3. Log out of console and log back in

### Issue: Permission denied when trying to add scopes

**Cause**: User role doesn't have admin permissions  
**Fix**: Ask your Master User or Environment Admin to make the changes

---

## 📋 Summary

|  | Before | After | Status |
|--|--------|-------|--------|
| **User App Scopes** | 5 (missing ai:agent:read) | 10 | ✅ FIXED |
| **Admin App Scopes** | 1 (only openid) | 18 | ✅ FIXED |
| **MCP Exchanger Scopes** | 7 (wrong mix) | 6 (correct) | ✅ FIXED |
| **Worker App Scopes** | Unknown | 2 (verified) | ✅ FIXED |
| **RFC 8693 Enabled** | ❌ No | ✅ Yes | 🔴→🟢 |

---

**Last Updated**: 2026-04-08  
**Related Files**:
- [scope-audit-compliance-not-followed.md](scope-audit-compliance-not-followed.md)
- [pingone-scope-configuration-actual-vs-required.md](pingone-scope-configuration-actual-vs-required.md)
- [Phase 111 Plan](../.planning/phases/111-scope-audit-compliance-app-ids/111-01-PLAN.md)
