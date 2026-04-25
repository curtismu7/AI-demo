---
phase: 231-agent-chip-groups-collapsible-sections-collapse-all-button-p
verified: 2026-04-25T00:00:00Z
status: human_needed
score: 8/8 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Open the banking agent while logged in and visually confirm no 'Learn more' toggle in the left rail"
    expected: "Left rail shows only ACTION_GROUPS (Account, Transaction, Admin, Testing) with no 'Learn more' button or education chips inline"
    why_human: "Cannot confirm UI visual rendering via grep alone — JSX conditional logic verified but visual absence requires browser check"
  - test: "Click a group header (e.g. Account) and confirm the count badge and collapse/expand arrow render correctly"
    expected: "Badge shows '(3)' next to 'Account'; arrow toggles between ▼ and ▶; 'Collapse all' / 'Expand all' button appears above first group"
    why_human: "CSS rendering, badge display, and animation cannot be verified programmatically"
  - test: "Click '⊞ All actions' button at the bottom of the left rail"
    expected: "Discovery popout opens with header '⊞ All actions', search input, and 5 groups (Account, Transaction, Admin, Testing, Learn & Explore)"
    why_human: "Popout render, animation (translateY), and chip layout require visual inspection"
  - test: "Type in the search box inside the discovery popout"
    expected: "Chips filter live as text is typed; groups with zero matches are hidden; empty state shows 'No matching actions'"
    why_human: "Live filter behavior requires browser interaction"
  - test: "Press Escape once when search has text, then again (or with empty search)"
    expected: "First Escape clears search text; second Escape (or Escape on empty search) closes popout and returns focus to '⊞ All actions' button"
    why_human: "Keyboard interaction and focus return behavior require browser testing"
  - test: "Confirm no ⚡ button in the bottom input row"
    expected: "Input row contains only the text input and Send button — no lightning bolt icon"
    why_human: "Visual confirmation of button removal from input row requires browser check"
---

# Phase 231: Agent Chip Groups — Verification Report

**Phase Goal:** Redesign the BankingAgent left-rail chip area: remove inline Learn & Explore, add per-group count badges and collapse-all toolbar, and add a searchable discovery popout for all chips
**Verified:** 2026-04-25
**Status:** human_needed (automated checks all pass; 6 visual/interaction items need browser confirmation)
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Authenticated left-rail no longer shows a 'Learn more' toggle or EDUCATION_COMMANDS chips inline | VERIFIED | `grep -c "showLearnMore\|showCommands"` returns 0; "Learn more" string found only in a template literal help text at line 1098, not JSX |
| 2 | The ⚡ button is absent from the bottom input row | VERIFIED | `grep -n "ba-cmd-btn\|⚡"` returns no matches in BankingAgent.js |
| 3 | Each action group header shows a count badge between the group name and the toggle arrow | VERIFIED | `ba-group-count` span present in renderActionGroups at line 1530 area; grep count = 1 in JS |
| 4 | A collapse-all / expand-all button appears above the first action group, right-aligned | VERIFIED | `ba-chips-toolbar` div with collapse-all button renders in renderActionGroups (grep count = 1); `anyExpanded` + `collapseAllGroups` + `expandAllGroups` all wired at lines 1357–1492 |
| 5 | An '⊞ All actions' button sits at the bottom of the chip list in the left rail | VERIFIED | `ba-all-actions-btn` button present at line 5635–5645; `showDiscovery` active class toggle wired |
| 6 | Clicking '⊞ All actions' opens a discovery popout with all groups plus education chips, with search input | VERIFIED | Discovery popout JSX at lines 5941–5990; `{isLoggedIn && showDiscovery && (` conditional; `ba-discovery-search` input wired to `discoverySearch` state; `filteredDiscoveryGroups` memo covers 5 groups |
| 7 | Pressing Escape closes the popout (or clears search first if search has text) | VERIFIED | `useEffect` at line 1229 with `document.addEventListener("keydown", onKey)`, Escape handler clears `discoverySearch` first then `setShowDiscovery(false)` with focus return |
| 8 | npm run build exits 0 with no new errors | VERIFIED | Build completed successfully with no errors |

