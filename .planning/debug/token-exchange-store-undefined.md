# 🔍 DEBUGGING: Token Exchange "store is not defined" Error

## Issue
**Error:** `Could not parse: Token exchange failed: store is not defined`  
**Trigger:** User attempts to show/display accounts  
**Context:** Recent Phase 146 changes (scope vocabulary alignment, ff_inject_scopes feature)  
**Timeline:** Error appeared after Phase 146 completion  

## Symptoms Gathered
- **Expected behavior:** User can view their accounts
- **Actual behavior:** Token exchange fails with "store is not defined" runtime error
- **Error message:** "Could not parse: Token exchange failed: store is not defined"
- **Phase context:** Phase 146-02 added `ff_inject_scopes` feature using `configStore.getEffective()`

## Initial Investigation Status
- ✅ Phase 146 files committed successfully
- ✅ agentMcpTokenService.js syntax valid
- ✅ configStore.js syntax valid
- ✅ Builds complete without errors (npm run build exits 0)
- ✅ API server running on port 3001

## Root Cause Hypothesis
The error message structure `Token exchange failed: store is  not defined` suggests:
1. A JavaScript runtime error where variable `store` is referenced but undefined
2. The error is being caught and wrapped in "Token exchange failed:" message
3. This is NOT a syntax error (code compiled and runs), but a runtime reference error

### Likely Sources
1. **Unimported variable in agentMcpTokenService.js** — Missing `require()` for a module
2. **Scope reference error in ff_inject_scopes code block** — Variable used outside scope
3. **Related file modification** — Changes in Phase 146 to oauthService, configStore, or related

## Investigation Plan

### ✓ Step 1: Check for bare `store` references (DONE - No matches)
Searched for unqualified `store.` references → No results

### Step 2: Verify Phase 146 Changes
- Check git commits for exactly what changed
- Look for any `store` variable reference
- Trace the error path through token exchange code

### Step 3: Check Runtime Error Context
- Run API with DEBUG flags for more verbose logging
- Attempt to trigger the error and capture full stack trace
- Identify exact line where `store is not defined` occurs

### Step 4: Verify Imports in Key Files
- agentMcpTokenService.js - confirm `configStore` imported
- oauthService.js - confirm all deps imported
- Routes calling these services - proper setup

## Exact Code Location We Modified (Phase 146-02)
File: `banking_api_server/services/agentMcpTokenService.js` lines 447-491

Key code pattern:
```javascript
const configStore = require('./configStore');  // Should be at top

// ... later in code (line 454+):
const ffInjectScopes = configStore.getEffective('ff_inject_scopes') === true ||
    configStore.getEffective('ff_inject_scopes') === 'true';
```

If this is the issue, `configStore` is either:
- Not imported
- Imported incorrectly
- The module itself has an error

## Next Action
Need to verify Phase 146 commits actually applied the correct require() statements and that `configStore` is in scope at the point where ff_inject_scopes logic uses it.

## Investigation Results (Deep Dive)

### Code Review Findings:
1. ✅ `configStore` properly imported (line 34 of agentMcpTokenService.js)
2. ✅ `sanitizeClaims()` function - clean code, no store references
3. ✅ `buildTokenEvent()` function - clean code, no store references  
4. ✅ `describeMayAct()` function - clean code, no store references
5. ✅ `appendUserTokenEvent()` function - calls buildToken Event/describeMayAct, both clean
6. ✅ ff_inject_scopes code block (lines 447-491) - uses `configStore.getEffective()` correctly

### Key Insight: "Could not parse:" prefix
- The error message format is: `Could not parse: Token exchange failed: store is not defined`
- The `Could not parse:` suggests JSON parsing or response parsing is failing
- The `Token exchange failed:` is the standard error wrapper from oauthService.js line 290
- The `store is not defined` is a JavaScript ReferenceError message

### Hypothesis: 
The error is being caught DURING token exchange, wrapped with "Token exchange failed:", but the original error is a ReferenceError about `store`.

Probable location: Inside oauthService.performTokenExchange() or performTokenExchangeWithActor(), something is referencing a variable `store` that doesn't exist when the function executes.

### CRITICAL: Check if other service was modified in Phase 146
Need to specifically trace where oauthService calls might be happening and if any configuration passes `store` as a variable name.

## Next Action: Direct Reproduction
1. Start API server with verbose DEBUG logging
2. Make API call to trigger token exchange
3. Capture full JavaScript stack trace
4. Identify exact line where "store is not defined" error originates
