---
phase: 198
gathered: "2026-04-19"
status: "ready"
source: "User request + Phase roadmap"
---

# Phase 198: Transaction Tokens For Agents — Context

**Gathered:** 2026-04-19  
**Status:** Ready for planning  
**Source:** User request to add Transaction Tokens support

---

## Scope

Support draft-oauth-transaction-tokens-for-agents-06 as a configurable alternative to RFC 8693 token exchange. System should maintain RFC 8693 as fallback and allow switching between modes via configuration. Both transaction modes must work end-to-end: BFF token exchange → MCP server validation → tool invocation.

---

## Locked Decisions (Extracted from User Request)

### D-01: Configuration-Driven Mode Selection
- **Decision:** Add `TOKEN_EXCHANGE_MODE` configuration (environment variable + config file)
- **Options:** `rfc_8693` (default, legacy mode) or `transaction_tokens` (new draft mode)
- **Requirement:** System must support both modes simultaneously (via config switching)
- **Why:** Allows gradual migration, testing without forcing cutover

### D-02: Dual-Mode MCP Server
- **Decision:** MCP server must validate and accept BOTH token types
- **Requirement:** Automatic token type detection in MCP auth middleware
- **Implementation:** Parse incoming bearer token; route to RFC 8693 validator OR Transaction Tokens validator
- **Goal:** No MCP server restart needed when switching modes
- **Why:** Enables zero-downtime mode switching during testing/deployment

### D-03: Automatic Fallback on Exchange Failure
- **Decision:** If configured mode fails, automatically retry with the other mode
- **Configuration:** `auto_fallback: true` (default) or `false` (strict mode)
- **Behavior:** 
  - Primary mode: Attempt configured mode (RFC 8693 or Transaction Tokens)
  - Fallback: If primary fails, try the other mode
  - Logging: Log which mode succeeded (for debugging dual-mode behavior)
- **Why:** Ensures reliability during transition period

### D-04: Session Context Format Compatibility
- **Decision:** Session context must include both RFC 8693 fields AND Transaction Tokens metadata
- **Fields (existing):**
  - `context.user` (from JWT `sub`)
  - `context.actor` (from `act` claim or transaction field)
- **Fields (new, if Transaction Tokens active):**
  - `context.transaction_id` (unique ID for this exchange/ transaction)
  - `context.transaction_scope` (what operation the agent is performing)
  - `context.agent_attestation` (optional: signature proving agent request validity)
- **Why:** Tools can access transaction metadata for logging/authorization without code changes
- **Backward Compatibility:** Tools don't require transaction fields; they're optional

### D-05: UI Display Mode Indicator
- **Decision:** ExchangeModeToggle component must display active mode (not user-selectable toggle)
- **Display Elements:**
  - Header: "Active Mode: RFC 8693 Token Exchange" OR "Active Mode: Transaction Token Exchange"
  - Fallback status: "Auto-fallback enabled" (if true)
  - Token table: Columns specific to active mode
- **Why:** Users need to understand which mode is active; administrators need visual confirmation mode switching works
- **Educational content:** Brief explanation of how Transaction Tokens differ from RFC 8693

### D-06: No Breaking Changes
- **Decision:** All changes must be backward compatible
- **Guarantees:**
  - RFC 8693 mode (default) behaves identically to current implementation
  - Tool APIs unchanged
  - Session context backward compatible (new fields optional)
  - Deployment: Can roll out Phase 198 without requiring downstream changes
- **Why:** Minimizes deployment risk and regression surface

---

## Implementation Scope

### What This Phase Covers
1. **BFF Token Exchange Service:** Add dual-mode logic to `agentMcpTokenService.js`
2. **MCP Server Auth Middleware:** Add token type detection and dual validator routing
3. **Configuration System:** Add TOKEN_EXCHANGE_MODE env var and config file support
4. **UI Component:** Update ExchangeModeToggle to display active mode and transaction metadata
5. **Testing:** Verify both modes work end-to-end
6. **Fallback Logic:** Implement auto-fallback retry on exchange failure

