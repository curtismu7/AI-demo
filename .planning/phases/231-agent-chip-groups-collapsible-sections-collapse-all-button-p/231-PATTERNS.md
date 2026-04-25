# Phase 231: Agent Chip Groups — Collapsible Sections + Discovery Popout - Pattern Map

**Mapped:** 2026-04-25
**Files analyzed:** 3 (2 modified, 1 modified)
**Analogs found:** 3 / 3

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `banking_api_ui/src/components/BankingAgent.js` | component | event-driven | `BankingAgent.js` itself (surgery on existing patterns) | exact |
| `banking_api_ui/src/components/BankingAgent.css` | config/style | — | `BankingAgent.css` itself (append 11 new classes) | exact |
| `banking_api_server/services/nlIntentParser.js` | service | request-response | `nlIntentParser.js` itself (extend `parseEducation()`) | exact |

All three files are self-referential: the phase extends existing code rather than creating new files from scratch. The patterns to copy are already inside each file.

---

## Pattern Assignments

### `banking_api_ui/src/components/BankingAgent.js` (component, event-driven)

**Analog:** `banking_api_ui/src/components/BankingAgent.js` — existing patterns being extended

---

#### Imports pattern (lines 1–55)

```javascript
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
// ... (existing imports unchanged)
import { EDUCATION_COMMANDS } from "./education/educationCommands";
import { EDU } from "./education/educationIds";
import "./BankingAgent.css";
```

No new imports are needed. `useMemo` and `useRef` are already imported and will be used by the new `showDiscovery` / `discoverySearch` state and the `discoveryTriggerRef`.

---

#### chipGroupsState pattern — localStorage init + persist + toggle (lines 1299–1334)

Copy this pattern for all three new handlers (`collapseAllGroups`, `expandAllGroups`, `anyExpanded`). The existing handler is the authoritative example:

```javascript
// State init — localStorage with fallback default (lines 1299–1314)
const [chipGroupsState, setChipGroupsState] = useState(() => {
  try {
    const saved = localStorage.getItem("ba_chip_groups_state");
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (e) {
    console.warn("Failed to load ba_chip_groups_state from localStorage:", e);
  }
  // CHANGE FOR PHASE 231: default must include `testing: false` to cover all four groups
  return {
    account: true,
    transaction: false,
    admin: false,
    // testing: false  ← ADD THIS
  };
});

// Persist effect (lines 1316–1326) — copy as-is
useEffect(() => {
  try {
    localStorage.setItem(
      "ba_chip_groups_state",
      JSON.stringify(chipGroupsState),
    );
  } catch (e) {
    console.warn("Failed to save ba_chip_groups_state to localStorage:", e);
  }
}, [chipGroupsState]);

// Toggle handler (lines 1329–1334) — copy as-is
const toggleGroupExpanded = (groupName) => {
  setChipGroupsState((prev) => ({
    ...prev,
    [groupName]: !prev[groupName],
  }));
};
```

**New derived value and handlers to add immediately after `toggleGroupExpanded` (after line 1334):**

```javascript
// Derived: true when any group is currently expanded
const anyExpanded = Object.values(chipGroupsState).some(Boolean);

// Collapse all groups — always enumerates ACTION_GROUPS keys (never hardcoded)
const collapseAllGroups = () => {
  setChipGroupsState(
    Object.fromEntries(Object.keys(ACTION_GROUPS).map((k) => [k, false]))
  );
};

// Expand all groups
const expandAllGroups = () => {
  setChipGroupsState(
    Object.fromEntries(Object.keys(ACTION_GROUPS).map((k) => [k, true]))
  );
};
```

---

#### Discovery popout state — add near line 1260 (alongside `showLearnMore` and `showCommands` which are being removed)

The removal targets are:
- Line 1224: `const [showCommands, setShowCommands] = useState(false);` — DELETE
- Line 1260: `const [showLearnMore, setShowLearnMore] = useState(false);` — DELETE

Replace with (using the same `useState` pattern as every other boolean toggle in this file):

```javascript
// Discovery popout state
const [showDiscovery, setShowDiscovery] = useState(false);
const [discoverySearch, setDiscoverySearch] = useState("");
const discoveryTriggerRef = useRef(null);
```

**Escape key handler for popout** — model on existing `document.addEventListener` + cleanup pattern used at lines 932–933, 1390–1394:

