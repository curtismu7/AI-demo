---
title: Scope Configuration Fix - Complete Implementation Guide
date: 2026-04-08
status: 🔴 READY FOR EXECUTION
priority: CRITICAL - Blocks RFC 8693 token exchange
---

# Scope Configuration Fix: Complete Implementation Guide

**Status**: 🔴 **Ready to Execute** — All documentation and automation created  
**Issue**: PingOne scope configuration drift prevents RFC 8693 token exchange  
**Impact**: User cannot delegate to agent; token exchange Step 6 fails  

---

## Executive Summary

| Component | Issue | Status | Fix Available |
|-----------|-------|--------|---|
| **User App** | Missing `banking:ai:agent:read` | 🔴 CRITICAL | ✅ Yes |
| **Admin App** | Has only `openid`; missing 17 scopes | 🔴 CRITICAL | ✅ Yes |
| **MCP Exchanger** | Missing 4 scopes; has 5 extra | 🔴 CRITICAL | ✅ Yes |
| **Worker App** | Needs verification | ⚠️ VERIFY | ✅ Yes |

**Total Scopes to Add**: ~30  
**Total Scopes to Remove**: ~5  
**Est. Time**: 30 minutes (manual) or 5 minutes (automated)

---

## Choose Your Path

### 🚀 Path A: Automated Fix (5 minutes)

**Best for**: Developers comfortable with Python and credentials

```bash
# 1. Set environment variables
export PINGONE_ENVIRONMENT_ID="d02d2305-f445-406d-82ee-7cdbf6eeabfd"  # Your env ID
export PINGONE_WORKER_CLIENT_ID="95dc946f-5e0a-4a8b-a8ba-b587b244e005"
export PINGONE_WORKER_CLIENT_SECRET="<your-worker-secret>"  # Get from console

# 2. Preview changes (dry-run)
python3 scripts/fix-pingone-scopes.py --dry-run

# 3. Apply changes
python3 scripts/fix-pingone-scopes.py

# 4. Verify in console (manual spot-check)
# Go to each app and confirm scope counts match expected

# 5. Run Phase 111 to update code config
/gsd-execute-phase 111
```

**Advantages:**
- ✅ Fast and automated
- ✅ Batch operations on all apps
- ✅ Error handling built in
- ✅ Dry-run mode for preview

**Requirements:**
- Python 3.6+
- `pip install requests`
- Worker app credentials

---

### 📖 Path B: Manual Console Fix (30 minutes)

**Best for**: Those who prefer UI or want to verify each step

```bash
# 1. Open the detailed fix guide
open .planning/debug/PINGONE-SCOPE-MANUAL-FIX-GUIDE.md

# 2. Follow step-by-step for each app:
#    - Step 1: User App (add 5 banking scopes)
#    - Step 2: Admin App (add 18 scopes, remove openid)
#    - Step 3: MCP Exchanger (add 4, remove 5)
#    - Step 4: Worker App (verify has 2)

# 3. Use this handy visual guide:
open .planning/debug/pingone-scope-configuration-actual-vs-required.md

# 4. After all changes, verify:
# - User App: 10 scopes total
# - Admin App: 18 scopes total
# - MCP Exchanger: 6 scopes total
# - Worker App: 2 scopes total

# 5. Run Phase 111 to update code config
/gsd-execute-phase 111
```

**Advantages:**
- ✅ Visual confirmation at each step
- ✅ Full control and transparency
- ✅ Great for auditing
- ✅ No API credentials needed (use PingOne console)

**Requirements:**
- PingOne console access (Master User or Admin role)
- ~30 minutes
- Attention to detail

---

## Critical Scopes to Fix

### 🔴 Most Important: `banking:ai:agent:read`

**Why**: This is the RFC 8693 delegation permission  
**Where**: MUST be in User App and MCP Exchanger apps  
**Impact**: Without this, agents cannot act on behalf of users

**Fix**:
- User App: ADD `banking:ai:agent:read`
- MCP Exchanger: ADD `banking:ai:agent:read`

