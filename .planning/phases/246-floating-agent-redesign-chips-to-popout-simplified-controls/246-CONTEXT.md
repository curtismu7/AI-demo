# Phase 246: Floating Agent Redesign — Context

**Gathered:** 2026-04-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Simplify the floating agent panel in float mode only:
- Remove the persistent left rail (172px chip column)
- Move all chips, settings, session controls, and server status into a single Actions popout
- Strip the header from 7 controls down to 3 controls + 1 Actions trigger button
- Deliver a clean chat-first experience where power features are on demand

Inline/embedded mode is explicitly out of scope — zero changes.

</domain>

<spec_lock>
## Requirements (locked via UI-SPEC.md)

**Visual and interaction contract is fully locked.** See `246-UI-SPEC.md` for complete wireframes, spacing, typography, color, component inventory, copy, and interaction contracts.

Downstream agents MUST read `246-UI-SPEC.md` before planning or implementing.

**In scope (from UI-SPEC.md):**
- Remove `.ba-left-col` from float mode (CSS hide)
- Add `.ba-actions-trigger` pill button to header
- Add `.ba-actions-popout` overlay with search, grouped chip sections, settings, session, view, status bar
- Strip `.ba-header-tools` to: Actions trigger, Expand toggle (⊞/⊟), Collapse (▼)
- Move appearance select, page theme toggle, sign-out, token chain toggle into popout sections

**Out of scope (from UI-SPEC.md):**
- Inline / embedded / bottom-dock mode — no changes
- Token chain column behavior — no changes
- Any modal (AgentConsentModal, OtpStepUpModal, etc.) — no changes
- FAB — no changes
- Any backend service, BFF route, or token logic — no changes
- `/agent` popout window route — no changes (button moves to popout)
- Marketing page embedded agent — no changes
- Admin dashboard inline agent — no changes

</spec_lock>

<decisions>
## Implementation Decisions

### A. Popout component shape
- **D-01:** Popout is **inline JSX inside BankingAgent.js** — not extracted to a separate component. Matches the existing pattern (everything is inline in this monolithic component). The popout block sits adjacent to the header tools JSX, guarded by `{showDiscovery && !isInline && <div className="ba-actions-popout">…</div>}`.

### B. Left rail migration approach
- **D-02:** **Surgical move** — existing chip-rendering logic (suggestion chips, action groups, session row, footer/status) is moved as-is from `ba-left-col` into the corresponding popout sections. The `allDiscoveryGroups`, `filteredDiscoveryGroups`, and `handleActionClick` computed values stay untouched. Only the JSX container changes. Do NOT rewrite the chip logic — the existing edge-case guards (`isLoggedIn`, `consentBlocked`, `isConfigured`, guest state) must be preserved exactly.

### C. Inline mode safety guard
- **D-03:** **CSS-only** — add one rule to `BankingAgent.css`:
  ```css
  .banking-agent-panel:not(.ba-mode-inline) .ba-left-col { display: none; }
  ```
  No JSX changes to the left rail block itself. `.ba-mode-inline` class is already conditionally applied (existing pattern). This prevents the emptied left rail from taking space without touching the 650-line left-rail JSX.

### D. Popout window button
- **D-04:** The current `↗` "Open in new window" button is **moved to the Actions popout VIEW section** (alongside the token chain toggle). It is NOT removed — removing it would be a regression.
- **D-04b:** Replace the `↗` icon with **`⧉`** (U+29C9, overlapping squares). Label in VIEW section: `⧉ New window`. The existing click handler (`window.open("/agent", …)`) is preserved unchanged.

### Agent's Discretion
- Order of VIEW section items in popout: token chain toggle first, new window second (token chain is more commonly used)
- Popout backdrop z-index: 100060 (per UI-SPEC.md)
- Popout container z-index: 100061 (per UI-SPEC.md)
- TESTING section collapsed by default (per UI-SPEC.md)
- ADMIN section hidden when role ≠ admin (existing `isAdmin` guard — preserve as-is)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### UI Contract
- `.planning/phases/246-floating-agent-redesign-chips-to-popout-simplified-controls/246-UI-SPEC.md` — Full visual and interaction contract: wireframes, spacing, typography, color tokens, component inventory, copywriting, interaction contracts, ASCII diagrams. READ THIS FIRST.

### Source files to modify
- `banking_api_ui/src/components/BankingAgent.js` — Main component (~6100 lines). Key anchors:
  - Line ~1207: `showDiscovery` / `discoverySearch` state (existing — reuse)
  - Line ~1436: `allDiscoveryGroups` computed (existing — reuse)
  - Line ~1447: `filteredDiscoveryGroups` computed (existing — reuse)
  - Line ~1573: `handleActionClick` function (existing — reuse unchanged)
  - Line ~4487: `ba-header-tools` div (modify — remove 4 controls, add Actions trigger)
  - Line ~5465: `ba-left-col` div (source for surgical move into popout)
- `banking_api_ui/src/components/BankingAgent.css` — Add `.ba-actions-trigger`, `.ba-actions-popout`, `.ba-popout-*` classes and the CSS guard for `.ba-left-col`

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `showDiscovery` / `setShowDiscovery` state — already used for the old discovery panel toggle; reuse to drive popout open/close
- `discoverySearch` / `setDiscoverySearch` state — already the search query; wire directly to popout search input
- `allDiscoveryGroups` (line 1436) — already computes all chip groups; popout renders from this
- `filteredDiscoveryGroups` (line 1447) — already filters by `discoverySearch`; popout renders from this
- `handleActionClick(actionId)` (line 1573) — existing chip click handler; call unchanged from popout chips
- `isInline` (line 1175) — existing boolean; use to guard all float-only popout rendering
- `isLoggedIn`, `consentBlocked`, `isConfigured` — existing guards in left-rail JSX; carry forward into popout sections
- `.ba-left-label` CSS class — existing 10px/700/uppercase section label; reuse for popout section headers per UI-SPEC

### Established Patterns
- All UI is inline JSX in BankingAgent.js — no sub-components extracted
- State-driven visibility: `{condition && <div>…</div>}` pattern throughout
- CSS classes use `ba-` prefix (BEM-adjacent)
- Theme: dark by default, `ba-mode-light` class on panel for light override

### Integration Points
- Header tools block (~line 4487): add `.ba-actions-trigger` button before expand toggle
- After header closing `</div>`: add popout JSX block (guarded by `showDiscovery && !isInline`)
- BankingAgent.css: new classes for popout + one-line CSS guard for left col

</code_context>

<specifics>
## Specific Ideas

- `⧉` (U+29C9) is the chosen icon for the "Open in new window" chip in the VIEW section
- Popout anchored `position: absolute; bottom: calc(100% + 8px); right: 0` relative to `.ba-header` per UI-SPEC
- Two-step Escape: first clears `discoverySearch` (if non-empty), second sets `showDiscovery = false` — matches existing `useEffect` at line ~1213
- TESTING section uses existing collapsible pattern (collapsed by default)

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 246-floating-agent-redesign-chips-to-popout-simplified-controls*
*Context gathered: 2026-04-28*
