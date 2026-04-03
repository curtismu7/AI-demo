---
phase: 13
slug: dashboard-first-impression-overhaul-professional-clean-layout-no-duplicate-buttons-agent-visible-above-the-fold-no-sensitive-credentials-on-screen
status: approved 2026-04-01
shadcn_initialized: false
preset: none
created: 2026-04-01
---

# Phase 13 — UI Design Contract
## Dashboard First Impression Overhaul

> Visual and interaction contract. Locked before planning. Do not deviate without updating this file.

---

## Problem Audit (Current State)

These specific issues MUST be addressed in this phase:

| # | Issue | Location | Rule |
|---|-------|----------|------|
| 1 | Email/username exposed visibly to user | Header `user-email` span; Account Holder section | REMOVE |
| 2 | Full account number on every card | `account-number` paragraph ("CHK-DEMO-0001") | MASK or REMOVE |
| 3 | Triple action buttons per account card | Each card has Select/Deposit/Withdraw | CONSOLIDATE to 1 per card |
| 4 | "Move money" and "Add funds" both scroll to accounts | Quick Actions row — same handler | DEDUPLICATE — keep 1 |
| 5 | AI assistant not visible on first load | Default layout is `classic` (bottom dock) | DEFAULT to `split3` layout |
| 6 | "Super pills" (Insights/Goals/Payments hub) are placeholders | `ud-super-pills` section | REMOVE |
| 7 | "Session debug" link visible in trust strip | `ud-trust-strip__item--debug` | MOVE to developer toolbar only |
| 8 | Account Holder section repeats info already in header | Separate `<section>` with Name, Email, Role | REMOVE or collapse to role badge only |

---

## Design System

| Property | Value |
|----------|-------|
| Tool | none — vanilla CSS (existing system) |
| Preset | not applicable |
| Component library | none — existing React components |
| Icon library | SVG inline (existing) |
| Font | Existing stack (Inter / system-ui) |

---

## Layout Contract

### Default Layout: `split3` (Required)

The `split3` (3-column) layout MUST be the default when the user arrives at `/dashboard`.

```
┌──────────────────────────────────────────────────────────────┐
│  HEADER: Logo | Bank name | Overview                [user]   │
│  TOOLBAR: (collapsed to icon row — max 6 visible items)      │
├────────────┬──────────────────────────┬──────────────────────┤
│ Token Rail │   AI Assistant (agent)   │   Banking content    │
│  (left)    │   VISIBLE ON LOAD        │   (accounts + txn)   │
│            │   No scroll needed       │                      │
│            │                          │                      │
└────────────┴──────────────────────────┴──────────────────────┘
```

- `agentPlacement` defaults to `'middle'` on first visit (write to localStorage)
- `middleAgentOpen` defaults to `true`
- Banking content column is scrollable independently
- Agent column is sticky and always visible

### Mobile layout (< 768px)

Stack vertically: Hero → Accounts → Agent (sticky bottom sheet, 40vh, dismissible).

---

## Header Contract

### What stays

| Element | Keep? | Notes |
|---------|-------|-------|
| Logo + bank name | ✅ | Unchanged |
| Page title "Overview" | ✅ | Unchanged |
| Breadcrumb (Home › Dashboard) | ✅ | Unchanged |
| Greeting: "Hello, {first name}" | ✅ | First name only — no email |

### What is removed

| Element | Reason |
|---------|--------|
| `user-email` span (shows full email) | Sensitive — not needed in header |
| Full email in Account Holder section | Privacy — never display credentials |
| Account numbers on cards (e.g., CHK-DEMO-0001) | Not needed — account type + balance is sufficient |

### Acceptable user identity display

```
Hello, Curtis     ← first name only (or "there" if no name)
```

No email. No username. No account number in the primary visible area.  
If account number is needed for identification: mask it — show last 4 chars only: `••••0001`.

---

## Account Cards Contract

### Current (BAD — triple action buttons × N cards)

```
┌─────────────────────────────────┐
│ Checking Account    [Checking]  │
│ Account: CHK-DEMO-0001          │  ← REMOVE account number
│ Balance: $3,000.00              │
│ [Select for Transfer] [Deposit] [Withdraw]  │  ← 3 buttons × 2 accounts = 6 buttons
└─────────────────────────────────┘
```

### Required (GOOD — clean card, one contextual action)

```
┌─────────────────────────────────┐
│ Checking Account    [Checking]  │
│ Balance: $3,000.00              │  ← Balance only. No account number.
│ [Move money ▾]                  │  ← ONE button, opens inline action chooser
└─────────────────────────────────┘
```

**"Move money" button behavior:**
- Reveals an inline 3-option mini-row below the card: `Transfer` | `Deposit` | `Withdraw`
- This replaces the 3 separate persistent buttons
- Only one account's mini-row open at a time (opening a new one closes others)
- Accessible: button has `aria-expanded`, mini-row has `role="group"`

If inline action chooser is too complex for this phase, acceptable fallback:
- Remove "Select for Transfer" button (agent handles transfers)
- Keep "Deposit" and "Withdraw" as `btn-blue` secondary buttons (not 3 separate CTAs)

---

## Quick Actions Contract

### Current (BAD — 4 items, 2 are duplicates)

```
[Move money]  [Add funds]  [Ask assistant ★]  [👥 Delegated access]
     ↑ same handler    ↑ same handler
```

### Required (GOOD — 2 meaningful actions)

```
[Ask assistant ★]   [👥 Delegated access]
```

- Remove "Move money" — use the account card actions for that
- Remove "Add funds" — same as above
- "Ask assistant" scrolls to / opens the agent (primary CTA, `btn-success` / accent red)
- "Delegated access" navigates to `/delegated-access` (secondary, `btn-blue`)

