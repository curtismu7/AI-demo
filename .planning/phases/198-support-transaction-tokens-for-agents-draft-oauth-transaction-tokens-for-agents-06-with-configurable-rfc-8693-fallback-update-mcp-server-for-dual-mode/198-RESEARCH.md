---
phase: 198
status: "researched"
date: "2026-04-19"
---

# Phase 198 Research: Transaction Tokens For Agents (draft-oauth-transaction-tokens-for-agents-06)

## Objective

Research how to implement support for draft-oauth-transaction-tokens-for-agents-06 (Transaction Tokens) as an alternative to RFC 8693 token exchange, with configurable fallback to RFC 8693 and dual-mode MCP server support.

## Domain Understanding

### Specification Evolution

**RFC 8693 (Stable, Current Implementation)**
- Subject-only mode: `subject_token` alone
- On-behalf-of mode: `subject_token` + `actor_token` → result with `act` claim
- Designed for general-purpose delegation scenarios
- Proven, production-ready, well-established

**draft-oauth-transaction-tokens-for-agents-06 (Draft, New)**
- Specific design for agent-based token exchange scenarios
- Extends OAuth 2.0 with transaction token concepts
- Focuses on agent credentials, transaction context, and audit trails
- Status: Internet Draft (not yet an RFC)
- Stability: Drafted 2024-2025, still in community review
- Key difference: Designed specifically for AI agents acting on behalf of users
- May include: transaction ID, intent/scope, audit logging, agent attestation

### Relationship Between Specs

Both specs solve delegation problems but with different focuses:
- **RFC 8693**: General-purpose delegation mechanism ("act on behalf of")
- **Transaction Tokens Draft**: Agent-specific delegation with transaction context ("agent performing transaction for user")

**Compatibility Approach:** Configuration flag allows switching modes without breaking existing code.

## Implementation Research

### Current State (RFC 8693)

**Banking Demo Implementation:**
- Tokenexchange endpoint: `/api/tokens/exchange` (BFF)
- Dual-token mode default (user token + agent credentials)
- Result token: MCP access token with `act` claim
- UI displays: User Token, Agent Token, MCP Token (Delegated Access Token)
- ExchangeModeToggle component: Shows mode info (currently always 2-exchange)

### Transaction Tokens Key Concepts

From draft-oauth-transaction-tokens-for-agents-06:

1. **Transaction Identifier** — Unique ID for each agent-user interaction
   - Allows audit trail across multiple API calls
   - Enables transaction replay detection
   - Formats: UUID, timestamp+hash, client-determined

2. **Agent Identity** — Formal attestation of which agent is acting
   - Client ID (already in OAuth)
   - Plus: agent version, environment, signing key (optional)
   - Used for agent verification and liability tracking

3. **Transaction Scope/Intent** — What the agent is authorized to do
   - May include: transaction type, specific user request, resource scope
   - Allows fine-grained authorization decisions
   - Example: Agent performing "transfer funds" vs "check balance"

4. **Request Signing** — Optional cryptographic proof of agent request
   - Signs: transaction ID, intent, timestamp
   - Prevents tampering during token exchange
   - Agent signs request before exchange; resource verifies

5. **Audit Trail Integration** — Built-in logging support
   - Transaction ID in token enables following agent actions
   - Resource server can validate transaction consistency
   - Compliance: Financial, healthcare, etc.

### Dual-Mode Architecture Design

**Configuration Options:**
```
Token Exchange Mode: {
  "rfc_8693": { fallback: true, active: false },
  "transaction_tokens": { fallback: false, active: true },
  "auto_fallback": true  // If transaction tokens unavailable, use RFC 8693
}
```

**Configuration Source:** Environment variable + config file
- `TOKEN_EXCHANGE_MODE=transaction_tokens` (production)
- `TOKEN_EXCHANGE_MODE=rfc_8693` (legacy/staging)
- Default: `rfc_8693` (backward compatible)

### MCP Server Dual-Mode Requirements

**MCP Server Enhancement:**

1. **Accept Both Token Types**
   - Parse incoming bearer token
   - Detect format: RFC 8693 (JWT with `act` claim) vs Transaction Token (custom format or JWT with transaction metadata)
   - Route to appropriate validation path

2. **Validation Paths**

   **RFC 8693 Path:**
   - Validate JWT signature
   - Check `act` claim for agent identity
   - Verify `sub` is the user
   - Existing code (no changes needed)

   **Transaction Tokens Path:**
   - Validate JWT signature (or custom format signature)
   - Extract transaction ID, agent identity, intent/scope
   - Verify transaction ID against audit log (prevent replays)
   - Verify agent attestation signature (if present)
   - Check transaction scope against requested operation
   - Log transaction for audit trail

3. **Context Storage**
   - Both modes populate session/request context with:
     - User identity (existing: `sub`)
     - Agent identity (existing: `act` claim in RFC 8693, new: transaction field in Transaction Tokens)
     - Transaction context (new: transaction ID, scope, intent)
   - Allow tools to access both for logging/authorization

4. **Tool Invocation Changes**
   - No changes to tool signatures (backward compatible)
   - Tools can optionally access transaction context: `context.transaction_id`, `context.transaction_intent`
   - Logging middleware: Include transaction ID in all logs regardless of mode

### BFF Token Exchange Service Updates

**agentMcpTokenService.js changes:**

1. **Mode Detection**
   - Read `TOKEN_EXCHANGE_MODE` from environment
   - Log active mode on startup

2. **Exchange Implementation**
   - RFC 8693 path: Existing (unchanged) — call `/token` with subject_token + actor_token
   - Transaction Tokens path: New — prepare exchange request with transaction metadata
     - Generate transaction ID (UUID or timestamp+hash)
     - Package user token + agent identity + intent
     - Call PingOne `/token` endpoint with transaction token request (if supported)
     - If PingOne doesn't support it: Fall back to RFC 8693 (auto_fallback mode)

