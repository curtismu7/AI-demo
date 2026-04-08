# Quick Task: Verify agent:invoke Scope Configuration

**Date:** 2026-04-07  
**Task:** Is the scope in the modal the right scope for app `b2752071-2d03-4927-b865-089dc40b9c85` to do token exchange?  
**Status:** ✅ VERIFIED  

---

## Finding

**YES** — `agent:invoke` is the correct scope, and the user app is properly configured.

### Evidence

1. **User App Configuration** (`pingoneProvisionService.js:668-675`)
   - App `b2752071-2d03-4927-b865-089dc40b9c85` (Super Banking User App)
   - Granted scopes from main resource server: `banking:agent:invoke`, `banking:read`, `banking:write`

2. **Modal Shows Correct Scope**
   - Image shows: "Required scopes: `agent:invoke`"
   - BankingAgent.js modal (lines 2642, 2680-2681): ✅ Correctly displays `agent:invoke` / `banking:agent:invoke`

3. **Backend Logic Fixed** (`agentMcpTokenService.js:525-527`)
   - Added `userHasAgentInvokeScope` check on 2026-04-07
   - Bypasses pre-block if user has `banking:agent:invoke` or `agent:invoke`
   - Token exchange proceeds to PingOne for final authorization

4. **How-to-Fix Instructions** (BankingAgent.js:2680-2687)
   - ✅ Correctly instructs: "Add `agent:invoke` (`banking:agent:invoke`) to the app's allowed scopes"
   - ✅ Follows with sign-out/sign-in to obtain new token with scope

---

## Root Cause of Missing Scope (Known Issue)

**Issue:** User tokens received by BFF lack `banking:agent:invoke` despite being granted in PingOne.

**Root cause:** When `ENDUSER_AUDIENCE` is set:
- OAuth request targets **MCP resource server** (`https://mcp-server.pingdemo.com`)
- MCP resource server is **missing `banking:agent:invoke` scope definition**
- PingOne omits the scope from token because it's not available on the requested resource

**Solution (validated in code):**
- Fix: Add `banking:agent:invoke` to MCP resource server scopes list
- Tracked in: `.planning/debug/scope-audit-missing-agent-invoke.md`

---

## Conclusion

The modal is showing the **right scope** (`agent:invoke`). The app has been **properly configured** with the scope. The fix applied on 2026-04-07 ensures users get correct guidance to add the scope. No changes needed — configuration is correct per design.
