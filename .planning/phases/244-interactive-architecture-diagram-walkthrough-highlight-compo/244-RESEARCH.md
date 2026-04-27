# Phase 244: Interactive Architecture Diagram Walkthrough — Research

**Researched:** 2026-04-27
**Domain:** React SVG overlay, event polling, real-time diagram highlighting
**Confidence:** HIGH (all claims verified against codebase)

---

## Summary

Phase 244 adds two new React pages — `/architecture/overview` and `/architecture/token-flow` — each showing a static PNG diagram with an absolute-positioned SVG overlay. Rectangular regions in the SVG highlight in real-time when matching events arrive from the existing `appEventService` polling endpoint, or when the banking agent's LLM response text contains component keywords.

The entire event delivery infrastructure already exists: `GET /api/admin/app-events` is polled every 10 seconds by `ActivityLogs.js`. The architecture pages simply subscribe to the same endpoint, filter events by category/tag, and map them onto SVG region coordinates. No new backend endpoints are needed.

The routing and nav pattern is fully established: `/monitoring/*` outer routes live in `App.js` with explicit `<Route path="/monitoring/*">` wrappers; the `AdminSideNav` Monitoring section holds child links. Two new child entries and two new inner `<Route>` paths are the complete infrastructure change.

**Primary recommendation:** Use absolute-positioned SVG `<rect>` elements (not canvas, not CSS clip-path) with `useEffect`-driven `useState` for active regions. Poll `/api/admin/app-events` on the same 10-second cadence as ActivityLogs. Scan the `agent_prompt/llm_complete` event's `metadata.response` string for keyword matches. Store region maps as plain JS config objects (no TypeScript needed — project uses `.js`/`.jsx`).

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **Trigger Model:** Banking agent mentions/tool calls + live system events both drive highlighting; both coexist on same page.
- **Page Structure:** Two dedicated pages; routes `/architecture/overview` and `/architecture/token-flow`; both in sidebar.
- **Diagram Display:** Static PNG assets in `banking_api_ui/public/architecture/`; SVG overlay absolutely positioned over image with matching coordinate regions.
- **Highlight Behavior:** Glowing border + semi-transparent fill in brand accent color; auto-clears after 3-5 seconds; multiple simultaneous highlights allowed; pulsing animation while active, fade on clear.
- **Event → Component Mapping (Overview):** `mcp_tool_call` → MCP GW; `authorize` (PERMIT/DENY) → PingAuthorize; `token_exchange` → IdP/OAuth AS + MCP GW; `agent_prompt/llm_invoke` or `agent_prompt/llm_complete` → Agent; auth_lifecycle/oauth → User + Trust Boundary; backend service call → Service regions.
- **Event → Component Mapping (Token Flow):** Same events mapped to more granular components.
- **Agent Semantic Trigger:** Scan agent LLM response text for keyword/component names → highlight matching region.
- **Data Source:** Reuse existing `appEventService` event stream; no new backend endpoints.
- **Image Assets:** PNG files stored in `banking_api_ui/public/architecture/`; provided by user.
- **Component Region Map:** Hand-defined per-image; stored as JS config file per diagram; shape: `{ id, label, bounds: { x, y, width, height }, triggers: string[] }`.
- **UI Placement:** Both pages added to AdminSideNav under Monitoring group; accessible to all logged-in users (not adminOnly); FAB agent visible (already covered by `isEmbeddedAgentDockRoute` via `/monitoring` prefix).

### Claude's Discretion
- Exact pixel coordinates for each region (must be derived visually from the image)
- Whether to use canvas overlay vs absolute-positioned SVG divs
- Tooltip content on hover for each component
- Color scheme for highlighting (use existing brand CSS variables)
- Whether to add a "step through" manual mode — out of scope unless quick

