# PingOne Console Update — Manual Steps

Apply the scope configuration changes documented in [PINGONE_RESOURCES_AND_SCOPES_MATRIX.md](../../docs/PINGONE_RESOURCES_AND_SCOPES_MATRIX.md)

---

## What's Changing

**The Critical Fix:** Change scope validation from `agent:invoke` to **`banking:ai:agent:read`** (Phase 69.1 standardization)

**Doc Update:** Matrix now clearly shows which resource server each scope belongs to

**PingOne Update Needed:** Ensure scopes are created on the correct resource server

---

## Step 1: Verify Main Banking Resource Server

1. Log in to **PingOne Admin Console**
2. Navigate to: **Applications** → **Resources** (or **APIs**, depending on your version)
3. Find: **Main Banking API** (or similar name per your config)
4. Check the **Resource URI** matches: `https://resource.pingdemo.com` (or your configured value)

---

## Step 2: Create/Verify Scopes on Main Banking Resource

**On the Main Banking Resource Server, verify these scopes exist:**

### Always Present (OIDC):
- ✅ `openid`
- ✅ `profile`
- ✅ `email`
- ✅ `offline_access`

### Banking Scopes (verify these):
- ✅ `banking:general:read`
- ✅ `banking:general:write`
- ✅ `banking:admin:full`
- ✅ `banking:admin:read`
- ✅ `banking:admin:write`
- ✅ `banking:accounts:read`
- ✅ `banking:transactions:read`
- ✅ `banking:transactions:write`
- ✅ `banking:sensitive:read`
- ✅ `banking:sensitive:write`

### Agent Scopes (CRITICAL — verify name is correct):
- ✅ `banking:ai:agent:read` ← **This MUST be here (NOT `agent:invoke`)**
- ✅ `banking:ai:agent:write`
- ✅ `banking:ai:agent:admin`
- ✅ `ai_agent`

**If `banking:ai:agent:read` doesn't exist:** Click **+ Add Scope** and create it with name `banking:ai:agent:read`

**If you see `agent:invoke` or `banking:agent:invoke`:** DELETE these — they are wrong

---

## Step 3: Grant Scopes to Admin OAuth App

1. Navigate to: **Applications** → **Applications** (not Resources)
2. Find: **Super Banking Admin App** (matches `admin_client_id` config)
3. Click the app → **Resource Permissions** tab (or **Scopes Granted**)
4. Select resource: **Main Banking Resource Server**
5. Verify these scopes are **Granted** ✅:
   - `openid`, `profile`, `email`, `offline_access`
   - `banking:general:read`, `banking:general:write`, `banking:admin:full`, `banking:admin:read`, `banking:admin:write`
   - `banking:accounts:read`, `banking:transactions:read`, `banking:transactions:write`

**Do NOT grant:** `banking:ai:agent:read` to Admin (admin uses delegated scope for agent)

---

## Step 4: Grant Scopes to Customer OAuth App (CRITICAL)

1. Navigate to: **Applications** → **Applications**
2. Find: **Super Banking User App** (matches `user_client_id` config)
3. Click the app → **Resource Permissions** tab
4. Select resource: **Main Banking Resource Server**
5. Based on `user_role` config default (`customer`), grant these scopes ✅:
   - `openid`, `profile`, `email`, `offline_access`
   - `banking:general:read`, `banking:general:write`
   - `banking:accounts:read`
   - `banking:transactions:read`, `banking:transactions:write`
   - **`banking:ai:agent:read`** ← **CRITICAL FOR AGENT DELEGATION**

**For other user roles:**
- `readonly`: Grant `banking:general:read`, `banking:accounts:read`, `banking:transactions:read` only
- `admin`: Grant all `banking:*` scopes
- `ai_agent`: Grant **`banking:ai:agent:read`** + all banking read/write

---

## Step 5: Verify MCP Resource Server (if configured)

If `MCP_SERVER_RESOURCE_URI` env var is set (RFC 8693 token exchange):

1. Navigate to: **Applications** → **Resources**
2. Find: **MCP Server** resource (URI matches `MCP_SERVER_RESOURCE_URI`)
3. Verify these scopes exist:
   - `admin:read`, `admin:write`, `admin:delete`
   - `users:read`, `users:manage`
   - `banking:general:read`, `banking:general:write`

**Optional:** Grant to **Agent MCP Exchanger** app if using 3-step exchange

---

## Step 6: Test Login

### As Customer:
1. Sign out (if already logged in)
2. Navigate to `/` → click **Customer Login**
3. Enter test credentials
4. **After login:** Open **Debu → Token Chain**
5. **Verify:** Token shows `banking:ai:agent:read` in the scope list ✅
   - Should see: `✓ Agent scopes: banking:ai:agent:read`
   - Should NOT see: `⚠️ NO agent scopes found` ❌

### Try Agent Action:
1. On `/dashboard` → click **Agent** tab (FAB or menu)
2. Try an agent action (e.g., "Get my accounts")
3. Should succeed ✅ (or fail with clear error, not scope error)

### Troubleshoot If Failed:
1. Check Token Chain again — verify `banking:ai:agent:read` in token
2. If missing from token: Customer must **sign out and back in** to get new token with updated scopes
3. If still missing: Re-verify Super Banking User App has scope granted in PingOne Console

---

## Step 7: Verify Admin (RFC 8693 Exchange)

### If using admin token exchange:
1. Sign in as **Admin** → Navigate to `/admin`
2. Try an agent action through admin interface
3. Token exchange should use **Admin App** to exchange for MCP token
4. Should succeed ✅

---

## Rollback

If tokenexchange fails after changes:

1. Check error in **Token Chain** panel
2. Common issues:
   - Scope name typo (must be `banking:ai:agent:read`, not `agent:invoke`)
   - Scope granted to wrong app or resource
   - User needs to re-login after scope changes

**Revert if needed:** Remove `banking:ai:agent:read` from Super Banking User App → app will block agent actions with clear error message

---

## Checklist

- [ ] Main Banking Resource Server exists with correct URI
- [ ] Scopes exist on Main Banking Resource:
  - [ ] `openid`, `profile`, `email`, `offline_access`
  - [ ] `banking:general:read`, `banking:general:write`
  - [ ] `banking:ai:agent:read` ← **IS PRESENT AND NAMED CORRECTLY**
  - [ ] Not `agent:invoke` ❌ (if present, DELETE)
- [ ] Admin OAuth App has all required scopes granted
- [ ] Super Banking User App has **`banking:ai:agent:read`** granted ← **CRITICAL**
- [ ] Customer can login and Token Chain shows scopes
- [ ] Customer can try agent actions without scope error
- [ ] Documentation updated in matrix ✅

---

## Reference

See [PINGONE_RESOURCES_AND_SCOPES_MATRIX.md](../../docs/PINGONE_RESOURCES_AND_SCOPES_MATRIX.md) for complete details on all resources, apps, and scopes.

**Key sections:**
- §2 Applications × Resources × Scopes (what to grant)
- §7 Quick Verification Checklist (what to verify)
- §8 Troubleshooting (if issues)
