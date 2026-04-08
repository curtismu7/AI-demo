# Phase 101: Token Exchange Flow Diagram UI — Single & Double Exchange with Agent Bubble

**Gathered:** 2026-04-08
**Status:** Ready for planning
**Phase dependency:** Phase 100 (configurable step-up MFA threshold and agent transaction stop limit)

---

## Phase Boundary

Create a visual, interactive token exchange flow diagram that teaches the difference between:
1. **1-exchange** (user token → MCP token, subject-only delegation per RFC 8693 §2.1)
2. **2-exchange** (user token + agent actor token → MCP token with nested `act` claim per RFC 8693 §4)

The diagram displays the token exchange process at runtime, showing how tokens flow through the system and highlighting where the agent acts on behalf of the user.

---

## Current State

**Existing token UI components (from codebase audit):**
- `ExchangeModeToggle.js` — Pill buttons to switch between 1-exchange and 2-exchange modes
- `TokenChainDisplay.js` — Lists token events (acquired, exchanged, skipped), displays JWT claims, includes RFC 8693 educational callouts
- `AgentFlowDiagramPanel.js` — Floating draggable panel showing agent operation milestones (pending, active, done, error) with basic token chain display
- `TokenInspector.tsx` — JWT claims viewer with human-readable labels and RFC 8693 annotations
- `ActorTokenEducation.tsx` — Actor/agent token terminology education panel

**What's missing:**
- Visual flow diagram showing the token exchange process (currently only lists/tables)
- Clear visual distinction between 1-exchange and 2-exchange flows in one diagram
- Agent actor representation in the flow (e.g., bubble, pill, or visual indicator on exchange steps)
- Animated or interactive diagram showing tokens flowing through: Browser → BFF → PingOne → MCP Server

---

## Decisions

### D-101-01: Flow Diagram Design
- **Approach**: Create a visual token exchange flow diagram (draw.io XML, rendered via <svg> or diagram library component)
- **Paths**: Side-by-side or stacked representation of 1-exchange and 2-exchange flows
- **Content**:
  - Actor/participant boxes: User, BFF (Backend-for-Frontend), PingOne OAuth, MCP Server
  - Token flows as arrows showing: login token acquisition → exchange request → PingOne processing → MCP token issuance
  - 1-exchange: User token at step 1, only subject (sub) at step N
  - 2-exchange: User token + Agent token at step 1, nested act + may_act at step N

### D-101-02: Agent Visuals
- **Representation**: Agent shown as distinct "bubble" or actor box in 2-exchange flow
- **Visibility**: Agent appears only when 2-exchange is active (toggled via ExchangeModeToggle)
- **Label**: Show agent client_id or "AI Agent" with actor icon
- **Responses**: In the MCP server response arrow, show agent's contribution (e.g., "Agent received: {result}")

### D-101-03: Integration Points
- **Mode toggle**: Flow diagram updates when ExchangeModeToggle changes mode (real-time visual diff)
- **Token chain**: Integrate with TokenChainDisplay to show historical token events below the diagram
- **Panel location**: Float in AgentFlowDiagramPanel or standalone panel on dashboard/config page
- **Responsive**: Adapt diagram layout for mobile (collapse to vertical stack or defer to landscape mode)

### D-101-04: Education Content
- **Annotations**: Label each step with RFC reference (e.g., "RFC 8693 §2.1: Subject Token Exchange")
- **Tooltips**: Hover/click on actor, token, or step to show explanation
- **Legend**: Color-code token types (user token, agent token, MCP token, session token)
- **Link to panels**: "Learn more" buttons open TokenExchange, MayAct, or ActorToken education panels

---

## Canonical References

**RFC 8693 Token Exchange:**
- `banking_api_server/services/performTokenExchange.js` — BFF token exchange logic (reads subject_token, calls PingOne /as/token)
- `banking_api_server/services/performTokenExchangeWithActor.js` — 2-exchange logic (presents both subject_token + actor_token)

**Existing UI integration:**
- `ExchangeModeToggle.js` — GET/POST `/api/mcp/exchange-mode` endpoint; state is session-based
- `TokenChainDisplay.js` — Displays token history from `/api/token-chain/current` (persisted in localStorage)
- `AgentFlowDiagramPanel.js` — Main panel for showing agent operations; can integrate flow diagram here

**BFF routing:**
- `banking_api_server/routes/mcp.js` — `/api/mcp/exchange-mode` GET/POST for mode toggling
- `banking_api_server/routes/tokenChain.js` — `/api/token-chain/current` for retrieving token history

**Education content:**
- `banking_api_ui/src/components/education/TokenExchangePanel.js` — Existing RFC 8693 education
- `bankingAgent.js` — Agent context messaging (includes exchange mode explanations)

---

## Requirements

**From ROADMAP.md Phase 101:**
- Visualize RFC 8693 token exchange flow (1-exchange vs 2-exchange) in a diagram
- Show agent participation in the flow (distinct visual representation)
- Make the diagram interactive and responsive to exchange mode toggle
- Integrate with existing TokenChainDisplay for historical token events
- Support education/learning mode (RFC annotations, tooltips, "learn more" links)

**Success criteria:**
1. User can toggle between 1-exchange and 2-exchange modes via ExchangeModeToggle
2. Flow diagram updates in real time to show visual diff between the two paths
3. In 2-exchange mode, the diagram clearly shows agent as an actor (bubble/pill/box)
4. Token types are color-coded or visually distinct (user token ≠ agent token ≠ MCP token)
5. Each step in the flow is labeled with RFC 8693 section reference
6. Hovering over/clicking on a step shows a tooltip or educationalpanel explaining that step
7. "Learn more" buttons link to existing education panels (TokenExchange, MayAct, etc.)
8. Diagram adapts gracefully to mobile screens (vertical layout or deferred to landscape)
9. Diagram can be embedded in AgentFlowDiagramPanel, dashboard, or standalone config page
10. No regressions: TokenChainDisplay, ExchangeModeToggle, existing token UI all still work after Phase 101

---

## Out of Scope

- Animation/transitions (diagram updates immediately, no motion graphics)
- 3D or advanced graphics (SVG or React diagram library only, no Canvas or WebGL)
- Token capture/export (Phase 101 is visualization + education, not token management)
- Vercel-specific deployment considerations (standard React deployment applies)
- Mobile-specific optimizations beyond responsive layout adaptation

---

## Context

- **Stack**: React 18 CRA, Axios for API calls, existing CSS patterns (BEM)
- **RFC 8693 implementation**: Both 1-exchange and 2-exchange paths already working in BFF
- **Exchange mode persistence**: Session-based via `/api/mcp/exchange-mode` endpoint
- **Token history**: Persisted in localStorage + API endpoint for retrieval
- **Existing diagrams**: None in the codebase; AgentFlowDiagramPanel shows milestones only
- **Responsive patterns**: Existing components adapt to mobile (e.g., ExchangeModeToggle is flex-based)

---

## Key Learnings from Prior Phases

- Phase 2 created ExchangeModeToggle but no visual diagram
- Phase 33 added TokenChainDisplay with historical events
- Phase 96 added token_aud validation (audience must match MCP server)
- Both 1-exchange and 2-exchange modes are feature-complete in BFF; Phase 101 is purely educational visualization

## Dependencies Met

- ✅ Phase 100: Configurable step-up MFA (unblocks Phase 101 by completing prior transaction security)
- ✅ RFC 8693 implementation complete and tested
- ✅ ExchangeModeToggle and TokenChainDisplay infrastructure in place
- ✅ Education panel system established (TokenExchange, MayAct, etc.)