### Deferred Ideas (OUT OF SCOPE)
- Manual "step through" prev/next walkthrough mode
- Audio narration per step
- Animated arrow drawing between components
- Clickable components that open documentation panels
- Editing the region map via admin UI
</user_constraints>

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Diagram image rendering | Browser / Client | — | Static PNG served from `public/`; `<img>` tag in React |
| SVG region overlay | Browser / Client | — | Absolutely positioned over image; pure React/CSS |
| Event polling | Browser / Client | API / Backend | Frontend polls `/api/admin/app-events`; backend returns in-memory ring buffer |
| Agent keyword scanning | Browser / Client | — | Scan text of `agent_prompt/llm_complete` events; no backend work needed |
| Highlight state management | Browser / Client | — | `useState` with setTimeout for auto-clear |
| Route/nav registration | Browser / Client | — | App.js `<Route>` + AdminSideNav children array |
| Event emission | API / Backend | — | `appEventService.logEvent()` already instruments all relevant backend paths |

---

## Standard Stack

### Core (already in project — no new installs)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | 18.x (CRA) | Component rendering, hooks | Project baseline [VERIFIED: banking_api_ui/package.json] |
| React Router v6 | In use | Route definition | All routes in App.js use v6 `<Routes>/<Route>` [VERIFIED: App.js] |
| `apiClient` (axios) | In use | HTTP polling to BFF | Same client used by ActivityLogs.js [VERIFIED: ActivityLogs.js] |

### No New Libraries Required
All needed capabilities (SVG, CSS animations, polling, event state) are native browser APIs or already-installed React. Adding a diagram library (react-flow, d3, etc.) would be over-engineering — the regions are static rectangles over a fixed image.

**Installation:** None required.

---

## Architecture Patterns

### System Architecture Diagram

```
[banking_api_server]
  appEventService (ring buffer, 200 events max)
       |
       | logEvent() called by:
       |   bankingAgentLangGraphService → category='agent_prompt', tag='agent_prompt/llm_complete'
       |   agentMcpTokenService         → category='token_exchange', tag='token_exchange/rfc8693-*'
       |   authorize middleware          → category='authorize', tag='authorize/bypass|permit|deny'
       |   oauthUser route              → category='oauth'
       v
  GET /api/admin/app-events?limit=200
       |
       | polled every 10s (same as ActivityLogs.js)
       v
[React: ArchitectureOverviewPage / ArchitectureTokenFlowPage]
  useEffect → setInterval(fetchEvents, 10000)
       |
       | each event batch:
       |   1. filter by category + tag → matched region IDs
       |   2. scan llm_complete metadata.response text → keyword → region IDs
       |   3. setActiveRegions(prev => merge new hits with timestamp)
       v
  DiagramCanvas component
    <div style="position:relative; display:inline-block">
      <img src="/architecture/overview.png" />
      <svg style="position:absolute; top:0; left:0; width:100%; height:100%">
        {regions.map(r => <HighlightRect ... active={activeRegions.has(r.id)} />)}
      </svg>
    </div>
       |
       | active region → CSS class with:
       |   box-shadow glow (brand-navy accent)
       |   semi-transparent fill
       |   pulse keyframe animation
       |   auto-clear via setTimeout (3-5s)
```

### Recommended Project Structure
```
banking_api_ui/public/
└── architecture/
    ├── overview.png          # Ping Identity Digital Assistants diagram
    └── token-flow.png        # Whiteboard token-flow diagram

banking_api_ui/src/
├── components/
│   ├── ArchitectureDiagramPage.js       # Shared page wrapper (image + SVG overlay)
│   ├── ArchitectureDiagramPage.css      # Highlight animations + region styles
│   ├── ArchitectureOverviewPage.js      # Page 1: imports overview regions config
│   └── ArchitectureTokenFlowPage.js     # Page 2: imports token-flow regions config
└── config/
    ├── diagram-overview-regions.js      # Region coordinate map for overview.png
    └── diagram-token-flow-regions.js    # Region coordinate map for token-flow.png
```

### Pattern 1: SVG Overlay with Percentage-Based Coordinates

**What:** Position an `<svg>` absolutely over the `<img>` using `width:100%/height:100%`. Define region bounds as percentages (0–100) of image dimensions so they scale correctly when the container resizes.

**When to use:** Any time a fixed-coordinate overlay must work at multiple display sizes.

