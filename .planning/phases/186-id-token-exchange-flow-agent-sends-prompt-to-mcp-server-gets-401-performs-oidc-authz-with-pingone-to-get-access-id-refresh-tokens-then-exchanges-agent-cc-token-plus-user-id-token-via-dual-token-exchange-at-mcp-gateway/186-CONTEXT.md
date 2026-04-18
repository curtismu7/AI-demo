# Phase 186: ID Token Exchange Flow — Context

**Gathered:** 2026-04-18  
**Status:** Ready for planning  
**Source:** User specification (Phase 186 roadmap spec + conversation)

---

<domain>

## Phase Boundary

Agent requests MCP server → receives 401 → app initiates OIDC user authentication with PingOne → app obtains user's access + ID + refresh tokens → app exchanges **agent CC token (pre-held from startup) + user ID token (newly obtained)** in a dual-token exchange at PingOne → MCP validates result and returns success.

**Parallel to Phase 184:** Phase 184 uses agent CC + user OAuth token; Phase 186 uses agent CC + user **ID token** specifically.

**Scope:** Backend token exchange logic, test page flow, documentation updates, anywhere 1-token exchange is documented.

</domain>

<decisions>

## Locked Implementation Decisions

### D-01: Trigger on 401 + Retry
- **What:** When agent receives 401 from MCP server, catch it in app handler
- **How:** App DOES NOT surface the error to user; instead, initiates OIDC authz flow transparently
- **Rationale:** Matches Phase 186 spec: "MCP server returns 401 to App, app handle 401 and does authz"
- **Canonical ref:** Phase 186 roadmap spec

### D-02: User Authentication Flow — OIDC Authorization Code
- **What:** Use PingOne `/authorize` endpoint with PKCE (existing Auth Code flow)
- **Scope:** `openid profile email` to get ID token
- **Why ID token:** Contains user identity; agent will present ID token in token exchange alongside agent CC token
- **Ensure:** Redirect after auth includes the token refresh set (access + ID + refresh)
- **Canonical ref:** CLAUDE.md § Workflow orchestration (plan mode); oauth-pingone SKILL (OIDC via `/authorize`)

### D-03: Dual Token Exchange Request Structure
- **Subject token:** User's ID token (from D-02 auth)
- **Actor token:** Agent's CC token (pre-held from app startup, not client credentials flow — agent already has it)
- **Audience:** MCP Gateway resource URI (same as phase 184)
- **Result:** MCP-scoped access token with `act` claim pointing to agent, `sub` pointing to user
- **Canonical ref:** RFC 8693 pattern established in Phase 184; oauth-pingone skill (Token Exchange section)

### D-04: Error Handling During 401→Auth Flow
- **If auth fails:** Return error to user; do NOT retry MCP call
- **If token exchange fails:** Surface error with context ("Invalid credentials" or "Exchange failed")
- **If MCP call succeeds post-exchange:** Return result to user
- **Retry logic:** NO automatic retry loop; user must retry the original operation after successful auth
- **Canonical ref:** CLAUDE.md § Autonomous bug fixing (prefer root cause over symptoms)

### D-05: Test Page Updates
- **Add:** New exchange flow card showing "ID Token Exchange (401 → Auth → Exchange)" sequence
- **Show:** 3-step flow with button labels transitioning (Send → Checking auth → Exchanging tokens)
- **Display:** Token chain visualization (before/after, highlighted ID token in chain)
- **Keep:** Existing 1-token and dual-token exchanges (Phase 184)
- **Future:** Legacy two-step exchange removal (captured as todo: remove-legacy-two-step-token-exchange-error-from-test-page)
- **Canonical ref:** PingOneTestPage.jsx (existing pattern from Phase 184/185), Phase 187 roadmap (1-token flow scope note)

### D-06: Documentation Scope
- **Update:** `PINGONE_TWO_TOKEN_EXCHANGES.md` or similar (existing Phase 184 docs)
- **Add:** Section for ID Token flow explaining why ID token instead of access token, when to use vs Phase 184
- **Examples:** Code snippet showing dual exchange request with ID token
- **Diagrams:** Mermaid or draw.io showing 401 → auth → exchange → response
- **Canonical ref:** Project documentation structure (from PROJECT.md roadmap overview)

### D-07: Backend Routes/Handlers
- **No NEW routes:** Reuse existing `/api/token-exchange` or wire into existing MCP call handler
- **Logic location:** App layer (catch 401 from MCP, divert to auth, retry exchange)
- **Session management:** Store ID token in session briefly (expires after use or with auth session)
- **Security:** ID token use must be scoped to current user session only; do not leak across sessions
- **Canonical ref:** CLAUDE.md § Core principles (no laziness, find root causes, BFF security)

### D-08: Verification Points (Pre-Planning)
- Agent sends request → MCP returns 401 (simulated or real 401 from test server)
- App catches 401 and triggers auth (no error shown to user yet)
- User completes OIDC auth dance, gets ID token
- App performs dual token exchange: agent CC + ID token
- Exchange succeeds, MCP token obtained
- Original request retried with MCP token
- Success returned to user with token chain visible
- **Canonical ref:** Verification patterns from Phase 184 & 185 (inline test during token chain display)

### D-09: Scope Alignment — NOT in Phase 186
- ❌ Modify PingOne app configurations (already set up for Phase 184, reuse)
- ❌ Change token signature validation (existing middleware used)
- ❌ Implement new error recovery UI patterns (use existing toast/error display)
- ❌ Create new MCP tools (wiring only, no new tools)
- ✅ Route the 401 → auth → exchange pattern in application logic
- ✅ Update test page to visualize the flow
- ✅ Update docs to explain ID token variant of dual exchange

