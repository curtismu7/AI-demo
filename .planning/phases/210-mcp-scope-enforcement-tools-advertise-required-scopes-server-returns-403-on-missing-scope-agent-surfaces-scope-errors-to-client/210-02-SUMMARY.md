# Phase 210 Plan 02 — SUMMARY

## Outcome
MCP server now returns JSON-RPC -32005 for "valid token, wrong scope" instead of generating an authChallenge. The no-token CIBA path is unchanged.

## What Was Built

### Task 1: AuthenticationResult insufficientScope
- `AuthenticationIntegration.ts`: extended `AuthenticationResult` interface with `insufficientScope?: boolean`, `missingScopes?: string[]`, `availableScopes?: string[]`
- changed the "has tokens but lacks required scopes" branch from returning `{ authChallenge: authRequest }` to `{ insufficientScope: true, missingScopes, availableScopes }`
- The no-token path still returns `authChallenge` (unchanged)

### Task 2: MCPMessageHandler -32005 error path
- `MCPMessageHandler.ts`: added `if (authResult.insufficientScope)` check BEFORE the `authResult.authChallenge` check
- returns `createErrorResponse(id, -32005, ...)` with `{ tool, requiredScopes, missingScopes, availableScopes }` data
- TypeScript compiles clean (`npx tsc --noEmit` → exit 0)

## Key Files Modified
- `banking_mcp_server/src/server/AuthenticationIntegration.ts`
- `banking_mcp_server/src/server/MCPMessageHandler.ts`

## Commit
`feat(210-02): MCP server returns -32005 for insufficient scope`

## Self-Check: PASSED
- `insufficientScope` in interface and return path
- -32005 path before authChallenge path in handleToolCall
- TypeScript type-checks pass