```javascript
// Add after showDiscovery state declarations
useEffect(() => {
  if (!showDiscovery) return;
  const onKey = (e) => {
    if (e.key === "Escape") {
      if (discoverySearch) {
        // First Escape clears search (per UI-SPEC keyboard nav)
        setDiscoverySearch("");
      } else {
        // Second Escape (or Escape on empty search) closes popout
        setShowDiscovery(false);
        discoveryTriggerRef.current?.focus();
      }
    }
  };
  document.addEventListener("keydown", onKey);
  return () => document.removeEventListener("keydown", onKey);
}, [showDiscovery, discoverySearch]);
```

---

#### allDiscoveryGroups memoized array — add near renderActionGroups

Model on the existing `useMemo` pattern used throughout this file (e.g., `agentToastMs` at line 1509):

```javascript
// Stable ordered list of all groups for the discovery popout
// Order: Account, Transaction, Admin, Testing, Learn & Explore (per UI-SPEC line 219)
const allDiscoveryGroups = useMemo(() => [
  { key: "account",      label: "Account",         chips: ACTION_GROUPS.account    },
  { key: "transaction",  label: "Transaction",      chips: ACTION_GROUPS.transaction },
  { key: "admin",        label: "Admin",            chips: ACTION_GROUPS.admin      },
  { key: "testing",      label: "Testing",          chips: ACTION_GROUPS.testing    },
  {
    key: "learn",
    label: "Learn & Explore",
    chips: EDUCATION_COMMANDS,
    isEducation: true,
  },
], []);

// Filtered by discoverySearch (live, case-insensitive substring)
const filteredDiscoveryGroups = useMemo(() => {
  const q = discoverySearch.trim().toLowerCase();
  if (!q) return allDiscoveryGroups;
  return allDiscoveryGroups
    .map((group) => ({
      ...group,
      chips: group.chips.filter((c) =>
        c.label.toLowerCase().includes(q)
      ),
    }))
    .filter((g) => g.chips.length > 0);
}, [discoverySearch, allDiscoveryGroups]);
```

---

#### renderActionGroups — extended version (replaces lines 1418–1464)

The existing function body is the pattern. Extension adds `ba-chips-toolbar`, `ba-group-count`, and wraps return in `<>...</>`:

```jsx
const renderActionGroups = () => {
  let groupsToRender = { ...ACTION_GROUPS };
  if (isConfigEmbeddedFocus) {
    groupsToRender = { admin: ACTION_GROUPS.admin || [] };
  }

  return (
    <>
      {/* Collapse-all / Expand-all toolbar — above first group */}
      <div className="ba-chips-toolbar">
        <button
          type="button"
          className="ba-collapse-all-btn"
          onClick={anyExpanded ? collapseAllGroups : expandAllGroups}
        >
          {anyExpanded ? "Collapse all" : "Expand all"}
        </button>
      </div>

      {Object.entries(groupsToRender).map(([groupName, actions]) => {
        const isExpanded = !!chipGroupsState[groupName];
        const capitalizedName =
          groupName.charAt(0).toUpperCase() + groupName.slice(1);
        return (
          <div
            key={groupName}
            className={"ba-action-group ba-action-group--" + groupName}
          >
            <button
              className="ba-group-header"
              onClick={() => toggleGroupExpanded(groupName)}
              type="button"
              title={
                (isExpanded ? "Collapse" : "Expand") +
                " " +
                capitalizedName +
                " actions"
              }
            >
              <span className="ba-group-name">{capitalizedName}</span>
              {/* Count badge — new for phase 231 */}
              <span className="ba-group-count">({actions.length})</span>
              <span
                className={
                  "ba-group-toggle " + (isExpanded ? "expanded" : "collapsed")
                }
              >
                {isExpanded ? "▼" : "▶"}
              </span>
            </button>
            <div
              className={"ba-group-content " + (isExpanded ? "" : "collapsed")}
            >
              {actions.map((action) => renderChip(action, groupName))}
            </div>
          </div>
        );
      })}
    </>
  );
};
```

Note: returning `<>...</>` instead of bare `Object.entries(...).map(...)` is a safe change — React renders fragments fine in `{isLoggedIn && renderActionGroups()}` at line 5558.

---

#### Left-rail render surgery — authenticated section (around lines 5556–5584)

**Remove** the entire `showLearnMore` block (lines 5564–5584):

