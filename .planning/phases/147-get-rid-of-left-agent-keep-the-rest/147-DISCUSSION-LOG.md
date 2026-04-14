# Phase 147: Get rid of left agent. Keep the rest — Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** April 14, 2026  
**Phase:** 147 — Get rid of left agent. Keep the rest  
**Areas discussed:** Removal scope, Relocated functionality, Suggestion chips, CSS cleanup

---

## Area 1: Removal Scope

| Option | Description | Selected |
|--------|-------------|----------|
| Option A | Remove `ba-left-col` from ALL modes (inline, float, bottom-dock, left-dock, side-dock) | |
| Option B | Remove `ba-left-col` from only inline mode (`/agent` route) | |
| Option C | Make removal conditional (feature flag or prop) | |

**User clarification:** "We have middle and right those work fine. But left is always covered up by the buttons, so want to remove it."

**Refined Question:** Remove left-dock placement entirely (Option A was misunderstood as "remove left-dock"), or remove the left column from within the agent?

**User's choice:** "Option A — Remove left dock" → After clarification: "No wait, do not remove left dock. Remove left agent. Keep the buttons (dock)."

**Final decision:** Remove `ba-left-col` (the agent's internal left column) while **keeping left-dock placement** (the sidebar itself). All modes affected.

---

## Area 2: Relocated Functionality

| Option | Description | Selected |
|--------|-------------|----------|
| Option A | Move buttons to the chat header (toolbar above messages) | |
| Option B | Move buttons to the input area | |
| Option C | Move buttons to a dropdown menu (hamburger icon) | |
| Option D | Drop buttons entirely; rely on main app nav | |

**User's choice:** After clarification that left-dock removal was a misunderstanding, user deferred to "the agent's Discretion" — buttons (login, logout, refresh) are dropped entirely. Users rely on primary navbar and BFF session management.

---

## Area 3: Suggestion Chips

| Option | Description | Selected |
|--------|-------------|----------|
| Option A | Move suggestions above the text input as a quick-pick row | ✓ |
| Option B | Move to "Start with" section in welcome message | |
| Option C | Drop suggestions entirely | |

**User's choice:** Option A — Move suggestion chips above the text input box.

---

## Area 4: CSS Cleanup

| Option | Description | Selected |
|--------|-------------|----------|
| Option A | Full cleanup — delete all `ba-left-col` CSS rules (~100-150 lines) | ✓ |
| Option B | Comment out CSS instead of deleting | |
| Option C | Hide with `display: none` | |

**User's choice:** Option A — Full CSS cleanup (delete dead code).

---

## the agent's Discretion

- **Handling of action button functions:** Once JSX removed, functions like `handleActionClick()`, `handleLoginAction()`, `handleSessionRefresh()` become dead code. Agent will decide whether to clean these up or leave them (low priority).
- **e2e test updates:** Tests referencing `.ba-left-col .ba-action-item` will fail. Agent will update or remove tests as needed.

---

## Deferred Ideas

None — scope remained focused on left-column removal and suggestion relocation.

