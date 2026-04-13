---
phase: 142
slug: ux-clear-separation-of-banking-action-buttons
status: approved
shadcn_initialized: false
preset: none
created: 2026-04-13
---

# Phase 142 — UI Design Contract

> Retrospective visual and interaction contract for button category separation: standard authz (striped red) vs agent (solid blue gradient).

---

## Design System

| Property | Value |
|----------|-------|
| Tool | none |
| Preset | not applicable |
| Component library | none |
| Icon library | Unicode emoji (U+2728 ✨ for agent prefix) |
| Font | system-ui, -apple-system, sans-serif |

---

## Spacing Scale

Declared values (must be multiples of 4):

| Token | Value | Usage |
|-------|-------|-------|
| xs | 4px | Icon gaps, inline padding |
| sm | 8px | Compact element spacing |
| md | 16px | Default element spacing |
| lg | 24px | Section padding |
| xl | 32px | Layout gaps |
| 2xl | 48px | Major section breaks |
| 3xl | 64px | Page-level spacing |

Exceptions: Button padding is 12px 20px (not on scale; inherited from existing baseline).

---

## Typography

| Role | Size | Weight | Line Height |
|------|------|--------|-------------|
| Body | 14px (0.875rem) | 400 | 1.5 |
| Label | 14px (0.875rem) | 500 | 1.4 |
| Button | 14px (0.875rem) | 500 | 1 |
| Heading | 18px | 600 | 1.4 |

---

## Color

| Role | Value | Usage |
|------|-------|-------|
| Dominant (60%) | #ffffff | Page/card backgrounds |
| Secondary (30%) | #004687 (--chase-navy) | Nav, headers, primary UI chrome |
| Standard action | #b91c1c → #dc2626 gradient | Transfer / Deposit / Withdraw buttons |
| Standard action border | #7f1d1d | Standard button border |
| Agent action | #1e3a8a → #3b69c2 gradient | Agent action buttons (Phase 143+) |
| Agent active / accent | #1e40af | Tab active state, agent badge |
| Agent badge text/bg | #3b69c2 | 🤖 Agent transaction badge |
| Destructive | #b91c1c | Standard banking actions (intentional overlap) |
| Disabled | opacity 50% + grayscale() filter | Auth-pending button state |

Accent reserved for: agent-category elements (tabs, badges, agent buttons) only — never for standard form controls or general interactive elements.

---

## Button Category Specification

### Standard Banking Buttons (Transfer, Deposit, Withdraw)

```css
/* Base: red gradient + diagonal stripe overlay */
background: linear-gradient(180deg, #dc2626 0%, #b91c1c 100%);
/* ::before overlay: */
background-image: repeating-linear-gradient(
  -45deg,
  rgba(255,255,255,0.25) 0px,
  rgba(255,255,255,0.25) 2px,
  transparent 2px,
  transparent 8px
);
/* opacity: 20-30% visible through gradient */
```

States:
- **Default**: Red gradient + diagonal stripe at 20-30% opacity
- **Hover**: Darker red gradient (#991b1b), stripe preserved
- **Auth pending**: Text → "Verify your identity...", inline spinner, opacity 50% + grayscale(50%) + cursor: not-allowed
- **Disabled (unauthenticated)**: Opacity 50%, cursor: not-allowed, tooltip: "Log in to transfer funds"

### Agent Buttons (Phase 143+, placed alongside standard)

```
✨ Agent Transfer    ✨ Agent Deposit    ✨ Agent Withdraw
```

- Background: `linear-gradient(180deg, #1e3a8a 0%, #3b69c2 100%)`
- Border: `1px solid #1e3a8a`
- Prefix: ✨ (U+2728) with 4px gap before label
- Same padding/size as standard buttons
- Side-by-side with standard variants (no toggle to hide)

---

## Copywriting Contract

| Element | Copy |
|---------|------|
| Standard CTA | "Transfer" / "Deposit" / "Withdraw" |
| Agent CTA | "✨ Agent Transfer" / "✨ Agent Deposit" / "✨ Agent Withdraw" |
| Auth pending state | "Verify your identity..." |
| Unauthenticated tooltip | "Log in to transfer funds" |
| Auth pending spinner | Inline SVG spinner, 14px, white, inside button right of text |

---

## Component Locations

Both locations receive consistent styling:
1. **Account Management table rows** — inline action column buttons
2. **Action cards below table** — Transfer card, Deposit card, Withdraw card

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| None (CSS-only) | n/a | not required |

---

## Checker Sign-Off

- [x] Dimension 1 Copywriting: PASS — button labels explicit and distinct
- [x] Dimension 2 Visuals: PASS — stripes clearly distinguish category without breaking gradient
- [x] Dimension 3 Color: PASS — red (standard) vs blue (agent) unambiguous
- [x] Dimension 4 Typography: PASS — consistent 14px/500 weight across both categories
- [x] Dimension 5 Spacing: PASS — button padding maintained from baseline
- [x] Dimension 6 Registry Safety: PASS — pure CSS, no third-party registry

**Approval:** approved 2026-04-13 (retrospective)