```jsx
// DELETE these lines:
<button type="button" className="ba-action-item ba-learn-more-toggle"
  onClick={() => setShowLearnMore((v) => !v)} disabled={consentBlocked}>
  {showLearnMore ? "▴" : "▾"} Learn more
</button>
{showLearnMore && EDUCATION_COMMANDS.map((cmd) => ( ... ))}
```

**Replace** with the "All actions" trigger button (position: after `renderActionGroups()` and the dividers, before the auth buttons):

```jsx
{isLoggedIn && renderActionGroups()}

<div className="ba-left-divider" />

{/* "All actions" discovery popout trigger */}
{isLoggedIn && (
  <button
    ref={discoveryTriggerRef}
    type="button"
    className={"ba-all-actions-btn" + (showDiscovery ? " active" : "")}
    onClick={() => setShowDiscovery((v) => !v)}
    disabled={consentBlocked}
    aria-expanded={showDiscovery}
    aria-haspopup="dialog"
  >
    ⊞ All actions
  </button>
)}
```

---

#### Discovery popout JSX — render inside `.ba-body` wrapper (position: sibling to `.ba-left-col`)

Model the conditional block structure on the existing `{showCommands && ...}` block at lines 5880–5904 (which is being deleted). The new popout renders as a sibling of `.ba-left-col` inside `.ba-body`, using `position: absolute` anchored to a `position: relative` parent.

```jsx
{/* Discovery popout — "All actions" overlay */}
{isLoggedIn && (
  <div
    role="dialog"
    aria-modal="true"
    aria-label="Action browser"
    className={
      "ba-discovery-popout" + (showDiscovery ? " ba-discovery-popout--open" : "")
    }
  >
    {/* Header */}
    <div className="ba-discovery-header">
      <span>⊞ All actions</span>
      <button
        type="button"
        className="ba-discovery-close"
        onClick={() => {
          setShowDiscovery(false);
          setDiscoverySearch("");
          discoveryTriggerRef.current?.focus();
        }}
        aria-label="Close action browser"
      >
        ✕
      </button>
    </div>

    {/* Search */}
    <input
      className="ba-discovery-search"
      type="text"
      placeholder="Search actions…"
      value={discoverySearch}
      onChange={(e) => setDiscoverySearch(e.target.value)}
      aria-label="Search actions"
      data-role="popout-search"
    />

    {/* Body */}
    <div className="ba-discovery-body">
      {filteredDiscoveryGroups.length === 0 ? (
        <div className="ba-discovery-empty">
          <div className="ba-discovery-empty-heading">No matching actions</div>
          <div>Try a different search term, or clear the search to see all actions.</div>
        </div>
      ) : (
        filteredDiscoveryGroups.map((group) => (
          <React.Fragment key={group.key}>
            <div
              className="ba-commands-section"
              role="heading"
              aria-level="3"
            >
              {group.label}
            </div>
            <div className="ba-chips">
              {group.chips.map((chip) => (
                <button
                  key={chip.id}
                  type="button"
                  className={"ba-chip" + (group.isEducation ? " ba-chip--learn" : "")}
                  onClick={() => {
                    if (group.isEducation) {
                      openEducationCommand(chip);
                    } else {
                      handleActionClick(chip.id);
                    }
                    setShowDiscovery(false);
                    setDiscoverySearch("");
                  }}
                  disabled={consentBlocked}
                >
                  {chip.label}
                </button>
              ))}
            </div>
          </React.Fragment>
        ))
      )}
    </div>
  </div>
)}
```

---

#### `showCommands` removal checklist — all 4 callsites (per RESEARCH.md Pitfall 4)

Search for `showCommands` in BankingAgent.js and remove/replace each:
1. Line 1224: `const [showCommands, setShowCommands] = useState(false);` — DELETE
2. Lines 5880–5904: `{showCommands && isLoggedIn && ...ba-commands-popup...}` — DELETE entire block
3. Line 5929: `className={\`ba-cmd-btn\${showCommands ? " active" : ""}\`}` — DELETE entire `⚡` button (lines ~5927–5936)
4. Line 5945: `setShowCommands(false)` in `onKeyDown` Enter handler — DELETE that call
5. Line 5964: `setShowCommands(false)` in send button `onClick` — DELETE that call

---

### `banking_api_ui/src/components/BankingAgent.css` (config/style)

**Analog:** `BankingAgent.css` — all new classes follow the exact CSS variable + pattern conventions established in the file.

**Append location:** After line 3716 (end of file), in a new section block.

