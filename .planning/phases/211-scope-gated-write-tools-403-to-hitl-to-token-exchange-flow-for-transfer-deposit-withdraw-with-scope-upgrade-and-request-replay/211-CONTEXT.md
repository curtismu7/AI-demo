# Phase 211: Scope-Gated Write Tools — Context

**Gathered:** 2026-04-21
**Status:** Ready for planning

<domain>
## Phase Boundary

When the user's MCP token lacks `banking:write`, the agent's `create_transfer`, `create_deposit`, and `create_withdrawal` tools return HTTP 403 (`mcp_scope_denied`) from the BFF (built in Phase 210). This phase builds the complete redemption path:

1. 403 `mcp_scope_denied` fires → `scopeErrorModal` triggers (as today)
2. Modal body shows an actionable scope-upgrade consent prompt (not static "fix in PingOne" text)
3. User approves → BFF performs RFC 8693 token exchange appending `banking:write` → upgraded MCP token stored in session
4. Modal transitions to "done" state → `runAction()` re-fires automatically with saved parameters → tool succeeds
5. Full sequence narrated: token events + inline chat messages + token chain panel update

**Depends on:** Phase 210 (`mcp_scope_denied` 403 + `scopeErrorModal` state already exist)

**Scope is limited to:** `create_transfer`, `create_deposit`, `create_withdrawal` (all require `banking:write`). Read-only tools and `get_sensitive_account_details` (`banking:sensitive:read`) are out of scope.

</domain>

<decisions>
## Implementation Decisions

### D-01: HITL Consent Modal — State-Machine Body
- **What:** Replace the static `scopeErrorModal` body (currently "How to fix in PingOne admin") with a state-machine body that has four states: `scope_error` → `confirm` → `exchanging` → `done`
- **Component:** NOT a new modal component — upgrade the existing inline `scopeErrorModal` JSX in `BankingAgent.js`. Keep the same overlay structure (`position: fixed; inset: 0; zIndex: 9999`).
- **State field:** Add `scopeUpgradeState: 'error' | 'confirm' | 'exchanging' | 'done'` to the `scopeErrorModal` state object (e.g. `setScopeErrorModal({ ...existing, scopeUpgradeState: 'error' })`)
- **Do NOT:** Open `AgentConsentModal` (transaction HITL component) as a separate step. The scope consent stays inside `scopeErrorModal`.
- **State content:**
  - `error`: Show missing scopes + "Upgrade scope to continue?" + [Approve] [Cancel] buttons
  - `confirm`: Show "You are granting this agent `banking:write` access for this session. This allows transfers, deposits, and withdrawals." + [Confirm] [Cancel]
  - `exchanging`: Show spinner + "Exchanging token for write access…"
  - `done`: Show "✓ Scope upgraded — retrying your request…" briefly, then auto-close and replay

### D-02: Token Exchange — BFF Inline Re-Exchange + Session Cache
- **Where:** `banking_api_server/server.js` — add a new route `POST /api/mcp/scope-upgrade` (or inline in the existing `POST /api/mcp/tool` catch path is also acceptable; planner to decide based on session state access)
- **What:** When called, BFF performs RFC 8693 token exchange using the existing `oauthUserService` exchange infrastructure, with `banking:write` appended to the scope list in `agent_mcp_allowed_scopes`
- **Session storage:** Store the upgraded MCP token as `req.session.mcpWriteToken` (separate from the baseline `req.session.mcpAccessToken`). Subsequent write-tool calls check `mcpWriteToken` first; if present, use it without re-exchanging.
- **One exchange per session:** No re-exchange on subsequent write tool calls in the same session.
- **Subject token:** Use the user's current access token from `req.session.accessToken` as the subject token (same as the existing exchange path).
- **Scope list:** Include `banking:write` in addition to the base `agent_mcp_allowed_scopes` scopes.

### D-03: Request Replay — Client-Side Automatic
- **What:** When `scopeErrorModal` reaches `done` state, `BankingAgent.js` automatically re-invokes `runAction()` using the `pendingAction` saved at the time of the 403.
- **Save pending action:** At the point where `setScopeErrorModal()` is called on a `mcp_scope_denied` error, also save `setPendingAction({ actionId, form })` (or equivalent local ref) so the replay has all original parameters.
- **No "Retry" button:** Replay is automatic. The modal auto-closes after the brief `done` state (500ms delay sufficient).
- **If replay also 403s:** Treat as a hard failure — show a static error message "Scope upgrade did not take effect. Try signing out and back in." Do not loop.