**Example:**
```javascript
// Source: standard SVG overlay pattern [VERIFIED: MDN / React controlled component pattern]

// diagram-overview-regions.js
export const OVERVIEW_REGIONS = [
  {
    id: 'mcp-gw',
    label: 'MCP Gateway',
    bounds: { xPct: 62, yPct: 38, wPct: 14, hPct: 18 }, // percentages of image
    triggers: ['mcp', 'token_exchange'],              // event categories
    tags: [],                                          // specific tags (empty = any tag in category)
    keywords: ['mcp gateway', 'mcp gw', 'gateway'],  // agent text keywords (lowercase)
  },
  // ...
];

// ArchitectureDiagramPage.js (shared)
function HighlightRect({ region, active }) {
  const { xPct, yPct, wPct, hPct } = region.bounds;
  return (
    <rect
      x={`${xPct}%`}
      y={`${yPct}%`}
      width={`${wPct}%`}
      height={`${hPct}%`}
      className={active ? 'diagram-region diagram-region--active' : 'diagram-region'}
      rx="4"
    >
      <title>{region.label}</title>
    </rect>
  );
}
```

**Why SVG `<rect>` over CSS clip-path over Canvas:**
- SVG `<rect>` is the right choice: declarative, percentage-friendly, animatable via CSS, tooltip via `<title>`, accessible via `aria-label`. [VERIFIED: browser support, React SVG patterns]
- CSS clip-path: suited for irregular shapes but percentage positioning is harder to author by hand.
- Canvas: imperative, no CSS animations, harder to make accessible, requires manual redraw on resize. Avoid.

### Pattern 2: Event Polling — Reuse ActivityLogs Pattern

**What:** Poll `GET /api/admin/app-events` at an interval; track last seen timestamp to detect new events.

**Key detail:** The endpoint requires `requireAdmin` + `requireScopes(['banking:admin'])`. These pages are accessible to all logged-in users per CONTEXT.md decision, but the event endpoint is admin-only. Resolution: either (a) keep the pages accessible to all but only show live highlights for admin users (check user role before polling), or (b) add a lightweight non-admin endpoint. Recommendation: check user role; show static diagram with a notice for non-admin users that live events require admin role.

**Example (from ActivityLogs.js, verified):**
```javascript
// Source: banking_api_ui/src/components/ActivityLogs.js lines 127-148 [VERIFIED]
const fetchAppEvents = useCallback(async () => {
  const params = new URLSearchParams();
  params.append('limit', '50');  // Only need recent events for diagram
  const response = await apiClient.get(`/api/admin/app-events?${params}`);
  return response.data.events || [];
}, []);

useEffect(() => {
  fetchAppEvents();
  const pollRef = setInterval(fetchAppEvents, 10000);
  return () => clearInterval(pollRef);
}, [fetchAppEvents]);
```

**`since` query parameter:** The endpoint supports `?since=<ISO timestamp>`. Use this to only fetch new events rather than re-fetching the full 200-event buffer each poll. Track `lastFetchedAt` ref.

### Pattern 3: Agent Keyword Scanning

**What:** The `agent_prompt/llm_complete` event in `appEventService` has `metadata.response` containing the LLM's text response. Scan this string (lowercased) for component keywords.

**Event shape (verified from bankingAgentLangGraphService.js line 286-287):**
```javascript
// category: 'agent_prompt'
// tag: 'agent_prompt/llm_complete'
// metadata.response: "...the token exchange at the MCP gateway uses RFC 8693..."
```

**Keyword scan pattern:**
```javascript
function getTriggeredRegionsByKeyword(responseText, regions) {
  const lower = responseText.toLowerCase();
  return regions
    .filter(r => r.keywords.some(kw => lower.includes(kw)))
    .map(r => r.id);
}
```

**When to trigger:** On any new event with `category === 'agent_prompt'` and `tag === 'agent_prompt/llm_complete'`. Scan `event.metadata?.response`.

### Pattern 4: Highlight State with Auto-Clear

**What:** Track active region IDs with timestamp; auto-clear after timeout via `useRef` timer management.

