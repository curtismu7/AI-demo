# Agent Code Review — HIGH Fix Pass 2026-05-12

## Summary
- Fixed: 21 of 25 HIGH findings
- Already-fixed-in-pass-1: 1
- Deferred: 3
- Commits (newest first, all local — not pushed):
  - `9522ed50` docs: REGRESSION_PLAN §4 rolled-up entry for 21 HIGH fixes
  - `2b97ebaa` fix(gateway): HIGH HI-09 — surface PingAuthorize decision_id + policy_version
  - `e1f04a12` fix(gateway): HIGH HI-08 — refuse to start with devBypass=true in NODE_ENV=production
  - `a68ba62d` fix(gateway): HIGH HI-07 — bound WS payload size + enforce Origin on upgrade
  - `5bbffcb6` fix(gateway): HIGH HI-06 — cap token-exchange caches with FIFO + sweep eviction
  - `e3a7aee9` fix(gateway): HIGH HI-04 — surface backend failures in tools/list partial-results _meta
  - `ebf9224b` fix(bff): HIGH HI-03 — audit + freshness gate on /internal/id-token retrieval
  - `725a532e` fix(gateway): HIGH HI-01 — narrow introspection cache window in production + full SHA-256 cache key
  - `c42b408a` fix(langchain): HIGH HI-08 — O_NOFOLLOW on secure_storage reads and writes
  - `beb05581` fix(langchain): HIGH HI-07 — use tz-aware datetimes in conversation_memory
  - `498c98d9` fix(langchain): HIGH HI-06 — refuse ambiguous user_id matches in initialize_session_with_user_id
  - `921dd795` fix(langchain): HIGH HI-05 — persist generated encryption salt instead of regenerating per-restart
  - `4fbc20ff` fix(langchain): HIGH HI-04 — reject plain ws:// MCP endpoints in production
  - `f29e432d` fix(langchain): HIGH HI-02 — serialize TokenManager.get_valid_token with asyncio.Lock
  - `8201432d` fix(langchain): HIGH HI-01 — bound WS message size and require allowed Origin
  - `ace19969` fix(agent-service): HIGH HI-04 — validate subject_token shape before PingOne exchange
  - `5d220267` fix(agent-service): HIGH HI-03/HI-05 — scrub token-exchange axios errors + assert returned aud/act
  - `d09dc0fb` fix(agent-service): HIGH HI-01/HI-03 — actor-token in-flight cache + scrub axios errors
  - `95e1014c` fix(ui): HIGH H1/H2/H3 — err.message guard, markdown auth-resume link, dead runActionRef

MEDIUM/LOW were out of scope per the user's directive.

## Per-finding

### Subsystem 1: BankingAgent UI (3 of 3 fixed)

#### H1 (UI) — `err.message.includes(…)` crashes when error has no `message`
**Status:** Fixed
**Commit:** `95e1014c`
**Files:** `banking_api_ui/src/components/BankingAgent.js`
**Verify:** `cd banking_api_ui && npm run build` exit 0.
**Notes:** Mirrored the `String(err?.message || "")` pattern already used elsewhere in the same catch block.

#### H2 (UI) — Raw HTML `<a>` tag escaped, breaking "Sign in" CTA
**Status:** Fixed
**Commit:** `95e1014c`
**Files:** `banking_api_ui/src/components/BankingAgent.js`, `banking_api_ui/src/components/shared/MarkdownText.js`
**Verify:** `cd banking_api_ui && npm run build` exit 0.
**Notes:** Picked the markdown-link option (smaller diff than building a React-element render branch). Extended `InlineMd` to tokenize `[label](url)` with a `safeHref` allowlist (http(s) and relative paths only — rejects `javascript:`, `data:`, `file:`). The login flow now uses `[Sign in →](${loginUrl})`.

