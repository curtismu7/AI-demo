# Phase 224: token-audit-trail-and-decoder - Research

**Researched:** 2026-04-24
**Domain:** React SPA — DevToolsDashboard tab extension, TokenChainContext data, JWT display
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Audit trail entries expand **in-place** (inline expand below the row) — same pattern as TestCard on MFA/authz-test pages. No modal, no side pane.
- **D-02:** On expand, show **decoded JWT claims** for any token produced by that operation — reuse `DecodedTokenPanel.jsx` directly.
- **D-03:** Expanded state is per-row (multiple rows can be open simultaneously).
- **D-04:** Click-into-for-more-detail behavior must be present — this was explicitly requested and is non-negotiable.

### Claude's Discretion
- **Where it lives:** Add as two new tabs (`audit` and `decoder`) inside the existing `DevToolsDashboard.jsx`. Reuses FloatingPanel, tab bar pattern, keeps everything in one floating panel.
- **Audit Trail data source:** Source from `TokenChainContext` events (token acquisitions per tool call) as the primary feed. Augment with `apiCallTrackerService` session data if available. Badge labels derived from token category (actor/subject/mcp) and scope claims.
- **Token Decoder column layout:** Horizontal scrollable columns — one column per token currently in `displayEvents` from `TokenChainContext`. Reuse `DecodedTokenPanel.jsx` per column. Single-column view when only one token exists.
- **Badge color system:** Reuse `deriveTokenCategory` from `TokenColorSystem` to match existing red/blue/green actor/subject/mcp color semantics.

### Deferred Ideas (OUT OF SCOPE)
- Persistent audit log across sessions (localStorage or BFF endpoint) — currently in-memory only
- Filtering/search within audit trail — future enhancement
- Token diff view (show what changed between token acquisitions) — future phase
</user_constraints>

---

## Summary

Phase 224 adds two new tabs to the existing `DevToolsDashboard.jsx` floating panel: **Audit Trail** (timestamped, clickable list of token/MCP operations) and **Token Decoder** (side-by-side decoded JWT columns per token in the current chain). This is a pure read-only display layer — no new BFF endpoints, no changes to token flows.

All data already exists in `TokenChainContext`. The primary data sources are:
1. `history` (array of `{ tool, timestamp, events[] }`) — provides the Audit Trail feed
2. `displayEvents` (array of current token events) — provides the Token Decoder feed

The key integration challenge is a **prop shape mismatch**: `DecodedTokenPanel.jsx` expects `decoded: { header, payload }` but `buildTokenEvent()` on the server stores `jwtFullDecode: { header, claims }`. The adapter is trivial: `{ header: e.jwtFullDecode.header, payload: e.jwtFullDecode.claims }`. This must be applied wherever token events feed into `DecodedTokenPanel`.

**Primary recommendation:** Add two panel blocks in `DevToolsDashboard.jsx` following the existing CSS-toggle pattern (`display: activeTab === "audit" ? "flex" : "none"`). Extract Audit Trail and Token Decoder as co-located sub-components within the same file. Inline per-row expansion uses `useState` with a `Set` of open row keys.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Audit Trail display | Browser/Client | — | Read-only render of in-memory context state; no server calls |
| Token Decoder display | Browser/Client | — | Renders `displayEvents` from `TokenChainContext`; no new API |
| Token event data | Browser/Client (context) | BFF (origin) | `TokenChainContext` already aggregates events; BFF produced them |
| Badge color classification | Browser/Client | — | `deriveTokenCategory()` is a pure JS function |
| JWT claim rendering | Browser/Client | — | `DecodedTokenPanel.jsx` renders pre-decoded `{ header, payload }` |

---

## Project Constraints (from CLAUDE.md)

- Run `cd banking_api_ui && npm run build` — exit code must be **0** after any UI change. [VERIFIED: CLAUDE.md]
- Minimal diff — name the component/element; do not refactor unrelated code. [VERIFIED: CLAUDE.md]
- Read `REGRESSION_PLAN.md` §1 before editing listed files. [VERIFIED: CLAUDE.md]
- Bug fixes get an entry in `REGRESSION_PLAN.md` §4. This phase is additive (no bug fixes expected), but any regressions introduced must be logged. [VERIFIED: CLAUDE.md]
- Do not edit marketing-only pages. [VERIFIED: CLAUDE.md — not relevant to this phase]