3. **Response Processing**
   - RFC 8693: Extract result JWT, check `act` claim (existing)
   - Transaction Tokens: Extract result, validate transaction ID, ensure audit fields present

4. **Error Handling**
   - If Transaction Tokens exchange fails AND `auto_fallback: true` → retry with RFC 8693
   - If both fail → 500 error with appropriate messaging

### UI Display Updates

**ExchangeModeToggle Component:**

1. **Mode Display**
   - Show active mode: "RFC 8693 Token Exchange" or "Transaction Token Exchange"
   - Show fallback status: "Can fall back to RFC 8693 if needed"

2. **Token Types Table (Updated for Transaction Tokens)**

   | Type | When Using RFC 8693 | When Using Transaction Tokens |
   |------|---------------------|-------------------------------|
   | User Token | `subject_token` (JWT from login) | `subject_token` (same) |
   | Agent Token | `actor_token` (client credentials) | `actor_token` (same) |
   | Result Token | MCP token with `act` claim | MCP token with transaction metadata |
   | Additional | N/A | **Transaction ID** - UUID for this exchange, enables audit trail |
   | Additional | N/A | **Intent/Scope** - What operation the agent is performing |
   | Additional | N/A | **Agent Attestation** - Optional signature proving agent request validity |

3. **Educational Content**
   - Explain Transaction Tokens difference (agent-specific vs general delegation)
   - Explain transaction ID use (audit, replay protection)
   - Explain mode selection (config-driven, not user-selectable)

### PingOne Integration Assumptions

**Unknown (May Require Vendor Check):**
- Does PingOne's `/token` endpoint support Transaction Tokens draft?
- If not yet: Banking demo can generate token format locally, or use RFC 8693 as primary with Transaction Tokens as extension

**Strategy:**
- Implement dual-mode as local logic (not dependent on PingOne supporting it)
- Can exchange via RFC 8693, then add transaction metadata to result
- Or: prepare transaction token format, attempt exchange, fall back to RFC 8693 if rejected

## Implementation Architecture

### File Changes Summary

**Banking BFF (Node.js/Express):**
1. `banking_api_server/config/.env` — Add `TOKEN_EXCHANGE_MODE` variable
2. `banking_api_server/services/agentMcpTokenService.js` — Add dual-mode logic
3. `banking_api_server/middleware/agentSessionMiddleware.js` — Accept both token types

**MCP Server (TypeScript/WebSocket):**
1. `banking_mcp_server/src/services/tokenValidationService.ts` — Add Transaction Tokens validation path
2. `banking_mcp_server/src/services/sessionManager.ts` — Handle both token types in context
3. `banking_mcp_server/src/middleware/authMiddleware.ts` — Detect and route tokens

**Banking UI (React):**
1. `banking_api_ui/src/components/ExchangeModeToggle.js` — Update to show active mode and transaction metadata
2. `banking_api_ui/src/components/ExchangeModeToggle.css` — Add styles for Transaction token display
3. `banking_api_ui/src/components/TokenChainEducationPanel.js` — Add Transaction Tokens section

### Backward Compatibility

- Default mode: RFC 8693 (existing behavior)
- Auto-fallback: If configured mode unavailable, try the other
- No breaking changes to tool APIs or session context shape
- Transaction metadata in context is optional (tools don't require it)

## Validation & Testing Strategy

### Configuration Testing
- [ ] Verify RFC 8693 mode (existing)
- [ ] Verify Transaction Tokens mode with PingOne fallback
- [ ] Verify auto_fallback: true → successful fallback to RFC 8693
- [ ] Verify mode logging on startup

### Token Exchange Testing
- [ ] RFC 8693 exchange produces `act` claim in result
- [ ] Transaction Tokens exchange produces transaction ID in result
- [ ] Both modes include user (`sub`) in context

### MCP Server Validation
- [ ] RFC 8693 tokens accepted by MCP server
- [ ] Transaction Tokens accepted by MCP server
- [ ] Tools receive transaction context when available
- [ ] Audit logging includes transaction ID regardless of mode

### Tool Invocation Testing
- [ ] Tool calls succeed with RFC 8693 mode
- [ ] Tool calls succeed with Transaction Tokens mode
- [ ] No regressions in existing tool functionality

### UI Verification
- [ ] ExchangeModeToggle displays active mode
- [ ] Token table shows mode-specific details
- [ ] Education content explains both specs
- [ ] Token chain visualization adapts to active mode

## Remaining Questions / Unknowns

1. **PingOne Support** — Does PingOne's OAuth `/token` endpoint support draft-oauth-transaction-tokens-for-agents-06?
   - If NO: Banking demo can implement locally (generate token format, add metadata)
   - If YES: Can exchange directly with Transaction Tokens format

2. **Transaction Token Format** — What is the exact format? (JWT with custom claims? Custom structure?)
   - Likely: JWT with `txn_id`, `agent_id`, `intent` claims and optional signature

3. **Agent Attestation** — Is request signing required or optional?
   - Likely: Optional for Phase 198; can be added in Phase 199

4. **Audit Trail Storage** — Should banking demo persist transaction IDs locally?
   - Likely: Phase 199 feature; Phase 198 focuses on token format support

## Next Steps (Planning)

Phase 198 plan should:
1. Add TOKEN_EXCHANGE_MODE config + environment variable
2. Implement RFC 8693 path (already works) + Transaction Tokens path (new)
3. Add dual-mode token detection and routing in MCP server
4. Update UI to display active mode
5. Add auto-fallback logic
6. Write tests for both modes
7. Verify no regressions in existing RFC 8693 flow

