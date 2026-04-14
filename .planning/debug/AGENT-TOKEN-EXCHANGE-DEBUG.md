# Agent Token Exchange Debug — "store is not defined"

**Error:** "Token exchange failed: store is not defined"  
**Context:** Agent FAB action "Show me my accounts 🏦"  
**Reported:** During Phase 146 planning session  
**Status:** Investigation in progress

---

## Error Flow Analysis

### Stack Trace Path (Reconstructed)

```
user invokes: "Show me my accounts 🏦"
  ↓
FAB message handler → processAgentMessage()
  [banking_api_server/services/bankingAgentLangChainService.js:36]
  ↓
createBankingAgent({ userId, userToken, sessionId, tokenEvents })
  [banking_api_server/services/agentBuilder.js:82]
  ↓
resolveMcpAccessTokenWithEvents(mockReq, 'banking_agent')
  [banking_api_server/services/agentBuilder.js:108]
  ↓
?? INNER ERROR: "store is not defined" ??
  ↓
catch (exchangeError) → throw new Error(`Token exchange failed: ${exchangeError.message}`)
  [banking_api_server/services/agentBuilder.js:115]
  ↓
User sees: "Token exchange failed: store is not defined" (wrapped in "Could not parse" by agent framework)
```

---

## Hypotheses (Ranked by Likelihood)

### H1: ConfigStore Initialization Race Condition ⭐⭐⭐⭐⭐
**Likelihood:** VERY HIGH

**Context:**
- `configStore.ensureInitialized()` is middleware at line 501 of server.js
- On cold start (Vercel serverless) or concurrent requests, a request might reach `resolveMcpAccessTokenWithEvents()` before initialization completes
- `resolveMcpAccessTokenWithEvents()` calls `configStore.getEffective()` at line 385-386 (and many more places)
- If configStore singleton was not fully initialized, calling methods might reference an undefined internal variable called `store`

**Root Cause Locale:**
- File: `banking_api_server/services/configStore.js`
- Likely: Constructor or initialization method references `this.store` before it's created
- OR: A require() of a dependency fails, leaving configStore partially initialized

**Evidence:**
- Error only happens on first/cold invocation of agent  
- Error references `store` (not `configStore`), suggesting internal variable in configStore

**Fix Strategy:**
1. Add guard in `resolveMcpAccessTokenWithEvents()` to check `configStore.initialized` before calling `.getEffective()`
2. Add `await configStore.ensureInitialized()` at start of `resolveMcpAccessTokenWithEvents()`
3. OR: Make agentBuilder middleware-aware, never invoke before config middleware completes

---

### H2: Session/Request Object Missing `session.store`
**Likelihood:** MEDIUM

**Context:**
- Line 96-99 of agentBuilder.js creates mockReq:
  ```javascript
  const mockReq = {
    session: { oauthTokens: { accessToken: userToken }, id: sessionId },
    sessionID: sessionId,
  };
  ```
- This mockReq is incomplete — it lacks `req.sessionStore` (Express session middleware setup)
- Some downstream code might try to access `req.sessionStore` or `req.session.store`

**Fix Strategy:**
- Verify mockReq has all required properties (sessionStore, session.store)
- Mock the sessionStore if it's needed for token exchange

---

### H3: Dependency Module Import Failure
**Likelihood:** LOW–MEDIUM

**Context:**
- `agentMcpTokenService.js` line 36: `const configStore = require('./configStore')`
- If configStore.js has a require() error in its dependencies, the variable might be partially undefined
- A dependency like `better-sqlite3` or `@vercel/kv` might fail to load in the agent context

**Fix Strategy:**
- Check server logs for MODULE_NOT_FOUND or require() errors during startup
- Verify all dependencies are bundled in agent execution path

---

### H4: Vercel Serverless / Cold Start Context Mismatch
**Likelihood:** MEDIUM

**Context:**
- Agent invocation happens via FAB (which might execute in different Lambda/container)
- That container might have different env var context (KV_REST_API_URL, SESSION_SECRET, etc.)
- ConfigStore might fail to initialize in that environment, leaving `store` undefined

**Fix Strategy:**
- Check if agent runs on different serverless instance than BFF
- Ensure all env vars are propagated to agent handler

---

## Data Needed for Diagnosis

To progress, we need:

1. **Full Stack Trace** (if available in agent logs)
   - Exact line number where "store" is referenced
   - Which module threw the error

2. **Environment Context**
   - Local development or production/staging?
   - Docker / Vercel serverless?
   - KV_REST_API_URL configured?
   - Vercel environment variables visible to agent?

