# Phase 231: Agent Chip Groups — Collapsible Sections + Discovery Popout — Research

**Researched:** 2026-04-25
**Domain:** React UI component surgery — BankingAgent left-rail chip redesign + NL heuristic completeness
**Confidence:** HIGH

---

## Summary

Phase 231 is a focused UI refactor of the BankingAgent left rail. The four changes are tightly coupled and ship together: remove the inline Learn & Explore section (JSX deletion only), ensure every chip label has a matching heuristic pattern in `nlIntentParser.js`, add count badges and a collapse-all control to the existing `ba-action-group` pattern, and introduce a new discovery popout ("All actions") replacing the `⚡` / `.ba-commands-popup` flow.

The codebase already has the full collapsible infrastructure: `chipGroupsState` (localStorage-persisted), `toggleGroupExpanded`, `renderActionGroups`, `renderChip`, and the CSS transitions on `.ba-group-content`. This phase extends what is there — it does not rebuild it.

The LangGraph heuristic lives in `banking_api_server/services/nlIntentParser.js` and already covers all `ACTION_GROUPS` entries via `parseBanking()`. The gap is that `EDUCATION_COMMANDS` entries with labels that don't match the existing `parseEducation()` keyword patterns will fall through to LLM. The phase requires a systematic audit of all 61 `EDUCATION_COMMANDS` labels against `parseEducation()` and adding regex entries for any that are missed.

The discovery popout is pure React state (`showDiscovery` boolean) + CSS overlay — no portals, no libraries, no async. It is anchored inside `.banking-agent-panel` so `position: absolute` works cleanly relative to the panel's own stacking context.

**Primary recommendation:** Three discrete tasks: (1) UI surgery — remove `showLearnMore`/`showCommands`/`⚡` JSX; (2) left-rail enhancements — `ba-chips-toolbar`, `ba-group-count`, `ba-all-actions-btn`; (3) discovery popout + heuristic audit.

---

## Project Constraints (from CLAUDE.md)

- After any `banking_api_ui` edit: `npm run build` in `banking_api_ui/` must exit **0**.
- Minimal diff — name the component/element; do not refactor unrelated code.
- Read `REGRESSION_PLAN.md` §1 before editing listed files; state what will not break.
- Bug fixes get an entry in `REGRESSION_PLAN.md` §4.
- Do not edit marketing-only pages unless the task explicitly says so.
- Tokens stay server-side; respect RFC 8693 / agent `on_behalf` patterns.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Remove inline Learn & Explore | Browser / Client | — | JSX-only deletion in BankingAgent.js |
| Collapsible groups + collapse-all button | Browser / Client | — | Extends existing chipGroupsState pattern |
| Count badge per group | Browser / Client | — | Derived from `ACTION_GROUPS[group].length`, no server call |
| Discovery popout UI | Browser / Client | — | Pure React state + CSS overlay inside panel |
| NL heuristic completeness | API / Backend | — | `nlIntentParser.js` on the BFF; no client change needed |

---

## Standard Stack

### Core (already in use — no new installs)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | 18.x (CRA) | Component rendering, useState, useCallback | Existing project stack [VERIFIED: codebase scan] |
| Plain CSS custom properties | — | Design tokens on `.banking-agent-panel` | Existing project convention — no Tailwind, no shadcn [VERIFIED: BankingAgent.css scan] |
| localStorage | browser API | Persist `ba_chip_groups_state` | Already used for group state [VERIFIED: BankingAgent.js line 1301] |

### No new dependencies required

The entire phase is custom CSS + plain React. The UI-SPEC.md explicitly confirms `shadcn_initialized: false` and `preset: none`. [VERIFIED: 231-UI-SPEC.md]

---

## Architecture Patterns

### System Architecture Diagram

