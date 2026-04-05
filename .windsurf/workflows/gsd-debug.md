---
description: GSD Debug - Investigation and systematic bug fixing
---

# GSD Debug Workflow

## Purpose
Investigation, debugging, and systematic bug resolution for complex issues that require systematic analysis and verification.

## When to Use
- Complex bug investigation
- Performance issues
- Integration problems
- Systematic debugging
- Root cause analysis
- Phase blockers that prevent progression

## Steps

### 1. Issue Identification
// turbo
Identify and prioritize the specific issues to debug based on current blockers:
```bash
node "$HOME/.copilot/get-shit-done/bin/gsd-tools.cjs" todo match-phase "52" 2>&1 | python3 -c "import json,sys; d=json.load(sys.stdin); [print(f\"{m['score']:.1f} [{m['area']}] {m['title']}\") for m in sorted(d['matches'], key=lambda x: -x['score'])]" | head -10
```

### 2. Systematic Investigation
For each identified issue:
- **Reproduce**: Create reliable reproduction steps
- **Isolate**: Determine the affected components and systems
- **Analyze**: Examine logs, error messages, and system behavior
- **Document**: Record findings and observations

### 3. Root Cause Analysis
- **Trace**: Follow the data flow and execution path
- **Identify**: Pinpoint the exact cause of the issue
- **Validate**: Confirm the root cause with targeted tests
- **Impact**: Assess scope and potential side effects

### 4. Solution Design
- **Plan**: Design minimal, targeted fixes
- **Test**: Create test cases to verify the fix
- **Risk**: Assess potential regression impacts
- **Backup**: Plan rollback if needed

### 5. Implementation
- **Apply**: Implement the minimal fix
- **Test**: Verify the fix resolves the issue
- **Validate**: Ensure no regressions introduced
- **Document**: Record the solution for future reference

### 6. Verification
- **Functional**: Test the fixed functionality end-to-end
- **Integration**: Verify compatibility with other systems
- **Performance**: Ensure no performance degradation
- **User Experience**: Confirm the fix improves user experience

## Expected Outcome
- Systematic resolution of complex bugs
- Root cause identification and documentation
- Minimal, targeted fixes with no regressions
- Improved system stability and reliability
- Updated documentation and test coverage

## Notes
- This workflow integrates with the GSD rules in `.cursor/rules/gsd-*.mdc`
- Always check `REGRESSION_PLAN.md` before making changes to protected areas
- Focus on one issue at a time for thorough investigation
- Document all findings for future reference and team knowledge sharing