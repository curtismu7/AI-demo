# Phase 143: UX agent banking actions via MCP server — Context

**Gathered:** 2026-04-13  
**Status:** Ready for planning  
**Source:** Interactive discuss-phase  

---

## Phase Boundary

This phase enables **agent-initiated banking transactions** via the MCP server chat interface. The agent (communicating through the BankingAgent chat panel) can initiate Transfer, Deposit, Withdraw, and Balance inquiries on behalf of the user. Results appear as transactions in the dashboard and are visually distinguished as agent-initiated.

**Key clarification:** Agent actions originate from the **agent chat interface**, not dashboard buttons. Dashboard buttons remain user-manual only. Agent results appear in the dashboard transaction history.

---

## Decisions

### D-01: Agent action initiation — Via MCP chat interface, not dashboard buttons
- Agent initiates actions by requesting (e.g., "Transfer $500 to savings") in the chat interface
- Agent calls MCP banking tools (Transfer, Deposit, Withdraw, Get Balance, List Accounts)
- No added dashboard buttons for agent actions; dashboard shows manual + agent-initiated transactions
- **Rationale:** Agent is conversational; user doesn't click "Agent Transfer" button. Agent offers the capability.

### D-02: User approval threshold — Hybrid (small auto-run, large requires approval)
- **Small transactions** (threshold TBD, e.g., < $500) auto-run with agent
- **Large transactions** (>= threshold) require explicit user approval via HITL in agent chat interface
- User sees **approval preview** showing: amount, destination, description, authorized by [Agent Name], timestamp, fees
- Buttons: **"Approve Agent Action"** / **"Reject"**
- **Rationale:** Educates user (see agent at work) without approval fatigue on every $50 transfer

### D-03: Token exchange strategy — 1-token default with feature flag for 2-token
- **Default path:** 1-token exchange (user ID token → MCP token scoped to user + agent aud)
- **Feature flag:** FF_AGENT_2_TOKEN_EXCHANGE toggles to 2-token (user ID token + agent token → MCP token with `act` claim)
- Admin/config page can switch paths for testing/demo purposes
- **Rationale:** Demonstrates both RFC 8693 paths; 1-token simpler for basic demo, 2-token shows explicit delegation

### D-04: Exchange path visibility — Show in token chain display
- Token chain panel displays which exchange path was used: **"1-exchange"** vs **"2-exchange"** label
- User (and developer viewing demo) knows which pattern was active for this agent action
- **Rationale:** Educational; demonstrates the two RFC 8693 paths visually

### D-05: Agent banking tools — All available
- Agent can call: **Transfer**, **Deposit**, **Withdraw**, **Get Balance**, **List Accounts**
- No restrictions on transaction types (full banking capability)
- **Rationale:** Shows full pattern; restrictions can be added in future phases if needed

### D-06: Agent transaction visibility — Separate "Agent Activity" tab
- Dashboard transaction history has two views/tabs:
  - **"All Transactions"** — manual + agent-initiated (mixed)
  - **"Agent Activity"** — agent-initiated only (filtered)
- Each agent transaction shows badge **🤖 Agent** and agent name
- **Rationale:** User can see agent pattern evolution; agent actions are transparent but categorized

### D-07: Agent action error handling — User-friendly + technical detail + remediation
- **Error display:** Both friendly + technical layers
  - User layer: "Agent couldn't complete this transfer. Check your token configuration or try manually."
  - Technical layer: "(Token exchange error: insufficient_scope — verify agent app has banking scope)"
- **User options:** "Retry" / "Cancel" / "Try Manually"
- **Help:** Link to troubleshooting docs: "How to fix agent action errors"
- **Rationale:** Educates user on what went wrong; provides path to resolution without agent blocking

### D-08: Real-time feedback during agent action — Combined detailed steps + result notification
- **During action:** Progress in agent chat: "🔄 Getting tokens..." → "🔄 Exchanging..." → "🔄 Calling agent..." → "✓ Transfer complete"
- **Result display:** Toast notification + transaction appears in dashboard immediately
- **Rationale:** User sees agent working; results are immediate + persistent

---

## the agent's Discretion

- **Approval threshold amount** — Planner will recommend safe default (e.g., $500); can be hardcoded or configurable
- **Token exchange implementation details** — How to surface the FF in config; which code path implements each
- **Progress step messaging** — Exact wording of "Getting tokens..." / "Exchanging..." steps
- **Error recovery flow** — Whether "Retry" button actually polls or user manually triggers agent again
- **Transaction history UI** — How tabs/filtering implemented in dashboard; can be dropdown, side nav, or button toggle
- **Badge placement** — Badge icon position in transaction row (prefix, suffix, or separate column)

---

## Deferred Ideas

- **Advanced MFA for agent actions** — Require step-up MFA for large transactions (future phase)
- **Agent rate limiting** — Max N transactions per hour by agent (future policy)
- **Spend notifications** — Alert user when agent spends over daily limit (future notifications phase)
- **Rollback/undo** — User can undo agent-initiated transaction within N minutes (future recovery phase)

---

## Canonical References

**Existing agent code:**
- [banking_api_server/routes/tokens.js](banking_api_server/routes/tokens.js) — Token exchange and agent token service calls
- [banking_api_server/services/agentMcpTokenService.js](banking_api_server/services/agentMcpTokenService.js) — MCP token resolution (1-exchange vs 2-exchange)
- [banking_mcp_server/src/server/BankingMCPServer.ts](banking_mcp_server/src/server/BankingMCPServer.ts) — MCP server + tool registry
- [banking_api_ui/src/components/BankingAgent.js](banking_api_ui/src/components/BankingAgent.js) — Agent chat interface

**Related documentation:**
- RFC 8693 — Token Exchange (both 1-exchange and 2-exchange paths)
- Phase 142 CONTEXT.md — Button visual separation patterns (for consistency)
- Phase 144 CONTEXT.md — ID token exchange (no access token to agent)

---

## Specifics

**MCP banking tools already implemented:**
- `banking_get_account_balance` — Returns balance for account
- `banking_create_transfer` — Transfer between accounts
- `banking_create_deposit` — Deposit into account
- `banking_create_withdrawal` — Withdraw from account
- `banking_list_accounts` — List user's accounts

**Existing token exchange in codebase:**
- 1-exchange: `agentMcpTokenService.resolveMcpAccessToken()` user token only
- 2-exchange: Requires both user token + agent token; adds `act` claim to result
- Both already wired in pingoneTestRoutes.js for testing

**Transaction history UI:**
- Currently shows only manual transactions (Transfer, Deposit, Withdraw)
- Agent transactions will be added alongside with `clientType: 'ai_agent'` flag
- Demo data already includes mixed transactions with `clientType: 'enduser' | 'ai_agent'`

---

*Phase 143 context — Ready for research and planning.*
