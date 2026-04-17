---
phase: 151-scope-vocabulary-audit
plan: 01
status: complete
---

# Phase 151 Plan 01 — Summary

## What was done

Comprehensive audit of all OAuth scope strings across the entire codebase: `banking_api_server`, `banking_mcp_server`, `banking_api_ui`, and `postman/`.

## Artifacts

- `151-SCOPE-AUDIT.md` — Full audit with cross-module reference matrix, issues found, and prioritized recommendations

## Key findings

1. **CRITICAL: MCP server uses two parallel scope systems** — `toolScopeMap.ts` uses canonical scopes correctly, but `BankingToolRegistry.ts` and 5 other files still use deprecated compound scopes (`banking:accounts:read`, `banking:transactions:read/write`, `banking:sensitive:read`). Risk of token exchange rejection if PingOne RS only has canonical scopes.

2. **MODERATE: UI has non-standard scopes** — `agentMcpScopes.js` invented `banking:general:read/write`; `useResourceIndicators.js` mock data has `transactions:read`, `accounts:read` (no `banking:` prefix) and completely fictional `ai:act`, `ai:read`, `ai:write`, `agent:manage`; `BankingAdminOps.js` has typo `banking:ai:agent:read`.

3. **LOW: Postman env has `banking:mcp:invoke`** — not in canonical scope registry.

## Recommendation

Priority 1 fix: Standardize the 6 MCP server files from compound → canonical scopes. This is the highest-risk divergence.

## Files analyzed

- `banking_api_server/config/scopes.js` (source of truth)
- `banking_mcp_server/src/tools/toolScopeMap.ts`, `BankingToolRegistry.ts`, `AuthorizationChallengeHandler.ts`
- `banking_mcp_server/src/server/BankingMCPServer.ts`, `HttpMCPTransport.ts`, `AuthenticationIntegration.ts`
- `banking_mcp_server/src/auth/AuthorizationRequestGenerator.ts`
- `banking_api_ui/src/config/agentMcpScopes.js`, `src/hooks/useResourceIndicators.js`, `src/components/BankingAdminOps.js`
- `postman/Super-Banking-Local.postman_environment.json`
- `banking_api_server/SCOPE_AUTHORIZATION.md`, `SCOPE_VOCABULARY.md`
