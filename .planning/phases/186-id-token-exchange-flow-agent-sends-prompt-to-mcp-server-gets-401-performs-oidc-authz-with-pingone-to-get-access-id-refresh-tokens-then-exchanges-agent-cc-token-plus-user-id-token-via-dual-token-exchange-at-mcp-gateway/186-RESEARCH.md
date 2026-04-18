# Phase 186: ID Token Exchange Flow — Research

**Researched:** 2026-04-18  
**Status:** Ready for planning  
**Domain:** ID token–based dual OAuth token exchange, RFC 8693 variant of Phase 184 pattern

---

## Executive Summary

Phase 186 reuses the dual-token exchange architecture from Phase 184 but substitutes the **user's ID token** for the user's access token. The codebase already has all required OAuth mechanics:
- `performTokenExchangeFromIdToken(idToken, ...)` exists and is ready (oauthService.js:318)
- `performTokenExchangeWithActor(...)` supports actor claims (line 373)
- Token chain visualization is established (Phase 185)

**Risk Assessment:** LOW. This is a configuration variant of an implemented pattern, not a new architectural risk.

---

## Technical Stack & Approach

### 1. Core OAuth 2.0 / OIDC Mechanics (Validated)

| Component | Current State | Phase 186 Usage |
|-----------|---------------|-----------------|
| PingOne Authorization Code + PKCE | ✅ Live (`oauthUser.js`) | Reuse for ID token retrieval |
| ID token issuance | ✅ Live (includes `sub`, `aud`, `iat`, `exp`) | Extract and use in exchange |
| Token Exchange (RFC 8693) | ✅ Live (`performTokenExchange*` methods) | Adapt to use ID token as subject |
| Actor claim (`act`) | ✅ Live from Phase 184 | Reuse exact same agent CC token + claim structure |
| Session management (Upstash) | ✅ Live (Vercel, serverless) | Store ID token temporarily, same as access token |

**Finding:** No new OAuth mechanics needed; all foundations exist.

### 2. Existing Code Reuse Analysis

#### oauthService.js — Token Exchange Methods

**Existing:** `performTokenExchangeFromIdToken(idToken, audience, scopes)` at line 318
```javascript
// This method already exists! 
// Input: idToken (JWT), audience, scopes
// Output: MCP-scoped access token
// Exactly what Phase 186 needs
```

**Already provided:** `performTokenExchangeWithActor(subjectToken, actorToken, audience, scopes)` at line 373
```javascript
// Supports actor claims for delegation
// Can accept ID token as subjectToken
// Agent CC token as actorToken
```

**Verification:** Both methods are callable from route handlers; just need to wire the 401 catch logic.

#### PingOneTestPage.jsx — Test Flow Patterns

**Existing test flows (TEST_CONFIG):**
- `exchange1` → Direct MCP token exchange (1-token)
- `exchange2` → Dual-token with agent CC (Phase 184)
- `exchange3` → Legacy two-step (deprecated)

**Finding:** Test page already has card-based presentation pattern; Phase 186 adds a 4th card reusing the same layout.

#### Session Management (express-session + Upstash)

- ID tokens are JWTs (~300-500 bytes)
- Stored in `req.session.oauthTokens` (existing pattern)
- Upstash Redis handles serverless sessions (Vercel tested)
- No new session storage needed; extend existing struct

### 3. Architectural Decision Points

#### A. Where to Integrate 401 Handling

**Option A (Recommended):** App-layer middleware or MCP call handler
```
Request to MCP → Catch 401 → Divert to OIDC auth → 
Resume token exchange → Retry MCP call
```
- Pros: Transparent to user, matches D-01 spec
- Cons: Requires middleware or handler wrapper
- Existing precedent: Phase 1-3 auth flows use similar pattern

**Option B:** MCP client-level (less control)
- Pros: Keeps app simpler
- Cons: MCP client can't initiate OIDC; would need app callback
- Not recommended per CLAUDE.md (BFF controls auth)

**Decision:** Option A (transparent app-layer handling)

#### B. ID Token vs Access Token — Why This Matters

| Token | Use Case | Phase 186 Choice |
|-------|----------|-----------------|
| **Access token** | Grants permission to resource API | Phase 184 (current) |
| **ID token** | Asserts user identity | Phase 186 (new) |
| **Refresh token** | Extends session | Separate; not in exchange |

**Why ID token in Phase 186?**
- User specification: "we need ID token to be the same as our new 2 token flow"
- MCP Gateway accepts it in token exchange (RFC 8693 subject_token can be ID token)
- Demonstrates identity-based delegation vs. capability-based (access token)
- Educational value: shows different token types perform different roles

**Risk:** ID tokens have shorter lifetime (~15-30 min) vs. access tokens (~1 hr). Solution: Fresh ID token from new auth (handled by auth flow), then immediate use.

#### C. Session State Management

**Flow:**
```
1. Agent requests MCP → receives 401
2. App catches 401, initiates OIDC auth
3. User redirects to PingOne, authenticates
4. PingOne redirects back with auth code
5. App exchanges code for ID + access + refresh tokens
6. App stores in session
7. App performs token exchange: agent CC + new ID token
8. MCP token obtained, stored
9. Original agent request retried
10. Token chain visualized (Phase 185 display)
```

**Session artifacts:**
- `req.session.oauthTokens.idToken` (new, temporary per 401 incident)
- `req.session.agentToken` (pre-held from startup, unchanged)
- `req.session.mcpToken` (result, reused for agent calls)

**Finding:** No schema changes needed; extend existing `oauthTokens` struct.

### 4. Test Page Integration

**Existing pattern (Phase 184 exchange2 card):**
```jsx
<TestCard
  title="Dual Token Exchange"
  description="Agent CC + User Token → MCP Token"
  config={TEST_CONFIG.exchange2}
  onSend={handleExchange2}
/>
```

