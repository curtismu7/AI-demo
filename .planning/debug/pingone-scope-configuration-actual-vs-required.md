---
issue_slug: pingone-scope-configuration-gaps
status: active
created: 2026-04-08
source: SCOPE_AUDIT_REPORT.md + PingOne Console Screenshots
---

# PingOne Scope Configuration: Actual vs Required

## Overview

Comparison of PingOne OAuth application scope configuration (from console screenshots) against requirements documented in [SCOPE_AUDIT_REPORT.md](../../../SCOPE_AUDIT_REPORT.md).

**Date**: 2026-04-08  
**Source**: PingOne console screenshots + SCOPE_AUDIT_REPORT.md  
**Status**: 🔴 **CRITICAL GAPS FOUND**

---

## Summary Table

| Application | Configured via Console | Required per Docs | Status | Gap |
|---|---|---|---|---|
| **User App** | ✅ Exists | ✅ Documented | 🟡 PARTIAL | Missing 5/8 scopes |
| **Admin App** | ✅ Exists | ✅ Documented | 🔴 MISSING | Only 1/12+ scopes |
| **AI Agent App** | ✅ Exists | ⚠️ Not listed | 🟡 N/A | Configuration unclear |
| **MCP Exchanger** | ✅ Exists | ✅ Documented | 🟡 PARTIAL | Scopes misaligned |
| **Worker App** | ❌ Missing | ✅ Documented | 🔴 MISSING | Not created |

---

## Detailed Analysis

### 1️⃣ User App (Super Banking User App)

**ID**: b2752071-2d03-4927-b865-089dc40b9c85

#### Required Scopes (per SCOPE_AUDIT_REPORT.md)
```
profile
email
banking:ai:agent:read
banking:general:read
banking:accounts:read
banking:transactions:read
banking:transactions:write
```

#### Actual Scopes (from console screenshot)
```
agent:invoke (Super Banking Agent Gateway)
email (OpenID Connect)
offline_access (OpenID Connect)
openid (OpenID Connect)
profile (OpenID Connect)
```

#### Analysis

| Scope | Required | Actual | Status | Impact |
|-------|----------|--------|--------|--------|
| profile | ✅ | ✅ profile | ✅ MATCH | OIDC standard scope |
| email | ✅ | ✅ email | ✅ MATCH | OIDC standard scope |
| banking:ai:agent:read | ✅ CRITICAL | ❌ MISSING | 🔴 **GAP** | **RFC 8693 delegation permission** — User CANNOT delegate to agent |
| banking:general:read | ✅ | ❌ MISSING | 🟡 GAP | User cannot read general banking data |
| banking:accounts:read | ✅ | ❌ MISSING | 🟡 GAP | User cannot read accounts |
| banking:transactions:read | ✅ | ❌ MISSING | 🟡 GAP | User cannot read transactions |
| banking:transactions:write | ✅ | ❌ MISSING | 🟡 GAP | User cannot perform write operations |
| agent:invoke | ❓ UNDOCUMENTED | ✅ agent:invoke | ⚠️ EXTRA | Not in SCOPE_AUDIT_REPORT.md |
| offline_access | ❌ | ✅ offline_access | ⚠️ EXTRA | Allows refresh tokens |
| openid | ✅ IMPLICIT | ✅ openid | ✅ MATCH | OIDC standard scope |

#### 🔴 Critical Issue
**User app is MISSING `banking:ai:agent:read`** — This is the delegation permission required for 2-exchange token delegation. Without this scope, RFC 8693 `may_act` claims cannot be issued, and agent operations will fail.

#### Fix Required
**Add to User App scopes:**
- banking:ai:agent:read
- banking:general:read
- banking:accounts:read
- banking:transactions:read
- banking:transactions:write

---

### 2️⃣ Admin App (Super Banking Admin App)

**ID**: 14cefa5b-d9d6-4e51-8749-e938d4edd1c0

#### Required Scopes (per SCOPE_AUDIT_REPORT.md)
```
All resource server scopes (both Main Banking API and MCP Server)

Includes:
- banking:ai:agent:read
- banking:ai:agent:write
- banking:ai:agent:admin
- banking:accounts:read
- banking:accounts:write
- banking:accounts:admin
- banking:transactions:read
- banking:transactions:write
- banking:transactions:admin
- banking:general:read
- banking:general:write
- banking:general:admin
- banking:admin
- admin:read
- admin:write
- admin:delete
- users:read
- users:manage
```

