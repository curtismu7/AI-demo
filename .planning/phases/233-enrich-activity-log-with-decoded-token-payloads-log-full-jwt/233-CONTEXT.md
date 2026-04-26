# Phase 233: Enrich Activity Log with Decoded Token Payloads - Context

**Gathered:** 2026-04-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Enrich the existing activity log (appEventService.js NDJSON + ring buffer, built in Phase 232) with structured payload data at every instrumented call site. This covers:
- JWT header+claims decoded inline in logEvent metadata for all four token types
- PingOne API request/response bodies captured at BFF call sites
- Full LLM prompt and system prompt text logged with agent_prompt events
- PKCE details, CIBA request details embedded in respective auth_lifecycle events
- Step-up MFA trigger events
- Scope resolution decision events
- Session state snapshots at key lifecycle points
- Frontend loading-state events via a new POST /api/admin/app-events BFF endpoint

This phase ALSO includes a holistic review pass: audit for duplicate events, consolidate UI polling, review ActivityLogs.js display for professional presentation of enriched metadata, and ensure the event system foundation is clean before adding more data to it.

</domain>

<decisions>
## Implementation Decisions

### D-01: Scope — all roadmap enrichment types in Phase 233

**Decision:** Full scope as described in the roadmap. Priority order within the phase:
1. JWT decode enrichment (touches all existing call sites, highest visibility)
2. PingOne API request/response body capture
3. Full LLM prompt + system prompt logging
4. PKCE details, CIBA details, step-up MFA, scope resolution in respective events
5. Session state snapshots
6. Frontend loading-state events (POST endpoint + frontend hooks)

**Rationale:** User confirmed full scope. Planning should break this into ~5-6 plans following the priority order above.

---

### D-02: JWT decode — at call sites, not inside appEventService

**Decision:** Each instrumented service decodes the token and passes decoded data as `{ jwtFullDecode: { header, claims } }` in the `metadata` object of each `logEvent` call. No change to `appEventService.logEvent()` signature.

