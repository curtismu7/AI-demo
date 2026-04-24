# Phase 226: agent-popout-close-existing — Research

**Researched:** 2026-04-24
**Domain:** React state management — agent panel placement / inline close-on-popout
**Confidence:** HIGH

---

## Summary

When the user clicks the "open in new window" button (↗) in the inline banking agent, `window.open('/agent', 'BankingAgent', ...)` fires and a separate browser window loads `AgentPage`. The inline agent **does not close** — both remain live simultaneously. This creates duplicate agent sessions, duplicate BFF calls, and UI confusion.

The fix requires one targeted change: after `window.open(...)` fires, call `setMiddleAgentOpen(false)` or `setRightAgentOpen(false)` (whichever placement is active) so the inline agent column collapses and the dashboard reverts to its non-split layout. This must be done via a callback prop (`onPopout`) that `UserDashboard.js` passes down to `BankingAgent`, because `setMiddleAgentOpen` and `setRightAgentOpen` are local state in `UserDashboard` and are not available inside `BankingAgent`.

The entire change is additive: one new prop on `BankingAgent`, two call-sites in `UserDashboard.js`, one line added to the existing `window.open` onClick handler. No existing logic needs to be removed or restructured.

**Primary recommendation:** Add an `onPopout` callback prop to `BankingAgent`; call it immediately after `window.open()` in the pop-out button handler; in `UserDashboard`, pass `onPopout={() => setMiddleAgentOpen(false)}` (middle) and `onPopout={() => setRightAgentOpen(false)}` (right-dock).

---

## Project Constraints (from CLAUDE.md)

- Read `REGRESSION_PLAN.md` §1 before editing listed files. State what will NOT be broken.
- Minimal diff — do not refactor unrelated code.
- After any `banking_api_ui` UI edit: run `npm run build` in `banking_api_ui/`; exit code must be 0.
- Bug fixes: add entry to `REGRESSION_PLAN.md` §4.
- Do not edit marketing-only pages.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Pop-out window open | Browser / Client | — | `window.open()` is a browser API call in BankingAgent onClick |
| Inline agent visibility | Frontend (React state) | localStorage persistence | `middleAgentOpen` / `rightAgentOpen` useState in UserDashboard |
| Placement persistence | localStorage + Context | — | `AgentUiModeContext` writes `banking_agent_ui_v2` key |
| Callback coordination | Component prop interface | — | Parent (UserDashboard) owns state; child (BankingAgent) fires callback |

---

## Standard Stack

No new libraries. The fix uses only existing React patterns already in the codebase.

| Item | Version | Purpose |
|------|---------|---------|
| React useState | 18.x (existing) | Controls `middleAgentOpen` / `rightAgentOpen` in UserDashboard |
| Callback prop pattern | — | Parent passes setter via prop; child calls it |

---

## Architecture Patterns

### System Architecture Diagram

```
User clicks ↗ button (BankingAgent.js, line ~4454)
       │
       ▼
window.open('/agent', 'BankingAgent', ...)   ← new browser window
       │
       ▼ [NEW: call onPopout() if provided]
       │
       ▼
UserDashboard.setMiddleAgentOpen(false)      ← closes inline column
  or  UserDashboard.setRightAgentOpen(false) ← closes right-dock column
       │
       ▼
UserDashboard re-renders without agent column
  (agentPlacement === 'middle' && middleAgentOpen === false)
  → falls through to bottom/float layout branch
  → FAB re-appears for re-open
```

### Relevant Project Structure

```
banking_api_ui/src/
├── components/
│   ├── BankingAgent.js          ← Pop-out button onClick (line ~4454); add onPopout prop
│   └── UserDashboard.js         ← middleAgentOpen / rightAgentOpen state owners; pass onPopout
├── context/
│   └── AgentUiModeContext.js    ← Controls placement (middle/right-dock/bottom/none) — NOT changed
└── pages/
    └── AgentPage.js             ← Renders BankingAgent in inline mode inside /agent route — NOT changed
```

### Pattern: Callback Prop for Child → Parent Notification

**What:** Child fires a function prop to notify parent of an internal event.
**When to use:** When the action (pop-out) occurs inside a child that does not own the state being changed (inline open/closed).

```jsx
// Source: existing pattern in BankingAgent.js (e.g., onLogout prop)

// BankingAgent.js — prop signature (add to destructure)
export default function BankingAgent({
  user,
  onLogout,
  mode = "float",
  embeddedDockBottom = false,
  embeddedFocus = "banking",
  distinctFloatingChrome = false,
  splitColumnChrome = false,
  showPopOut = false,
  onPopout,          // <-- NEW: called after window.open fires
}) {
  // ...
  // Inside the pop-out button onClick (line ~4509):
  window.open('/agent', 'BankingAgent', `...`);
  onPopout?.();      // <-- call immediately after
```