3. **Reproduction Steps**
   - Does error happen on **first login → first agent question**?
   - Or does it happen after successful agent invocation attempts?
   - Is it **deterministic** (always fails) or **intermittent** (race condition)?

4. **Recent Changes**
   - Did agent handler ship recently?
   - Did Phase 146 scope injection feature go live?
   - Any recent configStore changes?

---

## Next Steps

### Immediate (No Code Changes)

1. **Check agent execution logs** for full stack trace
   - If Vercel: check Function Logs in Production Monitoring
   - If local Docker: check docker logs
   - Extract exact line number of "store is not defined"

2. **Test reproduction**
   - Log in → immediately invoke agent with "Show me my accounts"
   - Log in → wait 5 min → invoke agent (does it succeed?)
   - This tells us if it's a cold-start or auth race condition

3. **Check configStore initialization** at server startup
   - Add log: `console.log('[server] configStore initialized:', configStore.initialized)`
   - Verify it returns `true` before first request

### Planned (Code Changes)

#### Plan A: Guard configStore Access (Safe, Low Risk)
Add to `resolveMcpAccessTokenWithEvents()` before first `configStore.getEffective()`:

```javascript
async function resolveMcpAccessTokenWithEvents(req, tool) {
  // Guard: Ensure configStore is initialized before token exchange
  if (!configStore || typeof configStore.getEffective !== 'function') {
    const err = new Error(
      'configStore not initialized. Ensure server middleware ran before token exchange.'
    );
    err.code = 'configstore_not_ready';
    err.httpStatus = 503;
    throw err;
  }

  // ... rest of function
}
```

**Benefit:** Clearer error message ("configStore not initialized" vs "store is not defined")  
**Impact:** None if configStore is always initialized (which it should be)  
**Effort:** 5 min

---

#### Plan B: Add Agent-Specific Middleware (Moderate Risk)
Ensure token exchange always runs after configStore init:

```javascript
// In agentBuilder.js or bankingAgentLangChainService.js
async function createBankingAgent({ userId, userToken, sessionId, tokenEvents = [] }) {
  // Ensure configStore is ready before token exchange
  await configStore.ensureInitialized();
  
  // Now safe to proceed
  const mockReq = { ... };
  const result = await resolveMcpAccessTokenWithEvents(mockReq, 'banking_agent');
  // ...
}
```

**Benefit:** Eliminates race condition if it exists  
**Impact:** Minimal (async guard adds <10ms)  
**Effort:** 10 min

---

#### Plan C: Full MockReq reconstruction (Higher Risk)
Verify mockReq has all session properties:

```javascript
const mockReq = {
  session: {
    oauthTokens: { accessToken: userToken },
    id: sessionId,
    save: (cb) => cb(),  // Mock save
    store: null,  // Mock store
  },
  sessionID: sessionId,
  sessionStore: null,  // Add sessionStore Mock
};
```

**Benefit:** Ensures downstream code doesn't expect real session properties  
**Impact:** Possible if this is the real issue  
**Effort:** 20 min + testing

---

## Decision Point

**User:** Execute Phase 146 first?

The user noted "Maybe Phase 146 will fix this". Phase 146 adds scope injection feature which modifies token handling.

**Recommendation:**
1. Execute Phase 146 Wave 1 (Plans 01–02) immediately — establishes canonical scope vocabulary
2. **After** Wave 1 executes, re-test agent with "Show me my accounts"
3. If error persists: run Plan A (configStore guard) + Plan B (initialization guard)
4. If error resolves: Document in Phase 146 SUMMARY and move on

**Rationale:** Phase 146 might eliminate the race condition by restructuring token exchange scopes. Easier than debugging in the dark.

---

## Files to Monitor

- `banking_api_server/services/configStore.js` — initialization logic
- `banking_api_server/services/agentMcpTokenService.js` — token exchange (line 333+)
- `banking_api_server/services/agentBuilder.js` — agent creation (line 82+)
- `banking_api_server/services/bankingAgentLangChainService.js` — message processing
- `banking_api_server/server.js` — middleware order (line 501)

---

## Commit Hash References

- Phase 146 planning: `dc6b1e2`
- Recent scope research: `e8f4f14`
- Token tracking enhancement: `6da533c`

---

## Status

- [ ] Full stack trace obtained from agent logs
- [ ] Reproduction steps confirmed (cold start / intermittent / deterministic)
- [ ] Environment context verified
- [ ] Phase 146 execution started
- [ ] Configstore guard added (if needed)
- [ ] Agent tested post-Phase 146
- [ ] Error resolved or escalated

