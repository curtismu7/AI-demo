# Phase 56-04 Summary: Scope Narrowing & RFC 8707 Compliance

## What Was Done

Eliminated the 3-level scope fallback chain in `agentMcpTokenService.js` and replaced it with explicit two-path logic per user directive "NO fall backs, it must work."

## Files Modified

- `banking_api_server/services/agentMcpTokenService.js`

## Key Changes

**Removed** (~70 lines):
- `fallbackScopes` variable and multi-step chain
- `toolCandidateScopes` passthrough fallback
- `['banking:read']` hardcoded default
- Old pre-exchange bail-out block

**Added**:
- Path A: direct intersection (`toolCandidateScopes ∩ userTokenScopes`, no `DELEGATION_ONLY_SCOPES`)
- Path B: delegation via `banking:ai:agent:read` (PingOne policy decides)
- Fail-fast else branch (403 `missing_exchange_scopes`) — no fallback
- `const effectiveToolScopes = finalScopes` alias to preserve downstream references
- `configStore.validateScopeAudience(finalScopes, mcpResourceUri)` call for RFC 8707 compliance

## Test Results

- Before: 61 failing / 13 passing
- After: 60 failing / 14 passing (net +1, no regressions)

## Commit

`feat(56-04)`: Scope fallback chain removed, explicit two-path logic, fail-fast