#### Actual Scopes (from console screenshot)
```
openid (OpenID Connect)
```

#### Analysis

| Scope Category | Required Count | Actual | Status | Impact |
|---|---|---|---|---|
| Banking Main Scopes | ~13 | 0 | 🔴 **MISSING ALL** | Admin cannot access any banking resources |
| Admin Scopes | ~3 | 0 | 🔴 **MISSING ALL** | Admin cannot perform admin operations |
| MCP Server Scopes | ~4 | 0 | 🔴 **MISSING ALL** | Admin cannot access MCP resources |
| PingOne API Scopes | 0 | 0 | ⚠️ N/A | Management API needs separate worker app |
| OIDC Standard | 1 | 1 | ✅ MATCH | openid granted |

#### 🔴 Critical Issue
**Admin app has ONLY `openid` scope** — This is catastrophic. Admin app is completely non-functional for banking operations. It can only provide OIDC identity claims, nothing else.

#### Fix Required
**Add ALL the following scopes to Admin App:**
- banking:ai:agent:read, :write, :admin
- banking:accounts:read, :write, :admin
- banking:transactions:read, :write, :admin
- banking:general:read, :write, :admin
- banking:admin
- admin:read, :write, :delete
- users:read, :manage

**This is the highest priority fix.**

---

### 3️⃣ Super Banking AI Agent App

**ID**: 2533a614-fcb6-4ab9-82cc-9ab407f1dbda

#### Required Scopes (per SCOPE_AUDIT_REPORT.md)
⚠️ **NOT DOCUMENTED** in SCOPE_AUDIT_REPORT.md table (only 4 apps listed)

#### Actual Scopes (from console screenshot)
```
agent:invoke (Super Banking Agent Gateway)
banking:accounts:read (Super Banking MCP Server)
banking:agent:invoke (Super Banking AI Agent Service)
openid (OpenID Connect)
```

#### Analysis

This app is **not mentioned in SCOPE_AUDIT_REPORT.md**, but appears to be configured in PingOne. It has:
- `agent:invoke` — Agent gateway invocation
- `banking:accounts:read` — Account data access
- `banking:agent:invoke` — AI service agent invocation
- `openid` — OIDC identity

#### Status
⚠️ **UNCLEAR** — Cannot audit against requirements because it's not documented. Possible interpretations:
1. This is a separate "AI Agent Service" app not covered by RFC 8693 flow
2. This is a duplicate/alternative to MCP Exchanger app
3. This is the implementation of the "Agent" actor in delegation

#### Action Needed
**Clarify purpose:** Is this app needed, or should it be removed? Update SCOPE_AUDIT_REPORT.md to document the 5-app architecture if it includes this app.

---

### 4️⃣ MCP Token Exchanger (Super Banking MCP Token Exchanger)

**ID**: 6380065f-f328-41c2-81ed-1daeec811285

#### Required Scopes (per SCOPE_AUDIT_REPORT.md)
```
banking:ai:agent:read
banking:accounts:read
banking:transactions:read
banking:general:read
admin:read
p1:read:user
```

#### Actual Scopes (from console screenshot)
```
agent:invoke (Super Banking Agent Gateway)
banking:accounts:read (Super Banking Banking API)
banking:agent:invoke (Super Banking AI Agent Service)
banking:transactions:write (Super Banking Banking API)
openid (OpenID Connect)
p1:read:user (PingOne API)
p1:update:user (PingOne API)
```

#### Analysis

| Scope | Required | Actual | Status | Impact |
|-------|----------|--------|--------|--------|
| banking:ai:agent:read | ✅ CRITICAL | ❌ MISSING | 🔴 **GAP** | Cannot verify delegation permission |
| banking:accounts:read | ✅ | ✅ banking:accounts:read | ✅ MATCH | Accounts accessible |
| banking:transactions:read | ✅ | ❌ MISSING | 🟡 **GAP** | Transactions read access missing |
| banking:general:read | ✅ | ❌ MISSING | 🟡 **GAP** | General data missing |
| admin:read | ✅ | ❌ MISSING | 🟡 **GAP** | Admin operations blocked |
| p1:read:user | ✅ | ✅ p1:read:user | ✅ MATCH | PingOne user read works |
| agent:invoke | ❓ UNDOCUMENTED | ✅ agent:invoke | ⚠️ EXTRA | Not in requirements |
| banking:agent:invoke | ❓ UNDOCUMENTED | ✅ banking:agent:invoke | ⚠️ EXTRA | Different from banking:ai:agent:read |
| banking:transactions:write | ❌ (read-only) | ✅ banking:transactions:write | ⚠️ EXTRA | Grants write when only read needed |
| openid | ❌ | ✅ openid | ⚠️ EXTRA | Not in requirements |
| p1:update:user | ❌ (read-only) | ✅ p1:update:user | ⚠️ EXTRA | Grants write when only read needed |

