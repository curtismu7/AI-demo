# Phase 187: 1-Token Exchange 401 Flow — Context

**Gathered:** 2026-04-18
**Status:** Ready for planning
**Source:** User specification (Phase 187 roadmap spec + discussion)

---

<domain>

## Phase Boundary

Phase 187 wires the **real 401 flow** for the 1-token exchange path:
- Agent (BankingAgent / test page) sends a request to MCP server
- MCP server returns HTTP **401** (no valid MCP token present)
- App catches the 401 → triggers user OIDC re-authorization transparently
- After user auth succeeds, user access token is used in **1-token exchange** (RFC 8693, subject-only)
- MCP server receives valid MCP token → request completes

**Distinction from Phase 186:** Phase 186 added the ID-token dual exchange (backend + test card). Phase 187 wires the **live 401 intercept path** for the simple 1-token flow and removes the legacy two-step exchange card that's creating confusion.

**Depends on:** Phase 186 (dual-token ID exchange infra, oauthService, pingoneTestRoutes patterns)

</domain>

<decisions>

## Locked Implementation Decisions

### D-01: Full BFF Wiring — Real 401 Intercept in Agent Path (GA-1 = A)
- **What:** `agentMcpTokenService.js` + `/message` endpoint: when no user token present (or MCP exchange fails with 401), return structured `{ need_auth: true, exchange_mode: '1-token' }` signal
- **How:** BankingAgent.js intercepts this signal → triggers user login redirect (via existing `navigateToCustomerOAuthLogin()` pattern) → after user re-authenticates, the 1-token exchange runs normally
- **Scope:** Plumb through the `{ token: null }` return path in `agentMcpTokenService.js` — currently it returns null and nothing explicit happens; add the structured response so agent can distinguish "no token → must auth" from other errors
- **Rationale:** User wants real flows, not simulations

### D-02: Remove Legacy exchange3 Card (GA-2 = include in 187)
- **What:** Delete the `exchange3` entry from TEST_CONFIG and the entire exchange3 test card column from `PingOneTestPage.jsx`
- **Remove:** `TEST_CONFIG.exchange3`, all `exchange3*` state vars, `testExchange3` callback, the JSX card column for "User Token → Agent Token → MCP Token (Legacy Two-Step)"
- **Keep:** exchange1, exchange2 (Phase 184), exchange186 (Phase 186), ID token card — all active flows survive
- **CSS:** Remove any dedicated legacy `exchange3` styles from `PingOneTestPage.css` if present
- **Pending todo:** Resolves `.planning/todos/pending/2026-04-18-remove-legacy-two-step-token-exchange-error-from-test-page.md`
- **Rationale:** The card shows a red FAILED state, is confusing, and the flow is deprecated

### D-03: Test Page 401 Flow Card — Real MCP Call (GA-3 = real)
- **What:** New test card "1-Token Exchange (MCP 401 → Auth → Exchange)" that sends a **real HTTP POST to MCP** (`/mcp` endpoint) without a valid MCP token → MCP server returns 401 → BFF catches it → performs 1-token exchange → retries with new MCP token → shows full chain
- **How:** New route `GET /api/pingone-test/exchange-1token-401-flow` in `pingoneTestRoutes.js`:
  1. Probe MCP server's `POST /mcp` (initialize request) using user's access token directly (raw, no exchange) — expected to get 401 from MCP
  2. Catch the 401, log the step ("MCP returned 401")
  3. Fetch fresh agent CC token via `oauthService.getMcpExchangerToken()` (see D-11) — decode for display
  4. Perform 1-token exchange: user access token → MCP token via exchanger client credentials
  5. Retry the MCP initialize with the MCP token → should succeed
  6. Return multi-step trace: `[mcpProbe401, agentTokenDecoded, exchangeStep, retrySuccess, mcpDecoded]`
- **HTTP client:** Use `http2McpBridge` or a plain `https.request` for the probe; MCP server URL from `getMcpServerUrl()` — handle `ws://` URLs by converting to `http://` for the probe
- **HTTP vs WS:** MCP server supports POST /mcp HTTP endpoint; use that, not WebSocket, for the probe

### D-04: Test Card UI Display
- **Show multi-step flow** with visual steps: ① Send to MCP (no token) → ② MCP returns 401 → ③ Agent fetches own CC token → ④ Exchange user token → ⑤ Retry MCP with MCP token → ⑥ Success
- **Token display:** `DecodedTokenPanel` for the MCP token result (green), subject user token (red/label), agent CC token (blue — "Agent Token (MCP Exchanger CC)")
- **Pattern:** Match existing Phase 186 card structure in PingOneTestPage.jsx
- **State vars:** `exchange401Status`, `exchange401Error`, `exchange401Decoded`, `exchange401Steps`, `exchange401AgentDecoded`, `exchange401SubjectDecoded`

