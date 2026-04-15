# Phase 156: Security Error Messages — Context

**Date:** April 15, 2026  
**Focus:** Educational error messaging for security violations  
**Phase Goal:** Improve error messages to teach users WHY security decisions were made, not just that they failed.

---

## User Intent

Security errors should be teaching moments, not black boxes:
- ❌ Bad: `401 Unauthorized`
- ✅ Good: `Unauthorized: This endpoint requires 'agent' scope. Your token has 'user' scope. Scopes control what each identity can access.`

---

## Problem Statement

Current error messages are generic:
- User sees "401 Unauthorized" — no context
- User doesn't understand token types vs. scopes
- Security features feel arbitrary instead of intentional
- No learning opportunity for compliance/audit teams

**Goal:** Every rejection includes:
1. **What failed** (the error)
2. **Why it failed** (the security reason)
3. **How to fix it** (the solution)
4. **What you should learn** (the teaching moment)

---

## Error Categories to Improve

### 1. Token Type Mismatch
```
❌ Bad: 403 Forbidden
✅ Good: Token type error: This endpoint requires an 'agent' or 'system' token. 
         Your token is a 'user' token (intended for user-level operations).
         Teaching: User tokens are associated with a person. Agent tokens are 
         associated with AI systems. Each has different permissions to prevent 
         privilege escalation.
```

### 2. Scope Violation
```
❌ Bad: 403 Forbidden
✅ Good: Scope violation: This endpoint requires 'mcp:execute' scope.
         Your token has scopes: ['profile', 'email', 'banking:read']
         Teaching: Scopes are like permissions in a video game. Different abilities 
         require different permission levels. Your token doesn't have the permission 
         needed for this operation.
```

### 3. Audience Mismatch (RFC 8693)
```
❌ Bad: 401 Unauthorized
✅ Good: Audience mismatch: This token was issued for 'https://api.mybank.com' 
         but this endpoint is 'https://mcp.mybank.com:8443'.
         Teaching: Tokens are locked to specific destinations (audience) to prevent 
         reuse attacks. If a token is stolen, it can only be used on the intended 
         endpoint, not elsewhere.
```

### 4. Missing Delegation Claim (`act`)
```
❌ Bad: 403 Forbidden
✅ Good: Delegation claim missing: This endpoint requires the 'act' claim 
         proving an agent is acting on behalf of a user.
         Your token has no 'act' claim (you're not delegated).
         Teaching: For AI agents to act on behalf of users securely, we need 
         proof of that relationship ('act' claim). Direct API calls don't have 
         this proof and can't proceed on this endpoint.
```

### 5. Token Expired
```
❌ Bad: 401 Unauthorized
✅ Good: Token expired: Your token expired at 2026-04-15 10:15:00 UTC.
         Current time: 2026-04-15 10:20:30 UTC (expired 5 minutes ago).
         Teaching: Tokens have a limited lifetime for security. If a token is 
         stolen, the attacker can only use it for a short window. After expiration, 
         you must refresh or re-authenticate.
```

### 6. Rate Limit Exceeded
```
❌ Bad: 429 Too Many Requests
✅ Good: Rate limit exceeded: Agent exceeded 10 requests per 60 seconds.
         Current count: 15 requests in the last 60 seconds.
         Teaching: Rate limits protect against cascade failures and runaway loops. 
         If an agent starts misbehaving (100+ requests), rate limiting stops it 
         before damage scales.
```

### 7. Insufficient Permissions (Admin Operations)
```
❌ Bad: 403 Forbidden
✅ Good: Insufficient permissions: This operation requires 'admin' role.
         Your role: 'customer'.
         Teaching: Admin operations (like kill switch, config changes) are 
         restricted to administrators to prevent unauthorized system changes.
         Contact your system administrator to perform this operation.
```

### 8. Policy Violation
```
❌ Bad: 403 Forbidden
✅ Good: Policy violation: Agent payment limit exceeded.
         Approved limit: $10,000 per day
         Current authorized: $8,500
         Requested: $2,500 (would exceed limit)
         Teaching: Transaction limits prevent large unauthorized movements. Each 
         AI agent is bounded by approvals to limit blast radius if things go wrong.
```

---

## Implementation Strategy

### Error Response Format

```json
{
  "error": "error_code",
  "message": "Human-readable error summary",
  "details": {
    "what_failed": "The specific check that failed",
    "why": "Security reason (3-4 sentences)",
    "teaching": "What this teaches about security",
    "tokens_involved": {
      "token_type": "user|agent|system",
      "token_scopes": ["scope1", "scope2"],
      "required_scopes": ["scope1"],
      "token_aud": "issued_for_audience",
      "expected_aud": "intended_audience"
    },
    "fix": "Specific action to resolve"
  },
  "documentation_link": "https://docs.mybank.com/errors/error_code"
}
```

