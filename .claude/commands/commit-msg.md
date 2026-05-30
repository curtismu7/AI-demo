---
description: Generate a conventional commit message from staged changes
allowed-tools: Bash(git diff --staged), Bash(git log --oneline -5)
---

Read the staged diff and the last 5 commits for context.

Generate a conventional commit message in the style this repo already uses (e.g. `fix(266): ...`, `docs(266): ...`, `discuss(267): ...`):

`<type>(<scope>): <short summary>`

- Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `perf`
- Scope is usually the phase number (e.g. `266`, `267`) — copy the style from recent commits
- Summary must be under 72 characters
- Use imperative mood ("add" not "added")
- If breaking change, append `!` after type/scope
- If the fix maps to a REGRESSION_PLAN.md §4 entry, mention the bug or phase
- Output only the commit message, nothing else
