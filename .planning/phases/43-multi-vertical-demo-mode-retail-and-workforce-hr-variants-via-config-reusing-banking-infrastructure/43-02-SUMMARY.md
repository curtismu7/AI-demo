---
plan: 43-02
phase: 43-multi-vertical-demo-mode-retail-and-workforce-hr-variants-via-config-reusing-banking-infrastructure
status: executed
completed: 2026-04-05
commit: TBD
---

# Plan 43-02 Summary: Vertical UI Layer

## Status
**EXECUTED**

## What Was Done

### Files created
- `banking_api_ui/src/context/VerticalContext.js` — React context for vertical config
- `banking_api_ui/src/components/VerticalSwitcher.js` — UI component for switching verticals
- `banking_api_ui/src/components/VerticalSwitcher.css` — Styling for vertical switcher

### Files modified
- `banking_api_ui/src/App.js` — wrapped app in VerticalProvider
- `banking_api_ui/src/components/DemoDataPage.js` — added vertical switcher section

### VerticalContext features
- Fetches active vertical from `/api/config/vertical` on mount
- Provides `vertical` object, `switchVertical(id)`, `mapTerm(term)` to tree
- Applies theme CSS vars when vertical changes (primary, accent, gradient)
- Handles loading/error states

### VerticalSwitcher variants
| Variant | Placement | UI |
|---------|-----------|----|
| `nav` | Top navigation | Compact dropdown |
| `config` | Demo Data page | Pill selector with dots and taglines |

### Integration points
- **App.js** — VerticalProvider wraps entire app
- **DemoDataPage** — Config variant with explanatory text
- **CSS theme** — VerticalContext applies `--vertical-primary`, `--vertical-accent`, `--vertical-gradient`

### Vertical switching flow
1. User clicks vertical pill
2. Calls `PUT /api/config/vertical` (updates configStore)
3. VerticalContext fetches new config
4. Applies theme CSS vars
5. Components re-render with new terminology via `mapTerm()`

## Verification
- `npm run build` → exit 0
- Vertical switcher appears on Demo Data page
- Theme CSS vars applied when switching (backend ready)
- No page reload required — context updates trigger re-renders

## Next steps (not in this phase)
- Apply `mapTerm()` throughout UI components (Dashboard, Agent, etc.)
- Use vertical theme CSS vars in component styles
- Add nav variant to header navigation
