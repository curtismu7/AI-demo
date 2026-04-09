# Phase 112: Marketing & Dashboard UI Polish — Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-09
**Phase:** 112 — marketing-and-dashboard-ui-polish-ensure-consistent-light-and-dark-mode

---

## Q&A Log

### D-1: Scope of dark mode coverage

**Question:** Should we fix dark mode on everything (every admin page, every modal, every panel) or prioritize the most visible surfaces?

**Options presented:**
- A) Fix everything — systematic sweep of all ~40 pages that have gaps
- B) **Prioritize visible surfaces** — Dashboard + UserDashboard + Marketing + Config + 5 key admin pages; leave internal/debug pages for later ✅ SELECTED
- C) CSS-only fix — add bulk `html[data-theme='dark']` overrides in a single `dark-overrides.css` without touching JS files

**User selection:** B

---

### D-2: Dark mode on `/marketing` path

**Question:** Should `/marketing` stay pinned to white, or follow the user's theme preference?

**Options presented:**
- A) Keep pinned white — marketing is a "product showcase" surface; dark mode would fight the Chase-inspired design intent
- B) **Let marketing follow the theme** — users who prefer dark should get a consistent experience everywhere ✅ SELECTED
- C) Add dark mode CSS to marketing but only activate it when user explicitly opted into dark (not system default)

**User selection:** B

---

### D-3: Toggle placement on pages missing it

**Question:** How should users switch themes from pages that don't have a toggle?

**Options presented:**
- A) **Global header toggle only** — one theme toggle in the app shell header/nav that works everywhere ✅ SELECTED
- B) Keep per-page toggles + add to header — each page decides whether to show its own toggle, header always has one as fallback
- C) Already decided — LandingPage and Dashboard toggles are enough

**User selection:** A

---

### D-4: Polish scope beyond dark mode

**Question:** What other polish work is in scope alongside dark mode?

**Options presented:**
- A) Dark mode only — "polish" just means the dark mode looks polished
- B) **Dark mode + spacing/typography inconsistencies** — fix obvious padding/font-size breakages discovered during dark mode sweep ✅ SELECTED
- C) Dark mode + Chase.com UI redesign todos — but Phase 113 owns that

**User selection:** B

---

## Summary of Decisions

| # | Area | Decision |
|---|------|----------|
| D-1 | Coverage scope | Prioritize visible surfaces (Dashboard, UserDashboard, Marketing, SideNav, Accounts, Transactions, Users, AuditPage, FeatureFlagsPage) |
| D-2 | Marketing dark mode | Let marketing follow theme — remove App--marketing-page white override from App.css |
| D-3 | Toggle placement | Global header toggle in SideNav; keep existing LandingPage + UserDashboard toggles |
| D-4 | Polish scope | Dark mode + fix any hardcoded color/spacing breakages found on priority pages |
