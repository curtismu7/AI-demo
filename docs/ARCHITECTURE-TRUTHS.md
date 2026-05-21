# Super Banking — Architectural Truths

Load-bearing system invariants that hold across the whole demo. These are the
"this is how the system actually works" statements that are easy to get wrong
because the obvious reading of a name or flag is not what the code does.

This is the **single canonical home** for these truths. The per-service skills
(`.claude/skills/banking-*`), `CONTEXT.md` (glossary), and `REGRESSION_PLAN.md`
(do-not-break list) each cover a slice; when they discuss one of these truths
they should point here, not re-derive it.

Scope rule: a statement belongs here only if it is a **system-wide truth that
contradicts a plausible naive reading**. Mechanics live in the per-domain skills;
do-not-break enforcement lives in `REGRESSION_PLAN.md`.

---

## T-1 — The MCP Gateway routes; it owns zero tools

`banking_mcp_gateway` (port 3005) is a **stateless OAuth relay**. It does not
implement banking tools. It owns: introspection, RFC 8693 re-exchange,
PingAuthorize evaluation, HITL escalation, backend aggregation, and Phase 266
credential disposition.

Tools live in the **MCP servers**: `banking_mcp_server` (OLB, 8080) and
`banking_mcp_invest` (8081). The gateway aggregates their `tools/list` and
forwards `tools/call`; it appends only two presentation-layer entries
(`special_offers`, `user_profile_card`).

**Naive reading that is wrong:** "the gateway is where MCP tools are defined."
It is not — `banking_mcp_server` owns the tool registry.

- Where: [banking-mcp-gateway/SKILL.md](../.claude/skills/banking-mcp-gateway/SKILL.md) (entry, `router.ts`)
- Code: `banking_mcp_gateway/src/router.ts` (route table, no tool bodies)
- Glossary: [CONTEXT.md](../CONTEXT.md) "gateway" vs "MCP server"

---

## T-2 — Authorization makes the access decision; the Gateway only enforces it

The gateway does **not** decide whether a tool call is allowed. It calls
**PingAuthorize** (when `PINGAUTHORIZE_ENDPOINT` is set) and acts on the verdict:

| Decision | Gateway action |
|---|---|
| `PERMIT` | Proceed — re-exchange token, forward to backend |
| `DENY` | Return 403, no backend call |
| `INDETERMINATE` | Call `hitlClient.createChallenge()`, return JSON-RPC error `-32002` with the challengeId — wait for a human |

The gateway's own checks (aud validation, D-05 anti-bypass, introspection,
`GatewayTokenPolicy`) are **preconditions**, not the authorization decision. The
policy decision is external and authoritative.

**Naive reading that is wrong:** "the gateway decides access via its token
policy." The token policy validates token *shape*; PingAuthorize decides
*access*. When `PINGAUTHORIZE_ENDPOINT` is unset the step is skipped — there is
then no policy decision layer, by design, not a silent allow inside the gateway.

- Where: [banking-mcp-gateway/SKILL.md](../.claude/skills/banking-mcp-gateway/SKILL.md) (auth pipeline, step 5)
- Code: `banking_mcp_gateway/src/auth/PingOneAuthorizeClient.ts`, `pingAuthorizeGuard.ts`
- HITL handoff on INDETERMINATE: [banking-hitl-service](../.claude/skills/banking-hitl-service/SKILL.md)

---

## T-3 — The heuristic always runs; "LLM only" means *prefer* the LLM, not *disable* the heuristic

The agent message path (`ff_heuristic_enabled`, default `true`, admin Feature
Flags UI labels it **"LLM Chips — Use Heuristic Fast-Path"**) has a counter-intuitive
contract. The flag does **not** gate whether the heuristic runs — the
deterministic heuristic parser is always a safety net.

What the flag actually controls:

| `ff_heuristic_enabled` | Behavior |
|---|---|
| `true` (default) | Heuristic match → return immediately, skip the LLM (~200-300ms). No match → fall through to the LLM. |
| `false` ("LLM only" toggle) | Prefer the LLM for the answer. **But** if no LLM produces an answer (Helix not configured, network failure, LLM returns `kind:'none'`), the code **still falls back to the heuristic** rather than letting a canned "I didn't catch that" UI message win. |