```javascript
// Source: standard React pattern [VERIFIED]
const [activeRegions, setActiveRegions] = useState({}); // { regionId: { activatedAt: Date } }
const clearTimers = useRef({});

function activateRegion(regionId, timeoutMs = 4000) {
  if (clearTimers.current[regionId]) clearTimeout(clearTimers.current[regionId]);
  setActiveRegions(prev => ({ ...prev, [regionId]: { activatedAt: Date.now() } }));
  clearTimers.current[regionId] = setTimeout(() => {
    setActiveRegions(prev => {
      const next = { ...prev };
      delete next[regionId];
      return next;
    });
  }, timeoutMs);
}
```

### Pattern 5: Route and Nav Registration

**Adding a `/architecture/*` outer route (mirrors the `/monitoring/*` pattern in App.js):**

```javascript
// App.js — add after the /monitoring/* block [VERIFIED: App.js lines 792-809]
<Route
  path="/architecture/*"
  element={
    <>
      <AdminSideNav user={user} />
      <TopNav user={user} onLogout={logout} />
      <main className="main-content">
        <Routes>
          <Route path="overview" element={<ArchitectureOverviewPage user={user} />} />
          <Route path="token-flow" element={<ArchitectureTokenFlowPage user={user} />} />
        </Routes>
      </main>
    </>
  }
/>
```

**Sidebar (AdminSideNav.jsx) — add under Monitoring children array [VERIFIED: AdminSideNav.jsx lines 120-135]:**
```javascript
{ label: 'Architecture', icon: '🗺️',
  children: [
    { label: 'Overview Diagram',    path: '/architecture/overview',    icon: '🏗️' },
    { label: 'Token Flow Diagram',  path: '/architecture/token-flow',  icon: '🔗' },
  ]
},
// OR: add as children under existing Monitoring group
{ label: 'Arch Overview',     path: '/architecture/overview',    icon: '🏗️' },
{ label: 'Arch Token Flow',   path: '/architecture/token-flow',  icon: '🔗' },
```

**sidebarRoutePatterns in App.js:** Add `'/architecture'` to the `sidebarRoutePatterns` array [VERIFIED: App.js line 587-613] so the sidebar renders on these routes.

**embeddedAgentFabVisibility.js:** The `/architecture` routes will be caught by `isEmbeddedAgentDockRoute` because `p.startsWith('/monitoring')` is already there — BUT `/architecture` does NOT start with `/monitoring`. Must add the prefix explicitly. [VERIFIED: embeddedAgentFabVisibility.js line 26]. CONTEXT.md says FAB is visible on both pages — add `/architecture` to the `startsWith` check in `isEmbeddedAgentDockRoute` and to `MONITORING_PREFIXES` in `isMonitoringRoute`.

### Anti-Patterns to Avoid

- **Canvas overlay:** Imperative repaint, no CSS animation, no `<title>` tooltips, resize events needed. Use SVG.
- **Pixel-absolute coordinates without scaling:** If bounds are hardcoded pixels and the image container is not fixed-width, regions drift on different screen sizes. Use percentage bounds.
- **Re-fetching full 200-event buffer every poll:** Use `?since=` query param so only new events are returned. The buffer is in-memory; flooding it with 200-event fetches every 10s is wasteful.
- **Single `setActive` clearing another component's timer:** Use per-region timers tracked in a `useRef` object (see Pattern 4). A single global timer would clear all regions at once when one expires.
- **Importing large diagramming libraries (react-flow, d3):** These pages need static image + SVG rects. No graph library needed.
- **Putting region maps inside the component file:** Keep them in separate config files so coordinates can be updated without touching component logic.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Event delivery | SSE / WebSocket | Poll `/api/admin/app-events` | Already exists, tested, admin-gated |
| Animation | JS animation loop | CSS `@keyframes` on SVG rect | Declarative, GPU-accelerated, no RAF loop needed |
| Responsive overlay | Manual resize observer | SVG `width:100%/height:100%` + percentage bounds | Browser handles scaling automatically |
| Tooltip | Custom popup component | SVG `<title>` element inside each `<rect>` | Native browser tooltip, zero JS |

**Key insight:** The entire value of this phase is in the region coordinate data and the event→region mapping logic, not in the overlay mechanism. Keep the mechanism as simple as possible (SVG + CSS) so maintenance cost stays near zero.

---

## Event → Region Mapping Reference

Verified from `appEventService.js` and instrumented services:

| Event Category | Tag (from codebase) | Overview Region | Token Flow Region |
|---------------|---------------------|-----------------|-------------------|
| `agent_prompt` | `agent_prompt/llm_invoke` | Agent | agent1, LLM |
| `agent_prompt` | `agent_prompt/llm_complete` | Agent + keyword scan | agent1 + keyword scan |
| `agent_prompt` | `agent_prompt/heuristic_tool` | Agent | agent1 |
| `token_exchange` | `token_exchange/rfc8693-success` | IdP/OAuth AS + MCP GW | PingOne AIC + Token Exc box + MCP Gateway |
| `token_exchange` | `token_exchange/rfc8693-error` | IdP/OAuth AS + MCP GW (error color) | same |
| `authorize` | `authorize/bypass` | PingAuthorize (grey/dimmed) | PingAuthorize |
| `authorize` | `authorize/permit` | PingAuthorize (green) | PingAuthorize |
| `authorize` | `authorize/deny` | PingAuthorize (red) | PingAuthorize |
| `oauth` | `oauth/user/callback` | User + IdP/OAuth AS | OLB Application + PingOne AIC |
| `mcp` | any | MCP GW | MCP Gateway |
| `agent` | `agent/message` | Agent | chatbot |

[VERIFIED: bankingAgentLangGraphService.js, agentMcpTokenService.js, authorize.js, oauthUser.js, appEventService.js]

**Note on `mcp` category tag:** The MCP WebSocket client writes traffic entries via `writeMcpTrafficEntry()` (mcpTrafficLogger) — separate from appEventService. The `mcp` category in appEventService is used for the agent-side MCP events. Confirm during implementation which service tags produce `category: 'mcp'` vs what goes to mcpTrafficLogger only.

---

## Common Pitfalls

### Pitfall 1: Admin-Only Event Endpoint Used on All-User Page
**What goes wrong:** `/api/admin/app-events` requires `requireAdmin`. Non-admin users navigating to `/architecture/overview` will get 403 errors on every poll. The page appears broken.
**Why it happens:** CONTEXT.md says the pages are accessible to all users; event endpoint is admin-gated.
**How to avoid:** Check `user.role` before starting the poll. For non-admin users, show the diagram in static mode with a badge: "Live event highlighting requires admin role." Admin users get the live poll.
**Warning signs:** 403 errors in browser DevTools network tab on `/api/admin/app-events`.

### Pitfall 2: SVG Doesn't Cover the Image
**What goes wrong:** The SVG overlay is sized to the `<div>` container but the image has intrinsic aspect ratio; the SVG may not match the rendered image bounds.
**Why it happens:** `<img>` with no explicit width/height takes intrinsic dimensions. The `<svg>` set to `width:100%; height:100%` covers the container, not the image's rendered area.
**How to avoid:** Wrap `<img>` in a container `<div style="position:relative; display:inline-block">`. Set `<img style="display:block; width:100%; max-width:XXXpx">`. The `inline-block` container shrinks to image size, so the SVG covers exactly the image.
**Warning signs:** Regions visually misaligned — off by a gap at top or bottom.

### Pitfall 3: Region Coordinates Become Wrong When Image Resizes
**What goes wrong:** Pixel coordinates defined at one screen width are wrong at another.
**Why it happens:** If `bounds` are in pixels and the image is scaled down, the overlay regions stay in absolute pixel positions.
**How to avoid:** Define all bounds as percentages (0–100%) of the image natural dimensions. The SVG handles the scaling.

### Pitfall 4: All Regions Cleared Together When First Expires
**What goes wrong:** User triggers agent → 3 regions light up simultaneously → first region's 4s timer fires → all 3 disappear.
**Why it happens:** Single `setTimeout(() => setActiveRegions({}), 4000)` clears the whole map.
**How to avoid:** Per-region timers in a `useRef` object (Pattern 4 above). Each region clears independently.

### Pitfall 5: Missing `/architecture` in `sidebarRoutePatterns` and FAB Visibility Utils
**What goes wrong:** Navigating to `/architecture/overview` causes the sidebar to disappear (it only renders on known patterns) and the FAB agent is hidden.
**Why it happens:** `sidebarRoutePatterns` (App.js line 587) and `isEmbeddedAgentDockRoute` / `isMonitoringRoute` (embeddedAgentFabVisibility.js) don't know about `/architecture`.
**How to avoid:** All three updates are required in the same task — route in App.js, sidebar entry in AdminSideNav.jsx, and both utility functions in embeddedAgentFabVisibility.js.