#### H3 (UI) — `runActionRef` assigned during render, never read
**Status:** Fixed
**Commit:** `95e1014c`
**Files:** `banking_api_ui/src/components/BankingAgent.js`
**Verify:** `cd banking_api_ui && npm run build` exit 0.
**Notes:** Removed both the `useRef` declaration and the assignment. `addMessageRef` left alone — it has active readers at lines 2443 and 2461.

---

### Subsystem 2: banking_agent_service (4 of 5 fixed, 1 already-fixed-in-pass-1)

#### HI-01 (agent-service) — Actor-token cache race on cold start
**Status:** Fixed
**Commit:** `d09dc0fb`
**Files:** `banking_agent_service/src/agentIdentity.ts`
**Verify:** `cd banking_agent_service && npx tsc --noEmit` clean.
**Notes:** Added `_inflightActorToken` Promise cache. The first cold-start caller fires the CC request; subsequent callers await the same promise. Cleared in `.finally()` so future cache-miss can re-fetch.

#### HI-02 (agent-service) — `connect()` Promise can resolve twice / no timeout
**Status:** already-fixed-in-pass-1
**Notes:** The BL-01 fix (`fedf0aac`) already added a 10s `CONNECT_TIMEOUT_MS`, a `settled` flag preventing double-resolve, and a `close` handler that fails pending requests. Re-read of `mcpGatewayClient.ts` confirms HI-02's exact recommendations are already in place.

#### HI-03 (agent-service) — Axios errors leak subject_token / actor_token via `err.config.data`
**Status:** Fixed
**Commit:** `d09dc0fb` (agentIdentity.ts) + `5d220267` (tokenResolver.ts)
**Files:** `banking_agent_service/src/agentIdentity.ts`, `banking_agent_service/src/tokenResolver.ts`
**Verify:** `cd banking_agent_service && npx tsc --noEmit` clean.
**Notes:** All three `axios.post` call sites (client_secret CC, PKI CC, RFC 8693 exchange) now wrap in try/catch and re-throw `Error(`{kind}_failed status={status} detail={detail}`)`. Any future logging of the thrown error cannot leak request bodies.

#### HI-04 (agent-service) — `subject_token` shape not validated
**Status:** Fixed
**Commit:** `ace19969`
**Files:** `banking_agent_service/src/index.ts`
**Verify:** `cd banking_agent_service && npx tsc --noEmit` clean.
**Notes:** `_validateSubjectTokenShape` checks 3 base64 segments + parseable payload + `exp > now`. Rejects with HTTP 400 `{error: 'invalid_subject_token', detail: <reason>}` before any PingOne round trip.

#### HI-05 (agent-service) — No aud / act.sub validation on returned gateway token
**Status:** Fixed
**Commit:** `5d220267`
**Files:** `banking_agent_service/src/tokenResolver.ts`
**Verify:** `cd banking_agent_service && npx tsc --noEmit` clean.
**Notes:** Added `_assertGatewayTokenShape` that decodes the exchanged JWT and asserts `aud === mcpGatewayResourceUri` (or array includes it). `act.sub` mismatch is `console.warn` rather than throw, per CLAUDE.md "act may be absent" guidance.

---

### Subsystem 3: LangChain agent (7 of 8 fixed, 1 deferred)

#### HI-01 (LangChain) — WS server has no origin check, no message-size limit
**Status:** Fixed
**Commit:** `8201432d`
**Files:** `langchain_agent/src/main.py`
**Verify:** Python AST parse exit 0.
**Notes:** `websockets.serve(...)` now passes `max_size=WS_MAX_MESSAGE_BYTES` (default 64 KB) and `origins=ALLOWED_WS_ORIGINS` (default `https://api.ping.demo:4000` + localhost variants).

#### HI-02 (LangChain) — `TokenManager._current_token` unlocked
**Status:** Fixed
**Commit:** `f29e432d`
**Files:** `langchain_agent/src/authentication/oauth_manager.py`
**Verify:** Python AST parse exit 0.
**Notes:** Added `self._refresh_lock = asyncio.Lock()` in `TokenManager.__init__`; wrapped the cache-check + refresh in `get_valid_token` with `async with self._refresh_lock`. Re-check inside the lock to avoid the rare double-fetch when a second caller races the first.

