---
name: token-education
description: >
  Architecture guide for the token visualization and education UI system in the Super Banking demo.
  USE THIS SKILL whenever: adding or editing a token education panel (ActorTokenEducation,
  AgenticTrustEducation, MCPToolsEducation, TokenChainDisplay, TokenDiffPanel,
  UnifiedTokenFlowInspector, FloatingTokenChainPanel, TokenCard); wiring a new panel into
  EducationBar or EducationUIContext; understanding how token events flow from BFF to the UI
  via TokenChainContext; working on tokenChainService.js or tokenDisplayService.js; adding a
  new EDU panel ID; or debugging "no token chain appears" / "events not showing" issues.
  DO NOT USE FOR: the actual token exchange logic (use oauth-pingone); MCP tool execution
  (use mcp-server); BFF session storage (use bff-sessions); CIBA education (use ciba skill).
argument-hint: 'Describe the education panel or token visualization feature you are adding or modifying'
---

# Token Education & Visualization System

> **Emoji rule:** only `⚠️`, `✅`, `❌` allowed anywhere in this repo.

---

## Purpose

The token education system teaches demo audiences about the RFC 8693 token chain:
- How `may_act` pre-authorizes delegation
- How the T1→T2→T3 exchange narrows `aud` and `scope` at each hop
- How the `act` claim proves agent identity
- What BFF token custody means (tokens never reach the browser)
- How PingOne Authorize makes per-request decisions

There are two distinct subsystems:
1. **Token chain visualization** — live data, shows what just happened in a tool call (`TokenChainContext`, `TokenChainDisplay`, `FloatingTokenChainPanel`, `TokenDiffPanel`)
2. **Static education panels** — explanatory content, no live data (`ActorTokenEducation`, `AgenticTrustEducation`, `MCPToolsEducation`), opened via `EducationUIContext`

---

## Data Flow — Live Token Chain

```
BFF (bankingAgentService / agentMcpTokenService)
  → tokenEvents[] attached to req
  → returned in /api/banking-agent/nl JSON response
      → callMcpTool() in bankingAgentService.js
          → TokenChainContext.setEvents(tokenEvents)
              → TokenChainDisplay, TokenDiffPanel, FloatingTokenChainPanel (consume context)

/api/token-chain (GET)                     ← polled by TokenChainDisplay on demand
  → tokenChainService.getTokenChain(userId)
  → tokenChainService.getMCPToolCalls(userId)
  → returns { tokenChain, mcpToolCallsChain, validationMode, metadata }
```

`TokenChainContext` also reads `sessionTokenEvent` (current BFF session token, shown when no tool call events exist) and `history` (localStorage-persisted history of recent tool calls).

**Cold-start fallback:** if `tokenChain` is empty and a session `accessToken` exists, `tokenChainService.synthesizeFromSession()` creates a synthetic entry. Synthetic entries have `_synthetic: true` — the UI labels the chain as "synthesized — not verified" rather than presenting it as a validated auth step.

---

## Key Context Providers

### `TokenChainContext` (`demo_api_ui/src/context/TokenChainContext.js`)

The live data bus for token chain panels. Exports:
- `events` — array of token event objects from the most recent tool call
- `nlRoutingEvent` — NL routing info for the current request (set at step 0)
- `sessionTokenEvent` — current session token (fallback when no tool events)
- `mcpToolCalls` — MCP tool delegation trail from `/api/token-chain`
- `validationMode` — `'introspection'` | `'jwt'` | `null`
- `resolvedIdentity` — `{ currentUser, knownClients }` for friendly labels
- `history` — array of `{ tool, timestamp, events[] }` (localStorage-backed)
- `setEvents(events)` — called by `callMcpTool()` after each tool invocation

Access pattern:
```js
import { useTokenChainOptional } from '../context/TokenChainContext';
const ctx = useTokenChainOptional(); // returns null if outside provider — never throws
const events = ctx?.events || [];
```

Use `useTokenChainOptional` (not `useTokenChain`) for components that may render outside the provider (e.g., marketing pages, standalone panels).

### `EducationUIContext` (`demo_api_ui/src/context/EducationUIContext.js`)

Controls which static education panel is open (one at a time). Exports:
- `panel` — currently open panel ID (string) or `null`
- `tab` — initial tab within the panel, or `null`
- `open(panelId, tabId?)` — open a panel, optionally at a specific tab
- `close()` — dismiss

