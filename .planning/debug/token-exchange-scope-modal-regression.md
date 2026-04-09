---
id: token-exchange-scope-modal-regression
title: "REGRESSION: Token Exchange Missing Required Scopes modal appearing (agent:invoke)"
created: 2026-04-09
status: investigating
---

# Issue: Token Exchange Scope Modal Regression

## Symptoms Reported

**Image:** Modal showing "Token Exchange: Missing Required Scopes"
- Required scopes: `agent:invoke`
- Your token has: `openid offline_access profile email`

**User Statement:**
- "We fixed this" — 2026-04-07 fix commit related files
- "That is not the right scope the code should be checking against"
- Asking if related phases completed (Phase 101?)

## Current Code State (as of now)

### Backend (agentMcpTokenService.js)
- ✅ Line 525: `userHasAgentInvokeScope` check exists
- ✅ Line 527: Conditional block prevents blocking if user HAS the scope
- ✅ 2026-04-07 fix appears to be in place

### Frontend (BankingAgent.js)
- ✅ Line 2637: Modal displays "Token Exchange: Missing Required Scopes"
- ✅ Line 2654: Uses `scopeErrorModal.requiredScopes`
- ✅ 2026-04-07 fix appears to be in place (should show `agent:invoke`)

## Investigation Questions

1. Is modal appearing every action or intermittently?
2. Does user have `banking:agent:invoke` scope in token?
3. Is `ff_skip_token_exchange` flag enabled (bypass)?
4. When exactly did regression occur?
5. Is this on local dev (port 3000/4000) or production?
6. Has Phase 101 (token exchange diagram) been completed?

## Hypothesis

**H1 (Most Likely):** Regression in commit between 2026-04-07 fix and now
- Possible revert or unintended change to `agentMcpTokenService.js`
- Check git log for accidental changes to token exchange validation

**H2:** Token state issue
- User doesn't actually have `banking:agent:invoke` in token
- PingOne configuration incomplete for scope assignment
- Token refresh missing the scope

**H3:** Phase 101 incomplete
- New logic in Phase 101 overrode the 2026-04-07 fix
- Token exchange flow refactored for diagram UI
- Need to verify Phase 101 maintains backward compatibility

## Next Steps

- [ ] Check git log from 2026-04-07 to now for token exchange changes
- [ ] Verify user token payload (token inspector)
- [ ] Check feature flag state
- [ ] Confirm Phase 101 completion and integration
- [ ] Test reproduction scenario

## Related Commits (Known Fixes)

- **2026-04-07**: Wrong required scopes fix (agentMcpTokenService.js, BankingAgent.js)
- **2026-04-04**: Vercel production agent unavailable fix (GET /api/mcp/inspector/tools)
- **2026-04-04**: Agent transfer ≥ $250 without MFA fix

