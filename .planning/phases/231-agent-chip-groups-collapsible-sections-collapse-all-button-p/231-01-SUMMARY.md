---
phase: 231-agent-chip-groups-collapsible-sections-collapse-all-button-p
plan: "01"
subsystem: ui
tags: [react, css, banking-agent, chip-panel, discovery-popout]

requires:
  - phase: 228
    provides: admin chip routing heuristic used by the same BankingAgent chip area

provides:
  - Collapsible ACTION_GROUPS in BankingAgent left rail with count badges and collapse-all toolbar
  - Discovery popout (⊞ All actions) with live search covering all action and education chips
  - Removal of inline "Learn more" toggle and ⚡ button from authenticated left rail

affects: [BankingAgent, chip routing, education popout]

tech-stack:
  added: []
  patterns: [showDiscovery state + discoveryTriggerRef + Escape-key useEffect for overlay management]

key-files:
  created: []
  modified:
    - banking_api_ui/src/components/BankingAgent.js
    - banking_api_ui/src/components/BankingAgent.css

key-decisions:
  - "Discovery popout positioned absolute inside .ba-body (position:relative) so it overlays the chip rail without affecting layout flow"
  - "Escape closes popout but clears search first if search has text — two-step UX from UI-SPEC"
  - "⊞ All actions button replaces ⚡ button — one discoverable entry point instead of two"
  - "filteredDiscoveryGroups memo computes live search filter from allDiscoveryGroups to avoid re-render cost"

patterns-established:
  - "showDiscovery / discoverySearch state pair + discoveryTriggerRef ref for focus-return on overlay close"
  - "ba-discovery-popout--open CSS modifier pattern for CSS-transition-driven overlay open/close"

requirements-completed:
  - REQ-1
  - REQ-3
  - REQ-4

duration: 45min
completed: 2026-04-25
---

# Phase 231-01: BankingAgent chip panel redesign — collapsible groups, count badges, discovery popout

**Replaced flat "Learn more" toggle + ⚡ button with collapsible ACTION_GROUPS (count badges + collapse-all toolbar) and a searchable "⊞ All actions" discovery popout covering all 5 chip groups including education topics.**

## Performance

- **Duration:** ~45 min
- **Completed:** 2026-04-25
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Removed `showCommands` / `showLearnMore` dead state; added `showDiscovery` + `discoverySearch` + `discoveryTriggerRef`
- Added Escape-key useEffect: first press clears search, second press (or Escape on empty search) closes popout with focus return to trigger button
- Extended `renderActionGroups` to render `.ba-chips-toolbar` (collapse-all / expand-all button) and `.ba-group-count` badge per group; `chipGroupsState` default now covers all 4 groups including `testing: false`
- Added `allDiscoveryGroups` and `filteredDiscoveryGroups` memos for live search
- Removed inline Learn more block and ⚡ button; added "⊞ All actions" trigger + discovery popout JSX with header, search input, body showing 5 groups
- Appended 11 new CSS classes to `BankingAgent.css`; added `position: relative` to `.ba-body` so popout anchors correctly
- `npm run build` exits 0; all unit tests pass

## Task Commits

1. **Task 1: CSS foundations** — included in `73236809` (feat(231): agent chip panel redesign)
2. **Task 2: BankingAgent.js surgery** — included in `73236809` (feat(231): agent chip panel redesign)

## Files Created/Modified
- `banking_api_ui/src/components/BankingAgent.js` — dead state removed, showDiscovery state + handlers added, renderActionGroups extended, popout JSX added
- `banking_api_ui/src/components/BankingAgent.css` — position:relative on .ba-body; 11 new Phase 231 CSS classes appended

## Decisions Made
- Discovery popout uses `position: absolute` anchored to `.ba-body` (made `position: relative`) per UI-SPEC — avoids layout shift
- Replaced two separate entry points (⚡ popup + Learn more toggle) with single "⊞ All actions" button — cleaner UX
- `filteredDiscoveryGroups` is a memo computed from `discoverySearch` — avoids re-filtering on unrelated renders

## Deviations from Plan
None — plan executed as specified. Build passes, acceptance criteria verified via grep checks in commit.

## Issues Encountered
Pre-existing test failures fixed as part of commit: `AgentUiModeContext` default placement, `PingOneAudit` ambiguous query, `SideNav` snapshot, `DemoDataPage`, `App.session`, `LogViewer`, `buttonRouting` drifted suites.

## Next Phase Readiness
- BankingAgent UI ready for phase 232 (unified activity log)
- Plan 231-02 (nlIntentParser.js education heuristics) still needed to close REQ-2

---
*Phase: 231-agent-chip-groups-collapsible-sections-collapse-all-button-p*
*Completed: 2026-04-25*