**Key existing patterns to mirror:**

- `.ba-group-header` (lines 3480–3495): `display: flex; align-items: center; gap; background: transparent; border: none; cursor: pointer; color: var(--ba-chip-txt); font-size: 11px; font-weight: 600; transition: all 0.15s ease`
- `.ba-cmd-btn.active` (lines 1354–1358): `background: var(--ba-accent-h); color: #fff; border-color: var(--ba-accent-h)` — "All actions" active state matches this
- `.ba-commands-popup` (lines 1267–1277): `background: var(--ba-surface); border-top: 1px solid var(--ba-border)` — popout background uses same tokens
- `.ba-group-content` (lines 3538–3549): `max-height: 500px; transition: max-height 0.25s ease, opacity 0.25s ease` — popout open/close transition mirrors this approach

**Positioned ancestor requirement (Pitfall 3 from RESEARCH.md):**

`.ba-body` at line 158 has no `position` declaration (defaults to `static`). The popout uses `position: absolute; bottom: 0; left: 0`. Add `position: relative` to `.ba-body`:

```css
/* BankingAgent.css line 158 — ADD position: relative */
.ba-body {
  position: relative;   /* ← ADD: establishes stacking context for .ba-discovery-popout */
  display: flex;
  flex-wrap: wrap;
  flex: 1 1 0%;
  overflow: hidden;
  min-height: 0;
  align-items: stretch;
  align-content: stretch;
}
```

**All 11 new classes to append (verbatim from 231-RESEARCH.md lines 337–506, authoritative source):**

```css
/* ─── Phase 231: chip toolbar + count badge ──────────────────────────── */

.ba-chips-toolbar {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 4px;
}

.ba-collapse-all-btn {
  font-size: 10px;
  font-weight: 600;
  padding: 4px 8px;
  border-radius: 6px;
  border: 1px solid var(--ba-border);
  background: transparent;
  color: var(--ba-muted);
  cursor: pointer;
}
.ba-collapse-all-btn:hover {
  background: rgba(65, 105, 225, 0.1);
}
.ba-collapse-all-btn:focus-visible {
  outline: 2px solid var(--ba-chip-bd);
  outline-offset: 2px;
}

.ba-group-count {
  font-size: 10px;
  font-weight: 600;
  padding: 4px 8px;
  border-radius: 999px;
  background: rgba(65, 105, 225, 0.18);
  border: 1px solid var(--ba-chip-bd);
  color: var(--ba-muted);
  flex-shrink: 0;
}

/* ─── Phase 231: "All actions" trigger button ─────────────────────────── */

.ba-all-actions-btn {
  display: block;
  width: 100%;
  font-size: 11px;
  font-weight: 600;
  padding: 6px 10px;
  border-radius: 8px;
  border: 1px solid var(--ba-chip-bd);
  background: transparent;
  color: var(--ba-chip-txt);
  cursor: pointer;
  text-align: center;
  transition: background 0.15s, border-color 0.15s, color 0.15s;
}
.ba-all-actions-btn:hover {
  border-color: #7c9cf5;
  background: rgba(65, 105, 225, 0.12);
  color: #e8eefc;
}
.ba-all-actions-btn.active {
  background: var(--ba-accent);
  border-color: var(--ba-accent);
  color: #fff;
}
.ba-all-actions-btn:focus-visible {
  outline: 2px solid var(--ba-chip-bd);
  outline-offset: 2px;
}

/* ─── Phase 231: discovery popout overlay ─────────────────────────────── */

.ba-discovery-popout {
  position: absolute;
  bottom: 0;
  left: 0;
  width: 320px;
  max-height: calc(100% - 40px);
  overflow-y: auto;
  background: var(--ba-surface);
  border: 1px solid var(--ba-border);
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(10, 20, 50, 0.45);
  z-index: 10;
  opacity: 0;
  transform: translateY(8px);
  pointer-events: none;
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.ba-discovery-popout--open {
  opacity: 1;
  transform: translateY(0);
  pointer-events: auto;
}
.banking-agent-panel.ba-mode-inline .ba-discovery-popout {
  width: 100%;
  height: 100%;
  max-height: none;
  border-radius: 0;
  box-shadow: none;
  inset: 0;
}

.ba-discovery-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px 8px;
  border-bottom: 1px solid var(--ba-border);
  font-size: 13px;
  font-weight: 600;
  color: var(--ba-text);
}

.ba-discovery-close {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  border: none;
  background: transparent;
  color: var(--ba-muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
}
.ba-discovery-close:hover {
  background: rgba(65, 105, 225, 0.12);
  color: var(--ba-text);
}
.ba-discovery-close:focus-visible {
  outline: 2px solid var(--ba-chip-bd);
  outline-offset: 2px;
}

.ba-discovery-search {
  display: block;
  box-sizing: border-box;
  font-size: 12px;
  padding: 8px 12px;
  border-radius: 8px;
  background: var(--ba-bg);
  border: 1px solid rgba(65, 105, 225, 0.45);
  color: var(--ba-text);
  margin: 8px 16px 0;
  width: calc(100% - 32px);
}
.ba-discovery-search:focus {
  outline: none;
  border-color: var(--ba-chip-bd);
}

.ba-discovery-body {
  padding: 4px 0 12px;
}

.ba-discovery-empty {
  padding: 24px 16px;
  text-align: center;
  color: var(--ba-muted);
  font-size: 11px;
}
.ba-discovery-empty-heading {
  font-size: 12px;
  font-weight: 600;
  color: var(--ba-text);
  margin-bottom: 6px;
}
```