### D-10: Success Definition
- Phase 186 complete when:
  1. ✅ Agent requests → MCP 401 caught and handled transparently
  2. ✅ User is authenticated via OIDC, ID token obtained
  3. ✅ Dual token exchange succeeds (agent CC + user ID token)
  4. ✅ MCP call completed with new token
  5. ✅ Test page demonstrates the flow with token chain visibility
  6. ✅ Documentation explains ID token exchange variant
  7. ✅ All changes committed and `npm run build` passes

</decisions>

<specifics>

## Specific Implementation References

### From Existing Code (Reuse)
- **Token exchange logic:** `banking_api_server/services/oauthService.js` (Phase 184, `performTokenExchange()`)
- **Auth flow:** `banking_api_server/routes/auth/oauthUser.js` (existing OIDC flow for user client)
- **Session storage:** `express-session` middleware (existing, stores tokens in `req.session.oauthTokens`)
- **Test page:** `banking_api_ui/src/components/PingOneTestPage.jsx` (Phase 185, existing test card patterns)
- **Token chain display:** `TokenChainDisplay.js`, `DecodedTokenPanel.jsx` (Phase 185 color system)

### New/Modified Artifacts
- `banking_api_server/routes/mcp/token-exchange-handler.js` (or similar) — wire 401 catch → auth → exchange logic
- `banking_api_ui/src/components/PingOneTestPage.jsx` — add ID Token Exchange flow card (Wave 1 or 2)
- `docs/PINGONE_TWO_TOKEN_EXCHANGES.md` OR update relevant doc — add ID token variant section
- Test verification script or manual checklist — validate 3-step flow (401, auth, token exchange)

### Token Claim Names (Phase 184 established; Phase 186 uses same)
- Subject claim: `sub` (user)
- Actor claim: `act` (agent)
- Audience claim: `aud` (MCP resource)
- Scope: `banking:read` and `banking:write` or equivalent (per app scopes)

### Environment Variables (Phase 184; reuse)
- `MCP_SERVER_AUDIENCE` — target audience for MCP token
- `AGENT_OAUTH_CLIENT_ID`, `AGENT_OAUTH_CLIENT_SECRET` — agent client credentials
- `USER_CLIENT_ID`, `USER_CLIENT_SECRET` — user app for auth flow

</specifics>

<deferred>

## Out of Phase 186 Scope (Noted for Future)

- **Legacy two-step exchange removal** — captured as todo (remove-legacy-two-step-token-exchange-error-from-test-page); deferred to Phase 187 or later cleanup
- **Phase 187 (1-token 401 flow)** — separate phase, depends on Phase 186 understanding
- **Multi-device session handling** — if user has multiple sessions, only current session gets ID token
- **ID token refresh/rotation** — use existing refresh token grant; Phase 186 uses ID token once per 401 incident
- **UI polish for auth interruption** — basic flow in Phase 186; polish (loading states, cancel button) deferred

</deferred>

<canonical_refs>

## Canonical References (Downstream Agents MUST Read)

**Phase 186 depends on the following architectural decisions:**

### OAuth 2.0 / OIDC
- [CLAUDE.md](./CLAUDE.md) — Project structure, BFF pattern, OAuth principles
- [oauth-pingone SKILL](../.claude/skills/oauth-pingone/SKILL.md) — OIDC Authorization Code + PKCE, ID token, token exchange (RFC 8693), PingOne endpoint reference
- [RFC 8693 Token Exchange](https://tools.ietf.org/html/rfc8693) — Formal spec for `subject_token`, `actor_token`, `audience`, `urn:ietf:params:oauth:grant-type:token-exchange`
- [OIDC Core 1.0](https://openid.net/specs/openid-connect-core-1_0.html) — ID token structure, validation

### Existing Token Exchange Implementation (Phase 184)
- [Phase 184 PLAN](../.planning/phases/184-*-*/184-*-PLAN.md) — Dual-token exchange foundation; Phase 186 reuses pattern
- `.planning/phases/184-*/184-SUMMARY.md` — Implementation details from Phase 184 execution
- `banking_api_server/services/oauthService.js` — `performTokenExchange()` function (Phase 184)

### Token Flow Test Page (Phase 185)
- [Phase 185 PLAN](../.planning/phases/185-*-*/185-*-PLAN.md) — Token color legend, test card patterns
- `banking_api_ui/src/components/PingOneTestPage.jsx` — Existing test flow cards + token chain display integration
- [Phase 185 SUMMARY](../.planning/phases/185-*/185-*-SUMMARY.md) — TokenColorSystem.js utility, how to display token types

### Project Structure & Security
- [REGRESSION_PLAN.md](./REGRESSION_PLAN.md) — Protected files, do-not-break list, session management constraints
- `banking_api_server/.env` — Environment variables for PingOne apps, audiences, agent credentials
- [vercel-banking SKILL](../.claude/skills/vercel-banking/SKILL.md) — Session store (Upstash), cold-start behavior on serverless

### Phase Dependencies
- Phase 184 ✅ Complete — Dual-token exchange foundation
- Phase 185 ✅ Complete — Token color coding and test page patterns
- Phase 186 (This) — ID token variant of dual exchange
- Phase 187 (Next) — 1-token exchange 401 flow (depends on 186 concepts)

</canonical_refs>

---

**Phase: 186 — ID Token Exchange Flow**  
**Context gathered: 2026-04-18 via user specification**  
**Readiness: Ready for research → planning → execution**
