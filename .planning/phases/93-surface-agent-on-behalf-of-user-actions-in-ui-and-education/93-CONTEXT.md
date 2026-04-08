---
phase: 93-surface-agent-on-behalf-of-user-actions-in-ui-and-education
created: 2026-04-08
status: locked
---

# Phase 93: surface-agent-on-behalf-of-user-actions-in-ui-and-education — Context

## Domain

Make visible to banking app users what the AI agent is doing on their behalf. This includes: real-time status display of ongoing agent operations, step-by-step operation flow (what tool is being called, what data is being accessed), and in-app educational panels explaining the "agent-on-behalf-of-user" pattern and RFC 8693's `act`/`may_act` delegation claims.

Target audience: Banking app users (demo customers) who want to understand and trust what operations the AI agent is performing with their authorization.

---

## Decisions

### D-01: Agent operations are visible in the banking dashboard
When an agent operation is in progress, a panel appears on the dashboard (or replaces the main content area) showing:
- Operation title (e.g., "Transferring $100 to savings account")
- Current step (e.g., "Step 2: Validating transaction limits")
- Estimated remaining time or progress percentage
- Ability to cancel the operation (if safe to do so at the current step)

Rationale: Users should see what's happening. Reduces anxiety from "black box" operations. Provides confidence that the agent is working on their request, not stuck.

### D-02: Operation steps are driven by real agent events
The dashboard subscribes to agent operation events (via WebSocket, polling, or event stream from the BFF). Each event corresponds to a real step in the agent's execution:
1. Operation start
2. Tool call 1 (e.g., "getTransactionHistory")
3. Tool result received
4. Tool call 2 (e.g., "validateTransactionLimit")
5. Tool result received
6. Operation complete

Rationale: Not faked progress. Real steps map to real tool calls. Users see actual data dependencies and logic flow.

### D-03: Each tool call shows data being accessed
For visually sensitive tools (e.g., "getAccountBalance", "listTransactions"), the operation panel shows:
- Tool name (e.g., "Get Account Balance")
- Data accessed (e.g., "Accessing account XXXX-1234")
- Scope required (e.g., "banking:read")
- Result summary (e.g., "Balance: $2,450.32")

Rationale: Transparency. User sees exactly what data the agent is reading. Builds trust.

### D-04: Education panels explain RFC 8693 delegation
Create a new education modal accessible from the agent operation panel:
- **Title**: "Agent Acting on Your Behalf — How Authorization Works"
- **Section 1**: Plain-English explanation of what it means for an agent to act on your behalf
- **Section 2**: Visual diagram showing the delegation chain:
  - User → Authorization Server → Agent
  - Agent with `may_act` claim → MCP Server
  - Token transformation with `act` claim
- **Section 3**: Link to Phase 1 auth flow education panels for deeper technical detail
- **Section 4**: FAQ: "Can the agent do more than I authorized?", "How is the agent's access revoked?", etc.

Rationale: Users don't know what `act`/`may_act` means. Education panels demystify the pattern. Links to existing Phase 4 education content where relevant.

### D-05: "Operation history" panel shows completed operations
After the operation completes, the panel can be minimized / archived. A separate "Operation History" tab in the dashboard shows recently completed operations with their results.

Example:
- "Transfer $100 to savings — Completed 2 min ago — View details"
- "Get Account Balance — Completed 5 min ago — Balance was $2,450.32"

Rationale: Audit trail. Users can review what the agent did. Useful for reconciliation and dispute resolution.

### D-06: Message format for agent operations
Agent operations emit events to the BFF in a standard format:
```json
{
  "operationId": "op-123",
  "userId": "user-456",
  "type": "operation",
  "event": "step_started" | "step_completed" | "tool_call" | "operation_complete" | "error",
  "step": 2,
  "stepName": "Validating transaction limits",
  "toolName": "validateTransactionLimit" (if applicable),
  "scope": "transactions:validate",
  "dataAccessed": "Account ending in 1234",
  "result": { ... } (if step_completed),
  "error": "..." (if error),
  "timestamp": "2026-04-08T12:00:00Z"
}
```

