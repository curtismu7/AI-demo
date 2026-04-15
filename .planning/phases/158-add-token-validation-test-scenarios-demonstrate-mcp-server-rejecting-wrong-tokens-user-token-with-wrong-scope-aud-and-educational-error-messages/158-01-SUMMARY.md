---
phase: 158-add-token-validation-test-scenarios-demonstrate-mcp-server-rejecting-wrong-tokens-user-token-with-wrong-scope-aud-and-educational-error-messages
plan: 01
execution_date: 2026-04-15
status: complete
commits: ["14e54bd"]
---

# Phase 158 Plan 01: Token Validation Test Scenarios - BFF Routes & Generator

**Completed:** April 15, 2026  
**Wave:** 1 (Autonomous, No Checkpoints)

---

## Summary

Plan 01 implemented the backend infrastructure for token validation test scenarios. Three files created:

### 1. testTokenGenerator.js (150 lines)
Helper middleware module for generating JWT test tokens with intentional security violations.

**Exports:**
- `generateTestToken(options)` — Base token generator with custom claims
- `generateWrongScopeToken()` — User token without agent scopes (scope mismatch)
- `generateWrongAudToken()` — Token with wrong audience (BFF instead of MCP)
- `generateMissingActToken()` — Token without `act` claim (no delegation proof)
- `generateAgentToken()` — Agent-only token with RFC 8693 `act` claim
- `generateExpiredToken()` — Token with past expiration time
- `decodeTestToken(token)` — Decode and inspect test tokens

**Features:**
- All tokens include `_test_token: true` marker for identification
- RFC 8693 delegation support (`act` claim with `client_id` + `sub`)
- Scope formatting (array → space-separated string per OAuth standard)
- Customizable expiration (`exp` or `expiresIn` options)

### 2. testTokenScenarios.js (304 lines)
BFF routes providing 5 test endpoints demonstrating token validation failures.

**Routes:**
- `POST /api/test/token-validation/scenario/{scenarioId}` — Execute a test scenario
- `GET /api/test/token-validation/scenarios` — List available scenarios

**Response Format (all scenarios):**
```json
{
  "scenario": "scenario_id",
  "scenario_name": "Human-readable name",
  "error_code": "ERROR_CODE",
  "http_status": 401 | 403,
  "error_description": "What went wrong",
  "teaching_message": "Why this security control exists + what to do next",
  "request": { "token_scopes": [...], "endpoint": "..." },
  "response": { "status": 401, "error": "ERROR_CODE" },
  "token_details": { "sub": "...", "aud": "...", "scopes": [...] }
}
```

**Scenarios Implemented:**

1. **wrong-scope** — User token lacks `banking:agent` / `mcp:invoke` scopes
   - Error: `SCOPE_MISMATCH` (403)
   - Teaching: User tokens only authorize general operations; agent delegation scopes required

2. **wrong-aud** — Token audience mismatch (issued for BFF, sent to MCP)
   - Error: `AUD_MISMATCH` (401)
   - Teaching: Each service validates its specific audience to prevent token reuse attacks

3. **missing-act** — Non-delegated token (no RFC 8693 `act` claim)
   - Error: `DELEGATION_030` (401)
   - Teaching: MCP requires proof of delegation via `act` claim; use token exchange

4. **agent-token-user-endpoint** — Agent token used on user-level endpoint
   - Error: `SCOPE_MISMATCH` (403)
   - Teaching: Agent tokens restricted to MCP operations; exchange with user token first

5. **expired-token** — Past expiration time
   - Error: `TOKEN_EXPIRED` (401)
   - Teaching: Tokens have limited lifetime; refresh or re-authenticate

**Feature Flag Protection:**
- `FF_TEST_TOKEN_SCENARIOS` environment variable gates all endpoints
- Disabled by default in production (`NODE_ENV=production` + flag=false → 403)
- Developer-only feature for educational demonstrations

### 3. testTokenScenarios.test.js (282 lines)
Jest test suite: 26 passing tests covering all scenarios and token generation functions.

**Test Coverage:**
- **Base function tests** (6 tests): Valid token generation, claim structure, RFC 8693 support
- **Scenario 1–5 tests** (15 tests): Each scenario generates correct token structure
- **Token decoding** (4 tests): Decode, validation, error handling, claim extraction
- **Scope formatting** (3 tests): Space-separated string, single scope, empty scope
- **JWT structure** (2 tests): Proper JWT format (3 parts), jti claim inclusion

**Execution:** `npm test -- testTokenScenarios.test.js` ✓ All 26 tests pass

---

## Verification Checklist

- **[x]** `testTokenGenerator.js` exports 6 generator functions
- **[x]** Each function generates valid, decodable JWT
- **[x]** RFC 8693 `act` claim structure correct (`client_id` + `sub`)
- **[x]** Scopes properly formatted as space-separated string
- **[x]** Expired tokens have `exp` < current time
- **[x]** Wrong audience tokens have `aud` field set correctly
- **[x]** Test tokens marked with `_test_token: true`
- **[x]** `testTokenScenarios.js` has 5 test endpoints
- **[x]** Each endpoint returns required fields (error_code, http_status, error_description, teaching_message)
- **[x]** Feature flag `FF_TEST_TOKEN_SCENARIOS` gates routes (403 in production)
- **[x]** Error codes match expected values (SCOPE_MISMATCH, AUD_MISMATCH, DELEGATION_030, TOKEN_EXPIRED)
- **[x]** Teaching messages include security control why + actionable suggestion
- **[x]** Test suite: 26 tests passing (0 failing)
- **[x]** Routes testable via `POST /api/test/token-validation/scenario/{scenarioId}`

---

## Key Files

| File | Lines | Purpose |
|------|-------|---------|
| `banking_api_server/middleware/testTokenGenerator.js` | 150 | Token generation helpers |
| `banking_api_server/routes/testTokenScenarios.js` | 304 | BFF test endpoints |
| `banking_api_server/src/__tests__/testTokenScenarios.test.js` | 282 | Jest test suite |

**Total:** 736 lines of code + tests

---

## What's Next

**Plan 02 (Wave 2):**
- Create `TokenSecurityTester.jsx` React component (Admin UI)
- Integrate into `Admin.jsx` page
- Provides user-friendly interface for running test scenarios
- Displays results visually with error codes + teaching messages

---

## Notes

1. **Feature Flag:** Routes are production-safe. Set `FF_TEST_TOKEN_SCENARIOS=false` in `.env` for production or let the Node.js environment check disable them automatically.

2. **JWT Signature:** Test tokens sign with dummy secret (`test-jwt-secret-not-verified-in-production`). Real production verification should skip signature checks for marked test tokens or reject them entirely.

3. **Educational Value:** Error messages and teaching messages are intentionally verbose to help developers understand why each scenario fails and how to fix it.

4. **Extensibility:** More scenarios can be added via new scenario-specific generator functions following the same pattern.

5. **Plan 02 Dependency:** Plan 02 (Admin UI) depends on these routes being available at `/api/test/token-validation/scenario/{scenarioId}`.

---

## Execution Time

- Planner: ~5 min (planning phase 158)
- Developer: ~20 min (implementation + testing)
- Test Runtime: 0.277 seconds (26 tests)

---

**Status:** ✅ **COMPLETE**

All artifacts created, tests passing, commit saved: `14e54bd`