So `false` is "prefer LLM," not "disable heuristic." A request can be answered
by the heuristic even with the "LLM only" toggle on — that is intended, not a bug.

Two call sites implement this with the same `!== 'false'` flag read and the same
"heuristic is the floor" guarantee:

- Intent routing: `banking_api_server/services/geminiNlIntent.js` — heuristic
  runs first unconditionally; in LLM-only mode, falls back to heuristic if no
  LLM answer (see the comment block at the top of `parseNaturalLanguage`).
- BFF LangGraph agent: `banking_api_server/services/bankingAgentLangGraphService.js`
  `processAgentMessage` — heuristic-first when enabled; when disabled, logs
  `heuristic_disabled` and routes all queries through the LLM, but unrecognized
  input still has the heuristic as the deterministic fallback downstream.

LLM provider order when the heuristic doesn't answer: **Helix is the default
provider; Ollama is OFF by default.** The intended path is **heuristic → Helix
→ (Ollama only if explicitly selected AND configured)**. Do not describe the
flow as "heuristic → Ollama"; Ollama is opt-in local inference, never a silent
default and never an automatic fallback. If Ollama is selected but not
configured/reachable, resolution falls back to Helix, not to a dead Ollama
call.

**Single-resolver enforcement (binding as the agent-consolidation spec lands).**
Provider resolution must be computed in **exactly one** BFF-side function
(`banking_api_server/services/llmProviderResolver.js` — `Heuristic → Helix →
Ollama-only-if-configured`). Every LLM path calls it; **no path may inline a
provider default** (`|| 'helix'` / `|| 'ollama'`). The agent reasoning service
(`banking_agent_service` :3006, post-consolidation) receives the *already
resolved* provider+model in its request payload and does **not** re-resolve —
the BFF is the single decision point (it owns `langchainConfig`, session,
configStore). Historic drift this corrects: `agentBuilder.js:162`,
`geminiNlIntent.js:250`, and `routes/langchainConfig.js:165` each had a
different inline default (one of them defaulted to Ollama). See
`docs/superpowers/specs/2026-05-15-agent-consolidation-design.md` §5.

**Naive reading that is wrong:** "`ff_heuristic_enabled=false` turns the
heuristic off." It does not. It changes precedence; the heuristic remains the
last-resort floor so chips and known phrases never produce a dead-end reply.

- Flag registry: `banking_api_server/routes/featureFlags.js` (id `ff_heuristic_enabled`)
- Default + env mapping: `banking_api_server/services/configStore.js` (`FF_HEURISTIC_ENABLED`, default `'true'`)
- Agent definitions: [CONTEXT.md](../CONTEXT.md) "agent" (qualify which agent — three exist)

**Amendment — 2026-05-19, five-mode model.** The original T-3 text above
(preserved verbatim for history) stated the heuristic *always* runs as a
deterministic floor. The **five-mode agent provider** feature
(`docs/superpowers/specs/2026-05-18-five-mode-agent-provider-design.md`)
amends this in **one narrow respect**: the heuristic **ROUTING fast-path** is
now **mode-dependent**, resolved by
`banking_api_server/services/agentModeResolver.js`:

- **ON** for modes `heuristics` and `heuristics_helix`.
- **OFF** for modes `helix_google`, `chatgpt`, and `claude` (these route
  straight to the LLM/platform; no heuristic routing pre-empt).

This amends **ONLY the routing-convenience role** (the ~200-300ms chip/known-
phrase fast-path). The deterministic transfer / HITL / step-up **SAFETY
enforcement was never the heuristic's authority** — it is server-side
(`banking_api_server/services/mcpToolAuthorizationService.js`,
`banking_api_server/services/transactionConsentChallenge.js`, and the Authorize
gate; REGRESSION_PLAN §1 / Phase 170) and is **UNCHANGED and mode-independent**.
No agent mode can relax it.

`banking_api_server/services/llmProviderResolver.js` **remains the single
low-level provider resolver** (`Heuristic → Helix → Ollama-only-if-configured`,
plus the openai/anthropic pass-through). `agentModeResolver` does not replace
it: it maps the user-facing mode onto `llmProviderResolver` and onto the
heuristic-routing primitive `ff_heuristic_enabled`. No module may inline a
mode→primitive mapping.

