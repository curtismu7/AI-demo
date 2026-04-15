# Phase 155: Left Sidebar Menu Redesign — Context & Vision

## User Vision

Create a unified left sidebar navigation menu with professional styling (colors, fonts, sizing seen in screenshot).

**Current state:**
- Navigation scattered across UI: Sign in button, Dashboard link, Admin panel toggle, Account menu
- Top toolbar cluttered: Theme toggle, Auto-refresh checkbox, Token info modal, Role switch button
- Side buttons on transaction panels, account detail panels, etc.

**Desired end state:**
- One clean sidebar menu on the left with icon + label entries
- Menu items sourced from:
  1. Current side buttons (Sign in, Dashboard, Admin link, Account info)
  2. Toolbar items consolidated (Theme, Auto-refresh, Token inspector, Switch role if admin)
  3. Additional navigation from top menu area
- Styling: Apply color palette, icon sizing (16-18px), label typography from screenshot
- Responsive: Should adapt to mobile/narrow views

## Design Constraints

**Styling from Screenshot:**
- Sidebar background color: Light/medium gray (#f5f5f5 or similar)
- Menu item text: Dark header font (font-weight 600, size 14px)
- Icons: 18px emoji or inline SVG
- Spacing: 8px between icon and label, 12px item padding
- Hover state: Light background highlight
- Active state: Bold text or accent left border

**Icon guidelines:**
- 🏠 Dashboard / Home
- 👤 Account / Profile
- ⚙️ Admin / Settings
- 🌙 / ☀️ Theme (Dark/Light)
- 🔄 Auto-refresh toggle
- 🔑 Token Inspector / OAuth info
- 🔐 Switch Role
- 📋 Transactions
- 💳 Accounts
- ➕ Other items as discovered

## Items to Consolidate

**From existing buttons:**
- Sign in / Sign out button
- Dashboard link
- Admin link (if user has admin role)
- Account dropdown/menu

**From top toolbar:**
- Light/Dark theme toggle
- Auto-refresh checkbox
- Token inspector modal button
- Role switch button (admin only)

**From other panels (audit needed):**
- Transaction list links
- Account detail navigation
- Educational mode toggle (if exists)
- API traffic viewer (if exists)

## Requirements

- **SIDE-155-01**: Sidebar menu component (layout, render items, responsive)
- **SIDE-155-02**: Icon + label styling matching screenshot design
- **SIDE-155-03**: Responsive behavior (sidebar collapses/adapts on mobile)
- **SIDE-155-04**: Toolbar consolidation (remove redundant buttons, keep task-specific actions)

## Non-Goals

- Deep redesign of entire UI layout
- Mobile-first rebuild (adjust existing responsive, don't start from scratch)
- New functionality (pure restructuring of existing nav items)

## Dependencies

- Phase 154 (DPoP planning) — assumed complete
- No blocking technical dependencies
- Requires audit of current UI structure to find all nav items

## Next Steps

1. Run `/gsd-plan-phase 155` to break into discrete tasks
2. Tasks will likely include:
   - Audit current buttons/menus across app
   - Design sidebar component layout
   - Implement styling per screenshot
   - Wire up menu items to existing actions
   - Test responsive behavior
   - Update routing/navigation as needed