---

## Standard Stack

### Core (already installed — no new packages needed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | 18.x | Component rendering, useState | Already in project [VERIFIED: banking_api_ui/package.json] |
| React Context (TokenChainContext) | — | Data source for both new tabs | Already wired to DevToolsDashboard indirectly [VERIFIED: codebase] |

### No new npm dependencies required
All building blocks are already present: `DecodedTokenPanel.jsx`, `TokenColorSystem.js`, `TokenChainContext.js`, `FloatingPanel`, and `DevToolsDashboard.jsx`. No install step needed. [VERIFIED: codebase grep]

---

## Architecture Patterns

### System Architecture Diagram

```
TokenChainContext
   ├── displayEvents (current tool call events or session events)
   │       └── Token Decoder Tab
   │               └── one DecodedTokenPanel column per event
   │                       decoded = { header: e.jwtFullDecode.header,
   │                                   payload: e.jwtFullDecode.claims }
   └── history (array of { tool, timestamp, events[] })
           └── Audit Trail Tab
                   └── one AuditRow per history entry
                           └── [expanded] → DecodedTokenPanel(s) for events with claims
```

```
User action (agent tool call)
  → bankingAgentService.callMcpTool()
    → setTokenEvents(tool, newEvents) on TokenChainContext
      → history prepended: { tool, timestamp, events[] }
      → displayEvents replaced with newEvents
        → DevToolsDashboard tabs update (CSS toggled, all mounted)
```

### Recommended File Structure
```
banking_api_ui/src/components/
├── DevToolsDashboard.jsx        ← EDIT: add tabs + inline AuditTrailTab + TokenDecoderTab sub-components
└── TokenDisplay.css             ← EDIT: add .audit-trail-* and .token-decoder-* CSS classes
```

No new separate files are required; the two new tab sub-components are small enough to co-locate in `DevToolsDashboard.jsx` as local functions.

### Pattern 1: Adding a Tab (existing pattern)
**What:** Add entry to `TABS` array + add a `display: activeTab === "X" ? "flex" : "none"` panel block.
**When to use:** All panel mounting in DevToolsDashboard follows this pattern for state preservation.
**Example:**
```jsx
// Source: DevToolsDashboard.jsx (verified in codebase)
const TABS = [
  { id: "chain", icon: "🔗", label: "Token Chain" },
  { id: "inspector", icon: "🔬", label: "Flow Inspector" },
  { id: "traffic", icon: "🔌", label: "MCP Traffic" },
  // ADD:
  { id: "audit", icon: "📋", label: "Audit Trail" },
  { id: "decoder", icon: "🔍", label: "Token Decoder" },
];

// Panel block (follows all three existing blocks):
<div style={{ display: activeTab === "audit" ? "flex" : "none", flexDirection: "column", height: "100%", overflowY: "auto" }}>
  <AuditTrailTab />
</div>
<div style={{ display: activeTab === "decoder" ? "flex" : "none", flexDirection: "column", height: "100%", overflow: "auto" }}>
  <TokenDecoderTab />
</div>
```

### Pattern 2: Inline Row Expand (ActivityLogs pattern)
**What:** `Set`-based expanded state; `onClick` on row header toggles item in Set; expanded section renders conditionally below.
**When to use:** Per-row expansion with multiple simultaneous open rows (D-03).
**Example:**
```jsx
// Source: ActivityLogs.js (verified in codebase)
const [expandedRowKeys, setExpandedRowKeys] = useState(new Set());
const toggleRow = (key) => setExpandedRowKeys(prev => {
  const n = new Set(prev);
  n.has(key) ? n.delete(key) : n.add(key);
  return n;
});

// Row:
<div onClick={() => toggleRow(entry.timestamp)}>
  {/* summary row */}
</div>
{expandedRowKeys.has(entry.timestamp) && (
  <div>
    {/* DecodedTokenPanel per token event that has claims */}
  </div>
)}
```