**Back-compat:** when `agent_mode` is unset, behavior is **identical to before**
— legacy `ff_heuristic_enabled` precedence applies exactly as the original T-3
text describes.

**Mode 1 (`heuristics`) has NO LLM.** An unrecognised query returns the
deterministic `nlIntentParser.buildCatalogMessage()` capability catalog — never
an LLM fallthrough. This is the one mode where the original "heuristic is the
last-resort floor" guarantee is the *entire* path, not merely the floor.

**Modes 4/5 (`chatgpt`/`claude`) carry an `external_wiring` sub-shape:**

- `bff` — the BFF retains the RFC 8693 exchange + the full token chain
  (per-tool exchange + `act` claim intact, surfaced in the Token Chain UI).
- `platform` — the platform drives the agent loop via the MCP Gateway using a
  BFF-minted gateway-audience token; the per-tool exchange and `act` claim are
  **lost upstream** (an intentional educational "delegation lost" surface), but
  the MCP Gateway D-05 invariant and PingAuthorize **STILL enforce** every tool
  call. Implemented in `banking_api_server/services/platformAgentRuntime.js`.

- Related: T-2 (the authorization decision is external and authoritative — the
  reason the mode-dependent routing change is safe), T-4 (PingOne performs the
  exchange the `bff` wiring retains).



---

## T-4 — PingOne performs token exchange; the Gateway, agents, and MCP servers only *request* it

RFC 8693 token exchange is a **PingOne operation**. The MCP Gateway,
`banking_agent_service`, `langchain_agent`, and the MCP servers do not exchange
tokens themselves — each one *requests an exchange from PingOne*: it sends a
token to PingOne's token endpoint and gets a new token back. No service in this
repo mints or transforms a token; they call PingOne and use what PingOne
returns.

Likewise: **PingOne issues** tokens (authentication, minting, the exchange
itself). The **authorization server (PingAuthorize / the PDP)** issues nothing —
it only validates (`aud`, scopes, claims) and decides PERMIT / DENY /
INDETERMINATE (see T-2). Three distinct roles: PingOne mints/exchanges,
PingAuthorize decides, the gateway/agents request + enforce.

Identity follows the same rule. A user's identity is established **from a
PingOne-issued token that the authorization server accepts** — never from a
client-supplied string. An agent that derives identity from an unauthenticated
claim is fabricating identity: no issuer in the loop, nothing for the
authorization server to validate. (This is the root of the `langchain_agent`
CR-02 identity-spoof finding.)

**Naive reading that is wrong:** "the gateway does the token exchange" or "the
agent exchanges the token." Phrases like "the gateway re-exchanges the token"
(used loosely in T-1/T-2 and the skills) are shorthand for *the gateway requests
re-exchange from PingOne*. The service never performs the cryptographic
exchange; it is a client of PingOne's token endpoint.

**Corollary — single-resource scope on every CC token request.** When a service
*requests* an audience-bound client-credentials token (the 2-exchange actor
tokens), PingOne requires the request to name scopes for **exactly one**
resource. The AI Agent and MCP Exchanger apps are intentionally granted scopes
on two resources each (gateway + intermediate/final — both grants are needed for
the two exchange steps). A CC request with `audience` but **no `scope`** makes
PingOne try every entitled scope, which spans multiple resources, and it rejects
with `400 invalid_scope: "May not request scopes for multiple resources"`. The
fix is always an explicit single-resource `scope` on the request (mirrors
`getMcpExchangerToken()` which sends scope + no audience). This recurs because
the grant set (provisioner) and the request scope (runtime) are two ends that
must agree.

**Naive reading that is wrong:** "the actor CC token just needs the right
audience" — it also needs an explicit single-resource scope, or a multi-resource
client cannot mint it at all. Enforced as do-not-break: `REGRESSION_PLAN.md` §4
(2026-05-15 "Middle agent returns nothing for transactions").

