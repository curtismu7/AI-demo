# Phase 244: Interactive Architecture Diagram Walkthrough — Context

**Gathered:** 2026-04-27
**Status:** Ready for planning
**Source:** Live design conversation

<domain>
## Phase Boundary

Two new dedicated React pages, each showing one architecture diagram image with interactive SVG overlay regions. Components on the diagram highlight in real-time as the banking agent processes steps OR as live system events fire through the MCP gateway/MCP server stack. This is an educational visualization — it shows the user which part of the architecture is "active" at any moment.

**Page 1:** Ping Identity "Digital Assistants" high-level diagram (the 5-step flow: User Auth → Access Token → Agent → MCP GW/API GW → Fine-Grained AZ → Backend Services)

**Page 2:** Detailed token-flow whiteboard diagram (full per-hop token chain: OLB App → agent1 → LLM → MCP Gateway → PingOne AIC → PingAuthorize → MCP OLB/Invest servers, with token claims shown on each arrow)

</domain>

<decisions>
## Implementation Decisions

### Trigger Model (LOCKED)
- **Banking agent drives highlighting** — when the agent mentions or processes a component (e.g., explains "token exchange at the gateway" or fires a gateway tool call), the corresponding region on the diagram highlights
- **Live system events also drive highlighting** — when actual MCP tool calls, gateway hops, token exchanges, or PingAuthorize evaluations fire in the system (via the activity event stream), the matching component highlights in real-time
- Both triggers coexist on the same page — agent-driven (semantic) + event-driven (real-time telemetry)

### Page Structure (LOCKED)
- **Two dedicated pages** — one per diagram
- Routes: `/architecture/overview` (Ping Digital Assistants diagram) and `/architecture/token-flow` (detailed whiteboard diagram)
- Both pages accessible from the monitoring/admin sidebar nav

### Diagram Display (LOCKED)
- Diagrams displayed as static image assets (PNG/WebP) stored in `banking_api_ui/public/` or `src/assets/`
- SVG overlay positioned absolutely over the image with matching coordinate regions
- Regions defined as rectangular or polygon bounding boxes mapped to image coordinates

### Highlight Behavior (LOCKED)
- Highlighted component: glowing border + semi-transparent fill in brand accent color
- Highlight auto-clears after a timeout (e.g., 3–5 seconds) unless the event is ongoing
- Multiple components can be highlighted simultaneously (e.g., gateway AND PingAuthorize both active during a policy evaluation)
- Active highlight shown with pulsing animation; fading out over 1–2 seconds

### Event → Component Mapping (LOCKED)
For the overview diagram (Image 1):
- `mcp_tool_call` event → highlight "MCP GW" region
- `gateway_authorize` / PingAuthorize evaluation → highlight "PingAuthorize" region
- `token_exchange` (RFC 8693) → highlight "IdP/OAuth AS" + "MCP GW" regions
- Agent LLM invoke → highlight "Agent" region
- User authentication events → highlight "User" + "Trust Boundary" regions
- Backend service call → highlight appropriate "Service A/B/C/D" region

For the token-flow diagram (Image 2):
- Same events mapped to more granular components: OLB Application, chatbot, agent1, LLM, PingOne AIC, Token Exchange box, PingAuthorize, MCP Gateway, MCP OLB, MCP Invest, OAuth RS

### Agent Semantic Trigger (LOCKED)
- Banking agent responses are scanned for keywords/component names
- When agent mentions a component by name or category, the corresponding region highlights
- Agent can also emit structured "diagram highlight" events as part of its response (tool call or metadata)

### Data Source (LOCKED)
- Reuses existing `appEventService` event stream (already feeds Activity Log, API Tracker)
- New event subscription in the diagram page components via the same SSE/polling mechanism used by other monitoring pages
- No new backend endpoints needed for event delivery — extend existing event categories if needed

### Image Assets (LOCKED)
- Image 1: Save the Ping Identity "Digital Assistants" slide as a high-res PNG
- Image 2: Save the detailed whiteboard token-flow diagram as a high-res PNG
- Both images provided by the user in this conversation; will be stored in `banking_api_ui/public/architecture/`

### Component Region Map (LOCKED)
- Region coordinates hand-defined per image (pixel bounding boxes or percentage-based)
- Stored as a JS/TS config file per diagram: `diagram-overview-regions.ts`, `diagram-token-flow-regions.ts`
- Each region: `{ id, label, bounds: { x, y, width, height }, triggers: string[] }`

### UI Placement (LOCKED)
- Both pages added to AdminSideNav under a new "Architecture" group (or under existing Monitoring group)
- Also accessible to customer users (non-admin) since this is educational
- FAB agent visible on both pages (already covered by `isEmbeddedAgentDockRoute`)

### Claude's Discretion
- Exact pixel coordinates for each region (must be derived by viewing the images)
- Whether to use canvas overlay vs absolute-positioned SVG divs
- Tooltip content on hover for each component (component name, role, token details)
- Color scheme for highlighting (use existing brand CSS variables)
- Whether to add a "step through" manual mode (prev/next buttons to walk through the flow sequentially) — out of scope for this phase unless quick to add

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing Event Infrastructure
- `banking_api_server/services/appEventService.js` — event emission; event categories
- `banking_api_ui/src/components/ActivityLogs.js` — existing event consumer pattern
- `banking_api_ui/src/utils/embeddedAgentFabVisibility.js` — route registration for FAB

### Route/Nav Patterns
- `banking_api_ui/src/App.js` — outer route pattern (explicit route, not path="*")
- `banking_api_ui/src/components/AdminSideNav.jsx` — nav item addition pattern

### Existing Monitoring Pages (Pattern Reference)
- `banking_api_ui/src/components/McpTrafficPage.jsx` — monitoring page structure
- `banking_api_ui/src/components/ApiTrafficPage.jsx` — monitoring page structure

### Agent Event Connection
- `banking_api_ui/src/components/BankingAgent.js` — agent response handling; event emission
- `banking_api_server/services/bankingAgentLangGraphService.js` — agent step events

</canonical_refs>

<specifics>
## Specific Ideas

- Image 1 regions (approximate, based on visual layout):
  - "User" — left side, people icon group
  - "Trust Boundary" — vertical separator bar
  - "IdP/OAuth AS" — top center box (Ping logo)
  - "PingAuthorize" — top right box (Ping logo)
  - "Agent" — center box (robot icon)
  - "MCP GW" — right center box
  - "API GW" — right center box (below MCP GW)
  - "Service A" / "Service B" / "Service C" / "Service D" — far right

- Image 2 regions include all the boxes in the whiteboard diagram: OLB Application, chatbot, agent1, LLM, PingOne (with 3 sub-boxes: Agent, Token Exc, Client Cred), PingAuthorize, MCP Gateway, MCP (OLB), MCP (Invest), API, OAuth RS, various service boxes on right

- Both images need to be saved and stored as assets; coordinate mapping will be done visually

</specifics>

<deferred>
## Deferred Ideas

- Manual "step through" prev/next walkthrough mode
- Audio narration per step
- Animated arrow drawing between components
- Clickable components that open documentation panels
- Editing the region map via admin UI

</deferred>

---

*Phase: 244-interactive-architecture-diagram-walkthrough-highlight-compo*
*Context gathered: 2026-04-27 from live design conversation*