### Pattern 3: DecodedTokenPanel — claims adapter
**What:** Token events store `jwtFullDecode: { header, claims }` but `DecodedTokenPanel` expects `decoded: { header, payload }`. Must adapt.
**When to use:** Everywhere a token event's JWT data feeds into `DecodedTokenPanel`.
**Example:**
```jsx
// Source: DecodedTokenPanel.jsx line 31 (verified), buildTokenEvent() line 163 (verified)
// WRONG (will break):
<DecodedTokenPanel decoded={event.jwtFullDecode} label={event.label} />

// CORRECT:
const decoded = event.jwtFullDecode
  ? { header: event.jwtFullDecode.header, payload: event.jwtFullDecode.claims }
  : null;
<DecodedTokenPanel decoded={decoded} label={event.label} />
```

### Pattern 4: Scope Badges (reuse existing CSS)
**What:** `decoded-scope-badge` CSS class is already in `TokenDisplay.css` for monospace blue scope pills.
**When to use:** Rendering scope strings from `event.claims?.scope` in audit trail rows.
**Example:**
```jsx
// Source: TokenDisplay.css line 432, DecodedTokenPanel.jsx line 55 (verified)
{event.claims?.scope?.split(" ").map(s => (
  <span key={s} className="decoded-scope-badge">{s}</span>
))}
```

### Pattern 5: Token Category Badge
**What:** `deriveTokenCategory(label, eventId, tokenType)` returns `"subject" | "actor" | "mcp" | null`. Use the inline color map for badge background.
**When to use:** Colored context badges on each audit trail row.
**Example:**
```jsx
// Source: TokenColorSystem.js (verified)
import { deriveTokenCategory } from "./TokenColorSystem";
const category = deriveTokenCategory(event.label, event.id, event.tokenType);
const BADGE_COLORS = { subject: "#dc2626", actor: "#2563eb", mcp: "#16a34a" };
const color = BADGE_COLORS[category] || "#6b7280";
<span style={{ background: color, color: "#fff", borderRadius: 4, padding: "2px 8px", fontSize: "0.7rem" }}>
  {event.label}
</span>
```

### Pattern 6: Token Decoder — horizontal scroll columns
**What:** `displayEvents` from `useTokenChainOptional()` provides the current list. One `DecodedTokenPanel` per event, in a horizontally scrollable flex row. `DecodedTokenPanel` already has its own expand-to-show-claims UX (it defaults to collapsed).
**When to use:** Token Decoder tab.
**Example:**
```jsx
// Source: TokenChainContext.js (verified) — displayEvents is events || [sessionTokenEvent] || []
const { events: displayEvents } = useTokenChainOptional() ?? { events: [] };
<div style={{ display: "flex", gap: "0.75rem", overflowX: "auto", padding: "1rem" }}>
  {displayEvents.map(event => {
    const decoded = event.jwtFullDecode
      ? { header: event.jwtFullDecode.header, payload: event.jwtFullDecode.claims }
      : null;
    return <div key={event.id ?? event.label} style={{ minWidth: 280, flex: "0 0 auto" }}>
      <DecodedTokenPanel decoded={decoded} label={event.label} />
    </div>;
  })}
</div>
```

### Anti-Patterns to Avoid
- **Passing `event.jwtFullDecode` directly to `DecodedTokenPanel`:** The key is `claims` not `payload`; the component will silently render nothing because `payload` will be undefined. Always adapt.
- **Calling `useTokenChain()` (throwing hook):** Use `useTokenChainOptional()` which returns null outside provider. Both tabs must tolerate a null context.
- **Mounting only the active tab (conditional render instead of CSS display):** The existing pattern mounts all tabs but CSS-toggles visibility. Conditional render would lose the existing state/polling in the chain/inspector/traffic tabs if the user switches tabs rapidly. Follow the `display: ... ? "flex" : "none"` pattern.
- **New floating panel or page:** CONTEXT.md locked decision: new tabs inside existing `DevToolsDashboard.jsx` only.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JWT claim display | Custom claim renderer | `DecodedTokenPanel.jsx` | Already has header/scope/timing/raw sections, glossary tooltips, RFC 8693 claim labels |
| Token color classification | if/else label matching | `deriveTokenCategory()` from `TokenColorSystem.js` | 3-priority fallback logic; already handles all known event IDs and label strings |
| Scope badge rendering | Custom CSS classes | `.decoded-scope-badge` in `TokenDisplay.css` | Already styled, consistent with Token Chain tab |
| Colored dot component | `<span>` with inline styles | `TokenColorDot` from `TokenColorSystem.js` | Ready-made component with accessibility attributes |
| Row expand tracking | Map or index-based state | `Set`-based `useState` (ActivityLogs pattern) | Handles multiple simultaneous open rows without key collisions |