### D-04: Educational Visibility — Full Narration
- **Token events:** Emit the following new event types in the token events array (same pattern as existing `token_exchange` events in `BankingAgent.js`):
  - `scope_denied` — when 403 `mcp_scope_denied` first fires
  - `scope_upgrade_consent` — when user clicks Confirm in the modal
  - `token_exchange` (reuse existing type) — when BFF exchange completes; include `actor`, `onBehalfOf`, `addedScopes: ['banking:write']`
  - `tool_replay` — when `runAction()` re-fires after upgrade
- **Inline chat messages:** Add chat panel messages at each state transition:
  - 403 fires: "⚠️ Scope gate: `banking:write` required for this action — requesting your approval."
  - Confirm: "🔐 You approved scope upgrade — exchanging token (RFC 8693)…"
  - Exchange done: "🔄 Token upgraded with `banking:write` — replaying request…"
  - Replay success: "✓ [Transfer/Deposit/Withdrawal] completed with upgraded scope."
- **Token chain panel:** After exchange completes, fire a `TokenChainContext` update that adds the write-scoped MCP token as a new step in the chain. The step should be labelled "Write-Scoped MCP Token (scope upgrade)" and show `banking:write` in the scopes display. Use the existing `addTokenEvent` or equivalent context dispatch.

### the agent's Discretion
- Exact button copy and icon choices within each modal state
- Whether the `confirm` state is a separate step or combined with `error` state (if the agent judges the two-step confirm adds unnecessary friction for a demo)
- CSS/styling details for the state-machine modal body updates
- Whether `POST /api/mcp/scope-upgrade` is a new route or inline in the existing tool catch path — whichever better fits the session state access pattern
- Exact key name for session-cached write token (`mcpWriteToken` is suggested but agent may adjust)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 210 — Scope Enforcement Infrastructure (direct dependency)
- `.planning/phases/210-mcp-scope-enforcement-tools-advertise-required-scopes-server-returns-403-on-missing-scope-agent-surfaces-scope-errors-to-client/210-03-SUMMARY.md` — What was built: `mcp_scope_denied` 403 path, `setScopeErrorModal()` trigger, `mcp_insufficient_scope` error code propagation

### BFF Token Exchange Infrastructure
- `banking_api_server/services/oauthUserService.js` — RFC 8693 exchange implementation; use existing exchange function with modified scope list
- `banking_api_server/services/agentMcpTokenService.js` — Session token retrieval; `mcpWriteToken` should follow same pattern
- `banking_api_server/services/configStore.js` — `agent_mcp_allowed_scopes` config (already includes `banking:write`); `ff_skip_token_exchange` flag

### UI — Existing Patterns to Follow
- `banking_api_ui/src/components/BankingAgent.js` — `scopeErrorModal` state (line ~1135), `setScopeErrorModal()` call sites (lines ~2575, ~2593), modal JSX (lines ~3705–3790), token event emission pattern (line ~797), `runAction()` function
- `banking_api_ui/src/components/AgentConsentModal.js` — HITL consent modal reference (for UX consistency; do NOT reuse component)

### MCP Tool Definitions
- `banking_mcp_server/src/tools/BankingToolRegistry.ts` — `create_transfer`, `create_deposit`, `create_withdrawal` all have `requiredScopes: ['banking:write']` (lines ~159, ~207, ~255)
- `banking_api_server/services/mcpLocalTools.js` — Local catalog entries for the same write tools

### RFC References (for educational copy in modal + token events)
- RFC 8693 §3.2 — Token exchange subject/actor token; cite in modal educational copy and token event labels

</canonical_refs>

<specifics>
## Specific Implementation Notes

- The `scopeErrorModal` state object currently has shape `{ missingScopes, userScopes, requiredScopes }` — extend it with `scopeUpgradeState: 'error'` as initial value; keep existing shape intact for the error display in the first state
- `runAction()` in `BankingAgent.js` is the correct replay entry point — it normalises chip vs form paths and handles the full toast/token-event lifecycle
- The NL (natural language) agent path also handles `mcp_scope_denied` (line ~3029) — the same flow should apply: emit chat message, trigger modal, replay. Planner should account for both the chip path and NL path.
- `ff_skip_token_exchange` in configStore should bypass the entire scope-upgrade flow (just show original error) — consistent with how it bypasses exchange elsewhere

</specifics>

<deferred>
## Deferred Ideas

- Adding a "Revoke write scope" button to downgrade the session token back to read-only — interesting but a separate phase
- Persisting the write-scoped token across sessions (currently one exchange per session, not per login) — future work
- Showing a PingOne Authorize policy decision trace alongside the scope upgrade — would require PingOne Authorize integration not in scope here
- Test page card for the 403→HITL→exchange→replay flow (similar to Phase 187's 401 flow card) — good educational addition but separate phase

</deferred>

---

*Phase: 211-scope-gated-write-tools*
*Context gathered: 2026-04-21 via gsd-discuss-phase*
