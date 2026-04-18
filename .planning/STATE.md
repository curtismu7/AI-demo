---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: Ready to plan
last_updated: "2026-04-18T12:10:08.609Z"
progress:
  total_phases: 195
  completed_phases: 165
  total_plans: 345
  completed_plans: 358
---

# State — Super Banking AI Banking Demo

**Milestone:** v1.0 — Complete Demo + Educational Content
**Updated:** 2026-04-17

---

## Current Position

Phase: 188
Plan: Not started
Next incomplete phase: 74 (62.1 Token exchange critical fixes and enhancements - may_act, RFC 8707, scopes) — Not Started

## Recent Progress

✅ Phase 181 COMPLETE

- Wave 1 (181-01): Added the CUA education drawer and registered `EDU.CUA = 'cua'`
- Wave 2 (181-02, 181-03): Added NL routing, sidebar/RFC/agent discoverability, and reciprocal links with Agent Gateway, HITL, and MCP Protocol
- Verification: `banking_api_ui` production build passed; heuristic NL parser routes `cua`, `computer use agent`, and `computer use` to the CUA panel

Note: current GSD stats report more plan summaries than plan definitions (`330/325`) because of legacy summary overcounting in the underlying stats output; the state file now mirrors the canonical tool totals rather than the stale Phase 05 snapshot.

## Roadmap Evolution

- Phase 189 added: Marketing page user authentication — login on /marketing goes straight to customer dashboard; resource-server buttons (balance, transactions) call banking API directly; PingOne authz validates user; agent path follows 401→exchange pattern

- Phase 188 added: Define AI token exchange taxonomy — user token (subject), agent token (actor), transaction token (MCP access) — validate naming against RFC 8693 and MCP spec

- Phase 187 added: 1-token exchange 401 flow — MCP 401 triggers user authz then token exchange for MCP token. Update docs, test page, all 1-token exchange paths.

- Phase 186 added: ID token exchange flow — MCP 401 → OIDC authz → agent CC + user ID token → dual token exchange at MCP Gateway

- Phase 185 added: Token color legend and consistent token-type color coding across all token displays

- Phase 184 added: End-to-end delegated token flow — agent CC token + user OAuth token sent to MCP Gateway for dual token exchange at PingOne before fulfilling request

- Phase 181 COMPLETE: CUA training slide-out added and verified

- Phase 183 added: MCP tools metadata compliance and token chain logging

- Phase 182 added: Public URL for MCP server so external clients like Claude can connect

- Phase 181 added: We need to add a training slide out for CUA for AI

- Phase 180 added: Evaluate and implement Google Gemma 4 as another LLM provider

- Phase 179 READY: Add dropdown for user to choose which LLM to use (1/1 plans incomplete)

- Phase 178 READY: Agentic Trust alignment — education page mapping 6 security pillars (2/2 plans incomplete)

- Phase 177 added: PingOne Test page — clarify token exchange sections, add subject_token to second exchange, explain IDToken FF bypass

- Phase 176 added: Show users in config what LLM we are using and pick the order — LM Studio default, fallback chain, bad LLM should not block

- Phase 175 READY: Investigate JSON-RPC and how and when we should be using it (2/2 plans incomplete)

- Phase 174 added: HITL step-up modal — replace toast with blocking modal for MFA and consent flows

- Phase 173 COMPLETE: Research and create a frontend using WebMCP from Google

- Phase 172 added: MCP server token exchange — require token exchange at MCP server before forwarding to backend app instead of OAuth pass-through

- Phase 171 added: https://developer.pingidentity.com/blog/introducing-the-pingone-mcp-server/

- Phase 170 added: Force HITL for all Transfers in authorization server

- Phase 169 added: Add OAuth token display page — show user info from token or PingOne userinfo endpoint