---

## Token Event Schema (VERIFIED)

The shape of each event returned by `buildTokenEvent()` and stored in `TokenChainContext`:

```typescript
// Source: agentMcpTokenService.js line 163-178 (verified)
interface TokenEvent {
  id: string;           // "user-token" | "agent-actor-token" | "exchanged-token" | "exchanged-token-fallback" | "exchange-in-progress" | "exchange-failed" | "exchange-required" | ...
  label: string;        // Human-readable, e.g. "User access token", "MCP access token (delegated) → MCP server"
  status: string;       // "active" | "acquired" | "exchanged" | "acquiring" | "skipped" | "failed" | "waiting"
  timestamp: string;    // ISO 8601
  alg: string | null;   // JWT header alg, e.g. "RS256"
  claims: object | null; // Sanitized JWT payload claims (sub, aud, scope, act, may_act, exp, iat, ...)
  explanation: string;  // Educational explanation text
  jwtFullDecode?: {     // Present when token was successfully decoded
    header: object;     // { alg, typ, kid }
    claims: object;     // Full JWT payload (same as event.claims but un-sanitized)
  };
  // Optional extra fields set per event type:
  rfc?: string;
  tokenScopes?: string[];
  mayActPresent?: boolean;
  mayActValid?: boolean;
  actPresent?: boolean;
  // ...
}
```

**History entry shape (TokenChainContext):**
```typescript
// Source: TokenChainContext.js line 65 (verified)
interface HistoryEntry {
  tool: string;        // MCP tool name, e.g. "get_my_accounts"
  timestamp: string;   // ISO 8601 of when the tool call occurred
  events: TokenEvent[]; // Token events produced by that tool call
}
```

**Context value shape:**
```typescript
// Source: TokenChainContext.js line 182-195 (verified)
interface TokenChainContextValue {
  events: TokenEvent[];          // displayEvents: current tool call events OR session token
  history: HistoryEntry[];       // All tool calls, newest first (max 20)
  mcpToolCalls: object[];        // From /api/token-chain BFF poll
  resolvedIdentity: object | null;
  setTokenEvents: (tool: string, events: TokenEvent[]) => void;
  clearEvents: () => void;
  setSessionToken: (event: TokenEvent) => void;
  clearHistory: () => void;
}
```

**Critical:** `context.events` is `displayEvents` (the aliased field in the useMemo). There is no separate `displayEvents` key — it is exported as `events`. [VERIFIED: TokenChainContext.js line 187]

---

## Common Pitfalls

### Pitfall 1: DecodedTokenPanel prop shape mismatch
**What goes wrong:** Passing `event.jwtFullDecode` directly as the `decoded` prop. The component destructures `{ header, payload }` but jwtFullDecode uses `claims` not `payload`. Result: silent rendering of nothing (component returns null because the payload object is empty/undefined).
**Why it happens:** Server uses `claims` (aligned with JWT RFC terminology for the payload). DecodedTokenPanel was built to match the `tokenDisplayService.js` shape (`{ header, payload }`) used by `/api/pingone-test/*` endpoints.
**How to avoid:** Always adapt: `decoded = event.jwtFullDecode ? { header: event.jwtFullDecode.header, payload: event.jwtFullDecode.claims } : null`.
**Warning signs:** DecodedTokenPanel renders its collapsed header but the expanded body shows empty Header/Identity sections.

### Pitfall 2: useTokenChain() vs useTokenChainOptional()
**What goes wrong:** Using the throwing `useTokenChain()` hook inside a sub-component rendered inside `DevToolsDashboard.jsx`. If the panel is ever rendered outside `TokenChainProvider`, the whole dashboard will throw.
**Why it happens:** `useTokenChain()` throws if context is null.
**How to avoid:** Use `useTokenChainOptional()` which returns null. Guard with `const ctx = useTokenChainOptional(); if (!ctx) return <empty state>;`.