#### HI-03 (LangChain) — MCP connection re-uses expired token without refresh-on-401
**Status:** Deferred (semantic ambiguity)
**Reason:** The MCP `-32001` JSON-RPC error code is currently treated as "user OAuth needed" and triggers the user authorization flow at `mcp_tool_provider._arun` line 331. Distinguishing "stale agent CC token" from "user grant missing" is a real semantic gap — same error code means different remediation. A refresh-and-retry-once policy would need to be tied to a specific signal (e.g., `error.data.kind == 'agent_token_expired'`) that the MCP server doesn't currently emit. This fix requires changes on both sides of the WS contract, which is larger than minimal-diff.

#### HI-04 (LangChain) — No TLS validation on `ws://` MCP endpoints
**Status:** Fixed
**Commit:** `4fbc20ff`
**Files:** `langchain_agent/src/config/settings.py`
**Verify:** Python AST parse exit 0.
**Notes:** `get_mcp_server_configs` now raises `ValueError` at startup when `ENVIRONMENT=production` and an `MCP_SERVER_*_ENDPOINT` is not `wss://` or `local://`. Dev keeps `ws://localhost` for run-bank.sh.

#### HI-05 (LangChain) — Encryption salt regenerated per-restart when `ENCRYPTION_SALT` unset
**Status:** Fixed
**Commit:** `921dd795`
**Files:** `langchain_agent/src/security/encryption.py`
**Verify:** Python AST parse exit 0.
**Notes:** First-run path now writes the generated salt to `${ENCRYPTION_SALT_DIR}/.encryption_salt` (default `./.storage/.encryption_salt`) with 0600 perms. Subsequent runs read the same file. If writing fails (e.g., read-only filesystem) the salt is still used for this process and a loud `WARNING` is logged — operators see the failure in the boot log rather than discover silent at-rest corruption weeks later. `ENCRYPTION_SALT` env var still takes precedence.

#### HI-06 (LangChain) — `initialize_session_with_user_id` first-match-wins
**Status:** Fixed
**Commit:** `498c98d9`
**Files:** `langchain_agent/src/agent/langchain_mcp_agent.py`
**Verify:** Python AST parse exit 0.
**Notes:** Rewrote the loop as a list-comprehension match: zero matches → existing warn-and-return; one match → proceed; multiple matches → log loudly and raise `ValueError` because this represents a data-integrity bug upstream that must not be papered over.

#### HI-07 (LangChain) — Conversation memory uses naive `datetime.now()`
**Status:** Fixed
**Commit:** `beb05581`
**Files:** `langchain_agent/src/agent/conversation_memory.py`
**Verify:** Python AST parse exit 0.
**Notes:** Added `timezone` to the import, replaced every `datetime.now()` with `datetime.now(timezone.utc)`. No migration needed — state is process-local, restart resets the in-memory dicts.

#### HI-08 (LangChain) — `secure_storage` opens files without O_NOFOLLOW
**Status:** Fixed
**Commit:** `c42b408a`
**Files:** `langchain_agent/src/storage/secure_storage.py`
**Verify:** Python AST parse exit 0.
**Notes:** Added `_safe_open_for_write` (`O_WRONLY|O_CREAT|O_TRUNC|O_NOFOLLOW` + 0600 atomic) and `_safe_open_for_read` (`O_RDONLY|O_NOFOLLOW`). Both `store()` and `retrieve()` use the helpers via `os.fdopen`. Defeats symlink TOCTOU on `./.storage/{key}.enc`.

---

### Subsystem 4: MCP Gateway + BFF Token Plumbing (7 of 9 fixed, 2 deferred)

