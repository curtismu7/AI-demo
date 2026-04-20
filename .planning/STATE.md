---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: unknown
last_updated: "2026-04-20T12:27:34.514Z"
progress:
  total_phases: 213
  completed_phases: 184
  total_plans: 379
  completed_plans: 382
---

# State — Super Banking AI Banking Demo

**Milestone:** v1.0 — Complete Demo + Educational Content
**Updated:** 2026-04-18

---

## Current Position

Phase: 200 (heuristic-command-chip-routing-use-llm-only-when-heuristic-cannot-understand) — EXECUTING
Plan: 1 of 1
Next phase: 127+ (available for planning)

## Recent Progress

📊 **Phase 205 PLANNED** (1 plan)

- Plan 205-01: Credentials Modal — Detect missing OAuth/worker credentials and prompt user via modal; submit to configstore; integrate with error handler
- Architecture: React modal component, credentials service API calls, BFF endpoints (/api/config/credentials/set, /api/config/credentials/missing), middleware integration
- Design: Modal shows form inputs per missing field; conditional guidance for worker tokens with PingOne setup instructions
- Ready to execute

✅ **Phase 126 COMPLETE**

- Plan 126-01: Added `resolvedIdentity` to TokenChainContext (single shared fetch); refactored TokenChainDisplay to read identity from context; EventRow User button shows friendly name; TokenChainEducationPanel JwtClaimsTab shows live sub/name/email; TokenChainPanel shows live sub in banking-app step; AgentFlowDiagramPanel compact view shows friendly identity
- Files: TokenChainContext.js, TokenChainDisplay.js, TokenChainEducationPanel.js, TokenChainPanel.js, AgentFlowDiagramPanel.js
- Build: npm run build exit 0, 441.42 kB

✅ **Phase 124 COMPLETE**

- Plan 124-01: Added persistent HITL badge to AgentConsentModal; strengthened manual-approval copy in BankingAgent.js chat messages; updated all MFA step-up flow labels in agentFlowDiagramService.js
- Files: AgentConsentModal.js, AgentConsentModal.css, BankingAgent.js, agentFlowDiagramService.js
- Build: npm run build exit 0, 440.81 kB

✅ **Phase 118 COMPLETE**

- Plan 118-01: HuggingFace research — recommend Dedicated Inference Endpoint (OpenAI-compatible, `ChatOpenAI` + `baseURL`); model `meta-llama/Llama-3.3-70B-Instruct`
- No code changes; implementation checklist in 118-RESEARCH.md

✅ **Phase 117 COMPLETE**

- Plan 117-01: Added `LLMProvider` ABC to Python interfaces; wired OpenAI + LM Studio in BFF agentBuilder; fixed per-provider model defaults
- Files changed: `langchain_agent/src/services/interfaces.py`, `banking_api_server/services/agentBuilder.js`, `banking_api_server/package.json`
- Build: npm run build exit 0, 440.49 kB

✅ **Phase 190 COMPLETE**

- Plan 190-01: Aligned all user-facing token-exchange labels in React SPA with Phase 188 RFC 8693 taxonomy
- Files changed: PingOneTestPage.jsx (~13 label sites updated)
- No changes needed in TokenExchangeFlowDiagram, TokenChainEducationPanel, TokenExchangePanel, RFC8707Content (already aligned)
- Canonical vocabulary: 1-exchange / 2-exchange (dual-token) / Phase 186 ID-token exchange / Legacy two-step chain
- Build verification: npm run build exit 0, 440.49 kB (−18 B)

✅ **Phase 189 COMPLETE**

- Plan 189-01: Added resource buttons (balance, transactions) to /marketing
- Implementation: LandingPage markup + CSS styling + service integration
- Error handling: Phase 187 need_auth pattern reused for token exchange on 401
- Login flow: Verified return_to=/marketing preserves user position after auth
- Build verification: npm run build exit code 0, no new errors
- Commits: 8597539 (implementation), 412e82a (summary)
- All locked decisions honored (D-01 through D-04)

✅ Phase 181 COMPLETE

- CUA education drawer added with NL routing

✅ Phase 187 COMPLETE

- 1-token exchange 401 flow established

---

## Roadmap Evolution

- Phase 205 added: Missing Credentials Modal — prompt for missing OAuth/worker creds with PingOne setup guidance
- Phase 204 added: /configure page needs explanations for each field/option; add Feature Flags as a tab on the configure page

- Phase 203 added: /pingone-test config and resource cards: yellow background until tested, green if passed, light red if failed

- Phase 202 added: PingOne test page: show token events in acquisition order (top=first obtained, bottom=MCP token); add summary of changes section

