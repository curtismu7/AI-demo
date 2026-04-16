# Phase 158: Token Validation Test Scenarios — Research

**Date:** April 15, 2026  
**Goal:** Research how to implement token validation test scenarios that demonstrate MCP security

---

## Research Summary

Phase 158 aims to add educational test scenarios showing how the MCP server rejects invalid tokens. This is a testing/demonstration phase built on top of Phase 157's security audit and Phase 156's error messaging improvements.

---

## Domain Analysis

### 1. Token Validation Architecture (Current State)

**MCP Server Token Validation:**
- `BankingSessionManager.ts` — manages session tokens, validates JWT signature
- `tokenExchange.ts` interfaces — define token exchange types and response formats
- `auth.ts` interfaces — define auth and delegation structures

**BFF Token Validation:**
- `middleware/auth.js` — validates token signature, checks exp/iat, verifies audience
- `middleware/actClaimValidator.js` — validates act/may_act claims (RFC 8693)
- `middleware/delegationValidationMiddleware.js` — validates delegation claims with error codes (DELEGATION_001–102)
- `middleware/scopeEnforcement.js` — checks scopes per endpoint

**Error Messaging (from Phase 156):**
- Comprehensive error codes defined (DELEGATION_001–102)
- Educational messages for 6 delegation failure scenarios
- HTTP status mapping (401 for auth, 403 for policy)

### 2. Test Scenario Requirements

From CONTEXT.md, five scenarios are needed:

1. **User token (wrong scope) → MCP** — User token lacks mcp:* scopes
2. **User token (wrong aud) → MCP** — Audience mismatch (token for BFF, used on MCP)
3. **Missing act claim** — Non-delegated token (no delegation proof)
4. **Agent token → user endpoint** — Agent token used where user scopes required
5. **Expired token** — Token past expiration time

### 3. Implementation Approaches

#### Approach A: BFF Test Routes (Recommended)
- Add `/api/test/token-validation/*` routes to BFF
- Routes intentionally bypass normal auth flow
- Generate test tokens with wrong claims
- Call MCP with test tokens
- Capture and format rejection messages

**Pros:**
- Full control over test data
- Can simulate any token combination
- Educational UI can display exact request/response

**Cons:**
- Must be disabled in production
- Requires test-token generation logic

#### Approach B: MCP Server Helmet/Logging
- Add logging/middleware to MCP to capture all rejection events
- Create `/test/replays` endpoint that shows past rejections
- Query by rejection type

**Pros:**
- Works with real flow
- Captures actual errors

**Cons:**
- Less predictable for demos
- Can't control exact test params

#### Approach C: Admin UI Test Panel
- Add "Token Security Tester" panel to `/admin`
- UI constructs test scenarios, calls BFF test routes (Approach A)
- Displays results visually

**Pros:**
- User-friendly
- Non-technical teams can run demos

**Cons:**
- Requires UI implementation
- Depends on Approach A

**Recommended Combination:** Approach A + C
- BFF routes provide test capabilities
- Admin UI provides user-friendly interface
- Educational error messages displayed in UI

### 4. Token Generation Strategy

**For Test Scenario 1 (user token with wrong scope):**
```javascript
// In-memory test token (NOT a real JWT, just for demo)
{
  sub: "user-123",
  aud: "banking-bff",
  scope: ["profile", "email", "banking:read"],  // Missing mcp:* scopes
  iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + 3600
}
```

**For Test Scenario 3 (missing act claim):**
```javascript
// User token without act claim
{
  sub: "user-123",
  aud: "mcp-server",
  scope: ["banking:read", "mcp:invoke"],
  iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + 3600
  // NO act claim
}
```

**For Test Scenario 5 (expired token):**
```javascript
{
  sub: "user-123",
  aud: "mcp-server",
  scope: ["banking:mcp:invoke"],
  iat: Math.floor(Date.now() / 1000) - 7200,  // 2 hours ago
  exp: Math.floor(Date.now() / 1000) - 3600   // expired 1 hour ago
}
```

### 5. Error Message Mapping

**Token Validation Errors → Educational Messages:**