### Where to Implement

**BFF Middleware:**
- `banking_api_server/src/middleware/tokenValidator.js`
- `banking_api_server/src/middleware/scopeChecker.js`
- `banking_api_server/src/middleware/rateLimit.js`
- `banking_api_server/src/middleware/adminGuard.js`

**MCP Server:**
- `banking_mcp_server/src/routes/tools.js` — validate tokens before tool calls
- `banking_mcp_server/src/middleware/delegationValidator.js` — check `act` claim

**Frontend:**
- Display error details in toast/modal (not just error code)
- Link to documentation for deeper learning
- Show token details if user clicks [View Token]

---

## UI Display Examples

### Example 1: Toast Notification
```
┌──────────────────────────────────────────────┐
│ ❌ Scope Violation                           │
│                                              │
│ This endpoint requires 'mcp:execute' scope. │
│ Your token has: profile, email, banking:read│
│                                              │
│ Teaching: Scopes work like video game       │
│ permissions. Your token doesn't have the    │
│ right ability.                               │
│                                              │
│ [Fix] [View Token] [Close]                  │
└──────────────────────────────────────────────┘
```

### Example 2: Modal Dialog
```
┌─ Authorization Failed ─────────────────────────┐
│                                                │
│ ❌ Token Type Mismatch                         │
│                                                │
│ What happened:                                │
│ You tried to call an endpoint that requires  │
│ an 'agent' token, but you sent a 'user'      │
│ token.                                        │
│                                                │
│ Why this matters:                             │
│ User tokens and agent tokens have different  │
│ permissions. User tokens can read personal   │
│ data; agent tokens can only access MCP       │
│ tools. This separation prevents privilege    │
│ escalation.                                   │
│                                                │
│ How to fix it:                                │
│ If you're an AI agent, make sure you're      │
│ using client credentials authentication,     │
│ not user authentication.                      │
│                                                │
│ Token details: [Show details >]               │
│ Learn more: [View docs]                       │
│                                                │
│ [Close] [Contact Support]                    │
└────────────────────────────────────────────────┘
```

### Example 3: In-App Panel (Admin)
```
Error Audit Log
═══════════════════════════════════════════════════

2026-04-15 10:15:23
❌ Scope Violation (USER_ADMIN_ENDPOINT)
Agent: mcp-banking-agent
Endpoint: POST /api/admin/agent/kill-switch
Error: Requires 'system:admin' scope; agent has ['agent', 'mcp:*']
Action: Rejected (not retried)

Teaching: Admin operations require explicit admin role.
This prevents accidental (or malicious) system changes.

───────────────────────────────────────────────────

2026-04-15 10:14:55
❌ Rate Limit Violated (AGENT_RATE_LIMIT)
Agent: mcp-banking-agent
Limit: 10 requests/60 sec
Actual: 15 requests in 60 sec
Action: Throttled (auto-kill triggered)

Teaching: Rate limits are a circuit breaker for cascade failures.
If an agent goes rogue (100+ requests), the rate limiter stops it.

───────────────────────────────────────────────────
```

---

## Integration with Other Phases

| Phase | How It Uses Phase 156 |
|-------|---|
| **157 (PingOne Audit)** | Error messages demonstrate security controls working |
| **158 (Token Validation)** | Token rejection tests show educational errors |
| **159 (Kill Switch)** | Revocation message explains why agent was stopped |
| **160 (TRiSM Training)** | Slide 1 (Trust) shows transparent error messages |

---

## Requirements (Locked Decisions)

- **REQ-156-01:** Every error includes what failed, why, how to fix, and teaching point
- **REQ-156-02:** Token details available (scopes, audience, type, claims) in error response
- **REQ-156-03:** Educational tone (not just technical; explain security reasoning)
- **REQ-156-04:** Consistent format across all error types
- **REQ-156-05:** Links to documentation for deeper learning
- **REQ-156-06:** Audit log captures all errors for compliance

---

## Success Criteria

1. ✅ Every security error includes a teaching explanation
2. ✅ Token details visible for debugging
3. ✅ Users understand why something was rejected (not just that it was)
4. ✅ Audit team can trace error decisions through logs
5. ✅ Board/regulator sees intentional, documented security decisions
6. ✅ New developers learn security principles from error messages

---

## Dependencies

- **Depends on:** Nothing (foundational)
- **Feeds into:** Phase 157 (audit), Phase 158 (validation demo), Phase 159 (kill switch), Phase 160 (training)

---

## Next Steps for Planning

Run `/gsd-plan-phase 156` to break into:
- Task 1: Define error response schema + middleware error handlers
- Task 2: Implement scope violation errors
- Task 3: Implement token type/audience/expiration errors
- Task 4: Add frontend error UI (toast, modal, audit log display)
- Task 5: Wire up error responses across BFF + MCP server
- Task 6: Documentation + examples for team