Rationale: Structured format allows UI to parse and display consistently. Can be extended with additional fields. Enables future analytics / audit logging.

### D-07: Operation visibility is opt-in at the user level
A user setting controls whether operation details are displayed:
- "Full visibility" (default): See all steps and data access
- "Summary only": See operation title and overall status, not individual steps
- "Quiet mode": No operation panel; operations proceed silently

Rationale: Respects user preference. Some users want transparency; others just want the agent to work. Settable globally or per operation.

### D-08: Agent operations do NOT block user actions
While an agent operation is in progress, the user can still:
- Navigate to other dashboard pages
- Initiate new agent operations (cautionwith concurrent ops, but not forbidden)
- Cancel a specific operation without canceling others

Rationale: User experience. Don't lock the user out while the agent works. Show operation status via a persistent indicator (e.g., toolbar notification or side panel).

### D-09: No changes to auth flows or MCP spec
Phases 1-2 auth and MCP tool calls work exactly as before. Phase 93 is purely a UI layer that wraps and displays what's already happening.

Rationale: Lower risk. Focus on presentation, not protocol changes.

---

## Deferred Ideas

- Native mobile app for operation notifications — future phase
- Email/SMS notifications for long-running operations — separate feature
- Cost estimation before operation authorizes — future phase
- "Undo" for completed operations — future consideration (not all operations are reversible)
- Machine learning to predict operation duration — future enhancement

---

## Canonical Refs

- `banking_api_ui/src/components/UserDashboard.tsx` (or similar) — Main dashboard component; where operation panel will render
- `banking_api_ui/src/hooks/useAgentOperation.ts` (or similar) — Hook for subscribing to agent events; may need to be created
- `banking_api_server/routes/` — BFF routes for agent operation events (may re-use existing routes or add new ones)
- `.planning/phases/04-*/04-*-PLAN.md` — Phase 4 education panels (reference for style/pattern)
- `.planning/phases/93-*/93-CONTEXT.md` — This file
- `docs/AGENT_OPERATION_EVENTS.md` — Future spec for the event format
- `REGRESSION_PLAN.md` — No-break list; UI must not change auth flows or MCP behavior

---

## Specific Context

**Why is this Phase 93, not Phase 4?** Phase 4 is education content (explaining OIDC, MCP, RFCs). Phase 93 is education + UI (showing agent operations + explaining delegation pattern). Phase 93 is placed after Phases 90-92 because those phases establish the security infrastructure (scopes, resources, attributes, external clients). Phase 93 can then explain that entire story to users.

**Event subscription strategy**: The UI can subscribe to agent operation events via:
1. Server-Sent Events (SSE) stream from `/api/events` (if real-time is required)
2. WebSocket on the BFF → MCP connection (if piggybacking on existing socket)
3. Polling `/api/operations/{operationId}` for status every 500ms (if low-latency not required)

Phase 93 planner should choose the strategy based on what's already in the codebase. Likely option: BFF already has WebSocket; Phase 93 adds an event channel to the existing socket.

**Integration with Phase 1-2 auth education**: When the user clicks "Learn more" in the agent operation panel, it should link to the Phase 4 education modal for the relevant auth flow (e.g., if the agent used CIBA, link to the CIBA education panel).

**Agent operation events in the context of Phase 1-2 flows**: 
- If an agent operation triggers a step-up MFA (from Phase 52 / Phase 1), the operation panel should show "Step-up MFA required" and hand off to the CIBA / step-up UI.
- After the user completes the step-up, the operation resumes and the panel updates to the next step.

---

## The agent's Discretion

- Exact UI layout: side panel vs. modal vs. fullscreen banner
- Animation/transition styling (fade in/out, slide, etc.)
- Wording for education panels (friendly, technical, or balanced)
- Icon/color scheme for different operation types (transfer, balance check, etc.)
- Whether to show operation history in a separate tab or as a collapsible section
- Timeout and retry behavior if the event stream is interrupted
