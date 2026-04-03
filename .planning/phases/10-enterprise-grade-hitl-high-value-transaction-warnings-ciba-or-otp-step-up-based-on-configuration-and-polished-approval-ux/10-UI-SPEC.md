---
phase: 10
slug: enterprise-grade-hitl-high-value-transaction-warnings-ciba-or-otp-step-up-based-on-configuration-and-polished-approval-ux
status: draft
shadcn_initialized: false
preset: none
created: 2026-04-01
---

# Phase 10 — UI Design Contract: Agent Surface Consistency + Enterprise HITL

> Visual and interaction contract for all three AI agent surfaces and the enterprise HITL approval flow.

---

## Scope

This spec covers **three agent surfaces** that each render `BankingAgent` in a different container:

| Surface | Component | Placement | Primary Route(s) |
|---------|-----------|-----------|-----------------|
| **Floating FAB** | `BankingAgent` (distinctFloatingChrome) | Fixed bottom-right | All authenticated routes (when placement ≠ bottom/middle) |
| **Middle (inline)** | `BankingAgent` (mode="inline") | Full-width panel within UserDashboard split layout | `/dashboard` with `placement=middle` |
| **Bottom dock** | `EmbeddedAgentDock → BankingAgent` | Collapsible, resizable strip pinned to bottom of viewport | `/`, `/dashboard`, marketing routes |

All three must **feel like one product** — same toolbar anatomy, same action button shapes, same HITL confirmation pattern — while respecting each surface's spatial constraints.

---

## Design System

| Property | Value |
|----------|-------|
| Tool | none (custom CSS, existing BankingAgent.css) |
| Preset | not applicable |
| Component library | none (vanilla React) |
| Icon library | React-Icons (already imported) |
| Font | System UI (inherits app font stack) |

---

## Spacing Scale

| Token | Value | Usage |
|-------|-------|-------|
| xs | 4px | Icon gaps, chip padding |
| sm | 8px | Toolbar item gaps, input padding |
| md | 16px | Panel inner padding, section gaps |
| lg | 24px | Modal padding |
| xl | 32px | Section breaks |

Exceptions: Bottom dock drag handle = 6px tall bar (not a 4px multiple — keep for haptic feel).

---

## Typography

| Role | Size | Weight | Line Height |
|------|------|--------|-------------|
| Chat body | 14px | 400 | 1.5 |
| Agent label / toolbar | 13px | 600 | 1.4 |
| Button / CTA | 14px | 500 | 1 |
| Modal heading | 18px | 700 | 1.3 |
| Warning banner | 13px | 500 | 1.4 |

---

## Color

| Role | Value | Usage |
|------|-------|-------|
| Agent primary (60%) | `#4169E1` (royal blue) | FAB, send button, selected state |
| Surface (30%) | `#f8f9fc` (light) / `#1e2332` (dark) | Panel background, dock background |
| Accent (10%) | `#E14141` (red) | High-value warning banner, destructive HITL reject |
| Warning amber | `#f59e0b` | ≥$500 transaction warning icon |
| Success green | `#22c55e` | Confirm approved, transaction complete |
| Destructive | `#dc2626` | Reject button (HITL), error state |

Accent (`#E14141`) reserved for: high-value transaction warnings, HITL reject button.

---

## Surface-Specific Constraints

### 1. Floating FAB (fixed bottom-right)

- **Size:** 52px height pill button, 26px border-radius — already established, do not change.
- **Panel:** `max-height: min(620px, 90vh)`, `width: min(380px, calc(100vw - 56px))`.
- **Toolbar anatomy:** Collapse chevron · Title ("BX AI Agent") · minimize (×). Action buttons as horizontal chips inside the chat input area.
- **HITL confirmation:** Modal overlay portaled to `document.body`; centered, max-width 400px, `z-index: 100070`.
- **High-value warning:** Red banner inside the panel above the confirm button — does NOT use a separate modal.

### 2. Middle / Inline (split layout)

- **Width:** Fills the right column of the 3-column dashboard grid (approx 380–420px).
- **Height:** Fills 100% of the split pane; no fixed height capping.
- **Toolbar:** Same anatomy as float except no minimize button (the layout toggle handles that).
- **Action buttons:** Full-width stacked rows (not chips) — more space available.
- **HITL confirmation:** Inline confirmation card within the chat stream (no modal — avoids covering the account tiles on the left).
- **High-value warning:** Inline warning card in the chat stream with amber left-border.

### 3. Bottom Dock (collapsible strip)