### Pitfall 6: Importing Components that Don't Exist Yet
**What goes wrong:** `App.js` imports `ArchitectureOverviewPage` at top of file before it is created. The build fails or the dev server crashes on hot-reload.
**Why it happens:** App.js has 90+ static imports at the top (lines 1-110 verified). Adding an import before the component file exists breaks CRA's module resolution.
**How to avoid:** Create the component files before adding the import to App.js. Plan the task order: (1) create config files → (2) create components → (3) wire App.js + AdminSideNav + embeddedAgentFabVisibility.

### Pitfall 7: `since` Parameter Ignored → Duplicate Event Processing
**What goes wrong:** Every 10-second poll returns the same 50+ events. Every event is reprocessed, re-triggering highlights. Regions flash continuously even when nothing new has happened.
**Why it happens:** Not using `?since=<lastFetchedAt>` query param.
**How to avoid:** Track `lastFetchedAt` in a `useRef`. After first fetch, set `lastFetchedAt = new Date().toISOString()`. On subsequent fetches, append `?since=<lastFetchedAt>`. Only non-empty responses trigger highlights.

---

## Code Examples

### CSS Highlight Animation (brand colors)
```css
/* Source: project brand variables from banking_api_ui/src/index.css [VERIFIED] */
/* --brand-navy: #004687; --brand-blue: #0066CC */

.diagram-region {
  fill: transparent;
  stroke: transparent;
  stroke-width: 2;
  transition: fill 0.3s ease, stroke 0.3s ease;
  pointer-events: none; /* don't intercept mouse events from image below */
}

.diagram-region--active {
  fill: rgba(0, 70, 135, 0.18);      /* --brand-navy at 18% opacity */
  stroke: #004687;                   /* --brand-navy */
  stroke-width: 3;
  animation: diagram-pulse 1.2s ease-in-out infinite;
  filter: drop-shadow(0 0 6px rgba(0, 102, 204, 0.7));
}

@keyframes diagram-pulse {
  0%   { stroke-width: 3; opacity: 1; }
  50%  { stroke-width: 4; opacity: 0.7; }
  100% { stroke-width: 3; opacity: 1; }
}

.diagram-region--active-error {
  fill: rgba(239, 68, 68, 0.15);
  stroke: #ef4444;
  stroke-width: 3;
}

.diagram-region--active-permit {
  fill: rgba(76, 175, 80, 0.15);
  stroke: #4CAF50;
  stroke-width: 3;
}
```