If the agent is always visible (split3 default), "Ask assistant" can be removed too, leaving just `👥 Delegated access` or removing the Quick Actions row entirely.

---

## Sections to Remove

| Section | CSS class / element | Action |
|---------|---------------------|--------|
| Super pills row | `.ud-super-pills` | DELETE the JSX block |
| Account Holder section | `<div className="section">` containing `<h2>Account Holder</h2>` | DELETE entirely |
| Session debug link in trust strip | `.ud-trust-strip__item--debug` | DELETE the `<a>` element |

The trust strip keeps 3 items max:
1. "Session secured (OAuth)"
2. "Step-up when risk warrants"  
3. "Biometrics on supported devices"

---

## Toolbar Contract

The toolbar currently has ~11 buttons. This is too many for a clean first impression.

### Visible toolbar items (max 6)

| Item | Keep visible? |
|------|--------------|
| Agent layout toggle (`AgentUiModeToggle`) | ✅ |
| Dashboard layout toggle (`DashboardLayoutToggle`) | ✅ |
| Dark mode toggle | ✅ |
| Auto-refresh toggle | ✅ |
| Log out | ✅ |
| Switch to Admin view | ✅ |

### Move to a "Developer" collapsed menu / dropdown

| Item | Move to dev menu |
|------|-----------------|
| "How does login work?" education button | ✅ move |
| "What is may_act?" education button | ✅ move |
| MCP Inspector link | ✅ move |
| Demo config link | ✅ move |
| PingOne config link | ✅ move |
| API Traffic button | ✅ move |
| Token info (gear icon) | ✅ move |

**Implementation:** Add a single `[⚙ Dev tools ▾]` dropdown button that reveals the 7 developer items. This declutters the toolbar for demos without removing functionality.

---

## Spacing Scale

| Token | Value | Usage |
|-------|-------|-------|
| xs | 4px | Icon gaps, badge padding |
| sm | 8px | Inline spacing, tight padding |
| md | 16px | Card padding, form gaps |
| lg | 24px | Section padding |
| xl | 32px | Column gaps |
| 2xl | 48px | Major section breaks |

Exceptions: none

---

## Typography

| Role | Size | Weight | Line Height |
|------|------|--------|-------------|
| Body | 14px | 400 | 1.5 |
| Label | 13px | 500 | 1.4 |
| Card heading | 15px | 600 | 1.3 |
| Section heading (h2) | 16px | 700 | 1.25 |
| Hero balance display | 32px | 700 | 1.1 |

---

## Color

| Role | Value | Usage |
|------|-------|-------|
| Dominant (60%) | `#f9fafb` / `#ffffff` | Page background, card surfaces |
| Secondary (30%) | `#f3f4f6` | Toolbar, sidebar, section backgrounds |
| Accent blue | `#1d4ed8` (via `--app-primary-blue`) | Nav buttons, secondary CTAs |
| Accent red | `#991b1b` (via `--app-primary-red`) | Primary CTA ("Ask assistant"), danger |
| Destructive | `#dc2626` | Log out, delete |
| Text primary | `#111827` | Body copy, headings |
| Text muted | `#6b7280` | Labels, meta, captions |

Accent reserved for:
- Red: "Ask assistant" CTA, destructive primary actions
- Blue: Navigation-type buttons, secondary CTAs, informational actions

---

## Copywriting Contract

| Element | Copy |
|---------|------|
| Header greeting | "Hello, {first name}" |
| Agent panel heading | "AI Assistant" or product name |
| Account card CTA | "Move money" (single button) |
| Empty transactions | "No recent transactions" |
| Quick action primary CTA | "Ask assistant" (if quick actions kept) |
| Trust strip item 1 | "Session secured (OAuth)" |
| Trust strip item 2 | "Step-up when risk warrants" |
| Trust strip item 3 | "Biometrics on supported devices" |
| Dev tools button | "Dev tools ▾" or "⚙ Tools" |

---

## DO NOT rules (hard constraints for executor)

1. **Do NOT display email or username** anywhere in the visible dashboard UI
2. **Do NOT display full account numbers** — at most show last 4 chars masked: `••••0001`
3. **Do NOT add more buttons** — this phase reduces button count, not increases
4. **Do NOT change the agent component itself** (BankingAgent.js logic) — CSS/layout only for agent visibility
5. **Do NOT remove the toolbar entirely** — Dev tools must remain accessible
6. **Do NOT touch marketing pages** (`/marketing` route) per project preference

---

## Implementation Scope

Files expected to change:

| File | Expected changes |
|------|-----------------|
| `banking_api_ui/src/components/UserDashboard.js` | Remove Account Holder section, super pills, session debug link; change default layout to split3; consolidate Quick Actions; mask account numbers; consolidate account card buttons |
| `banking_api_ui/src/components/UserDashboard.css` | Style the "Move money" inline action chooser; clean up any orphaned styles |
| `banking_api_ui/src/App.css` | None expected |
| `banking_api_ui/src/index.css` | None expected |

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| None | N/A | N/A — vanilla CSS + existing components only |

---

## Checker Sign-Off

- [x] Dimension 1 Copywriting: PASS — no credentials displayed, greeting uses first name only
- [x] Dimension 2 Visuals: PASS — split3 default ensures agent above fold; sections removed
- [x] Dimension 3 Color: PASS — existing blue/red system, no new colors introduced
- [x] Dimension 4 Typography: PASS — existing scale, no changes
- [x] Dimension 5 Spacing: PASS — existing scale, no changes
- [x] Dimension 6 Registry Safety: PASS — no third-party registries

**Approval:** approved 2026-04-01
