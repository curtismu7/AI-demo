# Actor Token Visibility Issue — Pre-Login Token Chain

**Issue:** Actor token missing from token chain display before user login, but agent is operational.

**Status:** Investigation started

---

## Reported Symptoms

### Expected Behavior
Actor token (RFC 8693 §2.1) should be visible in token chain before user login since:
- Agent FAB is loaded and operational for guests
- Agent must have some identity to call MCP tools
- Token chain should show the full chain: Subject Token → Exchange → MCP-Scoped Token

### Actual Behavior  
Token chain image shows only:
1. Subject Token (user access token, RFC 8693 §2.1) — WAITING
2. Token Exchange (subject_token → MCP-scoped, RFC 8693 §3.1) — WAITING
3. MCP-Scoped Access Token (RFC 8693 §3.2) — WAITING

**Missing:** Where is the actor token? How was the exchange performed without an actor?

### Timeline
- Recent phases (195-197) refined token exchange and delegation flows
- Actor token should have been wired in per RFC 8693 delegation pattern
- Issue first observed after reviewing post-login token chain flow

### Key Questions
1. **Pre-login state:** Is the agent using a stub/synthetic token before user login? If so, where is it in the chain?
2. **Actor claim:** When agent exchanges for MCP-scoped token, what `act` claim is used? Subject-only or nested?
3. **Display logic:** Is the token chain filtering out actor tokens from display, or are they genuinely absent?
4. **Phases 194/195:** Did token chain visualization updates accidentally hide actor tokens? Or were they never displayed?

---

## Investigation Checklist

- [ ] TokenChainDisplay.js — How does it render actor vs subject tokens?
- [ ] agentFlowDiagramService.js — Does it show actor claim in the exchange step?
- [ ] agentMcpTokenService.js — How is `act` claim set? Is it present in exchanged token?
- [ ] UnauthenticatedAgent behavior — What token does guest agent use before login?
- [ ] Phase 195 changes — Did act validation or removal affect display?


---

## Code Analysis Findings

### 1. agentSessionMiddleware.js
**Discovery:** `agentSessionMiddleware` explicitly rejects unauthenticated requests:
- Returns 401 if `!req.session?.user`
- Returns 401 if no `oauthTokens.accessToken`
- **Implication:** Guests CANNOT call `/api/banking-agent/*` routes without authentication

### 2. TokenChainDisplay.js
**Discovery:** Component has two display modes:
- `'with-actor'`: Displays `act` claim (BFF delegated per RFC 8693)
- `'subject-only'`: Displays "No act claim — subject-only RFC 8693"
- **Implication:** System CAN run without actor token; mode determines display

### 3. Pre-login Question
**Unclear:** If guests can't access the agent (401), how is the token chain diagram visible before login?
- Is there a demo/preview diagram?
- Does the diagram use hardcoded/synthetic data for guests?
- Is the user looking at a post-login diagram and misremembering timing?

---

## Hypotheses

### H1: Subject-Only Mode (Production State)
- Before user login, agent intentionally uses subject-only (no actor token)
- This simplifies the exchange: just the user's token, no BFF delegation
- Actor token added ONLY after user authenticates fully
- **Expected display:** "1-Exchange (no actor)" banner

### H2: Demo/Educational Diagram
- Pre-login state shows a *static* example diagram, not a live token chain
- Static example may not include actor tokens (educational simplification)
- Real agent flow uses actor tokens (added post-login)
- **Expected display:** Generic flow, not live update

### H3: UI Bug (Token Chain not Rendering Actor)
- Actor token exists in the exchange data
- But TokenChainDisplay's rendering logic filters it out or skips it
- Phase 194 or 195 changes may have inadvertently hidden it
- **Expected finding:** `act` claim present in data, but `renderActorClaim()` not called

---

## Next Steps (for debugger)

1. **Check token chain data fetcher:** Does `/api/tokens/session-preview` return `act` claims?
2. **Trace AgentFlowDiagramPanel:** When/how does it obtain token data?  
3. **Review Phase 195 changes:** Did act validation or removal affect display?
4. **Test live:** Examine actual network response for `/api/tokens/session-preview` and `/api/mcp/tool`

---

## ROOT CAUSE & SOLUTION

### The Real Answer

**Q: Why don't I see actor token before user login?**
- **A:** Guests cannot call agent endpoints at all — `agentSessionMiddleware` returns 401. If you see token chain before login, it's either:
  - A static/demo diagram (not live tokens)
  - Or you're viewing post-login (the "before" reference may be a misremembering)

**Q: How did we get MCP scoped token without actor token?**
- **A:** This is intentional design. RFC 8693 supports two modes:
  1. **With actor:** User token + Agent credentials → MCP token with `act` claim proving which client acted
  2. **Subject-only:** Just user token → MCP token without `act` claim

**Q: Why is actor token missing now?**
- **A:** Because `PINGONE_MCP_TOKEN_EXCHANGER_CLIENT_ID` is **not set**. When not configured:
  - Line 769: System logs warning "RFC 8693 exchange will run subject-only"
  - Line 776: Pushes tokenEvent 'on-behalf-of-warning' to UI
  - Line 791: Skips actor token acquisition
  - Result: MCP token has no `act` claim

### Fix

**To show actor token on MCP-scoped token:**

Set these environment variables on the BFF:
```bash
PINGONE_MCP_TOKEN_EXCHANGER_CLIENT_ID=<client-id-of-Super-Banking-MCP-Token-Exchanger>
PINGONE_MCP_TOKEN_EXCHANGER_CLIENT_SECRET=<secret>
```

Then:
1. On next login, agent will acquire actor token (client credentials)
2. Exchange runs with both subject + actor
3. MCP token will have `act: { client_id: "..." }` claim 
4. Token chain will display actor token and show `'with-actor'` mode

### Why Subject-Only Mode is Acceptable

- User token is still NEVER forwarded to MCP (RFC 8693 boundary respected)
- Audit trail shows user identity (from decoded subject_token on server logs)
- But MCP server cannot distinguish "which client acted" (could be agent, could be another service)
- Solution: Enable actor token (configure client credentials above)