### Minimal ArchitectureDiagramPage Component Shell
```javascript
// Source: synthesized from ActivityLogs.js polling pattern + standard SVG overlay [VERIFIED patterns]
import React, { useState, useEffect, useRef, useCallback } from 'react';
import apiClient from '../services/apiClient';
import AdminSubPageShell from './AdminSubPageShell';
import './ArchitectureDiagramPage.css';

export default function ArchitectureDiagramPage({ title, imageSrc, regions, user }) {
  const [activeRegions, setActiveRegions] = useState({});
  const clearTimers = useRef({});
  const lastFetchedAt = useRef(null);
  const pollRef = useRef(null);

  const activateRegion = useCallback((regionId, colorClass = 'active', timeoutMs = 4000) => {
    if (clearTimers.current[regionId]) clearTimeout(clearTimers.current[regionId]);
    setActiveRegions(prev => ({ ...prev, [regionId]: colorClass }));
    clearTimers.current[regionId] = setTimeout(() => {
      setActiveRegions(prev => { const n = { ...prev }; delete n[regionId]; return n; });
    }, timeoutMs);
  }, []);

  const processEvents = useCallback((events, regions) => {
    events.forEach(evt => {
      regions.forEach(r => {
        const categoryMatch = r.triggers.includes(evt.category);
        const tagMatch = r.tags.length === 0 || r.tags.includes(evt.tag);
        if (categoryMatch && tagMatch) {
          const colorClass = evt.tag?.includes('/deny') ? 'active-error'
            : evt.tag?.includes('/permit') ? 'active-permit'
            : 'active';
          activateRegion(r.id, colorClass);
        }
        // keyword scan for llm_complete
        if (evt.tag === 'agent_prompt/llm_complete' && evt.metadata?.response) {
          const lower = evt.metadata.response.toLowerCase();
          if (r.keywords?.some(kw => lower.includes(kw))) {
            activateRegion(r.id, 'active');
          }
        }
      });
    });
  }, [activateRegion]);

  const fetchEvents = useCallback(async () => {
    if (user?.role !== 'admin') return; // admin-only endpoint
    try {
      const params = new URLSearchParams({ limit: '50' });
      if (lastFetchedAt.current) params.append('since', lastFetchedAt.current);
      const res = await apiClient.get(`/api/admin/app-events?${params}`);
      const events = res.data?.events || [];
      if (events.length > 0) processEvents(events, regions);
      lastFetchedAt.current = new Date().toISOString();
    } catch (_e) { /* non-admin 403 swallowed */ }
  }, [user, processEvents, regions]);

  useEffect(() => {
    fetchEvents();
    pollRef.current = setInterval(fetchEvents, 10000);
    return () => {
      clearInterval(pollRef.current);
      Object.values(clearTimers.current).forEach(clearTimeout);
    };
  }, [fetchEvents]);

  return (
    <AdminSubPageShell title={title}>
      <div style={{ position: 'relative', display: 'inline-block', width: '100%', maxWidth: 1200 }}>
        <img src={imageSrc} alt={title} style={{ display: 'block', width: '100%' }} />
        <svg
          style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}
          aria-hidden="true"
        >
          {regions.map(r => (
            <rect
              key={r.id}
              x={`${r.bounds.xPct}%`}
              y={`${r.bounds.yPct}%`}
              width={`${r.bounds.wPct}%`}
              height={`${r.bounds.hPct}%`}
              rx="4"
              className={`diagram-region${activeRegions[r.id] ? ` diagram-region--${activeRegions[r.id]}` : ''}`}
            >
              <title>{r.label}</title>
            </rect>
          ))}
        </svg>
      </div>
      {user?.role !== 'admin' && (
        <p style={{ color: '#64748b', fontSize: '0.85rem', marginTop: '0.75rem' }}>
          Live event highlighting requires admin role.
        </p>
      )}
    </AdminSubPageShell>
  );
}
```

---

## Environment Availability

Step 2.6: SKIPPED — this phase is purely code/config changes with no new external dependencies. All required runtime dependencies (React, CRA build, browser SVG) are already present in the project.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | react-scripts (Jest + React Testing Library) |
| Config file | none (CRA default) |
| Quick run command | `cd banking_api_ui && npm run test:unit -- --testPathPattern=Architecture` |
| Full suite command | `cd banking_api_ui && npm run build` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| 244-R1 | Routes `/architecture/overview` and `/architecture/token-flow` render without crashing | smoke | `npm run build` exit 0 | ❌ Wave 0 |
| 244-R2 | Sidebar shows Architecture entries | manual-only | visual inspection | ❌ |
| 244-R3 | SVG overlay regions render over image | smoke | `npm run build` exit 0 | ❌ Wave 0 |
| 244-R4 | Event polling calls `/api/admin/app-events?since=` | manual-only | DevTools network tab | ❌ |
| 244-R5 | Admin users see highlights; non-admin users see static diagram + notice | manual-only | role-switch test | ❌ |
| 244-R6 | FAB agent visible on both architecture pages | manual-only | navigate + observe | ❌ |

### Sampling Rate
- **Per task commit:** `cd banking_api_ui && npm run build` — exit code 0 is the primary gate
- **Per wave merge:** Build + visual review in browser
- **Phase gate:** Full build green + manual walkthrough before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] No test files needed beyond build verification — the phase is primarily visual/interactive; unit tests for the pure mapping logic (`getTriggeredRegionsByKeyword`, `processEvents`) are optional but would be useful
- [ ] Build will fail immediately if App.js imports non-existent components — task ordering matters (create files before wiring imports)