### Pitfall 3: Tab bar overflow on small DevTools widths
**What goes wrong:** The tab bar has 3 tabs + "drag · resize · ↗ pop out" label. Adding 2 more tabs without checking fits in the existing bar can cause wrapping or overflow on the minimum 380px width.
**Why it happens:** `DevToolsDashboard` has `minWidth={380}`. At that width, 5 tabs with icons and labels will crowd.
**How to avoid:** Use shorter tab labels if needed ("Audit" / "Decoder") and test at min width. The `whiteSpace: "nowrap"` on existing tabs will cause horizontal scroll of the tab bar rather than wrapping — acceptable.

### Pitfall 4: History timestamp collision as row key
**What goes wrong:** Using `history[i].timestamp` as React key for audit trail rows. Two rapid tool calls could have the same ISO timestamp.
**Why it happens:** `new Date().toISOString()` has millisecond precision; rapid sequential calls are unlikely to collide but possible.
**How to avoid:** Use index or `${entry.tool}-${entry.timestamp}` as key, or prepend array index: `history.map((entry, i) => ... key={i})`.

### Pitfall 5: Touching TokenChainDisplay.js unnecessarily
**What goes wrong:** Phase inadvertently edits `TokenChainDisplay.js` to extract shared logic.
**Why it matters:** `TokenChainDisplay.js` is a regression-guarded file (REGRESSION_PLAN.md §1 "Token Chain blank on login" entry). Any edit risks the blank-on-login regression.
**How to avoid:** Do not touch `TokenChainDisplay.js`. All Audit Trail and Token Decoder logic is in new sub-components inside `DevToolsDashboard.jsx`.

---

## Code Examples

### Audit Trail Tab sub-component skeleton
```jsx
// Source: patterns from ActivityLogs.js + TokenChainContext.js (verified in codebase)
import { useTokenChainOptional } from "../context/TokenChainContext";
import { deriveTokenCategory } from "./TokenColorSystem";
import DecodedTokenPanel from "./DecodedTokenPanel";

function AuditTrailTab() {
  const ctx = useTokenChainOptional();
  const [expandedKeys, setExpandedKeys] = useState(new Set());
  if (!ctx) return <div style={{ padding: "1rem", color: "#94a3b8" }}>Loading…</div>;

  const { history } = ctx;
  const toggleRow = (key) => setExpandedKeys(prev => {
    const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n;
  });

  if (history.length === 0) {
    return <div style={{ padding: "1.5rem", color: "#94a3b8", textAlign: "center" }}>
      No operations yet. Use the agent to see token acquisitions here.
    </div>;
  }

  return (
    <div style={{ padding: "0.75rem", display: "flex", flexDirection: "column", gap: "0.25rem" }}>
      {history.map((entry, i) => {
        const key = `${entry.tool}-${entry.timestamp}`;
        const isOpen = expandedKeys.has(key);
        return (
          <div key={key} className="audit-trail-row">
            <div className="audit-trail-row-header" onClick={() => toggleRow(key)}>
              <span className="audit-trail-timestamp">
                {new Date(entry.timestamp).toLocaleTimeString()}
              </span>
              <span className="audit-trail-tool">{entry.tool}</span>
              {/* scope/category badges from entry.events */}
              <span className="audit-trail-chevron">{isOpen ? "▾" : "▸"}</span>
            </div>
            {isOpen && (
              <div className="audit-trail-row-expanded">
                {entry.events.map(evt => {
                  const decoded = evt.jwtFullDecode
                    ? { header: evt.jwtFullDecode.header, payload: evt.jwtFullDecode.claims }
                    : null;
                  return decoded ? (
                    <DecodedTokenPanel key={evt.id} decoded={decoded} label={evt.label} />
                  ) : null;
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
```

