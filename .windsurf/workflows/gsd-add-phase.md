---
description: GSD Add Phase - Add new development phase to roadmap
---

# GSD Add Phase Workflow

## Purpose
Add a new phase to the development roadmap when identified work doesn't fit into existing phases.

## When to Use
- When you discover a new area of work that needs its own phase
- When existing phases are too broad and need subdivision
- When you want to create a focused workstream for specific functionality

## Steps

### 1. Initialize Context
// turbo
Load project context:
```bash
node "$HOME/.copilot/get-shit-done/bin/gsd-tools.cjs" init roadmap
```

Extract from init JSON: `roadmap_exists`, `phases`, `current_phase`.

### 2. Gather Phase Information
Collect the following information:
- **Phase name**: Clear, descriptive title
- **Description**: What this phase will accomplish
- **Dependencies**: Which phases must complete first
- **Estimated duration**: Time estimate for completion
- **Deliverables**: Expected outcomes and artifacts

### 3. Determine Phase Number
Calculate appropriate phase number based on:
- Current highest phase number
- Dependencies and sequencing
- Logical progression from previous phases

### 4. Create Phase File
Create new phase file in `.planning/phases/`:

```markdown
# Phase [number]: [name]

## Description
[Detailed description of phase objectives]

## Dependencies
- Phase [number]: [phase name]
- [Additional dependencies]

## Deliverables
- [Deliverable 1]
- [Deliverable 2]

## Estimated Duration
[Time estimate]

## Success Criteria
- [Criteria 1]
- [Criteria 2]
```

### 5. Update Roadmap
Update `.planning/ROADMAP.md` to include new phase:
- Add phase to sequential list
- Update dependency graph
- Note insertion point

### 6. Update State
Update `.planning/STATE.md`:
- Add phase to "Upcoming Phases" section
- Update current phase if needed

### 7. Git Commit
```bash
node "$HOME/.copilot/get-shit-done/bin/gsd-tools.cjs" commit "docs: add Phase [number] - [name]" --files .planning/phases/[phase-file].md .planning/ROADMAP.md .planning/STATE.md
```

## Expected Outcome
- New phase file created with complete specification
- Roadmap updated with new phase
- Dependencies properly documented
- State updated to reflect new phase
- Changes committed to git

## Notes
- Always check for existing phases that might cover the same scope
- Consider if work fits into existing phase before creating new one
- Use clear, descriptive names for phases
- Document dependencies explicitly to prevent sequencing issues
