---
phase: 240
reviewers: [opencode]
reviewed_at: 2026-04-27T00:00:00.000Z
plans_reviewed: [240-01-PLAN.md, 240-02-PLAN.md, 240-03-PLAN.md]
---

# Cross-AI Plan Review — Phase 240

## OpenCode Review

### Summary
The three-plan structure follows a logical audit→UI→backend sequence with appropriate dependencies. Plans are generally well-scoped, but task specificity varies significantly between plans. Plan 240-01 risks being ceremonial busywork, while 240-03's backend normalization could destabilize production routes if not carefully bounded. The coverage matrix dependency creates a waterfall that may block parallel work unnecessarily.

---

### Strengths

- **Sensible dependency chain**: Audit → UI → backend normalization prevents rework
- **Backward compatibility awareness**: Explicit requirement in 240-02 prevents breaking existing consumers
- **Bounded scope**: D-04 expansion criteria ("first-class and user-actionable") prevents scope creep
- **Existing asset leverage**: Uses `PingOneApiPanel.jsx` rather than creating redundant components
- **Separation of concerns**: UI wiring and backend normalization in separate plans allows focused reviews

---

### Concerns

**HIGH** - **Backend normalization scope ambiguity**
Plan 240-03 targets `routes/authorize.js` which likely handles production auth flows, not just test pages. Changing response formats on production routes risks breaking the main application. The plan doesn't specify whether normalization applies to test-only routes or all routes.

**MEDIUM** - **Coverage matrix as blocker**
240-02 and 240-03 depend on 240-01's "coverage matrix doc," but the audit task is vague. Without clear criteria, the matrix may be inconsistent or incomplete, blocking downstream work.

**MEDIUM** - **PingOneApiPanel extension contract underspecified**
"Accept: method+URL endpoint metadata, docs link, request JSON, response JSON" doesn't specify prop names, structure, or whether existing props are deprecated.

**LOW** - **Test directory creation without infrastructure**
Creating `src/__tests__/routes/` as a new directory implies establishing test patterns, but no Jest config or test utilities are mentioned.

**LOW** - **D-04 evaluation criteria missing**
"Evaluate adjacent pages" task lacks specific criteria for determining inclusion.

---

### Suggestions

1. **Clarify 240-03 route scope**: Explicitly state whether `routes/authorize.js` normalization applies to test-only endpoints only, or all authorize routes with backward-compatible structure. If the latter, require additional verification tasks.

2. **Define coverage audit criteria in 240-01**: Specify exact sections per page to audit and pass/fail criteria (e.g., "Panel shows method+URL" = PASS).

3. **Specify PingOneApiPanel prop contract**: Define exact prop names and shapes up front:
   ```javascript
   { endpoint: { method: string, url: string }, docsUrl: string, request: object, response: object }
   ```

4. **Consider collapsing 240-01 into 240-02**: The coverage audit could be a 2-hour task within 240-02 rather than a separate plan, reducing waterfall delays. Alternatively allow 240-02/03 to proceed in parallel once the first section is audited.

5. **Add schema validation to 240-03**: Validate full response structure against a schema to catch field name mismatches, not just field presence.

6. **Include Jest setup task in 240-03**: Add explicit task to configure test environment before writing first route tests since `src/__tests__/routes/` doesn't exist.

---

### Risk Assessment: **MEDIUM**

Primary risk is backend normalization (240-03) affecting production routes without clear boundaries. `routes/authorize.js` likely serves live authentication flows — modifying its response structure without strict backward compatibility could break production. Additionally, the coverage matrix creates a single point of failure.

**Mitigation**: Require 240-03 to explicitly identify production vs. test routes, and add a verification task to test the main application flows after backend changes.

---

## Consensus Summary

Only one external reviewer (OpenCode) was available — `claude` skipped for independence (running inside Claude Code).

### Key Findings

**Agreed Strengths**
- Dependency chain (audit→UI→backend) is correct sequencing
- Backward compatibility requirement on PingOneApiPanel is well-identified
- D-04 scope criteria prevents feature creep

**Top Concerns to Address Before Re-planning**

1. **240-03 route scope** (HIGH): Clarify whether `routes/authorize.js` changes are test-endpoint-only or apply to production auth routes. This is the highest-risk change in the phase.
2. **PingOneApiPanel prop contract** (MEDIUM): Define the exact prop API (`endpoint`, `docsUrl`, `request`, `response`) in the plan before implementation to avoid integration drift between 240-02 and 240-03.
3. **240-01 may be mergeable into 240-02** (MEDIUM): The coverage audit is lightweight enough to inline, removing the Wave 1 blocker and enabling parallel Wave 2 execution.

### Recommendation

Re-plan with `--reviews` to incorporate these findings, particularly locking down 240-03 route scope and specifying the PingOneApiPanel prop contract explicitly.