### Token Decoder Tab sub-component skeleton
```jsx
// Source: TokenChainContext.js + DecodedTokenPanel.jsx (verified in codebase)
function TokenDecoderTab() {
  const ctx = useTokenChainOptional();
  if (!ctx) return <div style={{ padding: "1rem", color: "#94a3b8" }}>Loading…</div>;

  const displayEvents = ctx.events; // "events" is the displayEvents alias in context
  const eventsWithDecoded = displayEvents.filter(e => e.jwtFullDecode);

  if (eventsWithDecoded.length === 0) {
    return <div style={{ padding: "1.5rem", color: "#94a3b8", textAlign: "center" }}>
      No decoded tokens yet. Log in and run an agent action to see tokens here.
    </div>;
  }

  return (
    <div style={{
      display: "flex",
      gap: "0.75rem",
      overflowX: "auto",
      padding: "1rem",
      minHeight: 0,
      flex: 1,
    }}>
      {eventsWithDecoded.map(event => {
        const decoded = {
          header: event.jwtFullDecode.header,
          payload: event.jwtFullDecode.claims,
        };
        return (
          <div key={event.id ?? event.label} style={{ minWidth: 280, flex: "0 0 280px" }}>
            <DecodedTokenPanel decoded={decoded} label={event.label} />
          </div>
        );
      })}
    </div>
  );
}
```

### Badge color inline style
```jsx
// Source: TokenColorSystem.js (verified)
const BADGE_BG = { subject: "#dc2626", actor: "#2563eb", mcp: "#16a34a" };
const cat = deriveTokenCategory(event.label, event.id);
const bg = BADGE_BG[cat] || "#475569";
<span style={{ background: bg, color: "#fff", borderRadius: 4, padding: "2px 8px", fontSize: "0.7rem", fontWeight: 600 }}>
  {cat ?? event.id}
</span>
```

---

## REGRESSION_PLAN.md §1 Impact Assessment

Files this phase will touch:

| File | §1 Protected? | Risk |
|------|---------------|------|
| `DevToolsDashboard.jsx` | Not listed in §1 | Low — additive only, existing tabs untouched |
| `TokenDisplay.css` | Not listed in §1 | Low — new CSS class additions only |
| `TokenChainDisplay.js` | Listed: "Token Chain blank on login" | Must NOT touch — all new code goes in DevToolsDashboard.jsx |
| `BankingAgent.js` | Multiple §1 entries | Must NOT touch — not needed for this phase |
| `TokenChainContext.js` | Not listed in §1 but regression-adjacent | Must NOT touch — read-only via hook |

**Conclusion:** This phase is safe. It only writes to `DevToolsDashboard.jsx` (TABS array + two new panel blocks + two local sub-components) and `TokenDisplay.css` (new CSS classes). Neither file is in §1.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | react-scripts test (CRA/Jest) |
| Config file | none — CRA default |
| Quick run command | `cd banking_api_ui && CI=true npm run test:unit -- --testPathPattern=DevTools` |
| Full suite command | `cd banking_api_ui && CI=true npm run test:unit` |
| Build verification | `cd banking_api_ui && npm run build` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| 224-1 | Audit Trail tab appears in DevToolsDashboard | smoke | `npm run build` exit 0 | ❌ Wave 0 |
| 224-2 | AuditTrailTab renders history entries | unit | `npm run test:unit -- --testPathPattern=AuditTrailTab` | ❌ Wave 0 |
| 224-3 | Row expand toggles per-row (D-01/D-03) | unit | included in AuditTrailTab test | ❌ Wave 0 |
| 224-4 | DecodedTokenPanel receives {header,payload} not {header,claims} | unit | prop shape assertion in AuditTrailTab test | ❌ Wave 0 |
| 224-5 | Token Decoder tab renders columns from displayEvents | unit | `npm run test:unit -- --testPathPattern=TokenDecoderTab` | ❌ Wave 0 |
| 224-6 | npm run build exits 0 | build | `cd banking_api_ui && npm run build` | ✅ (always runnable) |

### Sampling Rate
- **Per task commit:** `cd banking_api_ui && npm run build` (build verification — primary gate per CLAUDE.md)
- **Per wave merge:** `cd banking_api_ui && CI=true npm run test:unit`
- **Phase gate:** Build exit 0 + no new console.error in changed flows

### Wave 0 Gaps
- [ ] `banking_api_ui/src/__tests__/AuditTrailTab.test.jsx` — covers 224-1 through 224-4
- [ ] `banking_api_ui/src/__tests__/TokenDecoderTab.test.jsx` — covers 224-5

*(Optional — build verification is the primary gate for this UI-only phase)*

---

## Environment Availability

Step 2.6: SKIPPED (no external dependencies — pure front-end component additions, no new CLI tools, services, or runtimes required)