| Scenario | Error Code | HTTP | Educational Message |
|----------|-----------|------|-------------------|
| Wrong scope | SCOPE_MISMATCH | 403 | "User tokens can only authorize general banking operations. This endpoint requires agent delegation scopes (mcp:invoke or banking:agent)." |
| Wrong aud | AUD_MISMATCH | 401 | "This token is for a different service. MCP requires tokens with audience `{expected_aud}` to prevent token reuse attacks." |
| No act claim | DELEGATION_030 | 401 | "This token was not issued for delegation. MCP operations require proof that an agent is acting on behalf of the user (act claim). Use token exchange (RFC 8693)." |
| Agent token on user endpoint | SCOPE_MISMATCH | 403 | "Agent tokens are restricted to MCP operations. User-level endpoints require banking:read or banking:write scopes." |
| Expired token | TOKEN_EXPIRED | 401 | "Token expired at {exp_time}. Refresh the token or re-authenticate." |

### 6. Testing Verification Strategy

**Criteria for "test scenario implemented correctly":**

1. ✅ BFF route accepts test parameters (which scenario, which token variation)
2. ✅ Test generates token with specified claims/scope/aud variations
3. ✅ Test sends token to MCP server (or validates at BFF boundary)
4. ✅ Rejection is captured (error code, status, message)
5. ✅ Error message is educational (includes teaching moment)
6. ✅ Admin UI displays results (scenario, request, response, explanation)
7. ✅ No production impact (test routes disabled in production OR gated by feature flag)

---

## Architecture Decisions

### Decision 1: Test Route Design
- **Choice:** Add `/api/test/token-validation/`  routes to BFF
- **Why:** Full control, non-intrusive, can be feature-flagged
- **Location:** `banking_api_server/routes/testTokenScenarios.js` (new file)
- **Feature Flag:** `FF_TEST_TOKEN_SCENARIOS` (enabled in dev, disabled in production)

### Decision 2: Token Generation
- **Choice:** Create JWTs with known claims (not signing with real PingOne key)
- **Why:** Can control exact claims without PingOne config changes
- **Caveat:** Mark as TEST_TOKEN in headers so MCP knows not to verify signature
- **Fallback:** Real tokens from PingOne with modified scope claims (via test helper)

### Decision 3: Error Message Delivery
- **Choice:** Return standardized JSON response with error_code + error_description + teaching_message
- **Format:**
  ```json
  {
    "success": false,
    "scenario": "user_token_wrong_scope",
    "error_code": "SCOPE_MISMATCH",
    "http_status": 403,
    "error_description": "Token scope violation.",
    "teaching_message": "User tokens can only authorize general account operations...",
    "request": { "token_sample": "...", "endpoint": "/api/mcp/tool" },
    "response": { "status": 403, "body": {...} }
  }
  ```

### Decision 4: Admin UI Integration
- **Choice:** Add "Token Security Tester" panel to `/admin`
- **Routes:** `/api/test/token-validation/list` (get scenarios), `/api/test/token-validation/run` (run scenario)
- **UI:** Simple form withmultiple-choice scenario selector + results display
- **Impact:** UI-only, no backend changes beyond routes

---

## Implementation Phases Mapping

| Scenario | Task | Complexity | Location |
|----------|------|-----------|----------|
| 1: User token, wrong scope | Create test route, generate token, validate rejection | Medium | BFF routes + MCP validator |
| 2: Wrong aud | Similar to #1, modify aud claim | Medium | BFF routes + MCP validator |
| 3: Missing act claim | Similar; remove act from token | Medium | BFF routes + MCP validator |
| 4: Agent token on user endpoint | Create endpoint-specific test | Small | BFF user endpoint middleware test |
| 5: Expired token | Generate old token with past exp | Small | BFF token validator test |

---

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Test routes expose token validation logic | Feature flag (FF_TEST_TOKEN_SCENARIOS), disabled in prod, never deployed |
| Test tokens could bypass real validation | Mark as TEST_TOKEN, use separate validation path, never hit real MCP in prod tests |
| Educational messages are verbose/confusing | Keep to 1-2 sentences + 1 actionable suggestion. Test with non-technical users. |
| UI adds frontend complexity | Keep UI simple (dropdown + results display), use existing admin panel patterns |

---

## Success Criteria

**Implementation is complete when:**

1. ✅ 5 test scenarios each have a BFF route that generates and sends test tokens
2. ✅ MCP server (or BFF proxy) rejects each test token with correct error code
3. ✅ Each rejection includes an educational error message
4. ✅ Admin UI displays mockup or working demo of test results
5. ✅ Feature flag gates test routes (disabled in production)
6. ✅ Documentation explains each scenario and why it's secure
7. ✅ No regression: existing token validation still works (Phase 156 + Phase 157 unchanged)

---

## Related Phases

- **Phase 156:** Improved error messages for token/delegation failures (foundation for this phase)
- **Phase 157:** Audit of token validation architecture (informed scope of this phase)
- **Phase 158b (future):** Performance testing for token validation overhead