### What This Phase Does NOT Cover
- **Transaction Token Format Specification:** Uses draft-oauth-transaction-tokens-for-agents-06 as-is (doesn't modify spec)
- **Agent Attestation Signing:** Transaction attestation signatures left for Phase 199
- **Audit Trail Storage:** Persistent audit logging left for Phase 199
- **PingOne SDK Integration:** Assumes PingOne OAuth endpoint behavior; vendor changes out of scope
- **New Feature Development:** Only adds mode switching; no new agent capabilities in Phase 198

---

## Deferred Ideas
- Agent request signing (transaction attestation)
- Persistent audit trail / compliance logging
- Admin dashboard for mode switching (UI-based toggle)
- Canary deployments with partial mode switching
- Metrics/monitoring for mode usage (added in future phase)

---

## Implementation Details

### Configuration Source Priority
1. **Environment Variable (Highest):** `TOKEN_EXCHANGE_MODE=transaction_tokens`
2. **Config File:** `.planning/config.json` → `tokenExchange.mode`
3. **Default (Lowest):** `rfc_8693` (RFC 8693 mode, backward compatible)

### Token Mode Detection Logic (MCP Server)

```
Extract bearer token from Authorization header
Decode JWT (without validating signature first)
If JWT has `act` claim AND `sub` claim → RFC 8693 mode
Else if JWT has `txn_id` claim AND `agent_id` claim → Transaction Tokens mode
Else if JWT has custom transaction metadata field → Transaction Tokens mode
Else → Reject as unrecognized format
Validate signature according to detected mode
```

### BFF Token Exchange Mode Flow

```
Active Mode: Read from TOKEN_EXCHANGE_MODE
If mode == "transaction_tokens":
  Attempt Transaction Token exchange
  If fails AND auto_fallback:
    Log "Transaction exchange failed, retrying with RFC 8693"
    Attempt RFC 8693 exchange
  If both fail: Return 500 error
Else (mode == "rfc_8693"):
  Attempt RFC 8693 exchange (current behavior)
  If fails AND auto_fallback:
    Log "RFC 8693 exchange failed, retrying with Transaction Tokens"
    Attempt Transaction Token exchange
  If both fail: Return 500 error
Return result token to client
```

---

## Canonical References

All planning should reference:

- `CLAUDE.md` — Project structure, OAuth patterns, MCP server deployment
- `REGRESSION_PLAN.md` § 1 — Protected files (auth, token exchange, MCP core)
- `.claude/skills/oauth-pingone/SKILL.md` — OAuth token exchange patterns
- `.claude/skills/mcp-server/SKILL.md` — MCP server auth and token handling
- `.planning/phases/186-ID-token-exchange/186-*-SUMMARY.md` — Token exchange evolution
- `.planning/phases/188-define-ai-token-exchange-taxonomy/188-*-SUMMARY.md` — RFC 8693 implementation reference

---

## Specific Ideas / Examples

### Configuration Example (.env)
```
# Token Exchange Mode: rfc_8693 (default) or transaction_tokens
TOKEN_EXCHANGE_MODE=rfc_8693

# Auto-fallback to other mode if primary fails
TOKEN_EXCHANGE_AUTO_FALLBACK=true
```

### Session Context Example (Both Modes)

**RFC 8693 Mode:**
```javascript
{
  user: { id: "user-123", email: "user@example.com" },
  actor: { id: "banking-ai-agent", claim: "act" },
  transaction_id: null,  // Not used in RFC 8693
  transaction_scope: null
}
```

**Transaction Tokens Mode:**
```javascript
{
  user: { id: "user-123", email: "user@example.com" },
  actor: { id: "banking-ai-agent", claim: "txn_actor" },
  transaction_id: "txn-uuid-2026-04-19-001",
  transaction_scope: "check_balance",
  transaction_timestamp: "2026-04-19T10:30:45Z"
}
```

### UI Token Table Display (Mode-Aware)

**When RFC 8693 Mode Active:**
| Token Type | Full Name | Source | RFC Role |
|------------|-----------|--------|----------|
| User Token | User access token | PingOne OIDC login | `subject_token` |
| Agent Token | Agent access token | Client credentials grant | `actor_token` |
| MCP Token | Delegated access token | Token exchange result | Result with `act` claim |

**When Transaction Tokens Mode Active:**
| Token Type / Field | Full Name | Source | Draft Role |
|-------------------|-----------|--------|------------|
| User Token | User access token | PingOne OIDC login | Subject |
| Agent Token | Agent access token | Client credentials grant | Actor |
| MCP Token | Transaction token | Token exchange result | Result with transaction metadata |
| Transaction ID | Unique transaction ID | Exchange generation | Audit trail identifier |
| Transaction Scope | Operation intent | Exchange metadata | "check_balance" / "transfer_funds" |

---

## Agent's Discretion Areas

- **Exact Token Format:** How to structure Transaction Tokens if PingOne doesn't support draft spec natively
- **Logging Format:** How to log mode switches and exchange failures
- **Error Messages:** User-facing and system-facing error text for mode failures
- **Test Coverage:** Which scenarios to prioritize for verification
- **Performance:** Token parsing and validation efficiency across both modes
- **Fallback Timing:** Retry logic (immediate vs. exponential backoff)

---

*Phase 198 Context  
Gathered: 2026-04-19  
Ready for planning: `/gsd-plan-phase 198`*