```
User click on chip
       │
       ▼
BankingAgent.js — handleActionClick / openEducationCommand
       │
       ├── ACTION_GROUPS chip → handleActionClick(action.id) → runAction / NL submit
       │
       └── EDUCATION chip (popout only) → openEducationCommand(cmd)
                                               │
                                               ▼
                                    EducationUIContext.open(panel, tab)

User types in NL input
       │
       ▼
BankingAgent.js — handleNaturalLanguage
       │
       ▼
banking_api_server — POST /api/agent/message
       │
       ▼
bankingAgentLangGraphService.js — parseHeuristic(message)
       │
       ├── parseBanking(t) — matches ACTION_GROUPS labels
       ├── parseEducation(t) — matches EDUCATION_COMMANDS labels
       └── kind:'none' → LangGraph LLM fallback (should never happen for chip labels)
```

### Recommended Project Structure

No new files or directories. All changes to:

```
banking_api_ui/src/components/
├── BankingAgent.js       — JSX surgery + new state + popout render
└── BankingAgent.css      — 11 new CSS classes appended at end

banking_api_server/services/
└── nlIntentParser.js     — parseEducation() additions for missing EDUCATION_COMMANDS labels
```

### Pattern 1: Extending chipGroupsState for collapse-all

**What:** Add a derived computation (`anyExpanded`) and a `collapseAll` / `expandAll` handler alongside the existing `toggleGroupExpanded` pattern.

**When to use:** When a collapse-all button needs to reflect the combined state of multiple independent group states.

```javascript
// Source: existing BankingAgent.js pattern extended
const anyExpanded = Object.values(chipGroupsState).some(Boolean);

const collapseAllGroups = () => {
  setChipGroupsState(
    Object.fromEntries(Object.keys(ACTION_GROUPS).map((k) => [k, false]))
  );
};

const expandAllGroups = () => {
  setChipGroupsState(
    Object.fromEntries(Object.keys(ACTION_GROUPS).map((k) => [k, true]))
  );
};
```

Note: `chipGroupsState` currently only stores `account`, `transaction`, `admin` — the `testing` group was added to `ACTION_GROUPS` but was not present in the default state object. The collapse-all handler must enumerate `Object.keys(ACTION_GROUPS)` (not a hardcoded list) so it covers all four groups including `testing`. The localStorage init also needs a fallback for `testing: false` when loading old stored state. [VERIFIED: BankingAgent.js lines 1299–1313 + ACTION_GROUPS definition lines 104–158]

### Pattern 2: Group count badge in JSX

**What:** A `<span className="ba-group-count">` rendered between `.ba-group-name` and `.ba-group-toggle` inside each `.ba-group-header`.

**When to use:** Every `renderActionGroups` iteration.

```jsx
// Source: extended from existing renderActionGroups in BankingAgent.js
<button className="ba-group-header" onClick={() => toggleGroupExpanded(groupName)}>
  <span className="ba-group-name">{capitalizedName}</span>
  <span className="ba-group-count">({actions.length})</span>
  <span className={"ba-group-toggle " + (isExpanded ? "expanded" : "collapsed")}>
    {isExpanded ? "▼" : "▶"}
  </span>
</button>
```

### Pattern 3: Discovery popout state

**What:** Single `showDiscovery` boolean + `discoverySearch` string, both plain `useState`. No portal — the popout renders inside `.ba-left-col`'s parent (`.ba-body` or `.banking-agent-panel`) using `position: absolute`.

**When to use:** Triggered by the "All actions" button. Closed by clicking `✕`, pressing `Escape`, or clicking outside.

```javascript
const [showDiscovery, setShowDiscovery] = useState(false);
const [discoverySearch, setDiscoverySearch] = useState("");
const discoveryTriggerRef = useRef(null);

// Close on Escape
useEffect(() => {
  if (!showDiscovery) return;
  const onKey = (e) => {
    if (e.key === "Escape") {
      setShowDiscovery(false);
      setDiscoverySearch("");
      discoveryTriggerRef.current?.focus();
    }
  };
  document.addEventListener("keydown", onKey);
  return () => document.removeEventListener("keydown", onKey);
}, [showDiscovery]);
```