- Where: [oauth-pingone/SKILL.md](../.claude/skills/oauth-pingone/SKILL.md) (RFC 8693 request shape), [banking-mcp-gateway/SKILL.md](../.claude/skills/banking-mcp-gateway/SKILL.md) (auth pipeline)
- Code: `banking_api_server/services/oauthService.js` `getClientCredentialsTokenAs` (scope arg), `agentMcpTokenService.js` `_performTwoExchangeDelegation` Steps 1 & 3, provisioner Steps 37a/37b (SYNC comments)
- Related: T-2 (authorization decision is external), [docs/architecture-notes/2026-05-15-agent-local-authz-smell.md](architecture-notes/2026-05-15-agent-local-authz-smell.md) (agent must not invent identity/authz locally)
- Glossary: [CONTEXT.md](../CONTEXT.md) "token custody"

---

## T-5 — Every hop validates `aud` independently; a validated token does not cascade downstream

Each hop checks that the bearer's `aud` matches *that hop's* expected resource
URI, and rejects it otherwise. A token is never "trusted because the previous
hop accepted it." The gateway validates the inbound token's `aud` is its own
resource URI (`tokenValidator.ts:54-58`, error `invalid_aud`), then *requests a
re-exchange from PingOne* (see T-4) to the next hop's audience before forwarding.
The backend MCP server then validates that exchanged token's `aud` against its
own URI in turn.

This is enforced in both directions:

- **Forward:** `audList.includes(expectedAud)` — wrong `aud` is rejected at every
  hop, including the gateway and each MCP server.
- **Anti-bypass (D-05):** a token whose `aud` *already* contains a downstream
  resource URI the gateway exchanges toward — `mcpOlbResourceUri`,
  `mcpInvestResourceUri`, **and `bankingResourceServerResourceUri`** (the
  Phase 266 banking-resource-server audience; added 2026-05-15, GW review
  WR-01) — is rejected by the gateway with `bypass_attempt`. A caller must
  obtain a gateway-targeted token first; only the gateway may exchange it
  onward. The set must include *every* downstream audience the gateway can
  exchange to: any omission is a bypass hole (that was exactly WR-01 — the
  banking-resource-server URI was missing). Without this, an attacker who
  minted a token for a downstream directly would skip the gateway's policy +
  introspection entirely.

Both checks **fail closed**: a mismatched or missing `aud` is a rejection, not a
pass-through.

**Naive reading that is wrong:** "once the gateway validates and re-exchanges
the token, the new token flows unchanged to the MCP server" or "a token that
passed one hop is good downstream." Each hop re-validates against its *own*
audience; tokens are per-hop, not transitive. This is why D-05 exists — it is
the invariant that makes the gateway the only door (see T-1).

- Where: [banking-mcp-gateway/SKILL.md](../.claude/skills/banking-mcp-gateway/SKILL.md) (D-05, auth pipeline)
- Code: `banking_mcp_gateway/src/tokenValidator.ts:54-58` (per-hop aud), `banking_mcp_gateway/src/auth/GatewayTokenPolicy.ts:48-57` (D-05 anti-bypass)
- Related: T-1 (gateway is the only door), T-4 (the re-exchange is a PingOne request, not a local mint)
- Enforced as do-not-break: `REGRESSION_PLAN.md` §1 / gateway invariant D-05

---

## T-6 — User identity is the PingOne UUID (the `sub`), and nothing else

A signed-in user is identified **only** by their PingOne-issued subject UUID
(`sub` / `oauthId`, e.g. `21756b10-7aa6-4b02-8dab-6898e0475870`). That value —
not a legacy numeric id, not an email, not `req.session.user.id` — is the key
for accounts, transactions, and every per-user lookup. `middleware/auth.js` sets
`req.user.id = decoded.sub` (the PingOne UUID) precisely so the whole BFF keys
off one identifier.

The trap: `req.session.user` carries **both** `id` and `oauthId`, and they are
**not the same value** (`sessionUser.id=1eff6468-… oauthId=21756b10-…` in real
logs). Code that resolves a user via `session.user.oauthId || session.user.id`
silently uses the wrong UUID whenever `oauthId` is absent/stale, and per-user
data (seeded against the PingOne `sub`) comes back empty — looks like "no
transactions" when the real cause is an identity mismatch.