**CSS classes NOT to delete** (reused in popout): `.ba-commands-popup`, `.ba-commands-section`, `.ba-chips`, `.ba-chip`, `.ba-chip--learn`, `.ba-cmd-btn`.

---

### `banking_api_server/services/nlIntentParser.js` (service, request-response)

**Analog:** `nlIntentParser.js` itself — `parseEducation()` function (lines 33–135).

**Pattern to copy:** Every existing `if (/regex/.test(t)) { return { kind: "education", education: { panel: EDU.CONSTANT, tab: "tab" } }; }` block.

#### EDU constants object (lines 7–20) — extend with new entries

The existing partial `EDU` object only has 12 constants. Add missing ones before the first `parseEducation` `if` block:

```javascript
const EDU = {
  // existing (lines 7–20 — keep as-is)
  LOGIN_FLOW: "login-flow",
  TOKEN_EXCHANGE: "token-exchange",
  MAY_ACT: "may-act",
  MCP_PROTOCOL: "mcp-protocol",
  INTROSPECTION: "introspection",
  AGENT_GATEWAY: "agent-gateway",
  RFC_INDEX: "rfc-index",
  STEP_UP: "step-up",
  PINGONE_AUTHORIZE: "pingone-authorize",
  CIMD: "cimd",
  CUA: "cua",
  HUMAN_IN_LOOP: "human-in-loop",
  // new additions for phase 231 — values must match client-side educationIds.js
  TOKEN_CHAIN: "token-chain",
  BEST_PRACTICES: "best-practices",
  PAR: "par",
  RAR: "rar",
  JWT_CLIENT_AUTH: "jwt-client-auth",
  AGENTIC_MATURITY: "agentic-maturity",
  AGENT_BUILDER_LANDSCAPE: "agent-builder-landscape",
  LLM_LANDSCAPE: "llm-landscape",
  AI_PLATFORM_LANDSCAPE: "ai-platform-landscape",
  SENSITIVE_DATA: "sensitive-data",
  PINGGATEWAY_MCP: "pinggateway-mcp",
  ARCHITECTURE_DIAGRAM: "architecture-diagram",
  IETF_STANDARDS: "ietf-standards",
  AI_PRIMER: "ai-primer",
  ID_JAG: "id-jag",
};
```

**CRITICAL:** Verify each string value against `banking_api_ui/src/components/education/educationIds.js` before committing. The `EDU` values on the BFF must match the client-side `EDU` constants exactly (the BFF returns them in the response and the client routes on them). See RESEARCH.md Open Question 2 / Assumption A2.

#### parseEducation() — new `if` blocks to add (after line 134, before `return null`)

Follow the exact pattern of lines 33–134. Each block is an independent `if`:

