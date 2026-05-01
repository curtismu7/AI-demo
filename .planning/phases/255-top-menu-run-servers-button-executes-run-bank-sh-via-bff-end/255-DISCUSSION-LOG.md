# Phase 255: Top-menu Run Servers button — Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-30
**Phase:** 255 — top-menu-run-servers-button-executes-run-bank-sh-via-bff-end
**Areas discussed:** Button placement & guard, BFF execution model, Modal output & UX, Security boundary

---

## Button placement & guard

| Option | Description | Selected |
|--------|-------------|----------|
| A) Admin-only, right side of TopNav | Visible only when `user?.role === 'admin'` | |
| B) Admin-only + env guard | Same as A but hidden on non-local hostnames | |
| C) Any logged-in user, right side | Any authenticated user can trigger it | ✓ |

**User's choice:** C — any logged-in user, right side of TopNav  
**Notes:** No environment/hostname guard on the UI side

---

## BFF execution model

| Option | Description | Selected |
|--------|-------------|----------|
| A) Always `./run-bank.sh restart` | Kill-then-start every time, predictable | ✓ |
| B) `./run-bank.sh start` | No-op if already running | |
| C) Status check first, then decide | Smarter but more complex | |

**Concurrent run handling:**

| Option | Description | Selected |
|--------|-------------|----------|
| i) Block with 409 | Return 409, modal shows "Already starting, please wait" | ✓ |
| ii) Kill and restart | Always replaces in-progress run | |

**User's choice:** Always restart; 409 block if already in progress

---

## Modal output & UX

| Option | Description | Selected |
|--------|-------------|----------|
| A) Live scrolling terminal log | Raw stdout/stderr, monospace, auto-scroll | |
| B) Structured status cards | Parse output, render per-service cards | |
| C) Both — cards + raw log | Status cards at top, scrollable raw log below | ✓ |

**Close behavior:**

| Option | Description | Selected |
|--------|-------------|----------|
| i) Auto-dismiss after 3s if healthy | Closes itself on success | |
| ii) Stay open, Close button | User decides when to dismiss | |
| iii) Auto-dismiss on success; stay open on error | Smart default | ✓ |

**User's choice:** C display + iii close behavior

---

## Security boundary

| Option | Description | Selected |
|--------|-------------|----------|
| A) `requireSession` — any logged-in user | Matches button visibility decision | ✓ |
| B) `requireAdmin` — admin only | Stricter than UI visibility | |

**Rate limit:** 3 requests per minute per session  
**Production guard:** Refuse (HTTP 403) if `NODE_ENV=production` or `VERCEL=1`

**User's choice:** A (requireSession); rate limited; production guard active

---

## Claude's Discretion

- SSE event shape (follow setupWizard.js convention)
- Status card parsing heuristic (port strings + emoji keywords)
- Modal CSS class strategy (extend DemoServerCheckModal patterns)
- Module-level singleton for in-progress guard (not Redis)