**Rule:** always resolve the user from the PingOne `sub` / `oauthId`. Never fall
back to the numeric/internal `id`. A `|| session.user.id` fallback in an
identity path is a bug, not resilience.

**Naive reading that is wrong:** "any user id will do as long as it's
consistent" — there is exactly one canonical identity (the PingOne UUID); the
other id field is a legacy artifact and using it returns the wrong user's
(usually empty) data.

- Code: `banking_api_server/middleware/auth.js` (`req.user.id = decoded.sub`), `middleware/agentSessionMiddleware.js` (agentContext.userId), `data/store.js` (`getTransactionsByUserId` / `getAccountsByUserId` filter on the PingOne UUID)
- Related: T-4 (identity comes from a PingOne-issued token the AS accepts, never a client string)
- Glossary: [CONTEXT.md](../CONTEXT.md) "token custody", "user"

---

## T-7 — The BFF LangGraph agent does NOT route through the gateway, yet still asks PingAuthorize itself

There are three agents (CONTEXT.md "agent"). They reach MCP tools by **two
different topologies**, and conflating them causes wrong architectural
conclusions:

- **`banking_agent_service` and `langchain_agent`** reach tools *through the
  gateway* (`banking_mcp_gateway`, 3005). The gateway asks PingAuthorize and
  enforces (T-2).
- **The BFF LangGraph agent** (`/api/banking-agent/message` inside
  `banking_api_server`) does **not** touch the gateway at all. It dials
  `banking_mcp_server` **directly** (`services/mcpWebSocketClient.js`,
  `MCP_SERVER_URL` default `ws://localhost:8080`). Its authoritative
  authorization gate is `mcpToolAuthorizationService.evaluateMcpFirstToolGate`
  at `server.js:~1535`, which the BFF runs itself on **every** MCP tool call
  (PingAuthorize or simulated; acts on PERMIT / DENY / HITL).

So "the gateway is where the PingAuthorize decision happens" is true for two
agents and **false for the BFF agent** — the BFF makes its own PingAuthorize
call, on a different code path, because the gateway is not in its path. Both
topologies satisfy T-2 (authorization decision is external and authoritative);
they just ask at different enforcement points. A redundant *second* local
scope-map decision that used to also run in the BFF was removed (ADR-0003 / R1)
precisely because the real gate at `server.js:~1535` already exists
independently — verifying this topology is what flipped that decision from
"risky" to "safe."

**Naive reading that is wrong:** "all agents go through the gateway, so the
gateway's PingAuthorize call covers everything" — the BFF agent bypasses the
gateway entirely and has its own authoritative PingAuthorize gate. Reasoning
about agent authorization without first asking *which agent / which topology*
leads to false conclusions (it nearly did for the R1 decision).