#### HI-01 (gateway) — Introspection cache 30s TTL on positive results
**Status:** Fixed
**Commit:** `725a532e`
**Files:** `banking_mcp_gateway/src/auth/GatewayIntrospectionClient.ts`
**Verify:** `cd banking_mcp_gateway && npx tsc --noEmit && npm test` → 47 passed.
**Notes:** `CACHE_TTL_MS` = 5_000 in production, 30_000 in dev. Also dropped the `.slice(0, 24)` cache-key truncation to full SHA-256 hex — same defect class as agent-service BL-02.

#### HI-02 (gateway) — `validateInboundToken` decodes JWT without signature verification
**Status:** Deferred (new dependency required)
**Reason:** Adding JWKS-based signature verification requires a new dependency (`jwks-rsa` or similar), test-infrastructure changes, and ongoing JWKS cache management. The BL-02 fix (`a28ec20a`) added introspection on the WS path via `runWsAuthorizationPipeline`, so the original "no signature check on WS because introspection doesn't run there" gap is closed. The review's own note: "Required if BL-02 is not fixed" — BL-02 IS fixed. Signature verification remains a defense-in-depth opportunity for a follow-up phase.

#### HI-03 (BFF, gateway-related) — `agentIdToken.js` blindly trusts `x-subject-sub` header
**Status:** Fixed
**Commit:** `ebf9224b`
**Files:** `banking_api_server/routes/agentIdToken.js`
**Verify:** `node -c banking_api_server/routes/agentIdToken.js` exit 0.
**Notes:** Two minimal defenses-in-depth:
1. **Audit log** every retrieval (and rejection) via `appEventService.logEvent('oauth', ...)`. Each entry carries the sub, optional `x-gateway-request-id`, and optional `x-tool-name` so a forensic investigation can reconstruct what the gateway was doing.
2. **Stale-session refusal:** when `oauthTokens.expiresAt` is older than `AGENT_ID_TOKEN_MAX_STALE_MS` (default 5 min), return 404 with `reason=session_stale` instead of an id_token.

#### HI-04 (gateway) — `tools/list` aggregator hides upstream failures
**Status:** Fixed
**Commit:** `e3a7aee9`
**Files:** `banking_mcp_gateway/src/index.ts`
**Verify:** `cd banking_mcp_gateway && npx tsc --noEmit && npm test` → 47 passed.
**Notes:** Response now carries `_meta.partialResults: true` plus `failedBackends` array when any backend rejected. Gateway-owned tools still appended unconditionally. The review's secondary recommendation (consolidate `gatewayTools` into `toolScopes.ts`) is a follow-up refactor.

#### HI-05 (gateway) — dual_token tokenEvents emit static `status:'ok'`
**Status:** Deferred (no current correctness bug)
**Reason:** Re-read of `banking_mcp_gateway/src/index.ts` lines 587-651 shows the `tokenEvents` array is built INSIDE the success branch (`identityResp.status < 400`) — error paths short-circuit with `jsonRpcError` before the events are sent. The static `status: 'ok'` claims are factually correct on the path taken. The refactor to per-step `'pending'` → `'ok'`/`'failed'` is future-proofing against a hypothetical partial-response future, not a current correctness fix. Out of scope for the minimal-diff bar.

#### HI-06 (gateway) — Unbounded token caches
**Status:** Fixed
**Commit:** `5bbffcb6`
**Files:** `banking_mcp_gateway/src/tokenExchange.ts`, `banking_mcp_gateway/src/auth/McpTokenExchangeClient.ts`
**Verify:** `cd banking_mcp_gateway && npx tsc --noEmit && npm test` → 47 passed.
**Notes:** Added `_cacheInsertWithEviction` helper in both files: sweep expired entries first, then FIFO-evict from `Map.keys().next().value` (insertion order) until below `MAX = 1000`. Also dropped the `.slice(0, 16)` cache-key truncations to full SHA-256 hex. The review's "consolidate to one shared cache module" is a follow-up refactor.

