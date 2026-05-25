# Phase 94: explicit-hitl-for-agent-consent - Context

**Gathered:** 2026-05-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Implement an explicit pre-action consent gate that intercepts agent tool calls before execution, presents a clear approval dialog (action description + required scopes), and enforces user approval. Includes:
- A new consent interceptor in the BFF/agent path
- Enhanced consent dialog that merges agent-action context with existing transaction details for financial ops
- "Allow Always" per-tool-name grants stored in session, with in-agent revoke UI
- Consent decisions surfaced as Token Chain panel events (audit trail)

This phase does NOT change: the underlying transaction execution logic, the ff_hitl_enabled flag behavior, PingOne token exchange claims, or the OTP/MFA step-up flow.
</domain>

<decisions>
## Implementation Decisions

### Consent Dialog Content
- **D-01:** Dialog format: "Agent wants to: [action description]" + "Requires: [scope list]". Action description comes from the tool's `description` field in BankingToolRegistry. Scope list comes from `BankingToolRegistry.toolScopeMap`.
- **D-02:** For financial tool calls (transfers, withdrawals, deposits): merge into a single enhanced dialog that shows both the agent-action context (action + scopes) AND the existing transaction details (amount, accounts, OTP). The existing `TransactionConsentModal` / `GatewayConsentModal` lifecycles should be enhanced, not stacked.
- **D-03:** Consent history: each approval/denial is emitted as a Token Chain event (same channel as existing `tokenEvents`). No new UI component needed — the Token Chain panel already renders these events.

### Allow Always
- **D-04:** Duration: session only. Stored in `req.session.agentConsents` (a Map of `toolName → true`). Cleared on logout / session expiry. No server-side persistence, no localStorage.
- **D-05:** Granularity: per tool name. Keyed by `tool.name` (e.g., `'get_my_accounts'`, `'get_balance'`). Each tool must be approved independently.
- **D-06:** Revoke UI: a compact "Consented this session" section inside the Banking Agent sidebar panel. Lists approved tool names with an individual revoke button. Removed from session on revoke.

### Claude's Discretion
- Button labels and visual design of the merged consent dialog — follow existing `AgentConsentModal` / `TransactionConsentModal` patterns for consistency.
- Whether the consent interceptor fires at BFF middleware layer or at the agent message handler — whichever is cleaner given the existing code structure.
- Exact Token Chain event shape for consent decisions — follow the existing `tokenEvents` format used by `agentMcpTokenService.js`.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing HITL Implementation
- `demo_api_ui/src/components/AgentConsentModal.js` — existing consent modal: two modes (transaction, legacy agent access). Enhanced by this phase for the merged financial-op dialog.
- `demo_api_ui/src/components/GatewayConsentModal.js` — handles `hitl_required` from MCP Gateway path. Financial-op dialog merges here.
- `demo_api_ui/src/components/TransactionConsentModal.tsx` — direct-UI transaction consent (Phase 170). Reference for financial detail rendering pattern.
- `demo_api_server/middleware/hitlGatewayMiddleware.js` — gateway HITL enforcement middleware.
- `demo_api_ui/src/services/agentAccessConsent.js` — existing agent consent service. Session storage pattern to follow for `req.session.agentConsents`.

### Tool Registry (source of action descriptions and scope requirements)
- `demo_mcp_server/src/tools/BankingToolRegistry.ts` — `description` field per tool = action description for dialog. All tool definitions live here.
- `demo_mcp_server/src/tools/toolScopeMap.ts` — maps tool name → required scopes. Used to populate "Requires: [scope]" in dialog.

### Existing HITL Skill (domain knowledge)
- `.claude/skills/hitl-consent/SKILL.md` — two HITL paths documented: Path 1 (direct UI, Phase 170) and Path 2 (MCP/agent, demo_hitl_service). Phase 94 adds the pre-action gate on Path 2.

### Feature Flag
- `demo_api_server/routes/featureFlags.js` — `ff_hitl_enabled` definition (already exists, category: HITL / Agent Consent). New phase does not add a separate flag — uses existing `ff_hitl_enabled` as the master gate.
- `demo_api_server/services/configStore.js` — `ff_hitl_enabled: { public: true, default: 'true' }`.

### Token Chain (consent event destination)
- `demo_api_server/services/agentMcpTokenService.js` — `tokenEvents` emission pattern. Consent approval/denial events follow this format.
- `demo_api_ui/src/components/BankingAgent.js` — Token Chain panel integration, `tokenEvents` rendering, `resultPanel` / Banking Agent sidebar layout (for the "Consented this session" revoke UI placement).

### Regression Guard
- `REGRESSION_PLAN.md` §0–1 — must not break: OAuth redirect origin, session token custody, HITL Phase 170 transfer-always-requires-consent rule, OTP verification flow.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `AgentConsentModal.js`: Two-mode modal (transaction / legacy). The "transaction" mode already renders amount + account details. Extend it to also receive `toolName` and `requiredScopes` props for the agent-context section.
- `GatewayConsentModal.js`: Already handles `hitl_required` from the MCP Gateway path. This is likely the right modal to enhance for the merged financial-op dialog.
- `req.session.txConsentChallenges`: Existing session key for transaction challenges. `req.session.agentConsents` (new Map) follows the same session pattern.
- `BankingToolRegistry.ts` tool `description` fields: human-readable action descriptions already exist for every tool — use these directly in the dialog.

### Established Patterns
- **Session storage for ephemeral consent**: `req.session` is the correct store; LMDB / configStore is for persistent config only.
- **Token Chain events**: `agentMcpTokenService.js` emits `tokenEvents` objects; the Token Chain panel renders them. Consent events should follow the same `{ type, label, detail, timestamp }` shape.
- **Feature flag gating**: All HITL behavior is gated on `ff_hitl_enabled` (read via `configStore.getEffective('ff_hitl_enabled')`). New consent interceptor respects this flag — if off, bypass entirely.

### Integration Points
- BFF agent message handler (`/api/banking-agent/message` or equivalent): pre-action interceptor fires here before tool dispatch.
- `BankingAgent.js` sidebar: "Consented this session" revoke list renders in the existing agent panel layout.
- Token Chain panel: consent events appear inline alongside token exchange events.

</code_context>

<specifics>
## Specific Ideas

- The consent dialog should be educational — it's a demo. Show the scope with a brief tooltip or label explaining what `banking:read` means. Follows the pattern of existing education panels.
- The "Consented this session" list in the agent panel should be visually subtle — it's secondary to the chat interface. A collapsed section or a small chip-list works.

</specifics>

<deferred>
## Deferred Ideas

- **Persistent Allow Always (server-side per user)**: Storing consent grants beyond session expiry would require a new LMDB table and revoke UI on the profile page. Out of scope for this phase — could be Phase 94.1 if needed.
- **Admin controls for HITL thresholds per tool**: Admin-configurable "always require consent for this tool" settings. The existing `ff_hitl_enabled` and `confirm_threshold_usd` cover the current need. Future phase.
- **Rate limiting on Allow Always grants**: ROADMAP mentions rate limiting — deferred. Session-scoped grants don't need rate limiting since they expire on logout.

</deferred>

---

*Phase: 94-explicit-hitl-for-agent-consent*
*Context gathered: 2026-05-25*