```jsx
// UserDashboard.js — middle placement render site (line ~2521)
<BankingAgent
  user={user}
  onLogout={onLogout}
  mode="inline"
  embeddedFocus="banking"
  distinctFloatingChrome
  splitColumnChrome
  showPopOut
  onPopout={() => setMiddleAgentOpen(false)}   // <-- NEW
/>

// UserDashboard.js — right-dock placement render site (line ~2486)
<BankingAgent
  user={user}
  onLogout={onLogout}
  mode="inline"
  embeddedFocus="banking"
  distinctFloatingChrome
  splitColumnChrome
  showPopOut
  onPopout={() => setRightAgentOpen(false)}    // <-- NEW
/>
```

### Anti-Patterns to Avoid

- **Mutating `agentPlacement` in AgentUiModeContext:** The context placement controls the *preferred* layout. Setting it to `none` after popout would persist that change to localStorage and break "re-open" behavior after the popup window is closed. Use `middleAgentOpen` / `rightAgentOpen` local state instead — these reset on every page load and are designed for the transient open/closed toggle.
- **Calling `setAgentUi({ placement: 'none' })` in the popout handler:** Would permanently change the user's saved placement preference, overwriting their `banking_agent_ui_v2` key. Do not touch context state.
- **Closing inside the popout window:** The `/agent` page renders `BankingAgent mode="inline"` with no `onLogout` proxy — there is no back-channel from the popup to the opener's React state.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead |
|---------|-------------|-------------|
| Cross-window communication | Custom `window.opener` messaging or `BroadcastChannel` | Not needed — just close inline immediately on click |
| State sharing | Custom global store | Already solved by local `useState` + callback prop |

**Key insight:** The opener window doesn't need to know if the popup is still open. Closing the inline agent immediately on click is the correct UX (clean, instant, no race condition). Re-open via the existing FAB.

---

## Common Pitfalls

### Pitfall 1: Missing `onPopout` JSDoc update
**What goes wrong:** The `@param` block at line ~1174 describing BankingAgent props is not updated, causing confusion for future editors.
**How to avoid:** Add `@param {function} [props.onPopout]` to the JSDoc comment block.

### Pitfall 2: Calling `onPopout` before `window.open`
**What goes wrong:** If `window.open` throws (rare), the panel closes but no window opens.
**How to avoid:** Call `window.open(...)` first, then `onPopout?.()`. Both are synchronous; no issue with ordering.

### Pitfall 3: Forgetting the right-dock call-site
**What goes wrong:** Only the middle placement gets `onPopout`; right-dock inline agent stays open when popped out.
**Warning signs:** `agentPlacement === 'right-dock'` case still shows duplicate agents.

### Pitfall 4: Breaking the `agentPlacement` useEffect (REGRESSION_PLAN.md §1 risk)
**What goes wrong:** The effect at UserDashboard.js line ~387 calls `setMiddleAgentOpen(true)` when `agentPlacement === 'middle'`. If the popout closes the inline and then the placement effect immediately re-opens it, there is a conflict.
**Why it doesn't apply:** The placement effect only fires when `agentPlacement` changes. We are not changing `agentPlacement` — we are only toggling the local `middleAgentOpen` boolean. The effect will not re-fire after the popout click.

### Pitfall 5: npm run build not verified
**What goes wrong:** Prop addition causes a JSX/prop-types linting error or import issue.
**How to avoid:** Run `cd banking_api_ui && npm run build` after the change. [VERIFIED: CLAUDE.md mandates this]

---

## Code Examples

### Full pop-out button onClick (current, BankingAgent.js ~4458)

```jsx
// Source: BankingAgent.js lines 4454-4519 [VERIFIED: read from file]
{(!isInline || showPopOut) && (
  <button
    type="button"
    className="ba-icon-btn"
    onClick={() => {
      const calculateOptimalSize = () => { /* ... */ };
      const { width, height, left, top } = calculateOptimalSize();
      window.open(
        "/agent",
        "BankingAgent",
        `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes,toolbar=no,menubar=no,location=no,status=yes`,
      );
      // ADD: onPopout?.();
    }}
    title="Open agent in new window"
    aria-label="Open agent in new window"
  >
    ↗
  </button>
)}
```

### middleAgentOpen state init (UserDashboard.js ~128)

```js
// Source: UserDashboard.js lines 128-134 [VERIFIED: read from file]
const [middleAgentOpen, setMiddleAgentOpen] = useState(
  () => agentPlacement === "middle",
);
const [rightAgentOpen, setRightAgentOpen] = useState(
  () => agentPlacement === "right-dock",
);
```

---