---

## Security Domain

This phase adds no authentication, no new API endpoints, and no new data collection. It renders data already present in the browser's `TokenChainContext` (sourced from BFF session via existing secure endpoints).

**No new ASVS controls required.** No new attack surface.

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V5 Input Validation | yes (minimal) | JWT claims are already sanitized by `sanitizeClaims()` on the BFF before reaching the context; display-only rendering of pre-decoded objects poses no injection risk |
| V4 Access Control | no | Read-only display of client-side context state |
| All others | no | No auth, session, crypto, or network changes |

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Separate floating panels per tool | Single DevToolsDashboard with tabs | Phase 213 | New tabs go inside existing panel |
| Raw event list in TokenChainContext | `history` (tool-call grouped, max 20) + `displayEvents` (current) | Phase ~194 | Audit Trail maps to history; Decoder maps to displayEvents |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | TokenDecoderTab showing only `displayEvents` events with `jwtFullDecode != null` gives the right "current chain" view | Token Decoder section | If events without jwtFullDecode (e.g., "waiting" status) should also appear as placeholder columns, the decoder would look sparse during a live exchange |
| A2 | No new CSS file is needed — `TokenDisplay.css` can absorb new audit trail classes | Architecture | If audit trail CSS clashes with existing classes in TokenDisplay.css a separate CSS file might be preferred |

---

## Open Questions

1. **Should the Audit Trail show the session token (pre-tool-call) entry as well as tool-call history?**
   - What we know: `history` only contains entries created by `setTokenEvents()` (i.e., tool calls). The session token event is in `sessionTokenEvent` state separately.
   - What's unclear: Should the audit trail show "Session initialized" as the first entry?
   - Recommendation: Include `sessionTokenEvent` as a synthetic entry at the bottom of the list (oldest) if present; renders with tool name `"session"`.

2. **DecodedTokenPanel defaults to collapsed — is that acceptable for Token Decoder tab?**
   - What we know: `DecodedTokenPanel` renders a clickable header ("▼ show / ▲ hide") and starts collapsed. In the Token Decoder side-by-side columns, users would need to click each column to expand.
   - What's unclear: The CONTEXT.md screenshot described "highlighted fields" in expanded columns — suggesting auto-expanded state.
   - Recommendation: Pass a prop or wrap in a small component that initializes `expanded=true` for the Token Decoder context. Since `DecodedTokenPanel` uses local `useState`, a wrapper component that calls `defaultExpanded` behavior could work — or the planner can inline an always-expanded version.

---

## Sources

### Primary (HIGH confidence)
- `DevToolsDashboard.jsx` — TABS array, panel block pattern, CSS toggle
- `TokenChainContext.js` — history shape `{ tool, timestamp, events[] }`, displayEvents alias, hook names
- `agentMcpTokenService.js` `buildTokenEvent()` — event schema including `jwtFullDecode: { header, claims }`
- `DecodedTokenPanel.jsx` — `decoded: { header, payload }` prop interface (critical mismatch)
- `TokenColorSystem.js` — `deriveTokenCategory()` signature, `TOKEN_COLORS` map
- `TokenDisplay.css` — `.decoded-scope-badge`, `.decoded-token-panel` classes
- `ActivityLogs.js` — Set-based expand pattern, `renderEventRow()` / `toggleEvent()`
- `REGRESSION_PLAN.md` §1 — protected files list

### Secondary (MEDIUM confidence)
- `MFATestPage.jsx` `TestCard` — inline expand/collapse with per-section open state (referenced in CONTEXT.md)
- `PingOneTestPage.jsx` — `DecodedTokenPanel` usage, `data.decoded` shape from BFF (`{ header, payload }`)

---

## Metadata

**Confidence breakdown:**
- Event schema: HIGH — verified directly in `buildTokenEvent()` source
- DecodedTokenPanel prop mismatch: HIGH — verified in both source files
- Tab add pattern: HIGH — verified in DevToolsDashboard.jsx
- CSS classes: HIGH — verified in TokenDisplay.css
- Test infrastructure: MEDIUM — CRA test setup confirmed, test file paths are new (Wave 0)

**Research date:** 2026-04-24
**Valid until:** 2026-05-24 (stable codebase, 30-day window)