The `Escape` key behavior from the UI-SPEC: if search has text, `Escape` clears it; if search is already empty, `Escape` closes the popout. This requires the `keydown` handler to check `discoverySearch` before deciding to close. [VERIFIED: 231-UI-SPEC.md Keyboard navigation section]

### Pattern 4: Popout search filter

**What:** Live case-insensitive substring filter on chip label. Groups with zero matching chips hide their section header.

```javascript
const filteredGroups = useMemo(() => {
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

Where `allDiscoveryGroups` is a stable memoized array built from `ACTION_GROUPS` + `EDUCATION_COMMANDS`, in display order: Account, Transaction, Admin, Testing, Learn & Explore. [VERIFIED: UI-SPEC line 219]

### Anti-Patterns to Avoid

- **Removing CSS classes referenced by other components:** `.ba-commands-popup`, `.ba-chips`, `.ba-chip`, `.ba-chip--learn`, `.ba-cmd-btn` are reused in the popout — do not delete them from BankingAgent.css even after deleting the `⚡` button JSX. [VERIFIED: UI-SPEC CSS class inventory]
- **`overflow: visible` on any wrapper inside `.ba-left-col`:** The popout must not escape the scroll container as `overflow: visible`. Use `position: absolute` on `.ba-discovery-popout` relative to a `position: relative` parent. [VERIFIED: UI-SPEC Layout Constraints]
- **Hardcoding group names in collapse-all:** Use `Object.keys(ACTION_GROUPS)` to keep it in sync automatically.
- **Portal for the popout:** Do not use `createPortal` — the popout is anchored to the panel, not the document body. The panel already has its own `z-index` stacking context. [VERIFIED: UI-SPEC positioning spec]

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Fuzzy search / ranked search | Custom scoring | Simple `str.includes(q)` substring match | UI-SPEC specifies "case-insensitive substring match" — no ranking needed for 60–70 short labels |
| Focus trap inside modal | Custom DOM walker | `Tab` / `Shift+Tab` natural DOM order (chips are naturally focusable buttons) | WCAG A compliance is met by DOM order; spec says arrow keys are optional |
| Animation library | Framer Motion / CSS-in-JS | Existing `max-height` + `opacity` transition on `.ba-group-content` | Project uses plain CSS transitions throughout; reuse the pattern |
| Chip click handler in popout | Duplicate handler | Reuse `handleActionClick(action.id)` for ACTION_GROUPS chips and `openEducationCommand(cmd)` for EDUCATION_COMMANDS chips | Both handlers already exist on the BankingAgent component |

---

## Runtime State Inventory

Step 2.5: SKIPPED — this is a UI refactor phase, not a rename/migration phase. No stored data, service config, OS registrations, secrets, or build artifacts carry state that needs migrating.

---

## Environment Availability

Step 2.6: No new external tools or services required. All changes are to existing React + Node.js files in the repo.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js / npm | `npm run build` verification | ✓ | existing | — |
| React (CRA) | BankingAgent.js | ✓ | existing | — |

---

## Common Pitfalls

### Pitfall 1: `testing` group missing from chipGroupsState defaults

**What goes wrong:** The `testing` group was added to `ACTION_GROUPS` after the initial `chipGroupsState` default object was written. The default only includes `account`, `transaction`, `admin`. If the collapse-all handler iterates the stored state instead of `Object.keys(ACTION_GROUPS)`, `testing` chips will be uncollapsible.

**Why it happens:** Stale default state in `useState` initializer; stored localStorage state from before `testing` was added.

**How to avoid:** Always enumerate groups as `Object.keys(ACTION_GROUPS)` in the collapse-all handler. In the state initializer, merge stored state with a fresh default that includes all four groups: `{ account: true, transaction: false, admin: false, testing: false }`.

**Warning signs:** The `testing` group header does not respond to "Collapse all". [VERIFIED: BankingAgent.js lines 1299–1313 vs ACTION_GROUPS]

### Pitfall 2: `⚡` button removal breaks the NL input row layout

**What goes wrong:** `.ba-input-row` is a flex row: `[⚡ button][input][send button]`. Removing the `⚡` `.ba-cmd-btn` without adjusting the row is safe (the input will expand to fill). However, if any CSS rule targets `.ba-input-row .ba-cmd-btn + .ba-input` (sibling selector), the layout may break.

**How to avoid:** After removing the `⚡` button JSX, verify the input row in build output. Check for sibling-selector rules in BankingAgent.css. [VERIFIED: BankingAgent.css `.ba-input-row` at line 1331]

### Pitfall 3: Popout `position: absolute` has no positioned ancestor

**What goes wrong:** If the popout's parent element does not have `position: relative` (or another non-static position), `position: absolute` will escape to the nearest positioned ancestor further up — possibly the document body — causing layout displacement.

**How to avoid:** Ensure the direct parent of `.ba-discovery-popout` (the left-rail column or panel body wrapper) has `position: relative` set explicitly. Check BankingAgent.css existing rules for the chosen parent. [ASSUMED — need to verify which element wraps `.ba-left-col` and whether it already has `position: relative`]

### Pitfall 4: `showCommands` state variable still referenced after `⚡` button removal

**What goes wrong:** `showCommands` is used in four JSX locations: the `.ba-commands-popup` conditional, the `ba-cmd-btn` active class, `setShowCommands` in the `Enter` key handler for NL input, and `setShowCommands(false)` in some chip `onClick`s. Removing the `⚡` button without removing all four references causes dead state.

**How to avoid:** Search for `showCommands` (7 occurrences per grep) and remove or replace all of them. Also remove the `useState` declaration at line 1224. [VERIFIED: BankingAgent.js grep results]

### Pitfall 5: `parseEducation()` coverage gaps for EDUCATION_COMMANDS labels

**What goes wrong:** Several `EDUCATION_COMMANDS` labels contain terms that do not appear in any `parseEducation()` regex. When a user clicks one of these chips (which submits the label as a chat message), `parseHeuristic` returns `kind: 'none'` and the LangGraph LLM is invoked — incurring latency/cost and potentially returning a wrong response.

**Specific gaps identified** [VERIFIED: nlIntentParser.js full scan vs educationCommands.js]:

| EDUCATION_COMMANDS label | Current coverage status |
|--------------------------|------------------------|
| `"PKCE deep dive"` | Covered — `\b(pkce\|code verifier\|code challenge)\b` |
| `"OAuth: Authorization Code + PKCE"` | Covered — `\b(login flow\|authorization code\|sign in flow\|oauth flow)\b` |
| `"OAuth: CIBA (backchannel)"` | Covered — `\b(ciba\|backchannel\|...)\b` |
| `"OAuth: Token exchange (RFC 8693)"` | Covered — `\b(token exchange\|rfc 8693\|...)\b` |
| `"may_act / act claims"` | Covered — `\b(may_act\|may act\|act claim\|...)\b` |
| `"MCP protocol"` | Covered — `\b(mcp\|model context\|...)\b` |
| `"MCP server discovery"` | Covered — `\b(mcp\|...)\b` (broad match) |
| `"MCP: MFA gate on tool discovery"` | Partially — `\b(mcp\|...)\b` but "MFA gate" may not resolve correctly |
| `"Token introspection (RFC 7662)"` | Covered — `\b(introspect\|7662\|rfc 7662)\b` |
| `"Agent Gateway (8707 / 9728)"` | Covered — `\b(agent gateway\|resource indicator\|8707\|9728\|rfc 8707)\b` |
| `"RFC & spec index"` | Covered — `\b(rfc\|spec index\|standards)\b` |
| `"Step-up MFA"` | Covered — `\b(step[-]?up\|mfa threshold\|acr)\b` |
| `"Step-up: deviceAuthentications API"` | NOT COVERED — "deviceAuthentications" not in any regex |
| `"PingOne Authorize"` | Covered — `\b(pingone authorize\|...)\b` |
| `"Authorize: policy & AI/MCP security"` | NOT COVERED — no pattern for "Authorize: policy" or "AI/MCP security" |
| `"Authorize: MCP PingOne & env"` | NOT COVERED — no pattern for "Authorize: MCP" sub-topic |
| `"OAuth: Client ID Metadata Doc (CIMD)"` | Covered — `\b(cimd\|client.?id.?metadata\|...)\b` |
| `"Computer Use Agent (CUA)"` | Covered — `\b(cua\|computer use agent\|...)\b` |
| `"Human-in-the-loop (agent)"` | Covered — `\b(human[- ]in[- ]the[- ]loop\|hitl\|...)\b` |
| `"⭐ AI Agent Best Practices"` | NOT COVERED — no regex for "best practices" or "ai agent best practices" |
| `"PAR (RFC 9126)"` | NOT COVERED — no regex for "par" or "rfc 9126" |
| `"RAR (RFC 9396)"` | NOT COVERED — no regex for "rar" or "rfc 9396" |
| `"JWT client auth (RFC 7523)"` | NOT COVERED — no regex for "jwt client auth" or "rfc 7523" |
| `"⭐ Agentic Maturity Model"` | NOT COVERED — no regex for "agentic maturity" |
| `"🔗 LangChain — LCEL + multi-provider"` | Covered — `\b(langchain\|lang chain\|lcel\|...)\b` |
| `"🤖 Agent Builder Landscape"` | NOT COVERED — no regex for "agent builder" |
| `"📊 Agent Builder Comparison"` | NOT COVERED — no regex for "agent builder comparison" |
| `"🧠 LLM Landscape"` | NOT COVERED — no regex for "llm landscape" |
| `"⚙️ How LLMs Work"` | NOT COVERED — no regex for "how llms work" |
| `"📊 LLM Comparison"` | NOT COVERED — no regex for "llm comparison" |
| `"🌐 AI Platform Landscape"` | NOT COVERED — no regex for "ai platform landscape" |
| `"📊 AI Platform Comparison"` | NOT COVERED — no regex for "ai platform comparison" |
| `"🔒 Sensitive Data & Selective Disclosure"` | NOT COVERED — no regex for "sensitive data" or "selective disclosure" |
| `"🔒 Selective Disclosure: RAR / RFC 9396"` | NOT COVERED |
| `"🛡️ PingGateway MCP Security"` | NOT COVERED — no regex for "pinggateway" |
| `"🛡️ Custom vs PingGateway"` | NOT COVERED |
| `"🏗️ C4 Architecture Diagram"` | NOT COVERED — no regex for "c4 architecture" or "architecture diagram" |
| `"🏗️ BFF Component Diagram"` | NOT COVERED — no regex for "bff component" |
| `"🔗 Token Chain"` | NOT COVERED — no regex for "token chain" |
| `"🔗 Token Chain: JWT Claims"` | NOT COVERED |
| `"🔗 Token Chain: Exchange Paths"` | NOT COVERED |
| `"🔀 Agent request flow"` | Partial — no exact pattern; `flowDiagram: true` dispatch handled differently |
| `"⭐ IETF Standards: Agentic Identity"` | NOT COVERED — no regex for "ietf standards" or "agentic identity" |
| `"📖 RFC7523bis"` through all IETF sub-tabs | NOT COVERED |
| `"📘 AI Primer"` and all sub-tabs | NOT COVERED |
| `"🔀 ID-JAG / Cross-App Access (XAA)"` and sub-tabs | NOT COVERED |

**Summary:** ~30 of 61 `EDUCATION_COMMANDS` entries currently fall through to LLM. The `parseEducation()` function needs additions covering: `best-practices`, `par`, `rar`, `jwt-client-auth`, `agentic-maturity`, `agent-builder`, `llm-landscape`, `llm-comparison`, `ai-platform`, `sensitive-data`, `pinggateway`, `architecture`, `token-chain`, `agent-flow`, `ietf-standards`, `ai-primer`, `id-jag`, plus the `step-up-device-auth` and `authorize` sub-topics.

**How to avoid:** The plan must include a dedicated task for `nlIntentParser.js` that adds regex patterns for all unmatched labels. The pattern approach: map each `EDUCATION_COMMANDS` entry to a keyword extracted from its label, add it to `parseEducation()`. [VERIFIED: nlIntentParser.js full content scan]

### Pitfall 6: `showLearnMore` state variable lingers as dead state

**What goes wrong:** After removing the `▾ Learn more` JSX block, `showLearnMore` at line 1260 and `setShowLearnMore` at line 1567 remain as dead code. This is harmless but creates confusion for future maintainers.

**How to avoid:** Remove both the `useState` declaration (line 1260) and all `setShowLearnMore` callsites as part of the JSX cleanup task.

---

## Code Examples

### New CSS classes to append to BankingAgent.css

```css
/* Source: 231-UI-SPEC.md CSS Class Inventory */