### D-05: BankingAgent.js 401 Signal Handling
- **What:** In `runAction()` / the agent MCP call path, when response contains `{ need_auth: true }`, call the existing user login flow (same as `handleLoginAction('login_user')`) with a note: "MCP requires your authorization — logging you in…"
- **Scope:** Intercept in the tool response handling path; add one branch: `if (result?.need_auth) { handleLoginAction('login_user'); return; }`
- **No new UI patterns:** Use the existing spinner + redirect pattern already in `handleLoginAction`

### D-06: agentMcpTokenService.js 401 Signal
- **What:** The `getSessionBearerForMcp(req)` missing-token branch currently returns `{ token: null, tokenEvents, userSub: null }` — add `need_auth: true` to that object
- **Also:** If MCP exchange itself fails with a 401-like error (token exchange rejected), return `{ token: null, need_auth: true, tokenEvents, userSub: null }` with appropriate token event logged
- **Callers:** The `/message` route in server.js that calls this service — bubble `need_auth` up to the API response

### D-07: Documentation — PINGONE_TOKEN_EXCHANGE_COMPARISON.md (GA-4 = B)
- **Target:** `docs/PINGONE_TOKEN_EXCHANGE_COMPARISON.md`
- **Add:** Section explaining the 1-token 401 scenario: when MCP returns 401, the app re-authenticates the user and performs a 1-token exchange (RFC 8693 subject-only) to get a fresh MCP token
- **Include:** Comparison row or note clarifying "1-token 401 flow" vs "dual-token 184/186 flows" — when each applies
- **Do NOT update:** `PINGONE_MAY_ACT_TWO_TOKEN_EXCHANGES.md` for this phase

### D-08: Verification Points (Pre-Planning)
- Test card button pressed → BFF route makes HTTP call to MCP → gets 401 → fetches agent CC token → does exchange → retries → returns multi-step result to UI
- Test card shows each step: 401 received, agent CC token decoded, exchange performed, retry succeeded
- BankingAgent: when no user token in session, response includes `need_auth: true` → agent shows re-auth prompt and redirects
- Legacy exchange3 card is gone from test page
- `npm run build` → exit 0
- Docs updated in `PINGONE_TOKEN_EXCHANGE_COMPARISON.md`

### D-09: Scope Alignment — NOT in Phase 187
- ❌ CIBA flow or step-up patterns (separate phases)
- ❌ New PingOne app configuration (reuse existing)
- ❌ Modify the dual-token (Phase 184/186) paths — those stay unchanged
- ❌ Add new MCP tools
- ❌ Update `PINGONE_MAY_ACT_TWO_TOKEN_EXCHANGES.md` (GA-4 = B only)
- ✅ 1-token 401 intercept in BFF (agentMcpTokenService + /message route)
- ✅ Real 401 test card with live agent CC token fetch and display
- ✅ Remove legacy exchange3 card
- ✅ Docs update in PINGONE_TOKEN_EXCHANGE_COMPARISON.md

### D-10: Success Definition
Phase 187 complete when:
1. ✅ `agentMcpTokenService.js` returns `need_auth: true` when user token is missing
2. ✅ BankingAgent.js intercepts `need_auth` signal and triggers re-auth redirect
3. ✅ New test route `exchange-1token-401-flow` makes real MCP call, gets 401, fetches fresh agent CC token, exchanges, retries
4. ✅ Test page card shows multi-step 401 → agent CC fetch → exchange → retry flow with real decoded tokens
5. ✅ Legacy exchange3 card removed from PingOneTestPage
6. ✅ PINGONE_TOKEN_EXCHANGE_COMPARISON.md updated with 1-token 401 scenario
7. ✅ `npm run build` → exit 0

### D-11: Agent CC Token Auto-Fetch Pattern — All Tests With Actor Token
- **Policy:** Any test route in `pingoneTestRoutes.js` that involves an agent/actor token MUST call `oauthService.getMcpExchangerToken()` to fetch a **fresh Client Credentials token** at request time — never rely on a cached or session-held agent token
- **Why:** The agent acts as its own identity (AI_AGENT app type). Its CC token is independent of the user session and must be obtained fresh so the test demonstrates the agent having its own credential
- **Existing compliance:** `exchange-idtoken-agent-to-mcp` (Phase 186) and the Phase 184 dual exchange already do this correctly via `await oauthService.getMcpExchangerToken()`
- **New route (D-03):** `exchange-1token-401-flow` — call `getMcpExchangerToken()` to get the agent CC token; decode it for display; include in the response as `agentTokenDecoded` so the UI shows it as its own panel
- **Display:** Decoded agent CC token → `DecodedTokenPanel` with label "Agent Token (MCP Exchanger CC)" and blue color (`#2563eb`, actor per TokenColorSystem)
- **Exchange3 removal rationale:** The legacy exchange3 was the only pattern where the "agent token" was derived from a token exchange (user → agent). That pattern is gone. All agent tokens henceforth come from CC grant, which reflects the real-world design: the agent authenticates independently

</decisions>
