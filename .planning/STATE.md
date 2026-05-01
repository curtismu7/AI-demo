---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: unknown
last_updated: "2026-05-01T03:14:26.738Z"
progress:
  total_phases: 145
  completed_phases: 119
  total_plans: 242
  completed_plans: 244
  percent: 100
---

# State — Super Banking AI Banking Demo

**Milestone:** v1.0 — Complete Demo + Educational Content
**Updated:** 2026-04-18

---

## Current Position

Phase: 247 (pingone-mcp-server-integration) — COMPLETE
Plan: 1 of 3
Next phase: 235 (surface-introspection-validation-results-in-token-chain-and-) — available for planning

## Recent Progress

✅ **Phase 232 COMPLETE**

- Plan 232-01: NDJSON file persistence in appEventService.js (`ACTIVITY_LOG_FILE` env var, `appendFileSync`, `mkdirSync`); added `authorize` and `agent_prompt` EVENT_CATEGORIES; added icons/labels to ActivityLogs.js
- Plan 232-02: Instrumented authorize.js (4 calls: bypass/permit/deny/error) and bankingAgentLangGraphService.js (3 calls: heuristic_tool/llm_invoke/llm_complete)
- Plan 232-03: Instrumented oauth.js (5 calls: callback-error/state-mismatch/nonce-mismatch/session-regen-failed/callback-success), cibaService.js (4 calls: initiate/initiated/denied/timeout), agentMcpTokenService.js (2 calls: rfc8693-success/rfc8693-error)
- Plan 232-04: Instrumented tokenChain.js (2 calls: fetched/error), agentTokenService.js (2 calls: agent-token-valid/agent-token-invalid), delegationService.js (5 calls: grant-success/grant-provisioning-failed/revoke-success/revoke-not-found×2)
- Commits: 8afdd056, 05bf7bf0, 60d94a91, 731a5463
- Build: npm run build exit 0

✅ **Phase 224 COMPLETE**

- Plan 224-01: Added Audit Trail (📋) and Token Decoder (🔍) tabs to DevToolsDashboard; AuditTrailTab reads context.history with Set-based multi-row inline expand + colored category badges via deriveTokenCategory; TokenDecoderTab shows horizontal scrollable DecodedTokenPanel columns from ctx.events; jwtFullDecode adapter { header, payload: claims } applied in both sub-components; 12 new CSS classes appended to TokenDisplay.css
- Files: banking_api_ui/src/components/DevToolsDashboard.jsx, banking_api_ui/src/components/TokenDisplay.css
- Build: npm run build exit 0

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

- Phase 258 added: Research BFF SSE migration — token chain push vs polling

- Phase 257 added: HITL and P1MFA approval settings page — configure what triggers HITL simple approval vs P1MFA for transactions, add page to side menu
- Phase 256 added: All modals should have pop out feature — close on-page modal when opening popout; popout has all the same functionality and buttons
- Phase 255 added: Top-menu Run Servers button — executes run-bank.sh via BFF endpoint and streams output to a modal so user can verify all services are up

- Phase 254 added: Family delegation — prompt for delegated user on next login, auto-provision user with MFA device and may_act attribute via worker token

- Phase 253 added: Gateway bypass fallback — fix scopes, AUD, and resource server so MCP tools work without the gateway and user never sees an error

- Phase 252 added: Dedicated log file per server (API, MCP Gateway, MCP Server, Auth, Agent) with Admin UI log viewer tabs

- Phase 251 added: Trace scopes, resource server, and AUD end-to-end — document correct flow and add health-check + auto-fix button to Admin UI

- Phase 250 added: Audit error messages and fix 401/403 error handling across all flows — ensure every error is human-readable and actionable

- Phase 248 added: Add token chain overview panel with explanatory text above each token and exchange step

- Phase 247 added: PingOne MCP Server integration — feature-flagged option to use pingidentity/pingone-mcp-server (stdio binary) alongside existing custom MCP gateway, with adapter layer, admin UI toggle, and status chip reflecting active mode