#### HI-07 (gateway) — WS no Origin check, no message-size limit
**Status:** Fixed
**Commit:** `a68ba62d`
**Files:** `banking_mcp_gateway/src/index.ts`
**Verify:** `cd banking_mcp_gateway && npx tsc --noEmit && npm test` → 47 passed.
**Notes:** `WebSocket.Server` constructor now passes `maxPayload = MCP_WS_MAX_PAYLOAD_BYTES` (default 1 MB) and a `verifyClient` that reuses `MCP_ACCEPTED_ORIGINS`. Permits no-Origin clients (server-to-server, including `banking_agent_service`); rejects 403 on cross-origin browser. The "re-introspect on every tools/call" half of HI-07 is already covered by BL-02 (`runWsAuthorizationPipeline` runs the same pipeline on every message).

#### HI-08 (gateway) — devBypass forwards inbound bearer unchanged
**Status:** Fixed
**Commit:** `e1f04a12`
**Files:** `banking_mcp_gateway/src/config.ts`
**Verify:** `cd banking_mcp_gateway && npx tsc --noEmit && npm test` → 47 passed.
**Notes:** `assertProductionSecrets` now exits 1 when `MCP_GW_DEV_BYPASS=true` and `NODE_ENV=production`. The /admin/config runtime mutation path was already blocked by BL-01; this catches the env-var startup path. The review's secondary recommendation (replace inbound bearer with a synthetic dummy in dev) is deferred — today the bypass demos a specific failure mode and replacing the bearer would break that demo.

#### HI-09 (gateway) — PingAuthorize decisions lack decision_id / policy_version
**Status:** Fixed
**Commit:** `2b97ebaa`
**Files:** `banking_mcp_gateway/src/auth/PingOneAuthorizeClient.ts`
**Verify:** `cd banking_mcp_gateway && npx tsc --noEmit && npm test` → 47 passed.
**Notes:** Extended `AuthzDecision` with optional `decisionId` / `policyVersion` / `traceId` fields, read from PA response with either snake_case or camelCase naming. All three decision branches (PERMIT / INDETERMINATE / DENY) now carry the metadata when PA returns it. Wiring these fields into the existing `auditTrail.authorize` header is a follow-up — this commit changes only the client-side capture surface.

---

## New findings discovered during fix pass

None of the HIGH fixes uncovered new BLOCK-tier issues. Observations worth a future pass:

1. **gateway HI-05 deferred — track tokenEvents per-step regardless.** Even though current code is correct on the taken path, a future change to the dual_token branch that adds an `await` between events being emitted and the success branch decision would silently re-introduce the observability fraud. Worth a refactor in the same phase as HI-02 (signature verification) since both touch the audit trail.

2. **`banking_agent_service/src/agentOrchestrator.ts` `any`-typed message arrays.** Not in scope (those are MEDIUM findings) but loose typing remains a maintenance trap — the next Anthropic SDK bump will be the moment this surface fails loudly.

3. **gateway HI-09 — decision metadata is captured but not wired into `auditTrail.authorize`.** The follow-up that wires `decisionId` / `policyVersion` into the audit-trail response header is a one-liner in `authorizeMcpRequest.ts`; deliberately scoped out of this commit to keep the client-side capture independent of the consumer side.

## Recommended next pass

- The 3 deferred items (LangChain HI-03, gateway HI-02, gateway HI-05) are each their own small phase rather than a fix-pass entry.
- **MEDIUM findings** (25 total across the four reports) are the natural next pass. The split-`runAction`, two-cache-consolidation, and `LangChainMCPAgent` god-class refactors all live there and are independent of each other.
- **MED follow-ups for this HIGH pass:** consolidate `gatewayTools` into `toolScopes.ts` (review's HI-04 secondary), unify the two gateway token-exchange caches into a shared module (review's HI-06 secondary), wire HI-09 metadata into `auditTrail.authorize`.

---

_Fixed: 2026-05-12_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 2_
