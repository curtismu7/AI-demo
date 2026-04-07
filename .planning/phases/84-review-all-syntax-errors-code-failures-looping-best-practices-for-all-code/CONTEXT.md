# Phase 84 Context: Code Quality Sweep

**Date:** 2026-04-07  
**Phase:** 84 — review all syntax errors code failures looping best practices for all code  
**Depends on:** Phase 83

---

## User Vision

Audit all code in the three main services (UI, API, MCP) for code quality issues and fix systematic problems. Deliverable: clean, consistent codebase ready for production review.

---

## Scope Definition

### Codebase Scale
- **banking_api_ui**: React/TypeScript UI (CRA)
- **banking_api_server**: Express.js API (Node.js)
- **banking_mcp_server**: MCP server (Node.js)
- **Total source files**: ~613 files (excluding node_modules, node_modules, build artifacts)
- **Test files**: ~201 test files (existing test infrastructure)

### Known Issues / TODOs to Address

1. **Shell Scripts** (explicit todo)
   - Consolidate 5+ shell scripts into single `run.sh` entry point
   - Add pre-flight checks, subcommands (start/stop/restart/logs/test/status)
   - Add post-start summary banner
   - PID-file process management
   - Make shellcheck-clean

2. **Debug Logging**
   - Multiple `console.log()` statements for debugging left in codebase
   - Should be reviewed and either removed or converted to structured logging
   - Examples: `authStateCookie.js`, `oauthService.js`, many others

3. **Code Quality Gaps**
   - No ESLint configuration currently
   - Unknown syntax/style violations
   - Unknown dead code or unused imports
   - May have circular dependencies or linting issues

4. **Testing & Validation**
   - 201 existing tests; unclear what coverage is and what gaps exist
   - May need test audit for completeness

---

## Decisions (Locked In)

| ID | Decision | Rationale |
|----|----------|-----------|
| D-01 | Audit before fixing | Run linters/checkers first to identify all issues before planning fixes |
| D-02 | Fix in multiple phases if needed | If scope is huge, split into focused sub-phases rather than do everything at once |
| D-03 | Preserve test suite | Do not break existing 201 tests; all fixes verified against test suite |
| D-04 | Shell script consolidation is priority | Include run.sh consolidation as a primary deliverable |

---

## Phase Success Criteria

✅ All identified is to code quality issues are categorized and high-priority ones are fixed  
✅ `run.sh` consolidation complete with pre-flight checks and subcommands  
✅ Console.log spam removed or converted to structured logging  
✅ Codebase passes manual review for obvious syntax/style issues  
✅ All 201 tests pass  
✅ No regressions in REGRESSION_PLAN.md protected areas  

---

## Next: Planning

Plans will be created to address:
- **Plan 1**: Audit code for quality issues (lint, dead code, etc.) - create inventory
- **Plan 2**: Fix high-priority issues (critical bugs, security, dead code)
- **Plan 3**: Consolidate shell scripts into enterprise-grade run.sh
- **Plan 4** (if needed): Clean up debug logging and add structured logging

Breakdown will be determined after task analysis.
