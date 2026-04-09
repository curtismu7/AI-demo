# Token Scope Diagnostic Guide — April 9, 2026

## The Problem We're Diagnosing

**Status:** PingOne Super Banking User App has `agent:invoke` but code now checks for `banking:ai:agent:read`

| Item | Value | Impact |
|------|-------|--------|
| PingOne App Scope | `agent:invoke` | ❌ Wrong (old) |
| Code Expects | `banking:ai:agent:read` | ✅ Correct (per Phase 69.1) |
| Result | Token won't match validation | ❌ Customer gets scope error |

---

## What We Fixed (April 9)

### 1. **Code Scope Validation** ✅
- [Commit `9040ba9`] Updated code to recognize `banking:ai:agent:read` instead of `agent:invoke`
- File: `banking_api_server/config/oauthUser.js` line 48
- File: `banking_api_server/services/agentMcpTokenService.js` lines 525-549
- File: `banking_api_ui/src/components/BankingAgent.js` error messages

### 2. **Token Logging Enhancement** ✅
- [Commit `5a4519a`] Added scope visibility to Token Chain
- File: `banking_api_server/services/agentMcpTokenService.js` lines 196-211
- Token now shows:
  * ```
    Token carries X scope(s): [scope1 scope2 ...]
    ✓ Agent scopes: agent:invoke
    ```
  * OR
  * ```
    Token carries X scope(s): [scope1 scope2 ...]
    ⚠️ NO agent scopes found
    ```

---

## How to Debug This Now

### Step 1: Deploy the Latest Code
```bash
vercel --prod  # or push to main → auto-deploy
```

### Step 2: Customer Logs In
- Navigate to https://your-app/
- Click "Sign In"
- Complete authentication
- You'll be on `/dashboard`

### Step 3: Check the Token Chain
**In the browser DevTools / Token Chain panel:**

Look for **"User access token"** section showing:

#### Scenario A: ✓ Scopes Present
```
Token carries 8 scope(s): openid profile email offline_access banking:read banking:write banking:accounts:read...
✓ Agent scopes: agent:invoke
```
→ **Meaning:** Token HAS scopes, but they're the OLD name. Need to fix PingOne app.

#### Scenario B: ⚠️ NO Agent Scopes
```
Token carries 4 scope(s): openid profile email offline_access
⚠️ NO agent scopes found
```
→ **Meaning:** Token is missing agent scopes entirely. PingOne app not configured with any agent scope.

#### Scenario C: ✓ Correct Scopes (After Fix)
```
Token carries 9 scope(s): openid profile email offline_access banking:read banking:write banking:accounts:read...
✓ Agent scopes: banking:ai:agent:read
```
→ **Meaning:** Everything matches. Token exchange should work.

---

## What We Need to Fix in PingOne

Based on what you see in the token (Scenario A or B above):

### If you see `agent:invoke` (Scenario A):
1. **PingOne Admin → Applications → Super Banking User App**
2. **Find Scopes tab**
3. **Delete:** `agent:invoke` ❌
4. **Add:** `banking:ai:agent:read` ✅
5. **Customer must sign out and back in** to get new token

### If you see NO agent scopes (Scenario B):
1. **PingOne Admin → Applications → Super Banking User App**
2. **Find Scopes tab**
3. **Check what scopes ARE there** (make note)
4. **Add:** `banking:ai:agent:read` ✅
5. **Verify** it appears in the list
6. **Customer must sign out and back in** to get new token

---

## After PingOne Fix

**After you add `banking:ai:agent:read` to the User App:**

1. Customer signs out completely
2. Customer signs back in fresh
3. New token should now have `banking:ai:agent:read`
4. Token chain will show:
   ```
   ✓ Agent scopes: banking:ai:agent:read
   ```
5. Try agent action again → should see exchange OR better error message

---

## Files Modified This Session

| Commit | File | Changes |
|--------|------|---------|
| `9040ba9` | `banking_api_server/config/oauthUser.js` | Line 48: Changed scope request to `banking:ai:agent:read` |
| `9040ba9` | `banking_api_server/services/agentMcpTokenService.js` | Lines 525, 531-549: Updated scope validation and error messages |
| `9040ba9` | `banking_api_ui/src/components/BankingAgent.js` | Lines 2642, 2680-2687: Updated error modal to show correct scope |
| `5a4519a` | `banking_api_server/services/agentMcpTokenService.js` | Lines 196-211, 220-224: Added scope extraction and metadata |

---

## Source of Truth Documents

If you need to understand WHY these changes:

- **[PINGONE_NAMING_STANDARDIZATION_AUDIT.md](../../PINGONE_NAMING_STANDARDIZATION_AUDIT.md)** § Phase 69.1.4 — Defines `banking:ai:agent:read` as standardized scope
- **[SCOPE_AUDIT_REPORT.md](../../SCOPE_AUDIT_REPORT.md)** — Audit showing correct scope names
- **[docs/PINGONE_APP_SCOPE_MATRIX.md](../../docs/PINGONE_APP_SCOPE_MATRIX.md)** § 2 — How to configure scopes in PingOne apps

---

## Next Steps

1. **Verify** code is deployed
2. **Check token** in Token Chain after customer login
3. **Add `banking:ai:agent:read`** to PingOne User App if not present
4. **Delete `agent:invoke`** if it was the old/wrong scope
5. **Customer re-login** to get fresh token with correct scopes
6. **Test agent action** again

---

## Questions?

If the token shows something unexpected, paste it here and we can debug further.

The token chain now makes it **completely transparent** what scopes the token has vs what the code expects.
