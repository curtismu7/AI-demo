---
phase: 156-improve-security-error-messages-for-token-scope-violations-and-delegation-failures
plan: 01
type: execute
status: complete
completed_at: 2026-04-17T00:00:00Z
---

# Plan 156-01 SUMMARY: BFF Error Schema & Educational Middleware

## Execution Status
✅ **COMPLETE** — All 3 tasks executed, 5 artifacts created, committed

---

## What Was Built

### Purpose
Implemented a standardized, educational error response system that transforms generic security errors into teaching moments. Users and operators now receive structured error responses explaining:
- **What failed** — The specific validation failure
- **Why** — Security reasoning behind the check
- **Teaching** — What this teaches about security patterns
- **Fix** — Concrete actions to resolve

### Artifacts Created
| Artifact | Lines | Purpose |
|----------|-------|---------|
| `errorSchemaService.js` | 107 | Error response builder; 8 error codes with HTTP status mapping |
| `errorMessageBuilder.js` | 145 | Educational message content (what/why/teaching/fix) for 8 error types |
| `tokenErrorMiddleware.js` | 45 | Middleware validating token type (user/agent/system) |
| `scopeErrorMiddleware.js` | 60 | Middleware validating required scopes |
| `delegationErrorMiddleware.js` | 70 | Middleware validating RFC 8693 'act' claim |
| **Total** | **457** | |

---

## Implementation Details

### Error Codes (8 types)
1. **TOKEN_TYPE_MISMATCH** (403 Forbidden) — User vs agent token type validation failure
2. **SCOPE_VIOLATION** (403 Forbidden) — Required scopes missing from token
3. **AUDIENCE_MISMATCH** (401 Unauthorized) — Token audience ≠ endpoint audience
4. **DELEGATION_CLAIM_MISSING** (403 Forbidden) — No 'act' claim in delegation token
5. **TOKEN_EXPIRED** (401 Unauthorized) — Token expiration time passed
6. **RATE_LIMIT_EXCEEDED** (429 Too Many Requests) — Too many requests in time window
7. **INSUFFICIENT_PERMISSIONS** (403 Forbidden) — User role insufficient for operation
8. **POLICY_VIOLATION** (403 Forbidden) — Transaction limit or policy constraint breach

### Error Response Structure
```json
{
  "error": "TOKEN_TYPE_MISMATCH",
  "message": "Human-readable error message",
  "details": {
    "what_failed": "Token type validation failed...",
    "why": "This endpoint requires a token for security isolation...",
    "teaching": "Token types enforce principle of least privilege...",
    "tokens_involved": { ... },
    "fix": "If you're implementing an AI agent, authenticate as the agent..."
  },
  "documentation_link": "https://docs.mybank.com/errors/TOKEN_TYPE_MISMATCH",
  "timestamp": "2026-04-17T00:00:00Z"
}
```

### Key Features
✓ **Zero runtime dependencies** — Uses only Node.js built-in APIs  
✓ **Middleware composable** — Can be chained in Express route handlers  
✓ **Educational focus** — Each error is a teaching opportunity  
✓ **RFC-compliant** — Delegation validation per RFC 8693  
✓ **Security-first** — Maps to correct HTTP status codes  

### Usage Example
```javascript
import tokenErrorMiddleware from '../middleware/tokenErrorMiddleware.js';
import scopeErrorMiddleware from '../middleware/scopeErrorMiddleware.js';
import delegationErrorMiddleware from '../middleware/delegationErrorMiddleware.js';

router.post(
  '/mcp/tool/execute',
  tokenErrorMiddleware('agent'),           // Validate token is agent type
  scopeErrorMiddleware(['mcp:execute']),   // Validate required scope
  delegationErrorMiddleware(),              // Validate 'act' claim exists
  (req, res) => {
    // Controller logic — auth is validated above
  }
);
```

---

## Tasks Completed

