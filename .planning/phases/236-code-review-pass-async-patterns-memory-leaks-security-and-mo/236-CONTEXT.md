# Phase 236: Code Review Pass — Context

**Gathered:** 2026-04-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Read-only code review of the Banking app's Express BFF backend (services and routes). Produces a structured REVIEW.md with severity-classified findings. No auto-fixes — human reviews findings and decides what to address.

</domain>

<decisions>
## Implementation Decisions

### Scope
- **D-01:** Review backend services only — all files under `banking_api_server/services/` and `banking_api_server/routes/`. The React SPA (229 components) is out of scope for this phase.
- **D-02:** No auto-fixing — phase output is a REVIEW.md report only. Each finding describes the issue and an actionable fix snippet, but code is not modified.

### Review Dimensions (all four, in priority order)
- **D-03:** Async patterns — unhandled promise rejections, missing `await`, floating promises, mixing callback-style with async/await
- **D-04:** Memory leaks — uncleared `setInterval`/`setTimeout`, event listener accumulation, large object retention
- **D-05:** Security — XSS via `innerHTML`, prototype pollution, insecure `eval()`, sensitive data in logs, missing input validation at system boundaries
- **D-06:** Modern JS standards — ES6+ usage (destructuring, `const`/`let`, spread), legacy `var` usage, unnecessary `.then()` chains

### Output Format
- **D-07:** Produce `banking_api_server/REVIEW.md` (or in the phase directory) with severity-classified findings: Critical / Major / Minor, one row per finding with: Severity, Category, File, Issue description, Actionable fix snippet.

### Claude's Discretion
- Exact file enumeration order (alphabetical, by module, or by risk profile)
- Whether to group findings by file or by severity in the report
- How many findings to surface (depth of analysis per file)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project guidelines
- `CLAUDE.md` — Project coding conventions and non-negotiables; regression plan
- `REGRESSION_PLAN.md` — Do-not-break list; high-risk files listed in §1

### Backend source
- `banking_api_server/services/` — 89 service files (primary review target)
- `banking_api_server/routes/` — Route handlers (secondary review target)

No external specs — review scope and output format fully captured in decisions above.

</canonical_refs>

<code_context>
## Existing Code Insights

### Review target summary
- 89 service files: token exchange, MCP, authorize gate, activity log, CIBA, introspection, delegation, session management
- 20+ route files: auth, accounts, transactions, admin, MCP tool endpoint, token chain, introspect
- Recently touched files (highest review priority): `appEventService.js`, `tokenIntrospectionService.js`, `tokenIntrospection.js` (middleware), `transactionAuthorizationService.js`, `mcpToolAuthorizationService.js`, `server.js`, `transactions.js`, `tokenChain.js`

### Known patterns
- Services use CommonJS `require()` throughout — no ES modules
- Most async operations use async/await; some older services still mix `.then()` chains
- `logEvent` / `logAppEvent` calls fire-and-forget (acceptable by design in appEventService)

</code_context>

<specifics>
## Specific Ideas

- The authorize gate changes (Phase 230) and introspection logging (Phase 235) are the freshest code — review those first
- The `server.js` file is very large (~1400+ lines) and is a known complexity hotspot

</specifics>

<deferred>
## Deferred Ideas

- React SPA review — out of scope for this phase; could be Phase 237 if needed
- Auto-fix mode — explicitly deferred (report-only chosen for safety)

</deferred>

---

*Phase: 236-code-review-pass-async-patterns-memory-leaks-security-and-mo*
*Context gathered: 2026-04-26*
