---
phase: 194
status: complete
date: 2026-04-19
---

# Phase 194 Research: Display Complete Token Chain & OIDC Flow Visualization

## Goal
Display complete token chain and OIDC flow visualization with token state changes, MCP calls, and backend operations. Users should see the end-to-end flow from login → token exchange → MCP tool calls → backend banking operations.

## Current State

### Existing Components
1. **TokenChainDisplay.js** (~1200 lines)
   - Shows token events with claims (sub, act, may_act, aud, scope, exp)
   - Status badges: active, acquired, exchanged, acquiring, skipped, failed, waiting
   - Educational boxes (MayActEduBox, ActMismatchEduBox, ClaimsPanel)
   - Draggable panel with localStorage history (last 20 calls)

2. **TokenExchangeFlowDiagram.jsx** (~300 lines)
   - SVG-based flow: 1-exchange (User → BFF → PingOne → MCP) and 2-exchange (User → Agent → BFF → PingOne → MCP)
   - Hoverable arrows with RFC 8693 education tooltips
   - Actor boxes with sub-labels (Browser, Backend, OAuth Server, Tool Server)

3. **AgentFlowDiagramPanel.js** (~400 lines)
   - Shows agent flow milestones: prompt preparation → MCP tool invocation → response handling → result delivery
   - Status tracking for pending/active/done/error states
   - TokenChainDisplay component embedded (compact view)
   - Shows tool name, operation duration, status

4. **TokenChainContext.js**
   - Manages token events: events[], sessionTokenEvent, mcpToolCalls, resolvedIdentity
   - Fetches /api/token-chain (MCP tool call trail)
   - Stores history in localStorage [(tool, timestamp, events[])]

### What's Missing

1. **OIDC flow sequence** - Initial login step not visually captured; only shows post-exchange
2. **Token state timeline** - No unified view of token lifecycle: acquiring → acquired → selected_exchange_path → exchange_in_progress → exchanged → used_in_mcp_call
3. **Backend operation visualization** - Banking API calls (balance fetch, transfer, etc.) not shown in flow
4. **MCP-to-backend linkage** - Tool call result not connected to actual banking operation
5. **Frontend-to-backend continuity** - No clear flow showing user action → agent invocation → token exchange → tool call → backed response
6. **State change indicators** - No visual feedback on "which token is being used now" or "exchange in progress"

## Design Implications

### User Perspective
Developer viewing the demo should understand:
- **Where are we in the OAuth flow?** (logging in, exchanging, calling tools, getting responses)
- **Which token is active now?** (user token, agent token, MCP token)
- **What state is each token in?** (acquiring, active, exchanged, used)
- **How did we get the MCP token?** (via 1-exchange or 2-exchange)
- **What backend operation is happening?** (Get balance, Transfer money, etc.)

### Technical Approach
1. **Extend TokenChainContext** to track:
   - OIDC login milestone (authentication start)
   - Token acquisition milestones (with state)
   - Exchange path selection (1 vs 2)
   - Exchange execution milestone
   - MCP tool call milestone
   - Backend operation milestone (fetch from /api/mcp/tool-call-audit or equivalent)

2. **Create CompleteTokenFlowPanel** or enhance existing:
   - Timeline/sequence view showing all milestones
   - State indicators for each token (acquiring, active, exchanged, used)
   - Visual "swimming lanes" for each actor (Browser, BFF, PingOne, MCP, Backend)
   - Connecting lines showing data flow

3. **Integrate with AgentFlowDiagramPanel**:
   - Add timeline below or alongside existing flow
   - Show token state changes as agent flow progresses
   - Highlight current token in use

4. **Backend support** (if not already present):
   - MCP tool call audit trail accessible from UI
   - Backend operation details (which banking API was called, with which scope/token)
   - Response time measurements

## Implementation Sequence

**Wave 1: Core Timeline Component**
- Create OidcFlowTimeline component showing OIDC login → exchange decision → exchange → tool call → backend op milestones
- Track state for each milestone (pending, active, done, error)

**Wave 2: Token State Visualization**
- Add token state indicators to timeline (acquiring, active, exchanged, used)
- Show which token serves each milestone
- Visual differentiation (colors, icons) for token types

**Wave 3: Backend Integration**
- Wire backend operation data from MCP tool audit trail
- Show banking API call details (endpoint, scope, response status)
- Display response time and result (balance, transaction ID, etc.)

**Wave 4: UX Polish**
- Smooth state transitions (animations if no performance impact)
- Collapsible sections for historical flows
- Export/share flow visualization

## Research References
- TokenChainContext stores events with: `{ id, timestamp, eventType, tokenType, tokenSub, tokenAct, scopes, claims, status }`
- AgentFlowDiagramService tracks: `{ name, status: pending|active|done|error, ms, step, tool, result }`
- Banking API returns operation results (balance, transaction ID, etc.)
- RFC 8693 terminology locked in from Phase 190 alignment

## No External Dependencies
All components use existing React patterns and utilities (hooks, context, CSS-in-JS). No new libraries needed.