**New pattern (Phase 186 exchange3 card):**
```jsx
<TestCard
  title="ID Token Exchange (401 → Auth → Exchange)"
  description="MCP 401 → User Auth → Agent CC + ID Token → MCP Token"
  config={TEST_CONFIG.idTokenExchange}
  onSend={handleIdTokenExchange}
  showTokenChain={true}  // Use Phase 185 visualization
/>
```

**Finding:** Reuse TestCard component; add new config object, new handler.

### 5. Documentation Surface

**Phase 184 docs (existing):** `docs/PINGONE_TWO_TOKEN_EXCHANGES.md`
- Explains dual-token concept
- Shows agent CC + access token pattern
- Covers RFC 8693 in context

**Phase 186 additions (new):**
- New subsection: "ID Token Variant — When and Why"
- Code example: dual exchange with ID token instead of access token
- Diagram: 401 → auth → exchange sequence
- Interactive link: test page exchange3 flow

**Risk:** None; pure documentation, no schema changes.

---

## Verification Architecture

### Pre-Implementation Verification (What to test)

1. **OAuth Scope:** ID token retrieved successfully from PingOne with `openid profile email`
2. **Token Exchange:** `performTokenExchangeFromIdToken()` accepts ID token and returns MCP token
3. **Actor Claim:** MCP token includes `act` claim referencing agent CC token owner
4. **Session State:** ID token stored and retrieved within same user session only
5. **401 Interception:** App correctly catches 401 from MCP and diverts to auth flow
6. **Test Page:** New exchange card flows through 3-step sequence (send, auth, exchange)
7. **Token Chain Display:** Phase 185 visualization shows ID token in chain pre-exchange

### Nyquist Validation Dimensions

**Dimension 1 (User outcomes):** Agent request succeeds via ID token exchange instead of failing on 401  
**Dimension 2 (Key links):** 401 intercept → auth trigger → token exchange retry wired correctly  
**Dimension 3 (Artifacts):** Test page card, documentation section, backend handler exist  
**Dimension 4 (Integration):** No session conflicts; ID token scoped to incident user only  
**Dimension 5 (Edge cases):** Handles auth failure (return error), exchange failure (return error), successful flow (return result)  
**Dimension 6 (Regression):** Existing Phase 184 exchanges (access token) unchanged; legacy flows untouched  
**Dimension 7 (Security):** ID token never leaks to frontend; BFF custodian pattern maintained  
**Dimension 8 (Performance):** Auth detour adds ~2-3 sec latency (acceptable for OIDC + exchange); caches result in session

---

## Known Limitations & Constraints

| Constraint | Impact | Mitigation |
|-----------|--------|-----------|
| ID token lifetime (15-30 min) | Can't reuse old ID tokens | Fresh auth on each 401 incident (acceptable) |
| OIDC redirect adds latency | First 401 incident ~3 sec slower | Transparent to user; documented |
| Session persistence (Vercel) | Cold start might lose token briefly | Reauth on cold start (existing Upstash pattern) |
| Multi-tab session state | User auth in one tab needed in another | Shared session via httpOnly cookie (no change) |

---

## Risk Register

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|-----------|
| ID token exchange fails (bad scopes) | Low | Agent request fails; user sees error | Verify scopes in PingOne config; test early |
| 401 interception breaks existing flow | Low | Regression in Phase 184 exchanges | Unit test both paths; isolate 401 catch logic |
| ID token usurped across sessions | Low | Security breach | Validate user context before exchange; session isolation |
| Test page visualization breaks | Medium | Can't demo flow | Reuse Phase 185 TokenChainDisplay (proven) |
| Docs unclear (ID vs access token) | Medium | Dev confusion | Live example in test page + diagrams |

---

## Confidence Assessment

| Dimension | Confidence | Justification |
|-----------|------------|---------------|
| OAuth mechanics | ⭐⭐⭐⭐⭐ | All methods exist; Phase 184 proven |
| 401 handling | ⭐⭐⭐⭐ | Pattern exists in auth flows; needs wiring |
| Test page integration | ⭐⭐⭐⭐⭐ | Component reuse; only new config/handler |
| Session management | ⭐⭐⭐⭐⭐ | Existing pattern; no schema change |
| Documentation | ⭐⭐⭐⭐ | Pure expansion of Phase 184 docs |
| **Overall** | **⭐⭐⭐⭐⭐** | **Low risk, high confidence variant** |

---

## Implementation Readiness

✅ **Phase 186 is ready to plan and execute.**

**Green lights:**
- All OAuth machinery exists and is proven (Phase 184)
- Code reuse identified and validated
- Session architecture proven on Vercel
- Test page pattern reusable
- Documentation extension straightforward
- Security model unchanged

**Yellow lights:**
- 401 intercept wiring needs careful isolation (not breaking Phase 184)
- ID token lifetime requires fresh auth (acceptable, documented)

**Red lights:** None

---

## Research Conclusion

Phase 186 is a **configuration variant** of Phase 184's dual-token exchange, swapping the user's access token for the user's ID token. The codebase has all required mechanics; primary work is:

1. **Wiring:** App-layer 401 intercept → OIDC auth → token exchange
2. **Testing:** Verify 401 → auth → exchange sequence end-to-end
3. **Visualization:** Reuse Phase 185 token chain display
4. **Documentation:** Add ID token variant section to existing docs

**Estimated task complexity:** Medium (wiring + testing), not high (no new OAuth mechanics).

---

**Research created:** 2026-04-18  
**Ready for:** `gsd-planner` (Phase 186 planning)  
**Next step:** Create PLAN.md with 2-3 tasks for implementation
