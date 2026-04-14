# Phase 147: Get rid of left agent. Keep the rest — Discussion Log [CORRECTED]

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered and scope correction.

**Date:** April 14, 2026  
**Phase:** 147 — Get rid of left agent. Keep the rest  
**Areas discussed:** Initial scope misunderstanding, Scope Correction, Placement mode removal

---

## Initial Misunderstanding

**Original User Statement:** "Remove left agent. Keep the rest. The left column buttons get covered up by the buttons on the side of the dashboard, so want to remove it."

**Agent's First Interpretation:** Remove the ba-left-col (internal left column) from the agent component.

**Discussion went down wrong path:** Area 1 (Removal Scope), Area 2 (Relocated Functionality), Area 3 (Suggestion Chips), Area 4 (CSS Cleanup) — all based on left-column removal.

**Decisions locked:** Remove ba-left-col, move suggestions, drop buttons, delete CSS.

---

## Scope Correction (Post-Commit)

**User Re-clarification:** "No this is wrong. The idea was to remove the left placement of the agent, since it conflicts with buttons on side of dashboard. If you can fix that, then we can keep left agent."

**The Actual Problem:** Left-dock **placement mode** (sidebar placement) conflicts with dashboard sidebar buttons, not the agent's internal left column.

**The Actual Solution:** Remove 'left-dock' as a valid placement option → agent cannot be placed in left sidebar → no conflict with dashboard buttons.

**Preservation:** Keep ba-left-col (left column with all functionality: action buttons, suggestions, auth controls) in ALL remaining modes (inline, float, bottom-dock, right-dock, side-dock).

---

## Corrected Decision Areas

### Area 1: Placement Mode Removal (Corrected)

| Option | Description | Selected |
|--------|-------------|----------|
| Option A | Remove 'left-dock' from valid placement modes in AgentUiModeContext | ✓ |
| Option B | Keep 'left-dock' and instead modify dashboard sidebar to avoid conflicts | |
| Option C | Make left-dock a conditional feature (flag-based) | |

**User's choice:** Option A — Remove 'left-dock' as a valid placement mode. Agent can still be accessed via inline, float, bottom-dock, right-dock, side-dock.

### Area 2: BA-Left-Col Preservation (Corrected)

| Option | Description | Selected |
|--------|-------------|----------|
| Option A | Keep ba-left-col (entire left column with all features) in all remaining modes | ✓ |
| Option B | Keep ba-left-col but conditionally hide certain buttons in some modes | |
| Option C | Remove ba-left-col (original misunderstanding) | ✗ (REJECTED) |

**User's choice:** Option A — Keep the left column fully functional. Scope issue was placement mode, not the column itself.

### Area 3: CSS Cleanup (Corrected)

| Option | Description | Selected |
|--------|-------------|----------|
| Option A | Remove only left-dock-specific CSS (~20-50 lines), keep all ba-left-col rules | ✓ |
| Option B | Full CSS cleanup (original misunderstanding: ~100-150 lines) | ✗ (REJECTED) |
| Option C | Comment out left-dock CSS instead of deleting | |

**User's choice:** Option A — Remove only the CSS rules specific to left-dock mode. Keep ba-left-col styling for all other modes.

### Area 4: Test Updates (Corrected)

| Option | Description | Selected |
|--------|-------------|----------|
| Option A | Remove/skip e2e tests that verify left-dock placement mode | ✓ |
| Option B | Keep all tests as-is | |

**User's choice:** Option A — Remove test cases that specifically test left-dock behavior. Keep tests for other modes.

---

## Summary of Correction

**What was wrong:** Agent misunderstood "remove left agent" as "remove agent's left column" rather than "remove left-dock placement mode".

**Impact:** First CONTEXT.md and DISCUSSION-LOG.md were created with wrong scope. User then caught the error post-commit and clarified actual intent.

**What changed:**
- Remove left-dock placement → NOT remove ba-left-col
- Keep action buttons, suggestions, all functionality → NOT drop them
- Delete 20-50 lines of left-dock CSS → NOT delete 100-150 lines of ba-left-col CSS
- Update placement mode config → NOT restructure entire agent component

**Files to modify (corrected):**
1. `AgentUiModeContext.js` — Remove 'left-dock' from valid placements
2. `BankingAgent.css` — Remove left-dock-specific rules only
3. `BankingAgent.js` — Remove left-dock-specific rendering logic (if any)
4. e2e tests — Remove left-dock test cases

---

## Deferred Ideas

None — scope is now narrow and focused on placement mode removal only.

---

*Context corrected: April 14, 2026*