### 🔴 Second Priority: Admin App Scopes

**Why**: Admin app is completely non-functional (only has `openid`)  
**Where**: Needs 18 scopes across Banking API and MCP Server  
**Impact**: Administrative operations will not work

**Fix**:
- Admin App: REMOVE `openid`
- Admin App: ADD all 18 banking + admin + MCP scopes

---

## Implementation Steps

### Step 1️⃣: Review the Issue

Read the audit reports to understand what's wrong:

```bash
cat .planning/debug/pingone-scope-configuration-actual-vs-required.md
cat .planning/debug/scope-audit-compliance-not-followed.md
```

**Key takeaways:**
- 4 apps need scope updates
- RFC 8693 delegation broken (missing `banking:ai:agent:read`)
- Admin app non-functional (only has `openid`)

### Step 2️⃣: Choose Fix Method

**Option A (Recommended)**: Use Python automation
```bash
# Preview changes
python3 scripts/fix-pingone-scopes.py --dry-run

# Apply changes
python3 scripts/fix-pingone-scopes.py
```

**Option B (Manual)**: Follow console guide
```bash
# Open guide and follow step-by-step
cat .planning/debug/PINGONE-SCOPE-MANUAL-FIX-GUIDE.md
```

### Step 3️⃣: Verify in PingOne Console

After fix completes, spot-check a couple apps:

1. Go to console.pingone.com
2. Select environment
3. Click each app to verify scope count:
   - User App: 10 scopes
   - Admin App: 18 scopes
   - MCP Exchanger: 6 scopes
   - Worker App: 2 scopes

### Step 4️⃣: Run Phase 111

Update code config with app client IDs:

```bash
/gsd-execute-phase 111
```

This adds the app IDs to `pingoneBackendDefaults.js` so the BFF uses correct credentials.

### Step 5️⃣: Test Token Exchange

After Phase 111 completes:

```bash
# Start the app
npm run dev

# Test 1-exchange flow:
# 1. Login as user
# 2. Open agent
# 3. Run read-only tool
# 4. Check token inspector for MCP token

# Test 2-exchange flow:
# 1. Toggle "2-Exchange" in token settings
# 2. Run same tool again
# 3. Verify `act` claim appears in token
```

---

## Scope Fix Details

### User App (Super Banking User App)

**ID**: b2752071-2d03-4927-b865-089dc40b9c85

Current scopes (5):
- agent:invoke
- email
- offline_access
- openid
- profile

Add these scopes (5):
- ✅ banking:ai:agent:read ← **CRITICAL for RFC 8693**
- ✅ banking:accounts:read
- ✅ banking:general:read
- ✅ banking:transactions:read
- ✅ banking:transactions:write

**Result**: 10 scopes total

---

### Admin App (Super Banking Admin App)

**ID**: 14cefa5b-d9d6-4e51-8749-e938d4edd1c0

Current scopes (1):
- openid

Remove (1):
- ✗ openid

Add these scopes (18):
- ✅ banking:accounts:read, :write, :admin (3)
- ✅ banking:transactions:read, :write, :admin (3)
- ✅ banking:general:read, :write, :admin (3)
- ✅ banking:ai:agent:read, :write, :admin (3)
- ✅ banking:admin (1)
- ✅ admin:read, :write, :delete (3)
- ✅ users:read, :manage (2)

**Result**: 18 scopes total

---

### MCP Exchanger (Super Banking MCP Token Exchanger)

**ID**: 6380065f-f328-41c2-81ed-1daeec811285

Current scopes (7):
- agent:invoke ← Remove
- banking:accounts:read ← Keep
- banking:agent:invoke ← Remove (wrong scope name)
- banking:transactions:write ← Remove (should be read-only)
- openid ← Remove
- p1:read:user ← Keep
- p1:update:user ← Remove (should be read-only)

Remove (5):
- ✗ agent:invoke
- ✗ banking:agent:invoke
- ✗ banking:transactions:write
- ✗ openid
- ✗ p1:update:user