/* Toolbar row above first chip group — collapse-all control */
.ba-chips-toolbar {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 4px;
}

/* Collapse-all / Expand-all toggle */
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

/* Count badge inline in group header */
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

/* "All actions" trigger button */
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

/* Discovery popout overlay */
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
  z-index: 1;
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

/* Popout header */
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

/* Popout search */
.ba-discovery-search {
  display: block;
  width: 100%;
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

/* Popout scrollable body */
.ba-discovery-body {
  padding: 4px 0 12px;
}

/* Empty state */
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

### Updated renderActionGroups (key additions only)

```jsx
// Source: existing BankingAgent.js renderActionGroups — extended
const renderActionGroups = () => {
  let groupsToRender = { ...ACTION_GROUPS };
  if (isConfigEmbeddedFocus) {
    groupsToRender = { admin: ACTION_GROUPS.admin || [] };
  }

  return (
    <>
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
          <div key={groupName} className={"ba-action-group ba-action-group--" + groupName}>
            <button className="ba-group-header" onClick={() => toggleGroupExpanded(groupName)} type="button">
              <span className="ba-group-name">{capitalizedName}</span>
              <span className="ba-group-count">({actions.length})</span>
              <span className={"ba-group-toggle " + (isExpanded ? "expanded" : "collapsed")}>
                {isExpanded ? "▼" : "▶"}
              </span>
            </button>
            <div className={"ba-group-content " + (isExpanded ? "" : "collapsed")}>
              {actions.map((action) => renderChip(action, groupName))}
            </div>
          </div>
        );
      })}
    </>
  );
};
```

### nlIntentParser.js — example new patterns needed

```javascript
// Source: EDUCATION_COMMANDS label audit — patterns to add to parseEducation()
// [VERIFIED: nlIntentParser.js existing patterns + educationCommands.js labels]

// Token Chain
if (/\b(token[- ]chain)\b/.test(t)) {
  return { kind: "education", education: { panel: EDU.TOKEN_CHAIN, tab: "overview" } };
}
// AI Best Practices / Agentic Maturity
if (/\b(best[- ]practices|agentic[- ]maturity)\b/.test(t)) {
  return { kind: "education", education: { panel: EDU.BEST_PRACTICES, tab: "overview" } };
}
// PAR
if (/\b(par|rfc[- ]?9126|pushed[- ]authorization)\b/.test(t)) {
  return { kind: "education", education: { panel: EDU.PAR, tab: "what" } };
}
// RAR
if (/\b(rar|rfc[- ]?9396|rich[- ]authorization)\b/.test(t)) {
  return { kind: "education", education: { panel: EDU.RAR, tab: "what" } };
}
// LLM Landscape
if (/\b(llm[- ]landscape|llm[- ]comparison|how[- ]llms?[- ]work)\b/.test(t)) {
  return { kind: "education", education: { panel: EDU.LLM_LANDSCAPE, tab: "commercial" } };
}
// Agent Builder
if (/\b(agent[- ]builder|agent[- ]framework)\b/.test(t)) {
  return { kind: "education", education: { panel: EDU.AGENT_BUILDER_LANDSCAPE, tab: "langchain" } };
}
// PingGateway
if (/\b(pinggateway|ping[- ]gateway)\b/.test(t)) {
  return { kind: "education", education: { panel: EDU.PINGGATEWAY_MCP, tab: "overview" } };
}
// Architecture Diagram
if (/\b(c4[- ]architecture|architecture[- ]diagram|bff[- ]component)\b/.test(t)) {
  return { kind: "education", education: { panel: EDU.ARCHITECTURE_DIAGRAM, tab: "context" } };
}
// IETF Standards / AI Primer / ID-JAG follow same pattern...
```

Full pattern list to be completed during execution — every `EDUCATION_COMMANDS` entry must be traced.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `⚡` button + `.ba-commands-popup` | `⊞ All actions` discovery popout | Phase 231 | Replaces the bottom-bar floating popup with an inline overlay anchored to the left rail |
| Inline "Learn more" toggle in left rail | EDUCATION_COMMANDS in discovery popout only | Phase 231 | Learn & Explore no longer clutters the authenticated chip area |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The popout's parent element (wrapping `.ba-left-col`) needs `position: relative` added — this was not verified in the CSS | Pitfall 3, CSS examples | Popout anchors to wrong parent, escapes layout |
| A2 | `EDU.TOKEN_CHAIN`, `EDU.BEST_PRACTICES`, `EDU.PAR`, `EDU.RAR`, `EDU.LLM_LANDSCAPE`, `EDU.AGENT_BUILDER_LANDSCAPE`, `EDU.PINGGATEWAY_MCP`, `EDU.ARCHITECTURE_DIAGRAM`, `EDU.IETF_STANDARDS`, `EDU.AI_PRIMER`, `EDU.ID_JAG`, `EDU.AI_PLATFORM_LANDSCAPE`, `EDU.SENSITIVE_DATA`, `EDU.JWT_CLIENT_AUTH`, `EDU.AGENTIC_MATURITY`, `EDU.LANGCHAIN`, `EDU.ID_JAG` are all valid EDU constants defined in `educationIds.js` and importable into `nlIntentParser.js` | Pitfall 5, code examples | Undefined constant causes a runtime error in BFF; `openEducationCommand` silently fails |

**Note on A2:** `nlIntentParser.js` (BFF) imports `EDU` locally from a server-side copy or uses string literals. The client-side `EDU` from `educationIds.js` is not automatically available on the server. Verify whether the BFF `nlIntentParser.js` already defines its own `EDU` constants (it does — lines 7–20 define a partial set) and extend that object, or use string literals matching the client-side `EDU` values.

---

## Open Questions

1. **Positioned ancestor for `.ba-discovery-popout`**
   - What we know: The popout must use `position: absolute; bottom: 0; left: 0` per the UI-SPEC.
   - What's unclear: Whether `.ba-left-col`'s parent already has `position: relative`. The floating panel uses `display: flex` on `.banking-agent-panel` but the `ba-body` wrapper's position context is unverified.
   - Recommendation: During Wave 1 (CSS), add `position: relative` to the chosen parent element and verify with a visual test before Wave 2.

2. **`nlIntentParser.js` EDU constant scope**
   - What we know: The client-side `EDU` is in `banking_api_ui/src/components/education/educationIds.js`. The BFF `nlIntentParser.js` defines its own `EDU` object at lines 7–20 with a partial set of 13 constants.
   - What's unclear: Whether the BFF `EDU` matches the values in the client-side `EDU` — specifically the newer panels (`TOKEN_CHAIN`, `BEST_PRACTICES`, `PAR`, etc.).
   - Recommendation: During the heuristic task, read `educationIds.js` fully to get all EDU string values, then extend the BFF `EDU` object with new entries before adding `parseEducation()` patterns.

3. **`ba-discovery-popout` z-index vs panel z-index**
   - What we know: Floating panel is `z-index: 100059`. UI-SPEC says popout uses `z-index: 1` (above panel content, below panel z-index).
   - What's unclear: Whether `z-index: 1` is sufficient within the panel's stacking context, or whether a higher value is needed to appear above other panel children.
   - Recommendation: Use `z-index: 10` as a safe value within the panel stacking context (well above other content, well below the global panel z-index).

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Jest + React Testing Library (CRA default) |
| Config file | none — CRA built-in |
| Quick run command | `cd banking_api_ui && npm run test:unit -- --testPathPattern=BankingAgent` |
| Full suite command | `cd banking_api_ui && npm run test:unit` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| 231-UI-01 | Learn & Explore toggle and EDUCATION_COMMANDS list absent from authenticated left-rail render | unit | `npm run test:unit -- --testPathPattern=BankingAgent` | ❌ Wave 0 |
| 231-UI-02 | Collapse-all button collapses all ACTION_GROUPS | unit | same | ❌ Wave 0 |
| 231-UI-03 | Count badge shows correct chip count per group | unit | same | ❌ Wave 0 |
| 231-UI-04 | "All actions" button opens discovery popout | unit | same | ❌ Wave 0 |
| 231-UI-05 | Search in discovery popout filters chips correctly | unit | same | ❌ Wave 0 |
| 231-UI-06 | Escape closes popout and returns focus | unit | same | ❌ Wave 0 |
| 231-NL-01 | All ACTION_GROUPS chip labels route via heuristic (not LLM) | manual smoke | manual — send each label as NL input | — |
| 231-NL-02 | All EDUCATION_COMMANDS labels route via heuristic | manual smoke | manual — send each label as NL input | — |
| 231-BUILD | `npm run build` exits 0 | build | `cd banking_api_ui && npm run build` | ✓ existing |

### Sampling Rate

- **Per task commit:** `cd banking_api_ui && npm run build` (build gate)
- **Per wave merge:** `cd banking_api_ui && npm run test:unit -- --watchAll=false`
- **Phase gate:** Full suite green + `npm run build` exit 0 before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `banking_api_ui/src/__tests__/BankingAgent.chips.test.js` — covers 231-UI-01 through 231-UI-06

*(Existing test infrastructure — `react-scripts test` — is present. Only the test file is missing.)*

---

## Security Domain

This phase has no auth, token, or network changes. No ASVS categories apply.

---

## Sources

### Primary (HIGH confidence)

- `banking_api_ui/src/components/BankingAgent.js` — full read, lines 1–5970 — ACTION_GROUPS structure, renderActionGroups, renderChip, showLearnMore/showCommands state, chipGroupsState pattern
- `banking_api_ui/src/components/BankingAgent.css` — full class inventory — ba-group-*, ba-chip*, ba-cmd-btn, ba-commands-popup, ba-left-col dimensions, design tokens
- `banking_api_server/services/nlIntentParser.js` — full read — parseEducation() patterns, parseBanking() patterns, EDU constants
- `banking_api_ui/src/components/education/educationCommands.js` — full read — all 61 EDUCATION_COMMANDS entries with labels
- `.planning/phases/231-agent-chip-groups-collapsible-sections-collapse-all-button-p/231-UI-SPEC.md` — full read — authoritative design contract

### Secondary (MEDIUM confidence)

- `.planning/STATE.md` — project history and current phase position
- `.planning/REQUIREMENTS.md` — requirement traceability
- `.planning/config.json` — nyquist_validation enabled, mode: yolo

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — plain React + CSS, verified by codebase scan
- Architecture: HIGH — all patterns traced to existing code
- Pitfalls: HIGH — Pitfalls 1–4 and 6 are VERIFIED; Pitfall 3 (positioned ancestor) is ASSUMED
- Heuristic gap audit: HIGH — all 61 EDUCATION_COMMANDS compared against nlIntentParser.js line by line

**Research date:** 2026-04-25
**Valid until:** 2026-05-25 (stable codebase, no external dependencies)