Panel IDs are constants in `demo_api_ui/src/components/education/educationIds.js`:
```js
import { EDU } from '../components/education/educationIds';
// EDU.TOKEN_EXCHANGE, EDU.MAY_ACT, EDU.MCP_PROTOCOL, EDU.INTROSPECTION,
// EDU.AGENT_GATEWAY, EDU.LOGIN_FLOW, EDU.RFC_INDEX, EDU.STEP_UP,
// EDU.PINGONE_AUTHORIZE, EDU.HUMAN_IN_LOOP, EDU.BEST_PRACTICES, ...
```

---

## Component Map

### Live Visualization Components

| Component | File | Role |
|---|---|---|
| `TokenChainDisplay` | `demo_api_ui/src/components/TokenChainDisplay.js` | Full token chain table — T1→T2→T3 with status badges, RFC reference pills, spec-citation. Reads `TokenChainContext`. Supports RFC link rendering via `RfcRef`. |
| `TokenDiffPanel` | `demo_api_ui/src/components/TokenDiffPanel.js` | Side-by-side claim diff across token hops. Reads `TokenChainContext.events`. Highlights added/changed/removed/absent claims per hop. Claims ordered by `CLAIM_INTEREST_ORDER`. |
| `FloatingTokenChainPanel` | `demo_api_ui/src/components/FloatingTokenChainPanel.js` | Draggable/resizable overlay panel housing `TokenChainPanel`. Used on the marketing/landing page. Position/size persisted to localStorage under key `'ftcp-pos'`. |
| `UnifiedTokenFlowInspector` | `demo_api_ui/src/components/UnifiedTokenFlowInspector.jsx` | Unified view combining chain + diff + history. |
| `TokenCard` | `demo_api_ui/src/components/TokenCard.jsx` | Single token renderer — decodes via `POST /api/token-display/raw-decode`, shows Header/Identity/Timing/Scopes sections. `TokenColorDot` badge driven by `deriveTokenCategory`. Uses `CLAIM_GLOSSARY` from `demo_api_ui/src/constants/claimGlossary.js` for tooltips. |
| `TokenColorSystem` | `demo_api_ui/src/components/TokenColorSystem.js` | `deriveTokenCategory(credentialPath)` → colour. `TokenColorDot` — colored dot badge. `TokenColorLegend` — legend row. |

### Static Education Panels

| Component | File | EDU ID | Content |
|---|---|---|---|
| `ActorTokenEducation` | `demo_api_ui/src/components/ActorTokenEducation.tsx` | n/a (standalone page `/actor-token-education`) | Explains actor/agent token terminology, FAQ (5 items), `act` and `may_act` claims. |
| `AgenticTrustEducation` | `demo_api_ui/src/components/AgenticTrustEducation.tsx` | n/a (panel) | 8-pillar agentic trust framework; uses `ScopeNarrowingVisualization`. Opens sub-panels via `useEducationUI` + `EDU.*` IDs. |
| `MCPToolsEducation` | `demo_api_ui/src/components/MCPToolsEducation.tsx` | n/a (standalone) | Tool catalog with categories (Read-Only, Write, Admin). Each tool shows scopes, params, example response. Static data — not live-fetched. |

### Navigation & Triggering

| Component | File | Role |
|---|---|---|
| `EducationBar` | `demo_api_ui/src/components/EducationBar.js` | Top-right hamburger menu; calls `open(EDU.*)` to trigger panels. Also dispatches `'education-open-ciba'` and `'education-open-cimd'` custom events. In `DEMO_MODE`, shows only the Agent UI button. |
| `SideNavEducationTrigger` | `demo_api_ui/src/components/SideNavEducationTrigger.js` | Sidebar entry that triggers an education panel. |

---

## Token Event Shape

Each entry in `tokenChainService`'s in-memory map has this structure (from `TokenEvent` constant):

```js
{
  id: '',
  timestamp: '',
  eventType: '',        // 'auth' | 'exchange' | 'refresh' | 'revoke'
  tokenType: '',        // 'user_token' | 'agent_token' | 'exchanged_token'
  tokenSub: '',         // sub claim
  tokenAct: null,       // act claim object (agent info)
  tokenAgent: null,     // agent client ID
  scopes: [],
  audience: '',
  issuer: '',
  expiry: null,
  description: '',      // human-readable (from generateTokenDescription())
  exchangeSteps: [],    // for exchange events
  userId: '',           // user who owns this chain
}
```

`TokenDiffPanel` reads `ev.claims` (decoded JWT payload) from each event. This is set when the BFF populates events with full decoded claims.

---

## BFF Routes

