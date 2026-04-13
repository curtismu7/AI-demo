---
phase: 143
slug: ux-agent-banking-actions-via-mcp-server
status: approved
shadcn_initialized: false
preset: none
created: 2026-04-13
---

# Phase 143 — UI Design Contract

> Retrospective visual and interaction contract for agent banking UX: Agent Activity tab, 🤖 badge, HITL approval modal, dual-layer error display, and real-time progress chips.

---

## Design System

| Property | Value |
|----------|-------|
| Tool | none |
| Preset | not applicable |
| Component library | none |
| Icon library | Unicode emoji (🤖 agent badge, ✓/🔄 progress) |
| Font | system-ui, -apple-system, sans-serif |

---

## Spacing Scale

Declared values (must be multiples of 4):

| Token | Value | Usage |
|-------|-------|-------|
| xs | 4px | Badge padding, chip gaps |
| sm | 8px | Compact element spacing |
| md | 16px | Default element spacing |
| lg | 24px | Section padding |
| xl | 32px | Layout gaps |
| 2xl | 48px | Major section breaks |
| 3xl | 64px | Page-level spacing |

Exceptions: Tab button padding uses 8px 16px (off-scale; matches compact tab pattern).

---

## Typography

| Role | Size | Weight | Line Height |
|------|------|--------|-------------|
| Body | 14px (0.875rem) | 400 | 1.5 |
| Label | 14px (0.875rem) | 500 | 1.4 |
| Tab label | 14px (0.875rem) | 500 | 1 |
| Badge | 12px (0.75rem) | 600 | 1 |
| Modal heading | 16px (1rem) | 600 | 1.4 |
| Error technical | 12px (0.75rem) | 400 | 1.5 |

---

## Color

| Role | Value | Usage |
|------|-------|-------|
| Dominant (60%) | #ffffff | Page/card/modal backgrounds |
| Secondary (30%) | #004687 (--chase-navy) | Nav, headers |
| Agent accent | #3b69c2 | 🤖 Agent badge background, tab active text |
| Tab active | #1e40af | Active tab bottom border + text |
| Tab inactive | #6b7280 | Inactive tab text |
| Progress chip active | #dbeafe | Chip background during operation |
| Progress chip complete | #dcfce7 | Chip background on completion |
| Error user layer | #fef2f2 | User-facing error box background |
| Error technical layer | #f8fafc | Technical detail box background |
| Destructive | #b91c1c | Reject / error actions |

Agent accent (#3b69c2) reserved for: agent transaction badges and tab active states only.

---

## Agent Activity Tab

### Structure
```
[ All Transactions ] [ 🤖 Agent Activity ]
─────────────────────────────────────────
{transaction list}
```

- Both tabs always visible; no toggle to hide
- Active state: bottom border 2px solid #1e40af, text #1e40af, font-weight 600
- Inactive state: text #6b7280, cursor pointer, hover: text #374151
- Agent Activity tab filters to `clientType === 'ai_agent'` transactions only

### Transaction Badge
```
🤖 Agent
```
- Background: #3b69c2, Color: #ffffff
- Font: 12px, weight 600
- Padding: 2px 8px, border-radius: 4px
- Placement: inline in transaction row, after amount or in type column

---

## HITL Approval Modal

### Trigger
Transactions at or above configured threshold (e.g., ≥$500) require explicit user approval.

### Layout
```
┌─────────────────────────────────────┐
│  Agent Action Approval              │
│  ─────────────────────────────────  │
│  Amount: $500.00                    │
│  Destination: Savings Account       │
│  Description: [agent description]   │
│  Authorized by: [Agent Name]        │
│  Timestamp: [ISO]                   │
│  ─────────────────────────────────  │
│  [ Approve Agent Action ]  [Reject] │
└─────────────────────────────────────┘
```

- Modal backdrop: rgba(0,0,0,0.5)
- Approve button: blue gradient (#1e3a8a → #3b69c2)
- Reject button: outlined red, text #b91c1c
- Escape key / backdrop click: treated as Reject

---

## Progress Chips (in Agent Chat)

Sequential display during agent action:

| Step | Label | State chip |
|------|-------|------------|
| 1 | 🔄 Getting tokens... | active (#dbeafe) |
| 2 | 🔄 Exchanging... | active (#dbeafe) |
| 3 | 🔄 Calling agent... | active (#dbeafe) |
| 4 | ✓ Transfer complete | complete (#dcfce7) |

- Chip height: 24px, border-radius: 12px (pill)
- Font: 12px, weight 500
- Display inline/flex in chat message bubble

---

## Dual-Layer Error Display

```
┌─────────────────────────────────────────────────────┐
│  ⚠ Agent couldn't complete this transfer.           │
│  Check your token configuration or try manually.    │
│                                                     │
│  ▼ Technical detail                                 │
│  Token exchange error: insufficient_scope           │
│  Verify agent app has banking scope assigned.       │
│                                                     │
│  [ Retry ]  [ Cancel ]  [ Try Manually ]            │
│  → How to fix agent action errors                   │
└─────────────────────────────────────────────────────┘
```

- User layer: background #fef2f2, border-left 4px solid #b91c1c
- Technical layer: background #f8fafc, font-family monospace, 12px
- "Technical detail" is collapsible (disclosure)
- "How to fix" is an anchor link to troubleshooting docs

---

## Token Chain Display (ExchangeModeBanner)

| exchangeMethod | Label |
|----------------|-------|
| `subject-only` | 1-Exchange |
| `with-actor` | 2-Exchange Delegation |
| `2-exchange` | 2-Exchange Delegation |

- Banner placement: inside TokenChainDisplay panel, above token detail
- Background: #eff6ff, text: #1e40af, border: 1px solid #bfdbfe

---

## Copywriting Contract

| Element | Copy |
|---------|------|
| Tab: all | "All Transactions" |
| Tab: agent filter | "🤖 Agent Activity" |
| Transaction badge | "🤖 Agent" |
| HITL modal title | "Agent Action Approval" |
| HITL approve CTA | "Approve Agent Action" |
| HITL reject CTA | "Reject" |
| Progress: tokens | "🔄 Getting tokens..." |
| Progress: exchange | "🔄 Exchanging..." |
| Progress: calling | "🔄 Calling agent..." |
| Progress: done | "✓ Transfer complete" (verb matches action) |
| Error user message | "Agent couldn't complete this [action]. Check your token configuration or try manually." |
| Error retry | "Retry" |
| Error cancel | "Cancel" |
| Error fallback | "Try Manually" |
| Error help link | "How to fix agent action errors" |

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| None (CSS-only) | n/a | not required |

---

## Checker Sign-Off

- [x] Dimension 1 Copywriting: PASS — all labels explicit, action verbs present
- [x] Dimension 2 Visuals: PASS — tab/badge/modal patterns consistent with existing UI
- [x] Dimension 3 Color: PASS — agent blue (#3b69c2) distinct from standard red; consistent accent usage
- [x] Dimension 4 Typography: PASS — 14px body, 12px chip/badge, 16px modal heading
- [x] Dimension 5 Spacing: PASS — 4px grid maintained; tab padding consistent
- [x] Dimension 6 Registry Safety: PASS — no third-party registry

**Approval:** approved 2026-04-13 (retrospective)
