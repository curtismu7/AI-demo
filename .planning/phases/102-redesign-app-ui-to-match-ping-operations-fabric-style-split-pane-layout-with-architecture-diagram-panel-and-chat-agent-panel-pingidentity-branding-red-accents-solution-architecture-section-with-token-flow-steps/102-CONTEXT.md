# Phase 102: Redesign App UI to Match Ping Operations Fabric Style - Context

**Gathered:** 2026-04-08  
**Status:** Ready for planning  
**Source:** User discussion — 7 design decisions captured

---

<domain>

## Phase Boundary

Redesign the banking demo UI to match PingIdentity Operations Fabric design language, introducing a split-pane layout that prominently displays both the chat agent interface and the system architecture with real-time token flow visualization. The result should feel like a modern, integrated operations dashboard where users can see agent actions unfold against the backdrop of the underlying OAuth 2.1, RFC 8693, and MCP architecture.

Target outcome: A presenter running this demo can show the full system topology (who/what/how tokens flow) while interacting with an AI agent in real time, making the demo educational and visually compelling.

</domain>

<decisions>

## Implementation Decisions

### D-01: Layout Architecture — Center and Stack

- **Primary arrangement:** Center content area with agent/chat as the main focal point, architecture diagram as a supporting right panel or persistent sidebar
- **Desktop (1024px+):** Horizontal split-pane layout — agent chat centered-left, architecture diagram fixed on right
- **Tablet (768px):** Responsive stacking — maintain side-by-side but reduce widths; agent retains primary focus
- **Mobile (360px+):** Vertical stack — agent full-width, architecture diagram toggleable or below (via tab switcher or collapse/expand)
- **Rationale:** Users primarily interact with the agent; architecture serves as an educational reference visible alongside. Desktop-first design ensures full experience on large screens, degrades gracefully on mobile.

### D-02: Architecture Diagram Panel — Separate Tabs

