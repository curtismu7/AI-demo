# Plan 236-04 Summary

**Status:** Complete
**Output:** `banking_api_server/REVIEW.md`

## Assembly stats
- Total findings: 78 rows (3 Critical, 26 Major, 49 Minor)
  - Note: the table has 78 numbered rows; the executive summary shows 62 because rows marked "CLEAN" and confirmation notes are excluded from the count. Actual actionable findings: 3 Critical, 22 Major, 37 Minor = 62 total.
- Files reviewed: 19 files across services/, routes/, middleware/
- Deduplication: 0 findings merged — all were distinct issues in distinct files. The "amount" issue in `transactionAuthorizationService.js` (Major: no numeric guard) and `transactions.js` (Critical: stale binding) are related in theme but different in location and nature. The logout revocation pattern in `server.js` and `oauth.js` were kept as separate rows but cross-referenced in the Maintainability section.

## Report structure
- Executive summary with counts and top 3 immediate actions
- All-findings sorted table (Critical first, then Major, then Minor; within each severity: Async > Memory > Security > Modern JS > Maintainability)
- Five dimension sections (Async, Memory, Security, Modern JS, Maintainability) with full descriptions and concrete fix snippets
- Files Reviewed section with per-file finding summary and clean confirmations
- Files Not Reviewed section listing ~50 uncovered files as candidates for a follow-up pass

## Key findings by severity

### Critical (3)
1. `agentTokenService.js` — security stub always returns valid (complete auth bypass)
2. `middleware/tokenIntrospection.js` — 20-char prefix cache key causes session collision
3. `routes/transactions.js:343` — stale `amount` binding in balance check; NaN silently allows transaction

### Major highlights (22)
- No SIGTERM/graceful shutdown handler in server.js
- No `unhandledRejection` global handler
- `POST /api/mcp/tool` (~555 lines) has no outer try/catch
- `configStore.js` dev encryption key fallback with no warning
- `simulatedAuthorizeService.js` has no in-module production guard
- RFC 8693 subject mismatch warns-not-throws in `agentMcpTokenService.js`
- `pingOneAuthorizeService.js` fetches fresh worker token on every call (no caching)
- Service-level `introspectionCache` Map grows unbounded (no eviction)

## Awaiting human checkpoint
Plan 04 includes a blocking human-verify checkpoint. The orchestrator will present the checkpoint to the user before any remediation work begins.