## Regression Risk Assessment

| REGRESSION_PLAN.md §1 Entry | Risk from This Change | Verdict |
|---|---|---|
| Middle layout start state (`middleAgentOpen` init + agentPlacement useEffect) | We close `middleAgentOpen` after popout click. The useEffect only fires on `agentPlacement` change — not on our toggle. FAB re-open is already wired. | SAFE |
| Bottom dock on dashboard routes | Not touched — bottom placement has no pop-out button shown | SAFE |
| BankingAgent FAB | FAB re-appears when `middleAgentOpen === false` (existing logic at line 2621) | SAFE |
| Split vs Classic dashboard + HITL consent | We do not change dashboardLayout state | SAFE |
| Agent startup consent gate | Not touched | SAFE |
| Float panel resize | Not touched | SAFE |

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Jest + React Testing Library (CRA) |
| Config file | `banking_api_ui/package.json` (jest key) |
| Quick run command | `cd banking_api_ui && npx react-scripts test --watchAll=false --testPathPattern="BankingAgent.chips"` |
| Full suite command | `cd banking_api_ui && npx react-scripts test --watchAll=false` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| REQ-226-01 | Pop-out button calls `onPopout` callback | unit | `cd banking_api_ui && npx react-scripts test --watchAll=false --testPathPattern="BankingAgent.chips"` | Wave 0 gap — test to add to existing file |
| REQ-226-02 | Inline panel closes when `onPopout` fires in middle placement | unit | same | Wave 0 gap |
| REQ-226-03 | `onPopout` defaults to undefined without breaking float mode | unit | same | Wave 0 gap |
| REQ-226-04 | npm run build exits 0 after prop addition | build | `cd banking_api_ui && npm run build` | Existing CI pattern |

### Sampling Rate

- **Per task commit:** `cd banking_api_ui && npm run build` (exit 0)
- **Per wave merge:** `cd banking_api_ui && npx react-scripts test --watchAll=false`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `banking_api_ui/src/components/__tests__/BankingAgent.chips.test.js` — add 3 new `it()` cases for `onPopout` behavior (existing file, no new file needed)

---

## Open Questions

1. **Should the popup window also get an `onClose` hook to re-open the inline agent?**
   - What we know: `window.open` returns a `WindowProxy`; a `beforeunload` listener on the popup could post a message back.
   - What's unclear: Whether the user expects the inline agent to re-open when they close the popup window. Product requirement not specified.
   - Recommendation: Out of scope for phase 226. Phase 226 goal is one-way: "close inline when popping out." Re-open-on-popup-close is a separate feature.

2. **Is the `AgentPage.js` at `/agent` the right popout destination, or should it be the standalone `BankingAgent` component?**
   - What we know: `window.open('/agent', ...)` already exists and routes to `AgentPage.js` which renders `<BankingAgent mode="inline" />`. [VERIFIED: read from file]
   - No change needed for phase 226.

---

## Environment Availability

Step 2.6: SKIPPED (no external dependencies — pure React/JS code change with no new services, APIs, or CLI tools required).

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `onPopout?.()` calling after `window.open()` is the correct ordering (open first, then close inline) | Code Examples | Minor UX only — if window.open somehow fails, panel still closes. Low risk. |

---

## Sources

### Primary (HIGH confidence)

- `banking_api_ui/src/components/BankingAgent.js` — pop-out button at lines 4453–4519, prop signature at lines 1182–1191 [VERIFIED: read from file]
- `banking_api_ui/src/components/UserDashboard.js` — `middleAgentOpen` / `rightAgentOpen` state at lines 128–134; BankingAgent render at lines 2509–2518 and 2536–2545; agentPlacement useEffect at lines 386–410 [VERIFIED: read from file]
- `banking_api_ui/src/context/AgentUiModeContext.js` — placement state, `setAgentUi`, `banking_agent_ui_v2` key [VERIFIED: read from file]
- `banking_api_ui/src/pages/AgentPage.js` — `/agent` route mounts `BankingAgent mode="inline"` [VERIFIED: read from file]
- `REGRESSION_PLAN.md` §1 — Middle layout start state + bottom dock entries [VERIFIED: read from file]

### Secondary (MEDIUM confidence)

- None — all claims verified from source files.

---

## Metadata

**Confidence breakdown:**
- Exact change location: HIGH — lines identified from file reads
- Prop pattern: HIGH — identical pattern already used (onLogout, showPopOut)
- Regression risk: HIGH — agentPlacement useEffect analyzed; no conflict found
- Test gaps: HIGH — existing test file identified; 3 new cases needed

**Research date:** 2026-04-24
**Valid until:** Stable — no fast-moving dependencies. Valid until BankingAgent.js or UserDashboard.js are significantly refactored.
