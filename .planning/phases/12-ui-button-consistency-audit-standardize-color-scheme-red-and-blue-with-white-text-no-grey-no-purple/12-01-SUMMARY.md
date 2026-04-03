---
phase: 12-ui-button-consistency-audit-standardize-color-scheme-red-and-blue-with-white-text-no-grey-no-purple
plan: 01
status: complete
commit: 7df3e47
---

# Plan 12-01 Summary: Button color system

## What was built

Established a consistent two-color button system (blue + red) across the BX Finance demo. Every interactive button is now either red (danger/CTA) or blue (nav/secondary), both with white text. Grey is reserved for disabled states only.

## Changes made

### `banking_api_ui/src/index.css`
- Added 4 blue CSS variables to `:root` immediately after the red set:
  - `--app-primary-blue: #1d4ed8`
  - `--app-primary-blue-hover: #1e3a8a`
  - `--app-primary-blue-mid: #2563eb`
  - `--app-primary-blue-border: #1e40af`
- Added `.btn-blue` utility class with gradient, white text, hover/focus/disabled states

### `banking_api_ui/src/App.css`
- `nav-home-fab`: grey (`#475569/#64748b`) → blue (`var(--app-primary-blue-mid/blue)`)
- `nav-dashboard-fab`: orange (`#b45309/#ea580c`) → blue (`var(--app-primary-blue-mid/blue)`)
- Both FABs: box-shadow rgba updated to blue tones
- Added `.btn-blue` and all pseudo-states to the `end-user-nano` override block (white text enforcement)
- Added `.btn-blue` to the `a:is(...)` text-decoration block

### `banking_api_ui/src/components/UserDashboard.css`
- `dashboard-toolbar-btn--theme`: grey → blue (vars)

### `banking_api_ui/src/styles/appShellPages.css`
- `app-page-toolbar-btn--theme`: grey → blue (vars)

### `banking_api_ui/src/components/BankingAgent.css`
- `ba-split-column .ba-send-btn`: `#94a3b8` grey → `var(--app-primary-blue-mid)` blue
- hover: `#64748b` → `var(--app-primary-blue)`

## What was NOT changed (by design)
- Disabled button states (grey opacity — correct)
- FunnyBank preset purple (intentional demo white-label branding)
- Marketing page hero button (CLAUDE.md stability requirement)
- Status badges and non-button UI elements

## Verification
- `npm run build`: **Compiled successfully** (exit 0)
- No new TypeScript/CSS errors

## Decisions
- Used `#2563eb` (blue-mid) / `#1d4ed8` (blue) / `#1e3a8a` (blue-hover) — matching the existing `demo-config-fab` blue palette already established in the codebase
