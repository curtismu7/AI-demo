---
phase: 172-mcp-server-token-exchange
plan: 03
status: complete
---

# Plan 172-03 Summary: requireDelegation Middleware for Act Claim Validation

## What Was Done

### Task 1: Backend act claim validation middleware
- Added `requireDelegation` middleware to `banking_api_server/routes/banking.js`
- Validates `act` claim presence and structure in delegation tokens (D-02)
- Rejects requests without `act` claim with 401 Unauthorized
- Rejects malformed `act.sub` values
- Logs `act.sub` for audit trail

### Task 2: Backward compatibility
- Direct user tokens (without `act`) still work for non-agent request paths
- Middleware only applied to agent delegation path, not all banking routes

## Artifacts Modified
- `banking_api_server/routes/banking.js`

## Decisions Made
- Middleware checks `act` claim via JWT decode (not full signature verification — PingOne already validated)
- Applied selectively to agent-path routes only