Add these scopes (4):
- ✅ banking:ai:agent:read ← **CRITICAL for RFC 8693**
- ✅ banking:transactions:read
- ✅ banking:general:read
- ✅ admin:read

**Result**: 6 scopes total

---

### Worker App (Super Banking Worker Token)

**ID**: 95dc946f-5e0a-4a8b-a8ba-b587b244e005

Should have exactly (2):
- ✅ p1:read:user ← Verify exists
- ✅ p1:update:user ← Verify exists

**Result**: 2 scopes total (no changes needed if correct)

---

## Troubleshooting

### Problem: Python script fails with "requests not found"

**Solution**:
```bash
pip install requests
```

### Problem: "Authentication failed" error

**Solution**:
1. Verify worker credentials are correct
2. Check environment variables are set:
   ```bash
   echo $PINGONE_ENVIRONMENT_ID
   echo $PINGONE_WORKER_CLIENT_ID
   ```
3. Verify worker app exists in PingOne console

### Problem: Can't find scope in dropdown

**Solution**:
1. Make sure scope exists on the resource server:
   - Go to Resources section in PingOne
   - Check if the scope is created under that resource
2. If scope doesn't exist, it needs to be created first

### Problem: Changes not taking effect

**Solution**:
1. Refresh browser page
2. Log out and back in to console
3. Wait 30 seconds and try again

---

## Success Criteria

✅ **Scope Configuration**: All apps have correct scopes per SCOPE_AUDIT_REPORT.md  
✅ **RFC 8693 Enabled**: User app and MCP Exchanger have `banking:ai:agent:read`  
✅ **Admin Functional**: Admin app has all 18 required scopes  
✅ **Code Config**: Phase 111 adds app IDs to code  
✅ **Token Exchange**: Both 1-exchange and 2-exchange flows work  
✅ **No Errors**: No 401/403 auth errors in agent operations  

---

## Timeline

| Step | Time | Who | What |
|------|------|-----|------|
| 1. Review issue | 5 min | Developer | Read audit reports |
| 2. Fix scopes (auto) | 5 min | Automation | Run Python script |
| 2. Fix scopes (manual) | 30 min | Developer | Follow console guide |
| 3. Verify | 5 min | Developer | Check each app in console |
| 4. Phase 111 | 10 min | Claude executor | Run `gsd-execute-phase` |
| 5. Test | 10 min | Developer | Test token exchange |
| **Total** | **35-60 min** | | |

---

## Next Actions

### ✅ Phase 1: Fix PingOne Scopes (THIS)

Choose one:
- **Automated**: `python3 scripts/fix-pingone-scopes.py`
- **Manual**: Follow `PINGONE-SCOPE-MANUAL-FIX-GUIDE.md`

### ✅ Phase 2: Update Code Config

```bash
/gsd-execute-phase 111
```

### ✅ Phase 3: Test and Verify

```bash
npm run dev
# Test 1-exchange and 2-exchange flows
# Verify token inspector shows correct claims
```

---

## Reference Files

| File | Purpose |
|------|---------|
| `PINGONE-SCOPE-MANUAL-FIX-GUIDE.md` | Step-by-step console instructions |
| `pingone-scope-configuration-actual-vs-required.md` | Detailed audit and gaps |
| `scope-audit-compliance-not-followed.md` | Original issue documentation |
| `fix-pingone-scopes.py` | Automated Python fix (recommended) |
| `fix-pingone-scopes.sh` | Bash wrapper for API calls |
| `SCOPE_AUDIT_REPORT.md` | Documentation requirements (source of truth) |

---

## Questions?

- **What if I don't have worker credentials?** → Use manual console method
- **Is this safe to run?** → Yes, but use `--dry-run` first to preview
- **Will this break anything?** → No, only adds/removes scopes; doesn't change app IDs
- **How long does it take?** → 5 min (auto) or 30 min (manual)
- **Can I undo if something goes wrong?** → Yes, just add/remove scopes back

---

**Last Updated**: 2026-04-08  
**Status**: 🟢 Ready to Execute  
**Next**: Choose Path A (automated) or Path B (manual) and proceed!