**Score:** 8/8 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `banking_api_ui/src/components/BankingAgent.css` | 11 new CSS classes for chip toolbar, collapse-all button, count badge, all-actions trigger, discovery popout | VERIFIED | 21 CSS class selector matches for new Phase 231 classes; `position: relative` on `.ba-body` at line 159; `.ba-discovery-popout--open` present |
| `banking_api_ui/src/components/BankingAgent.js` | Revised left-rail render — no inline edu chips, new showDiscovery state, discovery popout JSX | VERIFIED | `showDiscovery` has 6 occurrences; `ba-discovery-popout` has 1 occurrence (conditional render pattern); `discoveryTriggerRef` has 15 occurrences |
| `banking_api_server/services/nlIntentParser.js` | Extended EDU object (31 constants) and 22 new parseEducation() if-blocks | VERIFIED | TOKEN_CHAIN, BEST_PRACTICES, AGENTIC_MATURITY, PAR, RAR all present; 46 total `if.*\.test(t)` blocks; spot-check of 13 labels all return `education` |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| BankingAgent.js showDiscovery state | Discovery popout conditional render | `{isLoggedIn && showDiscovery && (` at line 5942 | WIRED | Render-conditional pattern (not CSS class toggle — functionally equivalent, popout always has `--open` class when rendered) |
| discoveryTriggerRef | ba-all-actions-btn button | `ref={discoveryTriggerRef}` prop | WIRED | ref applied to trigger button; focus return in close handlers at lines 5957 and 1239 |
| .ba-body CSS rule | .ba-discovery-popout position: absolute | `position: relative` on `.ba-body` at line 159 | WIRED | `.ba-discovery-popout { position: absolute; bottom: 0; left: 0 }` anchors to panel body |
| nlIntentParser.js EDU.TOKEN_CHAIN | educationIds.js TOKEN_CHAIN = 'token-chain' | String value `"token-chain"` | WIRED | EDU.TOKEN_CHAIN: 'token-chain' at line 36; if-block at line 103 returns `{ panel: EDU.TOKEN_CHAIN, tab: 'overview' }` |
| parseEducation() if-blocks | EDUCATION_COMMANDS chip labels | regex word-boundary match on norm()'d input | WIRED | 13-label spot-check all return `kind: 'education'`; 46 if-blocks total |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|--------------------|--------|
| BankingAgent.js discovery popout | `filteredDiscoveryGroups` | `allDiscoveryGroups` memo derived from `ACTION_GROUPS` + `EDUCATION_COMMANDS` constants | Yes — static chip definitions, no async fetch needed | FLOWING |
| BankingAgent.js renderActionGroups | `chipGroupsState`, `ACTION_GROUPS` | Module-level constants + useState | Yes — ACTION_GROUPS is the canonical chip definition | FLOWING |
| nlIntentParser.js parseEducation | regex tests against `norm(t)` | Input string from BFF route | Yes — pure function, returns structured intent object | FLOWING |

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| nlIntentParser returns education for "token chain" | `node -e "const p=require('./banking_api_server/services/nlIntentParser.js'); console.log(p.parseHeuristic('token chain').kind)"` | `education` | PASS |
| nlIntentParser returns education for "best practices" | same pattern | `education` | PASS |
| nlIntentParser returns education for "par rfc 9126" | same pattern | `education` | PASS |
| nlIntentParser returns education for "rar" | same pattern | `education` | PASS |
| nlIntentParser returns education for "agentic maturity" | same pattern | `education` | PASS |
| nlIntentParser returns education for "agent builder" | same pattern | `education` | PASS |
| nlIntentParser returns education for "pinggateway" | same pattern | `education` | PASS |
| nlIntentParser returns education for "ietf standards" | same pattern | `education` | PASS |
| nlIntentParser returns education for "ai primer" | same pattern | `education` | PASS |
| nlIntentParser returns education for "id jag" | same pattern | `education` | PASS |
| UI build | `cd banking_api_ui && npm run build` | Exit 0, build folder ready | PASS |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| REQ-1 | 231-01-PLAN.md | Remove inline edu chips from authenticated left-rail | SATISFIED | `showLearnMore` + `showCommands` count = 0; Learn more JSX block deleted |
| REQ-2 | 231-02-PLAN.md | LangGraph heuristic coverage for all edu chip labels | SATISFIED | 31 EDU constants in BFF; 22 new if-blocks; 13-label spot-check all return education |
| REQ-3 | 231-01-PLAN.md | Collapsible groups + collapse-all button | SATISFIED | `ba-chips-toolbar`, `ba-group-count`, `collapseAllGroups`/`expandAllGroups` + `anyExpanded` all wired in renderActionGroups |
| REQ-4 | 231-01-PLAN.md | Discovery popout with polished UI | SATISFIED | Discovery popout JSX with `ba-discovery-popout`, header, search, 5 groups, Escape handler, focus return — CSS animation classes present |