- Phase 201 added: PingOne test page: rename 'Verify Assets' to 'Verify Resources & Scopes' and filter to only show apps/resources used by this app

- Phase 200 added: Heuristic command/chip routing — use LLM only when heuristic cannot understand

- Phase 199 added: Fix agent token chain: get agent client-credentials token silently and show in token chain

- Phase 198 added: Support Transaction Tokens For Agents (draft-oauth-transaction-tokens-for-agents-06) with configurable RFC 8693 fallback; update MCP server for dual-mode

- Phase 196 added: Combine feature flags, configuration, and setup into unified tabbed page with clear visual tabs (color and outlines) including IDP setup tab

- Phase 194 added: Display complete token chain and OIDC flow visualization with token state changes, MCP calls, and backend operations
- Phase 193 added: Allow unauthenticated dashboard access — lazy login on agent/action buttons
- Phase 192 added: Client credentials resource server app — client_id/client_secret banking summary
- Phase 191 added: OIDC resource server app — banking summary with decoded tokens, MCP target
- Phase 190 added: Align UI with 2-token exchange taxonomy and education
- **Phase 189 COMPLETE** ✅: Marketing page user authentication with resource buttons
- Phase 188: Define AI token exchange taxonomy
- Phase 187 COMPLETE ✅: 1-token exchange 401 flow
- Phase 186: ID token exchange flow
- Phase 185: Token color legend
- Phase 184: End-to-end delegated token flow
- Phase 183: MCP tools metadata compliance
- Phase 182: Public URL for MCP server
- Phase 181 COMPLETE ✅: CUA training slide-out
- Phase 180: Evaluate and implement Google Gemma 4
- Phase 179 READY: Add LLM dropdown selector
- Phase 178 READY: Agentic Trust alignment — 6 security pillars
- Phase 177: PingOne Test page clarification
- Phase 176: Show LLM in config with fallback chain
- Phase 175 READY: Investigate JSON-RPC patterns
- Phase 174: HITL step-up modal
- Phase 173 COMPLETE ✅: WebMCP frontend from Google
- Phase 172: MCP server token exchange
- Phase 171: PingOne MCP server integration
- Phase 170: Force HITL for Transfers
- Phase 169: OAuth token display page

---

## Phase 189 Execution Summary

**Objective:** Add resource-server action buttons to marketing page with state-driven enable/disable

**Tasks Completed (5/5):**

1. ✅ Add resource buttons markup to LandingPage.js (185 lines)
2. ✅ Wire onResourceAction callback + error handling (need_auth pattern)
3. ✅ Verify login return_to=/marketing flow (D-01)
4. ✅ Style resource buttons + disabled states (127 lines CSS)
5. ✅ Verify npm run build passes (exit code 0)

**Implementation Details:**

- Files: LandingPage.js (+185 lines), LandingPage.css (+127 lines)
- Features: Balance + Transactions resource cards
- State: Disabled when logged out, active when logged in (D-02)
- Error handling: Phase 187 need_auth intercept → login → return to /marketing
- Build: Production build verified, no regressions
- Commits: 2 atomic (implementation + summary)

**Decisions Honored:**

- ✅ D-01: Login returns to /marketing (not /dashboard)
- ✅ D-02: Buttons disabled when logged out, active when logged in
- ✅ D-03: No existing content refactored (purely additive)
- ✅ D-04: Reused Phase 187 exchange, no new handlers

---

## Verification Results

✅ Resource buttons render correctly (disabled/enabled states)
✅ Service calls wired to getAccountBalance + getMyTransactions
✅ Phase 187 need_auth error pattern integrated
✅ Login flow preserves return_to parameter
✅ npm run build exit code 0
✅ No new warnings or errors
✅ All success criteria met (8/8)

---

## Next Steps

- **Option 1:** Plan Phase 189-02 (optional enhancements)
  - Add similar buttons to EmbeddedAgentDock
  - Add transaction detail drill-down
  - Add account selection dropdown

- **Option 2:** Move to Phase 190 or next incomplete phase
  - Check ROADMAP for next priority
  - Run `/gsd-discuss-phase 190` to gather context

- **Option 3:** Deploy to production
  - Review implementation on live server
  - Monitor user interactions and errors
  - Iterate based on feedback

---

## Notes

- Phase 189 planning (discuss-phase + plan-phase) took precedence to lock decisions before implementation
- Plan execution was straightforward due to Phase 187 infrastructure already in place
- No blockers or surprises during implementation
- All git commits include descriptive commit messages with file lists and rationale

---

## Accumulated Context

### Pending Todos

- 3 pending todos
- Latest: Resize dashboard columns - token chain, user data, and agent positioning
- Other: Marketing pages should only show float agent, never bottom positioning
- Other: Align UI with 2-token exchange