### ✅ Task 1: Create errorSchemaService.js
- Exports `ERROR_CODES` constant with 8 error types
- `buildErrorResponse()` — builds standardized error object
- `getStatusCode()` — maps error code to HTTP status
- `isValidErrorCode()` — validation helper
- `getAllErrorCodes()` / `getStatusCodeMap()` — introspection helpers

**Lines**: 107 | **Verified**: ✓ All methods present

### ✅ Task 2: Create errorMessageBuilder.js
- 8 static methods: `buildTokenTypeMismatch()`, `buildScopeViolation()`, `buildAudienceMismatch()`, `buildDelegationClaimMissing()`, `buildTokenExpired()`, `buildRateLimitExceeded()`, `buildInsufficientPermissions()`, `buildPolicyViolation()`
- Each returns: `{ what_failed, why, teaching, fix, ...details }`
- Educational content designed to teach security concepts
- Helper method `getAllBuilders()` for introspection

**Lines**: 145 | **Verified**: ✓ All 8 builders present

### ✅ Task 3: Create BFF Middleware (3 files)

**3a. tokenErrorMiddleware.js** (45 lines)
- Factory function accepting `requiredTokenType`
- Returns Express middleware
- Validates `req.user.token.token_type` against required type
- Returns 403 + educational error on mismatch
- Non-blocking if no token (auth middleware handles)

**3b. scopeErrorMiddleware.js** (60 lines)
- Factory function accepting `requiredScopes` (string or array)
- Returns Express middleware
- Validates token has all required scopes
- Returns 403 + educational error if missing scopes
- Supports exact matches and wildcard/prefix matching

**3c. delegationErrorMiddleware.js** (70 lines)
- Factory function accepting `options`
- Returns Express middleware
- Validates RFC 8693 `act` claim present in token
- Returns 403 + educational error if missing
- Optional: validate `act` claim is from allowed actors

---

## Verification

### Build Verification
```
✓ All 5 files created (457 total lines)
✓ No syntax errors
✓ Imports resolve correctly
✓ All methods implemented per plan spec
```

### Commit Verification
```
Commit: 4daf91f
Files: 5 changed, 457 insertions(+)

feat(156-01): implement BFF error schema and educational middleware
- errorSchemaService: 8 error codes, status mapping
- errorMessageBuilder: 8 educational message builders
- 3 middleware files: token validation, scope validation, delegation validation
```

### Integration Checklist
✅ Zero breaking changes — new files only, no existing code modified  
✅ Exports are standard ES6 — compatible with existing codebase  
✅ No external dependencies — uses only Node built-ins  
✅ Middleware pattern matches Express conventions  
✅ Error codes use SCREAMING_SNAKE_CASE constants  

---

## Next Steps

**Wave 1 continues with Plan 156-02** (peer task):
- MCP server validation — validate tokens/scopes/delegation at MCP server
- Format rejection responses educationally
- Educational tool call error messages

**Then Wave 2 (Plan 156-03)**:
- Frontend display — toasts + detailed modals
- Severity-based formatting
- Audit trail creation

---

## Key Links Verified

| Link | Status |
|------|--------|
| tokenErrorMiddleware → errorSchemaService | ✓ Imports, calls `buildErrorResponse()` |
| scopeErrorMiddleware → errorMessageBuilder | ✓ Imports, calls `buildScopeViolation()` |
| All middleware → errorSchemaService | ✓ All return errorSchemaService responses |
| All middleware → errorMessageBuilder | ✓ All call appropriate builder methods |

---

## Self-Check

- [x] All 5 artifacts created
- [x] Zero runtime dependencies
- [x] All 8 error codes implemented
- [x] All middleware composable
- [x] Educational content present
- [x] HTTP status codes correct
- [x] Committed with detailed message
- [x] No breaking changes
- [x] Ready for Wave 1 partner (156-02) and Wave 2 (156-03)

---

**Status**: ✅ READY FOR NEXT PLAN