- Where: [banking-api-server/SKILL.md](../.claude/skills/banking-api-server/SKILL.md) (the /api/mcp/tool pipeline), [banking-mcp-gateway/SKILL.md](../.claude/skills/banking-mcp-gateway/SKILL.md) (the other two agents' path)
- Code: `banking_api_server/server.js:~1535` (`evaluateMcpFirstToolGate` — BFF's own gate), `banking_api_server/services/mcpWebSocketClient.js` (direct to 8080, not via 3005)
- Related: T-2 (authorization decision is external — true at *both* enforcement points), [ADR-0003](adr/0003-pingauthorize-is-sole-bff-tool-gate.md) (the BFF's sole authoritative gate; local scope policy removed)
- Glossary: [CONTEXT.md](../CONTEXT.md) "agent" (qualify which one), "gateway"

---

## T-8 — A bug can be latent only because another defect masks it; fix the mask last

Several agent-code defects were *individually safe only because a coarser
mechanism serialized away the concurrency that would expose them*. The single
global message-queue worker in `langchain_agent` (WR-02) made three distinct
bugs harmless: CR-06 (shared MCP connection had no JSON-RPC id correlation —
cross-session response leak), WR-06 (`_current_tracer` was a module global —
cross-session trace bleed), and WR-01 (chat-message session-id was trusted from
the body). None could fire while everything was serialized through one worker.

The disciplined order is: **fix the masked defects properly first
(CR-06 → id correlation, WR-06 → ContextVar, WR-01 → BL-04 session-trust),
then remove the mask (WR-02 → per-session workers).** Removing the mask first
would have turned three latent bugs into live cross-session data leaks the
moment concurrency was introduced. Each masked fix shipped with a leak-proof
test that *proves* it holds under concurrency, so that when the mask was finally
removed (WR-02 Option A, per-session workers) the safety was already exercised
under real concurrency, not assumed.

**Naive reading that is wrong:** "the single-worker queue is just a performance
limitation; parallelize it for throughput." It was also load-bearing safety
scaffolding. Any change that increases concurrency (worker pools, async fan-out,
per-session tasks) must first confirm that every layer it exposes
(connection demux, per-context state, identity trust) is independently
concurrency-safe — or it converts dormant defects into live ones.

- Where: [langchain-agent/SKILL.md](../.claude/skills/langchain-agent/SKILL.md) (per-session worker model), code-review fix reports under `.planning/REVIEW-FIX-*`
- Code: `langchain_agent/src/api/message_processor.py` (per-session `_SessionWorker`), `src/mcp/connection.py` (CR-06 reader/demux), `src/agent/mcp_tool_provider.py` (WR-06 ContextVar tracer), `src/api/websocket_handler.py` (WR-01 BL-04 session-trust)
- Enforced as do-not-break: `REGRESSION_PLAN.md` §1 ("per-session message ordering must never reorder a conversation's turns"; "per-session worker reaper must be started at init")

---

## T-9 — Every PingOne client connection authenticates with `client_secret_post`; the Worker Token CC client is the only `basic` exception

All confidential-client calls to PingOne — the Authorization Code token
exchange, RFC 8693 token exchange (MCP exchanger), the AI-agent CC token, the
MCP-gateway token endpoint, and token introspection (which authenticates with
the **user** token, not the worker) — send credentials as
`client_secret_post` (`client_id` + `client_secret` in the form body). There
is exactly **one** exception: the **Worker Token CC client**
(`PINGONE_WORKER_TOKEN_*` — the PingOne "Super Banking Worker Token" app used
for Management API calls and redirect-uri/app-config reads), which
authenticates with `client_secret_basic`.

Mismatched auth methods are *the* recurring failure mode: PingOne rejects with
`invalid_client: "Unsupported authentication method"`, surfacing downstream as
`delegation_chain_broken` / `actor_token_invalid` / 502 on `/api/mcp/tool` and
`session_persist_failed` on admin login. Standardizing removes the entire
class. Code reflects the truth as the **default**: non-worker auth-method
resolvers default to `'post'`; only the worker CC resolvers default to
`'basic'`. New connections inherit `post` automatically.

**Naive reading that is wrong:** "auth method is per-app, set it however each
PingOne app happens to be configured" — that is exactly what produced the
inconsistent `basic`/`post` mix that broke token exchange this session. The
invariant is the other way round: the *code and config* assert `post`
everywhere, and PingOne apps are configured to match; the single deliberate
deviation (worker CC = `basic`) is explicit, commented, and isolated to the
`getAgentClientCredentialsToken*` functions.

- Code: `banking_api_server/services/agentMcpTokenService.js` (`aiAgentAuthMethod`, `mcpExchangerAuthMethod` — default `'post'`), `banking_api_server/services/oauthService.js` `getAgentClientCredentialsToken[WithExpiry]` (worker CC — default `'basic'`, the exception), `banking_api_server/.env` (`MCP_GW_TOKEN_ENDPOINT_AUTH_METHOD`, `PINGONE_INTROSPECTION_AUTH_METHOD`, `PINGONE_MCP_TOKEN_EXCHANGER_CC_AUTH_METHOD` = `post`)
- Related: T-4 (PingOne performs the token exchange — this is how the request authenticates to it)
- Glossary: [CONTEXT.md](../CONTEXT.md) "token custody", [oauth-pingone/SKILL.md](../.claude/skills/oauth-pingone/SKILL.md) (client auth methods)

---

## T-10 — A PingOne token request is single-resource: every scope asked for must live on the one target audience's resource

PingOne's `/as/token` endpoint (client_credentials AND RFC 8693 token
exchange) rejects any request whose requested scopes span **more than one
resource server**, with `invalid_scope: "May not request scopes for multiple
resources"`. A token is minted for exactly one audience; every scope in that
request must be a scope **defined on that audience's resource**. This is not
a bug to work around — it is how PingOne resource-scoping works.

Two concrete traps this caused (cost most of a debugging session):

- **Empty scope ≠ "no constraint".** A CC request that omits `scope`
  entirely makes PingOne default to *all* the app's granted scopes. If the
  app is granted scopes across two resources, the default-all request
  immediately violates the single-resource rule. The MCP Exchanger actor-CC
  mint must therefore request an *explicit single-resource* scope
  (`pingone_mcp_token_exchanger_client_scopes` default `banking:mcp:invoke`),
  never empty.
- **Appending a "policy-required" scope after audience validation
  re-introduces a cross-resource scope.** `agentMcpTokenService` validates
  `finalScopes` against the target audience (RFC 8707) and then *unconditionally
  adds* `banking:mcp:invoke` because the MCP Gateway policy requires it. That
  scope is only valid if it **also exists on the exchange's target resource**
  (`aud=mcp-server.ping.demo`). The fix is not to drop the scope (the gateway
  needs it) — it is to ensure `banking:mcp:invoke` is **provisioned onto the
  MCP-server resource itself** (mirroring what was already done for the
  Two-Exchange resources), so one single-audience token can legitimately
  carry both the tool scope and `banking:mcp:invoke`.

**Naive reading that is wrong:** "the token just needs the scopes the tool
requires; PingOne will sort out the resources." It will not — it rejects the
whole request. Designing an RFC 8693 hop means first asking *which single
resource is this token's audience, and does every scope I request exist on
that resource?* If a scope must travel through multiple hops, it must be
provisioned (mirrored) onto every resource that is an exchange audience along
the way. Scope vocabularies are per-resource and do not cascade.

**Authoritative source + the exchange-path nuance (verified 2026-05-17):**
PingOne docs —
<https://docs.pingidentity.com/pingone/applications/p1_resource_scopes.html>.
The doc states multi-custom-resource requests are *configurable* via the
application option **"Request scopes to access multiple resources"**, and that
the error for the disabled case is `"May not request scopes for multiple
custom resources"`. **Critical caveat:** that doc covers *authorization
requests* and is **silent on RFC 8693 token exchange**. Empirically (this T-10
plus three §4 incidents 2026-05-15/16) our **token-exchange** requests fail
with `"May not request scopes for multiple resources"` *regardless of that app
option* — so for the exchange path, treat single-resource as a hard
invariant the app setting does **not** lift. Do not design an exchange flow
that depends on the multi-resource option until/unless a test proves it
applies to `grant_type=urn:...:token-exchange`.

- Code: `banking_api_server/services/agentMcpTokenService.js` (`exchangeTokenRfc8693`, the `banking:mcp:invoke` append ~line 1015), `banking_api_server/services/oauthService.js` `getMcpExchangerToken` (explicit single-resource scope), `banking_api_server/services/pingoneProvisionService.js` (`mcpScopes` — `banking:mcp:invoke` mirrored onto the MCP-server resource; Two-Exchange resources do the same "for exchange compatibility"), `configStore.js` (`pingone_mcp_token_exchanger_client_scopes` default `banking:mcp:invoke`)
- Related: T-4 (PingOne performs the exchange), T-5 (every hop validates `aud` independently — this is the scope-side counterpart: every hop's scopes must match that hop's resource), T-9 (the auth-method invariant on the same token requests)
- Skill: [pingone-api-calls/SKILL.md](../.claude/skills/pingone-api-calls/SKILL.md) (PUT-not-PATCH + this single-resource scope rule)

---

## How to extend this file

Add a `T-N` entry only when **all** of these hold:

1. It is true system-wide (not one service's internal detail).
2. The obvious reading of a name, flag, or service boundary is *wrong*, and the
   gap has caused or could cause a real mistake.
3. It is not already enforced as a do-not-break rule in `REGRESSION_PLAN.md` §1
   (link to that instead of duplicating).

Keep each entry: the truth, the naive misreading it corrects, and pointers to
the authoritative skill/code/ADR. Mechanics stay in the per-domain skills.