| Route | File | Role |
|---|---|---|
| `GET /api/token-chain` | `demo_api_server/routes/tokenChain.js` | Returns `{ tokenChain, mcpToolCallsChain, validationMode, metadata }` for the authenticated user. Falls back to `synthesizeFromSession()` if chain is empty. Scrubs raw JWTs before responding. |
| `POST /api/token-display/decode` | `demo_api_server/routes/tokenDisplay.js` | Decode JWT with claim descriptions (for education). |
| `POST /api/token-display/raw-decode` | `demo_api_server/routes/tokenDisplay.js` | Decode JWT returning raw header + payload (for `TokenCard`). |

---

## TokenDiffPanel Claim Order

Claims in `TokenDiffPanel` are rendered in `CLAIM_INTEREST_ORDER`:
```js
['sub', 'aud', 'scope', 'act', 'may_act', 'client_id', 'iss', 'exp', 'iat', 'jti', 'acr', 'amr', 'env', 'org', 'azp']
```
Unknown claims are appended after this list. Do not change this order without updating `CLAIM_GLOSSARY` entries to match.

---

## Adding a New Education Panel

1. **Create the component** — `demo_api_ui/src/components/MyNewEducation.tsx`
   - Use CSS modules (`MyNewEducation.module.css`) or a plain CSS file
   - For static content: no context needed
   - For live token data: `useTokenChainOptional()` from `TokenChainContext`

2. **Register an EDU ID** — add to `demo_api_ui/src/components/education/educationIds.js`:
   ```js
   export const EDU = {
     ...
     MY_NEW_PANEL: 'my-new-panel',
   };
   ```

3. **Wire into EducationBar** — add a button that calls `open(EDU.MY_NEW_PANEL)`:
   ```js
   const go = useCallback((panelId, tabId) => () => { open(panelId, tabId); close(); }, [open, close]);
   <button onClick={go(EDU.MY_NEW_PANEL)}>My New Panel</button>
   ```

4. **Render in the panel host** — find where existing EDU panels are rendered (typically a switch in the parent layout) and add your panel ID.

5. **DEMO_MODE check** — if the panel should be hidden in `DEMO_MODE`, wrap with `useDemoMode()` check.

---

## Common Mistakes

| Mistake | Fix |
|---|---|
| Using `useTokenChain` (throwing) in a component that may render outside `TokenChainProvider` | Use `useTokenChainOptional` instead — returns `null` gracefully |
| Hardcoding a panel ID string instead of using the `EDU` constant | Use `EDU.MY_PANEL` from `educationIds.js` — string drift is how panels stop opening |
| Adding a new claim to the diff table without adding a glossary entry | Add to `CLAIM_GLOSSARY` in `TokenDiffPanel.js` for the tooltip |
| Directly fetching `/api/token-chain` in a component | Consume from `TokenChainContext` — it handles polling, cold-start fallback, and localStorage history |
| Using `⚠️` emojis in panel text — that's fine, but no other emojis | The emoji rule allows `⚠️` `✅` `❌` in panel copy too |
| Marking a `_synthetic` chain as "verified" in UI copy | Always check `synthetic` flag in response metadata and label it accordingly |

---

## Files to Read Before Editing

| File | Role |
|---|---|
| `demo_api_ui/src/context/TokenChainContext.js` | Live token event bus — shape of events, setEvents, history |
| `demo_api_ui/src/context/EducationUIContext.js` | Education panel open/close state |
| `demo_api_ui/src/components/education/educationIds.js` | EDU panel ID constants — add new IDs here |
| `demo_api_ui/src/components/TokenChainDisplay.js` | Full chain table + RFC link rendering |
| `demo_api_ui/src/components/TokenDiffPanel.js` | Claim diff — `CLAIM_INTEREST_ORDER`, `CLAIM_GLOSSARY`, `diffStatus` |
| `demo_api_ui/src/components/TokenCard.jsx` | Single token renderer — `POST /api/token-display/raw-decode` |
| `demo_api_ui/src/components/TokenColorSystem.js` | `deriveTokenCategory`, `TokenColorDot` — colour classification |
| `demo_api_ui/src/components/EducationBar.js` | Top-right menu — how to add a new panel trigger |
| `demo_api_ui/src/components/ActorTokenEducation.tsx` | Pattern for static FAQ-style education panel |
| `demo_api_ui/src/components/AgenticTrustEducation.tsx` | Pattern for pillar-list education with sub-panel links |
| `demo_api_server/services/tokenChainService.js` | BFF token event storage, `TokenEvent` shape, `synthesizeFromSession` |
| `demo_api_server/routes/tokenChain.js` | `GET /api/token-chain` — what the UI fetches |
