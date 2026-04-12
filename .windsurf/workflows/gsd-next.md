---
description: GSD Next - Continue with next development phase or task
---

# GSD Next Workflow

## Purpose
Continue with the next logical development phase or task based on current project state and todo priorities.

## When to Use
- When you've completed a phase and need to move to the next one
- When you need to identify the next high-priority task
- When you want to progress through the planned roadmap
- When you need to match todos to the current development phase

## Steps

### 1. Current State Assessment
// turbo
Run todo phase matching to identify current priorities:
```bash
node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" todo match-phase "52" 2>&1 | python3 -c "import json,sys; d=json.load(sys.stdin); [print(f\"{m['score']:.1f} [{m['area']}] {m['title']}\") for m in sorted(d['matches'], key=lambda x: -x['score'])]"
```

### 2. Review Project State
Check `.planning/STATE.md` to understand current project status and recent progress.

### 3. Identify Next Phase
Based on the todo matches and project state, determine whether to:
- Execute a quick fix (`/gsd-quick`)
- Debug an issue (`/gsd-debug`) 
- Execute a planned phase (`/gsd-execute-phase`)

### 4. Execute Selected Workflow
Choose and run the appropriate GSD command based on the assessment.

### 5. Update Planning
After completion, update relevant planning documents and move todos between directories as needed.

## Expected Outcome
- Clear identification of next development priority
- Execution of appropriate GSD workflow
- Progress toward project milestones
- Updated planning artifacts

## Notes
- This workflow integrates with the GSD rules in `.cursor/rules/gsd-*.mdc`
- Auto-approval is enabled for the phase matching command
- Always check `REGRESSION_PLAN.md` before making changes to protected areas