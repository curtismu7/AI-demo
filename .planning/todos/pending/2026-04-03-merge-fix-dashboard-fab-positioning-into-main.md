---
created: "2026-04-03T12:01:15.573Z"
title: "Merge fix/dashboard-fab-positioning into main"
area: "tooling"
files: []
---

## Problem

The active development branch `fix/dashboard-fab-positioning` is **514 commits ahead of `main`** and has never been merged. All feature work (Phases 1–33+) lives on this branch. `main` only has 2 unique commits (MCP server backports pushed manually for Render deploys).

This means:
- The branch name no longer reflects its purpose (it's the de-facto trunk)
- Render deploys require manual cherry-picks/backports to `main` each time MCP server changes
- Any PR visibility, GitHub Actions, or new contributor onboarding will be confusing

## Solution

Decide on one of:
1. **Merge or rebase `fix/dashboard-fab-positioning` → `main`** and make `main` the trunk going forward
2. **Rename** `fix/dashboard-fab-positioning` to something like `develop` or `main` and update Render to track that branch
3. **Keep as-is** if the split is intentional (e.g. `main` = Render stable, feature branch = Vercel)

Before merging: confirm Render's `render.yaml` / service config will still point to the right branch and there are no CI conflicts.