#### 🟡 Issues
1. **Missing `banking:ai:agent:read`** — Cannot verify delegation authorization
2. **Missing `banking:transactions:read`** — Cannot read transactions
3. **Missing `banking:general:read`** — Cannot read general data
4. **Missing `admin:read`** — Cannot perform admin operations
5. **Over-permissioned** — Has write scopes when read-only is documented
6. **Scope naming mismatch** — Has `banking:agent:invoke` instead of `banking:ai:agent:read`

#### Fix Required
**Add missing scopes:**
- banking:ai:agent:read (**CRITICAL**)
- banking:transactions:read
- banking:general:read
- admin:read

**Consider removing extra scopes:**
- agent:invoke (if not needed)
- banking:agent:invoke (likely should be banking:ai:agent:read instead)
- banking:transactions:write (change to :read only)
- openid (not needed for client credentials)
- p1:update:user (change to read-only: p1:read:user only)

---

### 5️⃣ Worker App (Super Banking Worker Token)

**ID**: 95dc946f-5e0a-4a8b-a8ba-b587b244e005

#### Required Scopes (per SCOPE_AUDIT_REPORT.md)
```
p1:read:user (PingOne API)
p1:update:user (PingOne API)
```

#### Actual Scopes (from console screenshot)
⚠️ **NOT VISIBLE IN SCREENSHOTS** — We saw this app exists in the app list (first screenshot from earlier), but the Resources tab was not shown.

#### Analysis
**Status**: ⚠️ **CANNOT VERIFY** — Need to check the Worker app's scope configuration in PingOne console.

#### Action Needed
**Check Worker App scopes:** Open Super Banking Worker Token app in PingOne console and verify it has:
- p1:read:user
- p1:update:user

If missing, add these scopes.

---

## Summary of Required Fixes

### 🔴 CRITICAL (Blocks Token Exchange)

| App | Fix | Priority | Impact |
|-----|-----|----------|--------|
| **User App** | Add `banking:ai:agent:read` | **P0** | Without this, RFC 8693 delegation fails entirely |
| **Admin App** | Add all banking + admin + MCP scopes | **P0** | Admin app completely non-functional |
| **MCP Exchanger** | Add `banking:ai:agent:read` + other missing scopes | **P0** | Token exchange Step 6 will fail |

### 🟡 IMPORTANT (Reduces Functionality)

| App | Fix | Priority | Impact |
|-----|-----|----------|--------|
| **User App** | Add banking read/write scopes | **P1** | Better user experience, full feature access |
| **MCP Exchanger** | Remove over-permissioned scopes | **P2** | Security hardening (least privilege) |
| **Worker App** | Verify scope configuration | **P1** | Ensure management API works |

### ⚠️ CLARIFICATION NEEDED

| Item | Action |
|------|--------|
| **AI Agent App** | Clarify purpose and add to documentation |
| **Scope naming** | Align `banking:agent:invoke` with RFC 8693 naming |

---

## Execution Plan

### Phase 1: Critical Fixes (Must Do)
```
1. Add banking:ai:agent:read to User App
2. Add ALL scopes to Admin App (see list above)
3. Add missing scopes to MCP Exchanger
4. Verify Worker App has p1:read:user + p1:update:user
```

### Phase 2: Security Hardening (Should Do)
```
1. Remove undocumented scopes from MCP Exchanger
2. Remove write scopes from read-only operations
3. Audit AI Agent App purpose and scopes
```

### Phase 3: Documentation (Nice to Have)
```
1. Update SCOPE_AUDIT_REPORT.md with actual current state
2. Document the 5-app architecture (including AI Agent App)
3. Add PingOne console audit trail with timestamp
```

---

## Next Steps

1. **Run Phase 111 execution** (add app IDs to code config)
2. **Fix PingOne app scopes** per Critical Fixes above
3. **Verify token exchange flow** end-to-end
4. **Update documentation** with actual configuration
5. **Add regression test** to prevent future drift
