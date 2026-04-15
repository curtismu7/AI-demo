# Phase 158: Token Validation Test Scenarios — Context

**Date:** April 15, 2026  
**Focus:** Security demonstration + educational error messaging  
**Phase Goal:** Add UI/test scenarios to demonstrate how the MCP server rejects wrong tokens (user token with incorrect scope/aud) and show educational error messages explaining the rejection.

---

## User Intent

> "We want to have the ability to send the wrong token to the MCP server (user token with wrong scope and/or aud). Showing how we are protecting the security of the tokens and not allowing the agent to use the wrong token."

**Translation:** Add test/demo functionality to:
1. Intentionally send a user token (not an agent token) to an endpoint expecting the agent token
2. Demonstrate the MCP server properly rejecting it
3. Show an educational error message explaining **why** it was rejected (security teaching moment)

---

## Security Model Being Demonstrated

### Token Types in Our System

| Token Type | Issued By | Used For | Key Claims | Scope |
|-----------|-----------|----------|-----------|-------|
| **User Token** | PingOne (user login) | General auth, BFF authorization | `sub: <user-id>`, `may_act: <agent-id>` | Typically includes `profile`, `email`, business scopes |
| **Agent Token** | PingOne (client credentials) | Agent authentication to BFF + token exchange | `client_id: <agent>`, `sub: <agent>` | Typically `agent`, `banking:agent` |
| **On-Behalf-Of Token** | BFF (token exchange) | Agent → MCP server calls | `sub: <user-id>`, `act: <agent-id>`, `aud: <mcp-audience>` | Includes `banking:agent`, `mcp:tools` |

### Why Token Rejection is Security

1. **Scope Protection**: MCP server should only accept tokens with `mcp:*` or `banking:agent` scopes, not user-level scopes
2. **Audience Protection**: Token must target the MCP server's audience, not the BFF or something else
3. **Delegation Chain**: Token must include `act` claim (on-behalf-of proof), which user tokens don't have
4. **Least Privilege**: User token has too many permissions; reduces blast radius if MCP is compromised

---

## Test Scenarios to Implement

### Scenario 1: User Token Sent to MCP (Wrong Scope)

**Setup:**
- User logs in normally → gets user token
- Agent attempts to call MCP server tool
- Intercept and send the **user token directly** instead of proper agent token

**Expected Rejection:**
```
Error: Token scope violation
Reason: This endpoint requires 'mcp:' or 'banking:agent' scopes. 
        Your token has: profile, email, banking:read

Teaching: User tokens can only authorize general account operations. 
          Agent operations require a specially-scoped token issued via delegation.
```

**Code Location:**
- BFF: `banking_api_server/src/middleware/tokenValidator.js` (or where token validation happens)
- Check: `token.scope.includes('mcp:') || token.scope.includes('banking:agent')`

### Scenario 2: User Token with Wrong Audience (aud Mismatch)

**Setup:**
- User token has `aud: "https://api.mybank.com"` (BFF)
- Attempt to use this token on MCP server expecting `aud: "https://mcp.mybank.com:8443"`

**Expected Rejection:**
```
Error: Token audience mismatch
Token audience: https://api.mybank.com
Expected audience: https://mcp.mybank.com:8443

Teaching: This token was issued for a different service. 
          MCP requires tokens with the MCP server's specific audience to prevent token reuse attacks.
```

**Code Location:**
- MCP server validation or BFF-to-MCP proxy: check `token.aud` matches expected value

### Scenario 3: Missing `act` Claim (Non-Delegated Token)

**Setup:**
- User token sent to MCP (no agent mediation)
- User token lacks `act` claim (no delegation proof)

**Expected Rejection:**
```
Error: Delegation chain broken
Missing claim: 'act' (acting as)

Teaching: This token was not issued for delegation. 
          MCP operations require proof that an agent is acting on behalf of the user ('act' claim).
          Use token exchange (RFC 8693) to convert the user token to a delegated token.
```

**Code Location:**
- MCP server: check `token.act` exists and is valid

### Scenario 4: Attempting to Use Agent Token as User Token

**Setup:**
- Agent gets its own authentication token
- Try to use it to call user-level endpoint (e.g., `/api/my-accounts`)