```javascript
// Token Chain (covers "Token Chain", "Token Chain: JWT Claims", "Token Chain: Exchange Paths")
if (/\b(token[- ]chain)\b/.test(t)) {
  return { kind: "education", education: { panel: EDU.TOKEN_CHAIN, tab: "overview" } };
}
// AI Best Practices
if (/\b(best[- ]practices|ai[- ]agent[- ]best)\b/.test(t)) {
  return { kind: "education", education: { panel: EDU.BEST_PRACTICES, tab: "overview" } };
}
// Agentic Maturity Model
if (/\b(agentic[- ]maturity|maturity[- ]model)\b/.test(t)) {
  return { kind: "education", education: { panel: EDU.AGENTIC_MATURITY, tab: "overview" } };
}
// PAR — Pushed Authorization Requests
if (/\b(par\b|rfc[- ]?9126|pushed[- ]authorization)\b/.test(t)) {
  return { kind: "education", education: { panel: EDU.PAR, tab: "what" } };
}
// RAR — Rich Authorization Requests
if (/\b(rar\b|rfc[- ]?9396|rich[- ]authorization|selective[- ]disclosure)\b/.test(t)) {
  return { kind: "education", education: { panel: EDU.RAR, tab: "what" } };
}
// JWT Client Authentication (RFC 7523)
if (/\b(jwt[- ]client[- ]auth|rfc[- ]?7523|rfc7523)\b/.test(t)) {
  return { kind: "education", education: { panel: EDU.JWT_CLIENT_AUTH, tab: "what" } };
}
// LLM Landscape / Comparison / How LLMs Work
if (/\b(llm[- ]landscape|llm[- ]comparison|how[- ]llms?[- ]work)\b/.test(t)) {
  return { kind: "education", education: { panel: EDU.LLM_LANDSCAPE, tab: "commercial" } };
}
// Agent Builder Landscape / Comparison
if (/\b(agent[- ]builder|agent[- ]framework[- ]landscape)\b/.test(t)) {
  return { kind: "education", education: { panel: EDU.AGENT_BUILDER_LANDSCAPE, tab: "overview" } };
}
// AI Platform Landscape / Comparison
if (/\b(ai[- ]platform[- ]landscape|ai[- ]platform[- ]comparison)\b/.test(t)) {
  return { kind: "education", education: { panel: EDU.AI_PLATFORM_LANDSCAPE, tab: "overview" } };
}
// Sensitive Data & Selective Disclosure
if (/\b(sensitive[- ]data|selective[- ]disclosure)\b/.test(t)) {
  return { kind: "education", education: { panel: EDU.SENSITIVE_DATA, tab: "overview" } };
}
// PingGateway MCP Security
if (/\b(pinggateway|ping[- ]gateway)\b/.test(t)) {
  return { kind: "education", education: { panel: EDU.PINGGATEWAY_MCP, tab: "overview" } };
}
// Architecture Diagrams (C4, BFF Component)
if (/\b(c4[- ]architecture|architecture[- ]diagram|bff[- ]component)\b/.test(t)) {
  return { kind: "education", education: { panel: EDU.ARCHITECTURE_DIAGRAM, tab: "context" } };
}
// IETF Standards: Agentic Identity (and sub-tabs like RFC7523bis)
if (/\b(ietf[- ]standards|agentic[- ]identity|rfc7523bis)\b/.test(t)) {
  return { kind: "education", education: { panel: EDU.IETF_STANDARDS, tab: "overview" } };
}
// AI Primer
if (/\b(ai[- ]primer)\b/.test(t)) {
  return { kind: "education", education: { panel: EDU.AI_PRIMER, tab: "overview" } };
}
// ID-JAG / Cross-App Access (XAA)
if (/\b(id[- ]jag|cross[- ]app[- ]access|xaa)\b/.test(t)) {
  return { kind: "education", education: { panel: EDU.ID_JAG, tab: "overview" } };
}
// Step-up: deviceAuthentications API
if (/\b(device[- ]authentications?[- ]api|deviceauthentications)\b/.test(t)) {
  return { kind: "education", education: { panel: EDU.STEP_UP, tab: "device" } };
}
// Authorize: policy / AI/MCP security sub-topics
if (/\b(authorize[: ][- ]?(policy|ai.?mcp|mcp[- ]ping))\b/.test(t)) {
  return { kind: "education", education: { panel: EDU.PINGONE_AUTHORIZE, tab: "policy" } };
}
// Agent request flow diagram
if (/\b(agent[- ]request[- ]flow|agent[- ]flow[- ]diagram)\b/.test(t)) {
  return { kind: "education", education: { panel: EDU.ARCHITECTURE_DIAGRAM, tab: "agent-flow" } };
}
```

**Note:** Tab values (`"overview"`, `"what"`, `"context"`, etc.) must be verified against `educationIds.js` and the education panel component tab IDs. The patterns above use best-guess tab names from the RESEARCH.md audit. Read `educationIds.js` fully before finalizing.