**Tokens to decode and embed:**
- User access token (from OAuth login)
- MCP / exchanged token (RFC 8693 result, showing act claim + narrowed audience/scope)
- Agent actor token (agent's own token in 2-exchange flows, showing act claim structure)
- ID token (OIDC id_token, showing sub/name/email)

**Consistency:** Matches the existing `jwtFullDecode: { header, claims }` pattern already used in `agentMcpTokenService.js` and consumed by `TokenChainDisplay.js`.

---

### D-03: Shared tokenUtils.js — extract decodeJwtClaims() from agentMcpTokenService

**Decision:** Extract `decodeJwtClaims()` (and/or rename `jwtFullDecode` equivalent) to a new shared utility: `banking_api_server/utils/tokenUtils.js`.

**Rationale:** With 5+ services needing JWT decode, importing from `agentMcpTokenService.js` creates awkward cross-service dependencies. A shared utility has no circular deps and is explicitly importable.

**Interface:**
```js
// banking_api_server/utils/tokenUtils.js
function decodeJwt(token) {
  // returns { header, claims } or null on invalid/missing
}
module.exports = { decodeJwt };
```

**Error handling:** Invalid or missing tokens return `null` — call sites pass `jwtFullDecode: decoded || undefined` so null/undefined is omitted from the event cleanly.

---

### D-04: LLM prompt logging — full text, no truncation

**Decision:** Log the complete prompt text and system prompt text in `agent_prompt` events. No truncation.

**Rationale:** This is a demo/dev tool. Full visibility is the educational value. The activity log NDJSON file is append-only — large prompts are acceptable.

**Field names in metadata:** `{ prompt: string, systemPrompt: string, model: string, toolsAvailable: string[] }` for LLM invoke events.

---

### D-05: Frontend loading events — POST /api/admin/app-events, session auth

**Decision:** Add a new route: `POST /api/admin/app-events`

- **Auth:** `authenticateToken` only (valid session, any role — not restricted to admin role). Frontend events come from the user's own session.
- **Body:** `{ category, severity, message, tag, metadata }` — same shape as appEventService.logEvent parameters
- **Handler:** Calls `appEventService.logEvent(category, severity, message, { tag, metadata })` server-side so events land in both the ring buffer and the NDJSON file

**Frontend loading states to instrument (all four):**
- Agent processing spinner (between agent submit and response)
- Token exchange in-flight (RFC 8693 exchange in progress, visible in Token Chain panel)
- MCP tool execution (between MCP tool dispatch and result)
- Step-up MFA challenge (HITL consent waiting / CIBA polling active)

**Frontend implementation:** Add a lightweight `postAppEvent(category, severity, message, options)` helper in `banking_api_ui/src/services/` that POSTs to the BFF endpoint. Each loading-state hook calls this at start and end of the async operation.

---

### D-06: PingOne API body capture

**Decision:** At BFF services that call PingOne Management/Token/Authorize APIs, log the request body (parameters, no raw tokens) and response body (status, claims summary, relevant fields) as `metadata.request` and `metadata.response` in the logEvent call.

**Sensitive data rule:** Strip raw token strings from logged bodies. Keep: endpoint URL, HTTP status, response claims (sub, scope, aud, act), error codes. Omit: `access_token`, `id_token`, `refresh_token`, `client_secret` values.

---

### D-08: Holistic event system review — audit, simplify, deduplicate

**Decision:** Before or alongside enrichment, do a holistic audit of the full event system: server-side instrumentation, UI polling, and display. Goal: no duplicate event sources, no unnecessary polling, professional and efficient code that won't create future maintenance issues.

**Audit checklist for the planning agent:**

1. **Event deduplication audit** — Review all `logEvent` call sites added in Phase 232 (oauth.js, cibaService.js, agentMcpTokenService.js, authorize.js, bankingAgentLangGraphService.js, tokenChain.js, agentTokenService.js, delegationService.js). Identify any events that fire for the same action from multiple code paths (e.g., a token exchange logged in both the route AND the service). Remove duplicates; keep the most informative site.

2. **UI event fetching consolidation** — `ActivityLogs.js` polls `/api/admin/app-events`. Check whether `TokenChainContext.js`, `apiCallTrackerService`, and any other frontend services make separate polling calls for overlapping data. Consolidate into a single polling source where possible, or document why each fetch is distinct.

3. **ActivityLogs.js display review** — With enriched metadata (JWT claims, bodies, prompts) now in events, review how the UI expands and renders metadata. Ensure: no raw JSON blobs shown to users without structure, collapsed by default with expand-on-click, consistent with the DevToolsDashboard expand pattern. May require targeted display improvements in `ActivityLogs.js`.

4. **appEventService.js code quality** — Review the service for: ring buffer eviction logic, file write error handling, event shape consistency (all fields present even when null), and whether `MAX_EVENTS = 500` is the right ceiling given richer payloads.

5. **Category coverage check** — Verify that all EVENT_CATEGORIES in appEventService.js have corresponding icon/label entries in ActivityLogs.js CATEGORY_ICONS and CATEGORY_LABELS. Fill any gaps.

**This review plan comes first in Phase 233 execution** — before JWT enrichment plans — so that enrichment work builds on a clean foundation rather than compounding existing issues.

---

### D-07: PKCE, CIBA, session snapshot details

**Decision:** Embed relevant detail in the existing auth_lifecycle category events:
- `oauth/callback-success` → add `{ pkce: { code_challenge_method, code_challenge_length }, idTokenClaims: { sub, email, acr } }`
- `ciba/initiate` → add `{ bindingMessage, scope, deliveryMode }`
- `ciba/initiated` → add `{ authReqId_length, expiresIn, interval }`
- Session snapshots: emit `auth_lifecycle/session-snapshot` event at login and logout with `{ sessionId_hash, role, hasAccessToken, hasIdToken, hasRefreshToken }` — hash the session ID, never log the raw value

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 232 Foundation (read first)
- `.planning/phases/232-unified-activity-log-append-only-structured-log-file-for-tok/232-CONTEXT.md` — Locked decisions for appEventService.js structure, logEvent signature, categories, and which call sites were instrumented
- `.planning/phases/232-unified-activity-log-append-only-structured-log-file-for-tok/232-01-SUMMARY.md` through `232-04-SUMMARY.md` — What was actually built and which files were modified

### Core Files to Modify
- `banking_api_server/services/appEventService.js` — The event service; logEvent signature stays unchanged
- `banking_api_server/routes/oauth.js` — OAuth callback; add PKCE + session snapshot enrichment
- `banking_api_server/services/cibaService.js` — CIBA; add auth_req_id length and timing enrichment
- `banking_api_server/services/agentMcpTokenService.js` — RFC 8693 exchange; add jwtFullDecode for exchanged token
- `banking_api_server/services/agentTokenService.js` — Agent actor token; add jwtFullDecode
- `banking_api_server/services/delegationService.js` — Delegation events; already instrumented in 232
- `banking_api_server/routes/tokenChain.js` — Token chain; already instrumented in 232

### JWT Decode Pattern References
- `banking_api_server/services/agentMcpTokenService.js` lines 92-158 — `decodeJwtClaims()` implementation and `jwtFullDecode` pattern to extract to tokenUtils.js
- `banking_api_ui/src/components/TokenChainDisplay.js` lines 365-430 — How `jwtFullDecode` is consumed in the UI (confirms the `{ header, claims }` shape)

### Frontend Integration
- `banking_api_ui/src/components/BankingAgent.js` — Agent FAB; add loading-start and loading-end event posts
- `banking_api_ui/src/context/TokenChainContext.js` — Token exchange loading states; add event posts around exchange calls
- `banking_api_ui/src/components/DevToolsDashboard.jsx` — No changes needed; enriched metadata surfaces in existing JSON expand

### Regression Guard
- `REGRESSION_PLAN.md` §1 — Read before touching BankingAgent.js, oauth.js, cibaService.js, or agentMcpTokenService.js

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `agentMcpTokenService.js:92` — `decodeJwtClaims(token)` returns `{ header, claims }` via `Buffer.from(parts[1], 'base64').toString()` — extract to `utils/tokenUtils.js`
- `jwtFullDecode: { header, claims }` shape — already used in `TokenChainDisplay.js`, `DelegatedAccessPage.js`, `apiTrafficStore.js` — reusing this shape ensures UI components render it correctly without changes
- `banking_api_ui/src/services/` — appropriate location for the new `postAppEvent()` frontend helper

### Established Patterns
- **logEvent enrichment:** Existing call sites use `metadata: { ... }` for all structured data; JWT decode data goes into `metadata.jwtFullDecode` following the established shape
- **Admin routes auth:** `authenticateToken` + `requireScopes(['openid'])` is the standard pattern for admin BFF routes; D-05 uses `authenticateToken` only (no admin role check) per user decision

### Integration Points
- `banking_api_server/routes/` — new `POST /api/admin/app-events` route added here (new file or extension of `adminRoutes.js`)
- `banking_api_server/server.js` — mount new route if added as a separate file

</code_context>

<specifics>
## Specific Ideas

- JWT decode should produce `null` (not throw) for invalid/expired tokens — call sites handle `decoded || undefined` to cleanly omit from event metadata
- Session ID in session snapshots: hash it with a short SHA-256 prefix so correlated events are identifiable without leaking the raw session value
- `postAppEvent()` frontend helper should fire-and-forget (no await on success/error) so loading-state instrumentation never blocks UI interactions

</specifics>

<deferred>
## Deferred Ideas

- Log rotation / file size management — still out of scope; NDJSON file grows unbounded in demo
- Token signature validation status in decoded metadata — would require introspection call; Phase 233 is decode-only (no verify)
- Per-category log level filtering (suppress verbose categories in production) — future hardening phase

</deferred>

---

*Phase: 233-enrich-activity-log-with-decoded-token-payloads-log-full-jwt*
*Context gathered: 2026-04-26*