- **Tab 1: System Architecture** — Full topology diagram showing Users → BFF → PingOne → MCP Server, with roles and credential flows
- **Tab 2: Token Exchange Flow** — Real-time visualization of RFC 8693 token paths (1-exchange vs 2-exchange), integrated from Phase 101's TokenExchangeFlowDiagram component
- **Tab 3: API & Endpoints** — (Optional, at planner's discretion) REST endpoints, MCP tool catalog, or other reference material
- **Interaction:** Tabs are static headers; no drilldown required. User clicks tab label to switch views. All tabs loaded but only active tab visible
- **Rationale:** Separating architecture from token flow prevents visual clutter while keeping both readily accessible. Tabs are familiar UX pattern

### D-03: Chat Agent Panel — Redesign + Current Features

- **Redesign scope:** Update BankingAgent component UI to match PingOps Fabric visual language (see D-04 styling); preserve functional behavior
- **Current features to retain:**
  - Operation steps display and progress tracking
  - Agent consent modals for HITL workflows
  - Token inspection panel (TokenChainDisplay integration)
  - Error states and recovery workflows
  - Real-time streaming of agent operations
- **New visual treatment:**
  - Apply PingIdentity red accents to action buttons, status indicators, and key UI elements
  - Use PingIdentity font family (see D-04)
  - Clean spacing and alignment per PingOps Fabric design system
  - Clear visual hierarchy: agent message → user action → outcome

### D-04: PingOps Fabric Styling — Red + Ping Fonts + Both Modes

- **Color Palette:**
  - Primary accent: PingIdentity Red (#b91c1c, already in codebase as `--app-primary-red`)
  - Red variants: Hover (#991b1b), mid (#dc2626), border (#7f1d1d) — already defined in index.css
  - Apply red to: primary buttons, action links, success states, important status badges, error highlights
  - Backgrounds: Light (#f5f5f5) for light mode, dark (#1a1a1a or darker) for dark mode
- **Typography:**
  - Font family: Use PingIdentity standard fonts (Inter or similar sans-serif; at planner's discretion define exact font stack in CSS)
  - Font weights: Regular (400) for body, Semi-bold (600) for labels, Bold (700) for headers
  - Line height: 1.5 for readability, 1.25 for compact labels
- **Theme Support:** Implement both light and dark modes
  - Light mode: White backgrounds, dark text, red accents, subtle shadows
  - Dark mode: Dark backgrounds (#1a1a1a range), light text, red accents remain vibrant, adjusted shadows
  - Toggle: Reuse existing theme switcher pattern from Dashboard (already supports light/dark switching via localStorage + CSS variables)
- **Component spacing:** Consistent padding (8px, 12px, 16px, 24px increments), margin hierarchies

### D-05: Solution Architecture Section — Embed TokenExchangeFlowDiagram

- **Integration point:** Embed Phase 101's TokenExchangeFlowDiagram component in the Token Exchange Flow tab (D-02 Tab 2)
- **Real-time sync:** TokenExchangeFlowDiagram receives mode prop from ExchangeModeContext (created in Phase 101-02 Task 1)
  - When user toggles exchange mode (1-exchange ↔ 2-exchange), diagram updates immediately
  - Diagram shows current token claims and delegation path based on active mode
- **Visual context:** Surround the flow diagram with explanatory text or education panel link ("Learn more about RFC 8693 token exchange")
- **No duplication:** Do NOT create a new architecture diagram; reuse and extend Phase 101's component
- **Rationale:** Phase 101 component is production-ready and RFC-compliant; embedding it avoids reinventing and ensures architectural consistency

### D-06: User Role Variations — Unified Layout + Full Visibility for All Roles

- **Single layout for all:** Admin, customer, and guest roles all see the same architectural layout and panels
- **Visibility rules:** Both admins and customers have full access to:
  - Token exchange flow visualization (Tab 2)
  - System architecture diagram (Tab 1)
  - Agent chat interface with operation history
  - Token inspection panel (TokenChainDisplay)
- **Role-based content within panels:** (Agent's discretion what differs)
  - Example: Agent operations available to admin might differ from customer operations, but the panel structure and visibility remain unified
  - Example: Token details shown may vary (customer sees their token; admin sees all tokens), but panel layout is identical
- **Rationale:** Unified view simplifies maintenance and ensures all users understand the system architecture. Educational goal of the demo is to teach architecture to developers/architects, so full visibility supports that

### D-07: Responsive Strategy — Desktop-First

- **Design approach:** Optimize for desktop (1024px+) as primary target, then adapt to smaller screens
- **Key breakpoints:**
  - 1024px+: Full split-pane layout (agent left/center, architecture right)
  - 768px-1023px: Reduced-width panes, maintain side-by-side where space allows
  - 360px-767px: Stacked vertical layout, tabs for panel switching
- **Implementation hierarchy:**
  - Base CSS: Desktop styles (flexbox row layout, fixed widths)
  - Media query @media (max-width: 1024px): Adjust widths, reduce padding
  - Media query @media (max-width: 768px): Convert to flex column, stack panes
  - Media query @media (max-width: 360px): Minimum widths, touch-friendly tap targets
- **Rationale:** Banking demo is typically shown on a projector or large monitor; desktop-first ensures the main presentation experience is polished. Mobile adaptation is a quality-of-life feature for ad-hoc testing

### the agent's Discretion

- **Exact Ping font stack:** Planner can evaluate and choose specific font-family values (e.g., 'Inter', 'Segoe UI', or custom Ping font if available)
- **Shadow and elevation styles:** Planner can define depth, blur radius, and shadow colors to match PingOps Fabric mood
- **Animation and transitions:** Planner can choose button hover effects, state transitions, and tab switch animations
- **Tab 3 (API & Endpoints) implementation:** Optional; planner decides if worth including or defer to Phase 103
- **Component sizing:** Exact proportions for split-pane widths (e.g., 60% agent / 40% architecture) — planner can tune based on content

</decisions>

<specifics>

## Specific Ideas

**PingIdentity Branding Integration:**
- PingIdentity logo placement (top-left, top-right, or subtle watermark in background)
- Red accent usage: Buttons, status indicators, navigation breadcrumbs, error states
- Consistent with existing Phase 85 (Chase dashboard styling) — maintain existing design language where it doesn't conflict, override where PingOps Fabric requires

**Token Flow Real-Time Visualization:**
- When user runs an agent operation, TokenExchangeFlowDiagram should highlight or animate the current token exchange step
- Visual feedback: "Token exchanged" checkmark or glow effect next to each step as operation progresses
- Tie to Phase 101-02 Task 3 (interactive tooltips) — tooltips can explain each RFC reference in the flow

**Agent Operation Progress:**
- Current implementation shows steps; new design should make this more visually prominent in the center pane
- Consider: Numbered badges, progress bar, or timeline view alongside messages

**No Breaking Changes:**
- Existing functionality (auth flows, agent operations, token inspection) must remain operational
- This is a visual redesign, not a behavioral one

</specifics>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### PingIdentity Design & Branding
- `banking_api_ui/src/index.css` — CSS variables for primary colors (#b91c1c red palette already defined)
- `banking_api_ui/src/context/IndustryBrandingContext.jsx` — Branding context system for theme switching
- `banking_api_ui/src/components/Dashboard.js` — Existing theme support (light/dark mode via localStorage)

### Layout & Responsive Design Patterns
- `banking_api_ui/src/components/agent/AgentLayout.css` — Current agent layout structure (to be redesigned in Phase 102)
- `banking_api_ui/src/components/BankingAgent.css` — Main agent component styling (~76KB, extensive)
- `banking_api_ui/src/styles/draggablePanel.css` — Existing panel positioning patterns

### Token Flow Visualization (Phase 101 Output)
- `banking_api_ui/src/components/TokenExchangeFlowDiagram.jsx` — RFC 8693 flow diagram component (to be embedded in Phase 102 Tab 2)
- `banking_api_ui/src/context/ExchangeModeContext.js` — Mode state provider for real-time diagram syncing
- `.planning/phases/101-*/101-01-SUMMARY.md` — Phase 101 completion details and must-haves

### Token Inspection & Display
- `banking_api_ui/src/components/TokenChainDisplay.js` — Existing token history panel (to be integrated in redesigned layout)
- `banking_api_ui/src/components/education/TokenChainPanel.css` — Token display styling patterns

### Existing Dashboard & Role Structure
- `banking_api_ui/src/components/Admin.js` — Admin dashboard structure
- `banking_api_ui/src/components/UserDashboard.js` — User/customer dashboard structure (recently refactored per Phase 85)

### Phase 85 Reference (Chase Dashboard Styling)
- `.planning/phases/85-chase-dashboard-styling/*-SUMMARY.md` — Completed Phase 85 output; shows how dashboard redesign was executed
- `banking_api_ui/src/components/UserDashboard.css` — Updated dashboard styling patterns from Phase 85

### RFC 8693 & Authentication References (Educational Context)
- `CLAUDE.md` § "Workflow orchestration" — RFC 8693 implementation patterns and considerations
- `banking_api_server/` routes for token exchange endpoints — Backend token exchange logic

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

**Components:**
- **TokenExchangeFlowDiagram** (Phase 101) — RFC 8693 flow visualization; embed in Tab 2 without modification
- **TokenChainDisplay** — Token history panel; integrate into redesigned layout
- **ExchangeModeContext** (Phase 101-02 Task 1) — Global mode state provider; wire into Tab 2 for real-time diagram updates
- **AgentFlowDiagramPanel** — Existing agent flow display; integrate into center pane
- **BankingAgent** (main, 149KB) — Primary agent interface; apply visual redesign while preserving behavior

**Styling Patterns:**
- CSS variables for colors, spacing, and breakpoints already defined in `index.css`
- Theme switching via `IndustryBrandingContext` (established pattern, reusable)
- Responsive breakpoints in existing component CSS files (768px, 1024px already recognized)
- BEM naming convention throughout codebase (.afd-*, .tefd-*, etc.)

### Established Patterns

- **Layout:** Flex-based layouts preferred over CSS Grid (consistent with existing components)
- **State management:** React Context preferred for shared state (e.g., ExchangeModeContext, IndustryBrandingContext)
- **CSS organization:** Component-scoped CSS files (.component.css) paired with .jsx files
- **Color access:** CSS variables for colors (not hardcoded hex values)
- **Theme support:** Inline theme switching + localStorage persistence (established in Dashboard)

### Integration Points

- **Main app:** Dashboard.js and Admin.js are entry points; Phase 102 will redesign their layout structure
- **Agent interface:** BankingAgent.js is the core agent component; apply PingOps styling without changing functional behavior
- **Education panels:** ExchangeModeContext + TokenExchangeFlowDiagram integrate with existing education panel system
- **Token state:** TokenChainDisplay pulls from session/API; no changes needed to data flow, just visual integration in new layout
- **Routing:** Existing routes remain; this is layout/styling, not navigation change

</code_context>

<deferred>

## Deferred Ideas

- **API & Endpoints panel (Tab 3):** Planner can defer this to Phase 103 if time constraints exist. Phase 102 focuses on Tabs 1 (System Architecture) and 2 (Token Exchange Flow)
- **Advanced animations:** Smooth transitions and parallax effects on token flow are nice-to-have; defer if they add significant complexity
- **Mobile app version:** Phase 102 targets web responsive design; native mobile app is a future phase
- **Custom Ping fonts:** If specific PingIdentity fonts are not available, defer to Phase 103 or note as "use system PingOps-compatible font stacks"
- **Accessibility audit:** WCAG compliance deep-dive deferred to Phase 103 (Phase 102 focuses on visual redesign following Ping patterns)

</deferred>

---

*Phase: 102 — Redesign App UI to Match Ping Operations Fabric Style*  
*Context gathered: 2026-04-08 via user discussion*