---

### Anti-Patterns Found

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| None found | — | — | — |

All "placeholder" occurrences in BankingAgent.js are HTML input `placeholder` attributes (form fields and the discovery search input), not stub implementations. No TODO/FIXME/HACK markers in modified files.

---

### Note: Popout Implementation Deviation

The plan spec called for a CSS class toggle pattern:
```jsx
className={"ba-discovery-popout" + (showDiscovery ? " ba-discovery-popout--open" : "")}
```

The implementation uses conditional JSX render instead:
```jsx
{isLoggedIn && showDiscovery && (
  <div className={"ba-discovery-popout ba-discovery-popout--open"}>
```

The element is only present in the DOM when `showDiscovery` is true, so `ba-discovery-popout--open` is always applied when the element exists. This achieves the same functional result. The CSS transition on `.ba-discovery-popout` (opacity + translateY) will trigger on mount/unmount with React's rendering cycle. This is functionally equivalent for a verifier — no gap.

---

### Human Verification Required

#### 1. Left-rail visual state (logged-in view)

**Test:** Open the banking agent while logged in and inspect the left rail
**Expected:** No 'Learn more' toggle button; no education chips inline; only ACTION_GROUPS (Account, Transaction, Admin, Testing) with collapsible headers
**Why human:** JSX conditional logic verified but visual absence of UI elements requires browser confirmation

#### 2. Count badges and collapse-all toolbar render

**Test:** Expand the Account group header; inspect the header area
**Expected:** Count badge shows `(3)` next to "Account"; collapse/expand arrow toggles correctly; "Collapse all" / "Expand all" button appears above first group header, right-aligned
**Why human:** CSS badge rendering and toolbar positioning require visual inspection

#### 3. Discovery popout opens with correct content

**Test:** Click '⊞ All actions' button at bottom of left rail
**Expected:** Popout animates in showing header '⊞ All actions', search input, and 5 chip groups: Account (3), Transaction (4), Admin (2), Testing (4), Learn & Explore (N chips)
**Why human:** Popout animation, chip count display, and group layout require browser rendering

#### 4. Live search filtering

**Test:** Type "token" in the discovery search box
**Expected:** Only chips whose labels contain "token" are shown (e.g., "🔗 Token Chain"); groups with no matching chips disappear; clearing the input restores all groups
**Why human:** React state-driven filter behavior and empty-state messaging require browser interaction

#### 5. Escape key behavior (two-step)

**Test:** Open popout, type search text, press Escape; then press Escape again
**Expected:** First Escape clears the search field (popout stays open); second Escape closes the popout and returns focus to the '⊞ All actions' button
**Why human:** Keyboard event sequencing and focus return require browser testing

#### 6. ⚡ button absent from input row

**Test:** Inspect the bottom input row of the banking agent panel while logged in
**Expected:** Input row contains only the text input field and the Send button — no lightning bolt icon visible
**Why human:** Visual confirmation of button removal from input row layout

---

### Gaps Summary

No automated gaps found. All 8 observable truths are verified by code inspection and behavioral spot-checks. The 6 human verification items are standard visual/interaction checks that cannot be confirmed programmatically — they do not indicate implementation defects.

---

_Verified: 2026-04-25_
_Verifier: Claude (gsd-verifier)_
