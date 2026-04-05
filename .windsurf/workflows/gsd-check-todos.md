---
description: GSD Check Todos - List and manage pending todos
---

# GSD Check Todos Workflow

## Purpose
List all pending todos, allow selection, load full context for the selected todo, and route to appropriate action.

## When to Use
- When you want to see all pending todos
- When you need to select a specific todo to work on
- When you want to filter todos by area (api, ui, auth, etc.)
- When you need to manage todo backlog

## Steps

### 1. Initialize Todo Context
// turbo
Load todo context and check for pending todos:
```bash
node "$HOME/.copilot/get-shit-done/bin/gsd-tools.cjs" init todos
```

Extract from init JSON: `todo_count`, `todos`, `pending_dir`.

If `todo_count` is 0, inform the user that no pending todos exist and suggest using `/gsd-add-todo` to create new ones.

### 2. Parse Area Filter
Check for area filter in arguments:
- `/gsd-check-todos` → show all todos
- `/gsd-check-todos api` → filter to area:api only
- `/gsd-check-todos ui` → filter to area:ui only

### 3. List Pending Todos
Use the `todos` array from init context (already filtered by area if specified).

Parse and display as numbered list with:
- Title
- Area (api, ui, auth, database, testing, docs, planning, tooling, general)
- Relative time from created timestamp

Example format:
```
Pending Todos:

1. Add auth token refresh (api, 2d ago)
2. Fix modal z-index issue (ui, 1d ago)
3. Refactor database connection pool (database, 5h ago)

---

Reply with a number to view details, or:
- `/gsd-check-todos [area]` to filter by area
- `q` to exit
```

### 4. Handle User Selection
Wait for user to reply with a number.

If valid: load selected todo, proceed to context loading.
If invalid: "Invalid selection. Reply with a number (1-[N]) or `q` to exit."

### 5. Load Todo Context
Read the todo file completely. Display:

```
## [title]

**Area:** [area]
**Created:** [date] ([relative time] ago)
**Files:** [list or "None"]

### Problem
[problem section content]

### Solution
[solution section content]
```

If `files` field has entries, read and briefly summarize each file to provide context.

### 6. Check Roadmap Integration
Check for roadmap by examining `.planning/ROADMAP.md` if it exists:

1. Check if todo's area matches an upcoming phase
2. Check if todo's files overlap with a phase's scope
3. Note any match for action options

### 7. Offer Appropriate Actions
**If todo maps to a roadmap phase:**

Use AskUserQuestion:
- header: "Action"
- question: "This todo relates to Phase [N]: [name]. What would you like to do?"
- options:
  - "Work on it now" — move to done, start working
  - "Add to phase plan" — include when planning Phase [N]
  - "Brainstorm approach" — think through before deciding
  - "Put it back" — return to list

**If no roadmap match:**

Use AskUserQuestion:
- header: "Action"
- question: "What would you like to do with this todo?"
- options:
  - "Work on it now" — move to done, start working
  - "Create a phase" — /gsd-add-phase with this scope
  - "Brainstorm approach" — think through before deciding
  - "Put it back" — return to list

### 8. Execute Selected Action
**Work on it now:**
```bash
mv ".planning/todos/pending/[filename]" ".planning/todos/done/"
```
Update STATE.md todo count. Present problem/solution context. Begin work or ask how to proceed.

**Add to phase plan:**
Note todo reference in phase planning notes. Keep in pending. Return to list or exit.

**Create a phase:**
Display: `/gsd-add-phase [description from todo]`
Keep in pending. User runs command in fresh context.

**Brainstorm approach:**
Keep in pending. Start discussion about problem and approaches.

**Put it back:**
Return to list_todos step.

### 9. Update State
After any action that changes todo count:

Re-run `init todos` to get updated count, then update STATE.md "### Pending Todos" section if exists.

### 10. Git Commit
If todo was moved to done/, commit the change:

```bash
git rm --cached .planning/todos/pending/[filename] 2>/dev/null || true
node "$HOME/.copilot/get-shit-done/bin/gsd-tools.cjs" commit "docs: start work on todo - [title]" --files .planning/todos/done/[filename] .planning/STATE.md
```

Tool respects `commit_docs` config and gitignore automatically.

Confirm: "Committed: docs: start work on todo - [title]"

## Expected Outcome
- All pending todos listed with title, area, and age
- Area filter applied if specified
- Selected todo's full context loaded
- Roadmap context checked for phase match
- Appropriate actions offered and executed
- STATE.md updated if todo count changed
- Changes committed to git (if todo moved to done/)

## Notes
- This workflow integrates with the GSD rules in `.cursor/rules/gsd-*.mdc`
- Auto-approval is enabled for the init todos command
- Always check `REGRESSION_PLAN.md` before making changes to protected areas
- Todo files are stored in `.planning/todos/pending/` and `.planning/todos/done/`
- Todos are created with frontmatter containing created timestamp, title, area, and files/gsd-execute phase 