- Phase 245 added: 403 scope trap and token introspection — 403 insufficient scope errors are trapped by the agent, trigger automatic scope upgrade via token exchange, and all tokens are validated via PingOne introspection endpoint
- Phase 244 added: Interactive architecture diagram walkthrough — highlight components on Ping Identity Digital Assistants diagram and detailed token-flow diagram as each step is processed
- Phase 243 added: Build a real MCP Gateway in front of the MCP server with RFC 9728 protected resource metadata, PingOne Authorize-led policy evaluation, token passing and token exchange to the MCP server, no tokens ever exposed to the LLM, and strict audience-per-hop validation so each token aud maps only to the next hop in the flow
- Phase 240 added: make sure all tests pages have, and look for other pages this makes sense and make a plan for those: 1) Actual PingOne API 2) Actual Request to pingOne for that call (JSON) 3) Actual Response from pingone Call (JSON) 4) LInk to actual PingOne api docs page, for that call https://developer.pingidentity.com/apis.html
- Phase 239 added: make sure all tests pages have, and look for other pages this makes sense and make a plan for those: 1) Actual PingOne API 2) Actual Request to pingOne for that call (JSON) 3) Actual Response from pingone Call (JSON) 4) LInk to actual PingOne api docs page, for that call https://developer.pingidentity.com/apis.html
- Phase 238 added: Dashboard overhaul — token diff view, architecture diagram, MCP inspector, API call explorer, and RFC-linked learning panels
- Phase 237 added: Frontend RFC visualization + production polish (rfcLinks, RfcLink, exchange hop JWT examples, token chain annotations, RFC 9728 live metadata)
- Phase 236 added: Code review pass — async patterns, memory leaks, security, and modern JS standards audit
- Phase 235 added: Surface introspection validation results in token chain and activity log — show that PingOne confirmed a token active, not just decoded
- Phase 234 added: Token-chain updates too often; update token-chain only when the active UI page contains token-chain
- Phase 233 added: Enrich activity log with decoded token payloads — full JWT header+claims per token, introspection results, PingOne API req/resp bodies, LLM prompts, agent reasoning steps, PKCE details, CIBA, step-up MFA triggers, scope resolution, session snapshots
- Phase 232 added: Unified activity log — append-only structured log file for token exchanges, MCP tool calls, PingOne API calls, authorize gate decisions, agent prompts, and auth events; wire to Activity Logs UI
- Phase 231 expanded: Agent chip groups — remove Learn & Explore chips from inline panel, keep full list in LangGraph regex (no LLM fallback), collapsible sections, popout discovery panel showing all chips by group
- Phase 230 added: Authorize gate — never silently skip, warn user when not calling P1Authorize and show reason
- Phase 229 added: Token introspection configuration — show setup guide when introspection not configured, explain how to enable it
- Phase 228 added: Admin agent chip routing — fix heuristic so chips like "show all customer accounts" and "show last 5 errors" never fall back to LLM; add sample data to support those prompts
- Phase 227 added: Remove side menu and "Admin Dashboard" button — simplify navigation, reduce demo clutter
- Phase 226 added: Agent popout closes existing inline agent — prevent duplicate agent state when popping out to separate window
- Phase 225 added: Retail theme toggle — ff_retail_mode FF switches Banking ↔ Best Buy-style electronics; swaps theme/data/agent copy, keeps all auth/MCP/PingOne panels unchanged
- Phase 224 added: Token Audit Trail + Token Decoder — dual-tab panel in Dev Tools Dashboard; audit trail shows timestamped ops with scope badges + click-through detail; token decoder shows side-by-side decoded JWT columns per token in chain
- Phase 214 added: Fix FIDO registration and check authentication. Look at Curl commands. Show the request and response for FIDO on the test page under each section for FIDO2
- Phase 213 added: Dev Tools Dashboard — complete data wiring, deduplication, and panel polish

- Phase 211 added: Scope-gated write tools: 403-to-HITL-to-token-exchange flow for transfer/deposit/withdraw with scope-upgrade and request replay
- Phase 210 added: MCP scope enforcement — tools advertise required scopes, server returns 403 on missing scope, agent surfaces scope errors to client
- Phase 209 added: Modular component architecture — discrete deployable building blocks for Agent, MCP Server, Authorization Server, and OAuth/OIDC with plug-and-play adapter interfaces (PingGateway drop-in, PingOne Authorize swap, generic IDP abstraction, standalone GitHub-downloadable components)
- Phase 208 added: Fix 36 failing test suites and NL agent heuristic path — test infrastructure + get_my_accounts display and token events (completed)
- Phase 206 added: Document last-mile credential architecture — IBM Agentic Trust framework alignment
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

- 7 pending todos
- Latest: Update token-chain only on token-chain UI pages
- Other: Remove icons from agent panel; fix pop-out agent taking too much space
- Other: Fix PingOne token policy explorer
- Other: Add clear button to token chain panel (clear on demand; keep until user clicks)
- NEW: Simulated Authorize output must be byte-for-byte indistinguishable from real PingOne Authorize — same JSON shape, field names, HTTP status codes, error formats, and timing characteristics. API requests must also mimic PingOne Authorize request format exactly.
- NEW: All test pages (PingOne Test, MFA Test, Authz Test, etc.) must show (1) the actual PingOne API endpoint being called and (2) the full JSON request body for that call, so users can learn what each API does.

**Planned Phase:** 244 (interactive-architecture-diagram-walkthrough-highlight-compo) — 3 plans — 2026-04-27T21:23:04.394Z