**Expected Rejection:**
```
Error: Token scope mismatch
Your token is for: 'agent' (AI agent use only)
This endpoint requires: 'banking:read', 'profile'

Teaching: Agent tokens are restricted to MCP operations.
          To call banking APIs on behalf of users, the agent must first exchange 
          its token using RFC 8693 token exchange with a user token.
```

**Code Location:**
- BFF endpoint middleware: check that user-level endpoints reject `agent`-only scopes

### Scenario 5: Expired Token Attempt (UI Testing)

**Setup:**
- User token has expired
- Agent still tries to use it

**Expected Rejection:**
```
Error: Token expired
Issued: 2026-04-15T10:00:00Z
Expired: 2026-04-15T10:15:00Z
Current: 2026-04-15T10:20:00Z

Teaching: Tokens have a limited lifetime for security.
          Expired tokens cannot authorize new operations.
          Refresh the token or re-authenticate.
```

---

## UI/UX for Demonstration

### Option A: New Test Panel in Admin UI

Add a "Token Security Test" panel to `/admin` that allows:

```
┌─ Token Security Tester ──────────────────┐
│                                          │
│ Select Test Scenario:                    │
│ ⚪ User token (wrong scope) → MCP        │
│ ⚪ User token (wrong aud) → MCP          │
│ ⚪ Missing 'act' claim → MCP             │
│ ⚪ Agent token → user endpoint           │
│ ⚪ Expired token → MCP                   │
│                                          │
│ [Run Test]                               │
│                                          │
│ Results:                                 │
│ ┌──────────────────────────────┐        │
│ │ Request:                     │        │
│ │ POST /api/mcp/tools/call    │        │
│ │ Token: eyJ...{user-token}   │        │
│ │                              │        │
│ │ Response: 403 Forbidden      │        │
│ │ {                            │        │
│ │   "error": "token_scope_...",│        │
│ │   "teaching": "User tokens...",       │
│ │   "reason": "Token has: ...", │       │
│ │   "fix": "Use token exchange.."       │
│ │ }                            │        │
│ └──────────────────────────────┘        │
│                                          │
│ [Show JWT] [Copy Response]               │
└──────────────────────────────────────────┘
```

### Option B: Agent Debug Tab Enhancement

Extend existing `AgentFlowDiagramPanel` to include:
- "Simulate Wrong Token" button
- Shows token type mismatch in flow
- Displays rejection reason

### Option C: Postman Collection Entry

Add new Postman request:
```
POST {{ base_url }}/api/mcp/tools/call
Authorization: Bearer {{ user_token }}  (← wrong token type)

Expected: 403 with educational error
```

---

## Implementation Approach

### 1. **Token Validation Middleware** (If not exists)

Create/update `banking_api_server/src/routes/mcp-security.js`:

```javascript
/**
 * Validates tokens for MCP endpoint access.
 * Rejects if:
 * - Scope doesn't include 'mcp:' or 'banking:agent'
 * - Audience doesn't match expected MCP audience
 * - `act` claim missing (non-delegated)
 * - Token is expired
 */
export function validateMcpToken(req, res, next) {
  const token = req.user?.token; // Assuming decoded/validated already
  
  if (!token) {
    return res.status(401).json({
      error: 'unauthorized',
      message: 'No token provided',
    });
  }

  // Check 1: Scope validation
  const hasValidScope = token.scope?.includes('mcp:') || token.scope?.includes('banking:agent');
  if (!hasValidScope) {
    return res.status(403).json({
      error: 'token_scope_violation',
      message: 'Token scope invalid for MCP access',
      teaching: `This endpoint requires 'mcp:' or 'banking:agent' scopes. 
                 Your token has: ${token.scope?.join(', ') || 'none'}.
                 User tokens are restricted. Use token exchange (RFC 8693) to get an MCP token.`,
      token_scopes: token.scope,
      required_scopes: ['mcp:', 'banking:agent'],
      fix: 'Ensure agent uses RFC 8693 token exchange before calling MCP',
    });
  }

  // Check 2: Audience validation
  const expectedAudience = process.env.MCP_AUDIENCE || 'https://mcp.mybank.com:8443';
  if (token.aud !== expectedAudience) {
    return res.status(403).json({
      error: 'token_audience_mismatch',
      message: 'Token not issued for this MCP server',
      teaching: `This token was issued for: ${token.aud}. 
                 This MCP server requires audience: ${expectedAudience}.
                 Tokens are audience-restricted to prevent reuse attacks.`,
      token_audience: token.aud,
      mcp_audience: expectedAudience,
      fix: 'Use token exchange to issue a token for the MCP audience',
    });
  }

  // Check 3: Delegation claim validation (act presence)
  if (!token.act) {
    return res.status(403).json({
      error: 'delegation_chain_broken',
      message: 'Missing delegation proof',
      teaching: `This token lacks the 'act' (acting as) claim, which proves 
                 an agent is acting on behalf of a user. 
                 Non-delegated tokens cannot be used for MCP operations.`,
      token_claims: Object.keys(token),
      required_claim: 'act',
      fix: 'Use RFC 8693 token exchange with act_as parameter',
    });
  }

  // Check 4: Token expiration (if not already checked by middleware)
  if (token.exp && Date.now() > token.exp * 1000) {
    return res.status(401).json({
      error: 'token_expired',
      message: 'Token has expired',
      teaching: `Token expired at ${new Date(token.exp * 1000).toISOString()}. 
                 Tokens have limited lifetime for security.
                 Refresh or re-authenticate to get a new token.`,
      expired_at: token.exp,
      current_time: Math.floor(Date.now() / 1000),
      fix: 'Refresh the token or re-authenticate',
    });
  }

  next(); // Token is valid
}
```

### 2. **Test Endpoint** (Optional for Demo)

Add admin-only endpoint to trigger test scenarios:

```javascript
POST /api/admin/test/token-rejection
Body: { scenario: "user_token_wrong_scope" }

Response: Simulated rejection with teaching message
```

### 3. **UI Components**

Create `banking_api_ui/src/components/TokenSecurityTester.js`:
- Dropdown to select scenario
- Run button to trigger test
- Display formatted rejection response
- Show decoded token comparison

### 4. **Logging & Audit**

Log all rejection attempts:
```javascript
logger.info('Token rejection', {
  reason: 'scope_violation',
  token_type: 'user',
  scenario: 'scenario_1',
  timestamp: new Date(),
  user_agent: req.headers['user-agent'],
});
```

---

## Requirements (Locked Decisions)

- **REQ-158-01:** MCP server must validate token scope (reject non-MCP scopes)
- **REQ-158-02:** Error messages must include teaching explanation (not just "forbidden")
- **REQ-158-03:** Test scenarios must be runnable from admin UI or test endpoints
- **REQ-158-04:** Demonstrate actual rejection (not just warning), validate security works
- **REQ-158-05:** Token claims visible (via JWT decoder) so users can understand what went wrong

---

## Dependencies

- **Depends on:** Phase 156 (security error messages) and Phase 157 (PingOne audit)
- **Related to:** Phase 155 (sidebar might expose test panel)
- **Builds on:** Existing token validation infrastructure (sessionResolver, tokenChainDisplay)

---

## Success Criteria

1. ✅ Can send wrong token to MCP endpoint
2. ✅ MCP rejects it with 403/401 error
3. ✅ Error message includes teaching explanation
4. ✅ UI shows what went wrong and why
5. ✅ Demonstrates security is working (not a bypass)
6. ✅ Users understand token types and scopes after seeing error

---

## Deliverables

1. **Token validation middleware** — enforces scope, aud, delegation checks
2. **Test scenarios UI/endpoint** — demonstrates each rejection type
3. **Educational error messages** — explain why token was rejected
4. **Documentation** — how to run tests, what each scenario teaches
5. **Audit logging** — track rejection attempts

---

## Next Steps for Planning

Run `/gsd-plan-phase 158` to break into:
- Task 1: Implement token validation middleware (scope, aud, act checks)
- Task 2: Create admin test UI/endpoint for rejection scenarios
- Task 3: Add educational error messages for each rejection
- Task 4: Wire up rejected tokens to show in TokenChainDisplay
- Task 5: Document and validate security demonstration