---

## Security Domain

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | — |
| V3 Session Management | no | — |
| V4 Access Control | yes | Admin-gate: poll only when `user.role === 'admin'`; endpoint already has `requireAdmin` |
| V5 Input Validation | yes | Event text scanned for keywords — use `toLowerCase()` + `includes()` only; no eval, no regex with user input |
| V6 Cryptography | no | — |

### Known Threat Patterns
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Unauthenticated event data exposure | Information Disclosure | Swallow 403 silently; show static diagram only |
| XSS via agent response text in SVG | Tampering | Keyword scan uses string `.includes()` only; never inject response text into DOM/SVG innerHTML |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The `mcp` category in appEventService covers MCP tool calls in the agent flow (not just mcpTrafficLogger entries) | Event → Region Mapping | If MCP tool calls only go to mcpTrafficLogger and not appEventService, `mcp` category will never fire; need separate polling of `/api/mcp/traffic` |
| A2 | The project uses `.js`/`.jsx` (not `.ts`/`.tsx`) for all new components | Standard Stack | Confirmed by checking existing components; risk is low |
| A3 | Region coordinate percentages can be estimated from the PNG files when they arrive | Component Region Map | Coordinates cannot be known without viewing the actual images |

---

## Open Questions

1. **MCP tool call events in appEventService**
   - What we know: `mcpWebSocketClient.js` calls `writeMcpTrafficEntry()` (mcpTrafficLogger); `appEventService` has a `mcp` category; `agentMcpTokenService` logs `token_exchange` not `mcp`.
   - What's unclear: Are there any `appEventService.logEvent('mcp', ...)` calls in the codebase? Grep shows none in the files examined — the `mcp` category in EVENT_CATEGORIES may be unused.
   - Recommendation: During implementation, grep for `logEvent.*mcp` across all server files. If unused, the `mcp` trigger must be satisfied by inspecting tags like `agent_prompt/heuristic_tool` with `action === 'mcp_tool_call'`, or by polling `/api/mcp/traffic` instead.

2. **Image aspect ratios and natural dimensions**
   - What we know: PNG files not yet saved; region coordinates cannot be determined until images are available.
   - What's unclear: Whether overview.png and token-flow.png will be landscape, widescreen, or square.
   - Recommendation: The implementer must view each image, note the pixel dimensions, and calculate percentage bounds for each named region visually (e.g., using browser DevTools or an image editor).

---

## Sources

### Primary (HIGH confidence — verified by direct codebase read)
- `banking_api_server/services/appEventService.js` — event structure, categories, `getEvents()` API, `?since` support
- `banking_api_server/services/bankingAgentLangGraphService.js` — event tags and metadata shapes for agent_prompt events
- `banking_api_server/services/agentMcpTokenService.js` — token_exchange event tags
- `banking_api_server/routes/admin.js` lines 951-1013 — `/api/admin/app-events` endpoint, auth requirements
- `banking_api_ui/src/components/ActivityLogs.js` lines 127-148 — polling pattern with 10s interval
- `banking_api_ui/src/App.js` lines 792-809 — `/monitoring/*` outer route pattern
- `banking_api_ui/src/components/AdminSideNav.jsx` lines 120-135 — Monitoring children array, section structure
- `banking_api_ui/src/utils/embeddedAgentFabVisibility.js` — `isEmbeddedAgentDockRoute`, `isMonitoringRoute`, `MONITORING_PREFIXES`
- `banking_api_ui/src/index.css` — CSS brand variables (--brand-navy, --brand-blue, etc.)
- `banking_api_ui/src/components/AdminSubPageShell.js` — page shell component API

### Secondary (MEDIUM confidence)
- SVG percentage-coordinate overlay pattern — standard browser behavior, no external source needed

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all confirmed in place; no new packages needed
- Architecture: HIGH — event polling, SVG overlay, and routing patterns all verified from existing code
- Pitfalls: HIGH — most pitfalls are direct observations from reading the existing code (auth gate, timer management, route patterns)
- Region coordinates: LOW — cannot be determined without the actual image files

**Research date:** 2026-04-27
**Valid until:** 2026-05-27 (stable patterns; only risk is if appEventService is refactored)