---

## Shared Patterns

### CSS custom properties — all new CSS uses these tokens (lines 118–146 of BankingAgent.css)

**Source:** `banking_api_ui/src/components/BankingAgent.css` lines 118–146
**Apply to:** Every new CSS class in this phase

```css
/* On .banking-agent-panel — all new classes must use these, not raw hex values */
--ba-bg: #152a52;
--ba-surface: #1a3a6e;
--ba-border: rgba(65, 105, 225, 0.35);
--ba-text: #e8eefc;
--ba-muted: #9db4e8;
--ba-chip-bg: rgba(65, 105, 225, 0.18);
--ba-chip-bd: #5b7ef0;
--ba-chip-txt: #c7d7ff;
--ba-accent: #b91c1c;
--ba-accent-h: #991b1b;
```

Exception: `.ba-discovery-search` uses `rgba(65, 105, 225, 0.45)` as a raw value because `--ba-input-bd` (used elsewhere) maps to the same value — either approach is correct.

### Boolean toggle state pattern — used by every modal/popup in BankingAgent.js

**Source:** `banking_api_ui/src/components/BankingAgent.js` line 1224
**Apply to:** `showDiscovery` state

```javascript
// Pattern: const [show*, set*] = useState(false);
// Toggle: set*(v => !v)
// Conditional render: {show* && <Component />}
// Active class: className={`ba-btn${show* ? " active" : ""}`}
```

### Document event listener + cleanup pattern — used for keyboard handling

**Source:** `banking_api_ui/src/components/BankingAgent.js` lines 1388–1394
**Apply to:** `showDiscovery` Escape key handler

```javascript
// Pattern: useEffect with document.addEventListener + cleanup return
document.addEventListener("mousemove", handleMouseMove);
document.addEventListener("mouseup", handleMouseUp);
// cleanup:
return () => {
  document.removeEventListener("mousemove", handleMouseMove);
  document.removeEventListener("mouseup", handleMouseUp);
};
```

### nlIntentParser `if`/regex pattern — every education routing entry

**Source:** `banking_api_server/services/nlIntentParser.js` lines 33–135
**Apply to:** All 17+ new `parseEducation()` blocks

```javascript
// Pattern: single if per topic, regex with \b word-boundary anchors, case already normalized by norm()
if (/\b(keyword1|keyword2|rfc[- ]?NNNN)\b/.test(t)) {
  return { kind: "education", education: { panel: EDU.CONSTANT, tab: "tab-name" } };
}
```

---

## No Analog Found

All three files are self-contained extensions. No file in this phase is a net-new type without prior art in the codebase.

---

## Structural Notes for Planner

### Wave 0: Test file (gap — no existing test file)

`banking_api_ui/src/__tests__/BankingAgent.chips.test.js` must be created. Use existing CRA Jest + React Testing Library setup (no config file needed). Model on any existing `*.test.js` in `banking_api_ui/src/__tests__/` if any exist; otherwise the CRA default pattern is `render(<Component />) + screen.getBy*`.

### Wave ordering recommended by RESEARCH.md

1. **Wave 1 — CSS:** Add `position: relative` to `.ba-body`; append 11 new classes. Verify build exits 0.
2. **Wave 2 — JSX surgery:** Remove `showLearnMore`/`showCommands`/`⚡` button. Verify build exits 0.
3. **Wave 3 — JSX additions:** `anyExpanded`, `collapseAllGroups`, `expandAllGroups`, count badge in `renderActionGroups`, `showDiscovery` state, popout JSX. Verify build exits 0.
4. **Wave 4 — BFF heuristics:** Extend `EDU` constants + add `parseEducation()` patterns in `nlIntentParser.js`.
5. **Wave 5 — Tests:** Write `BankingAgent.chips.test.js`.

### chipGroupsState default object must include `testing: false`

The existing default at line 1309 only has `account`, `transaction`, `admin`. Add `testing: false` to the default object. Also add it to the localStorage merge fallback so existing stored state (missing `testing`) still works:

```javascript
return {
  account: true,
  transaction: false,
  admin: false,
  testing: false,  // add this
};
```

---

## Metadata

**Analog search scope:** `banking_api_ui/src/components/`, `banking_api_server/services/`
**Files scanned:** 3 primary files fully read
**Pattern extraction date:** 2026-04-25
