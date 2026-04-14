# Phase 146: Scope Vocabulary Alignment — Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered and rationale.

**Date:** 2026-04-14  
**Phase:** 146 — Scope vocabulary alignment — match code to PingOne  
**Areas discussed:** Audit Scope, Scope Naming Convention, Documentation, Real vs Demo Scopes, Scope UI Access  

---

## Area 1: Audit Scope

**Question:** What should the alignment audit cover?

| Option | Description | Depth |
|--------|-------------|-------|
| A | Map existing code scope references to PingOne config; produce discrepancy report | Inventory |
| B | Create canonical scope registry (Scope → Resource Server → Code Enforcement) | Registry |
| C | Full audit + cleanup: identify inconsistencies and refactor code | Comprehensive |

**User's choice:** All three (A + B + C)  
**Rationale:** "Do them all" — comprehensive approach ensures downstream phases have confidence

**Selected decision:** D-01 — Perform comprehensive audit: inventory existing scopes, create canonical registry, refactor code to align. Deliverable by end of Phase 146: every scope reference documented and justified.

---

## Area 2: Scope Naming Convention

**Question:** Should we standardize on one naming approach?

| Approach | Pattern | Trade-off |
|----------|---------|-----------|
| A | Keep mixed approach (some routes use `requireScopes()`, some don't via row-level checks) | Inconsistent; reflects production reality |
| B | Simplify to 4 core scopes only (`banking:read`, `banking:write`, `banking:admin`, `ai_agent`) | Cleaner mental model; less realistic |
| C | Formal custom resource server with real `banking/*` scopes | Production-realistic; requires user setup |

**User's choice:** C  
**Rationale:** "C, but we already have pingone-test page that should have this ability (and the code needs to be updated to match what we are doing here)"

**Selected decision:** D-02 — Implement formal custom PingOne resource server with canonical scopes: `banking:read`, `banking:write`, `banking:admin`, `ai_agent`. Add detection + automation in Config service to create resource server if missing; fallback to guided setup. Update pingone-test page to align with new vocabulary (part of Phase 146 scope).

---

## Area 3: Documentation — Scope Reference Structure

**Question:** How should documentation be organized?

| Approach | Structure | Maintenance |
|----------|-----------|------------|
| A | Single source-of-truth update to OAUTH_SCOPE_CONFIGURATION.md | One file; gets longer |
| B | Separate canonical registry (SCOPE_VOCABULARY.md) + keep implementation docs separate | Clear separation; multiple files |
| C | Embedded in code + auto-generated docs from JSDoc | DRY; harder to overview |

**User's choice:** B + C (hybrid)  
**Rationale:** Need both structured reference AND rich code documentation

**Selected decision:** D-03 — Create new `banking_api_server/SCOPE_VOCABULARY.md` as canonical registry. Update existing `OAUTH_SCOPE_CONFIGURATION.md` + `SCOPE_AUTHORIZATION.md` to link to it. Add JSDoc comments to all scope-enforcing routes. Extract scope references from code comments for future automated reference docs.

---

## Area 4: Real vs Demo Scopes

**Question:** How to handle the gap between real PingOne tokens and demo scopes?

| Approach | Pattern | Trade-off |
|----------|---------|-----------|
| A | Use real scopes only; no injection | Production-realistic; demo fails if setup incomplete |
| B | Inject synthetic scopes in demo mode (similar to `ff_inject_may_act`) | Learner sees all scopes; token isn't "real" |
| C | Hybrid: real scopes by default, inject as fallback if setup missing | Best of both; educational when needed |

**User's choice:** C  
**Additional requirement:** "Yes scope injection be visible in the token inspector"

**Follow-up 1:** Scope injection badge placement?  
**User's choice:** "Both" (warning banner + scope badges)

**Selected decision:** D-04 — Implement hybrid approach. Use real PingOne scopes by default. If resource server missing, offer optional demo mode with `ff_inject_demo_scopes` flag. When injected: display warning banner "⚠️ Scope injection enabled — demo mode (scopes injected by application)" + add "INJECTED" labels to scope badges in token inspector. Visibility strategy: both banner (warning level) + scope-level badges (granular).

---

## Follow-Up: PingOne Resource Server Implementation

**Question:** How should Phase 146 handle resource server creation?

**Options:**
1. Automate creation via PingOne Management API
2. Provide setup guide; assume user has done it
3. Both: detect missing, offer to automate, fallback to guide

**User's choice:** "Q1 = all 3"  
**Meaning:** Detect missing resource server, attempt automation, provide fallback guidance

**Selected decision:** (Part of D-02) Add three-level fallback: (1) Detection via Management API check, (2) One-click creation via `POST /api/admin/config/create-resource-server`, (3) Guided setup with manual steps if automation fails.

---

## Follow-Up: Scope Reference Access in UI

**Question:** Where should canonical scope reference be accessible?

**User's input:** "WE need conical resource for scpes on the config drop down menu, so users can find it easy. Put in hamburger menu as well. Add this to 146"

**Selected decision:** D-05 — Add "📚 Scope Reference" link in Config dropdown menu AND hamburger menu (SideNav). Both link to SCOPE_VOCABULARY.md or render as modal panel. Supports learners who want to understand scopes during demo.

---

## Area 5: PingOne Test Page Refactor

**Question:** Should test page updates be part of Phase 146?

**User's choice:** Q3 = "part of 146"

**Selected decision:** D-06 — Update `/pingone-test` routes and PingOneTestPage.jsx to use canonical scope vocabulary (D-02 naming). Update test endpoints, UI display, and ensure scope injection indicators match main app. Rationale: Test page is a teaching tool; must demonstrate final vocabulary.

---

## Summary: Decisions Captured

| Decision ID | Area | Choice | Rationale |
|-------------|------|--------|-----------|
| D-01 | Audit Scope | A+B+C comprehensive | Full alignment with no gaps |
| D-02 | Scope Naming | C + formal resource server | Production-realistic education |
| D-03 | Documentation | B+C hybrid | Registry + code docs |
| D-04 | Real vs Demo | C hybrid + both visibility | Transparent fallback; learner-friendly |
| D-05 | UI Access | Config + hamburger menus | Fast reference for learners |
| D-06 | PingOne Test | Part of Phase 146 | Consistent vocabulary in teaching tool |

---

## the agent's Discretion

- Specific UI component for scope reference modal (modal vs sidebar vs link)
- Timing of resource server creation (on load vs on-request)
- Injection badge styling and placement details
- Resource server app permissions/scopes needed for Management API
- Backward compatibility / deprecation strategy for compound scopes

---

## Deferred Ideas (Reviewed but not in Phase 146 scope)

- Advanced scope scenarios (time-limited scopes, delegation chains) → future educational phase
- Scope audit CI/CD automation → future DevOps phase
- Multi-tenant scope patterns → out of scope for v1 demo

---

*Phase 146 context discussion completed: 2026-04-14*
*Ready for: /gsd-plan-phase 146*