- **Height:** User-resizable `200–85vh`, default 320px. Stored in `localStorage`.
- **Collapsed state:** 44px header bar showing title + expand chevron. No chat visible.
- **Width:** Full content width (not fixed, inherits `.global-embedded-agent-dock-wrap`).
- **Toolbar:** Collapse / expand chevron · Title · Action area (chips or small buttons).
- **Chat input:** Must always be visible without scrolling when dock height ≥ 320px.
- **HITL confirmation:** Inline in chat stream (same as middle) — no modal since dock height may be short.
- **High-value warning:** Same inline warning card; amber left-border strip.

---

## Shared Interaction Contracts (all 3 surfaces)

### Action Button Chips

- Shape: `border-radius: 20px` pill; `height: 32px`; `padding: 0 14px`.
- States: default `background: var(--chip-bg, #e8edff); color: #4169e1;` · hover +10% brightness · active scale(0.97) · disabled opacity 0.45.
- Icon + label layout: 16px icon · 6px gap · 13px label.
- Touch target: minimum 44px tappable area (add padding-y if needed).

### HITL Confirmation Card (inline variant)

```
┌──────────────────────────────────────┐
│ 🔒 Confirm Action                    │
│  Transfer $250 → Savings             │
│  [Warning: high-value] (if ≥ $500)   │
│                                      │
│  [Cancel]          [Confirm ✓]       │
└──────────────────────────────────────┘
```

- Border: `1px solid #4169e1`; `border-radius: 12px`; padding: `md (16px)`.
- "Confirm" button: `background: #4169e1`; `color: #fff`; `border-radius: 8px`.
- "Cancel" button: text-only, `color: #6b7280`.
- High-value overlay: amber left-border `4px solid #f59e0b` on the card + warning icon + copy "⚠ High-value transaction — verify before confirming".

### High-Value Warning (≥ $500)

- Threshold: `$500` (configurable via `STEP_UP_AMOUNT_THRESHOLD` env — already in `.env`).
- Visual: amber left-border card **inside** the confirmation card, not a separate modal.
- Copy: `"⚠ This transaction exceeds $500. Please verify the details carefully."`
- Behavior: does NOT block confirm button — it is informational (CIBA/OTP step-up is a separate Phase 09/10 concern).

### Toolbar Anatomy (all surfaces uniform)

```
[ ≡ collapse ] [ BX AI Agent ]          [ ✕ or – ]
```

- Left: collapse/expand toggle (chevron up/down).
- Center: "BX AI Agent" label — 13px 600 weight.
- Right: minimize/close appropriate to surface.
- Height: 44px (`--stack-fab-height` already set).
- Border-bottom: `1px solid rgba(0,0,0,0.08)`.

---

## Copywriting Contract

| Element | Copy |
|---------|------|
| FAB label | "BX AI Agent" |
| Panel title | "BX AI Agent" |
| Input placeholder | "Ask me anything about your accounts…" |
| Send button | "Send" (icon only on small surfaces) |
| Collapse tooltip | "Collapse agent" |
| Expand tooltip | "Open agent" |
| HITL confirm heading | "Confirm Action" |
| HITL confirm body | "{action} {amount} {account}" |
| HITL high-value warning | "⚠ This transaction exceeds $500. Please verify before confirming." |
| HITL confirm button | "Confirm" |
| HITL cancel button | "Cancel" |
| Empty chat | "Hi {name}! I can help with deposits, withdrawals, transfers, and account questions." |
| Error state | "Something went wrong. Try again or refresh the page." |

---

## Consistency Checklist (implementation gate)

Before marking any surface task complete:

- [ ] Toolbar height = 44px on all 3 surfaces
- [ ] Action button chips: same pill shape, same `#4169e1` accent
- [ ] HITL card uses inline (not modal) on middle + bottom; modal only on FAB
- [ ] High-value warning: amber left-border, threshold ≥ $500
- [ ] Collapsed dock: 44px bar, no content visible
- [ ] Touch targets ≥ 44px on all interactive elements
- [ ] Dark mode: all surfaces respect `html[data-theme='dark']`
- [ ] No z-index collisions between FAB panel (`100059`) and inline surfaces

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| None (custom CSS) | — | not required |

---

## Checker Sign-Off

- [ ] Dimension 1 Copywriting: PASS
- [ ] Dimension 2 Visuals: PASS
- [ ] Dimension 3 Color: PASS
- [ ] Dimension 4 Typography: PASS
- [ ] Dimension 5 Spacing: PASS
- [ ] Dimension 6 Registry Safety: PASS

**Approval:** pending
