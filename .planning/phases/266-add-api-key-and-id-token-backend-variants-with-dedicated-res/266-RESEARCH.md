# Phase 266: API-key and ID-token backend variants with dedicated result pages — Research

**Researched:** 2026-05-10
**Domain:** Banking demo — new backend variants + Gateway routing + dedicated result UIs + architecture diagrams
**Confidence:** HIGH (codebase verified end-to-end; no external library research required — all patterns already exist in-repo and are being extended)

---

## Summary

Phase 266 extends the existing 2-backend gateway (`mcp-olb` + `mcp-invest`) with TWO new backend variants brokered by `banking_mcp_gateway`:

1. **API-key backend** — receives `X-API-Key` instead of OAuth bearer; gateway swaps the user's OAuth token for a service API key at the hop.
2. **ID-token + access-token backend** — receives BOTH the OAuth access token (auth) AND the ID token (identity claims); renders `name`, `email`, `sub`, `picture`.

The good news: **the patterns are 100% in-repo and proven**. `banking_mcp_invest` is the canonical template for "spin up another backend, add a tool name, wire it into the gateway router". The aspirational API-key backend node is **already drawn** (dashed) on `/architecture/flow` at `(840, 260)` — Phase 266 is the work to make it live. `id_token` is **already persisted** in `req.session.oauthTokens.idToken` (see `banking_api_server/routes/oauthUser.js:471`) and additionally embedded in the signed `_auth` cookie — no session-schema migration needed.

**Primary recommendation:** Build two new sibling services (`banking_demo_apikey_backend/` on port 8082, `banking_demo_userinfo_backend/` on port 8083) modeled on `banking_mcp_invest/`. Extend `banking_mcp_gateway/src/router.ts` with three routing decisions instead of two: `olb | invest | apikey | userinfo`. Add a `credentialKind` per target (`oauth_bearer | api_key | dual_token`) and a swap step in `index.ts` `handleMessage` before `proxyJsonRpc`. Add three new tools to `BankingToolRegistry`-equivalent registries in each new server (`get_special_offers` for API-key path; `get_user_profile_card` for ID-token path). Create three React result components with distinct color identities (existing OIDC RS = blue, API-key = amber, ID-token = teal) — mount them inline in `ResultsPanel` (BankingAgent.js:1389) keyed off new `panel.type` values. Update `ArchitectureFlowPage.js` to flip `aspirational:true` to `false` on the API-key node and add a new `id-token-backend` node + edges. Hand-edit the 5 `.mmd` source files and re-run `npm run build:diagrams`.

---

## User Constraints

> No CONTEXT.md exists for this phase (no `/gsd-discuss-phase 266` was run). The phase description in ROADMAP.md is the binding scope. There are no locked decisions — every architectural choice in this research is therefore in **Claude's discretion**, but constrained by the project rules below.

### Locked Decisions
*(none — no CONTEXT.md)*

### Claude's Discretion
- Whether each new backend lives as a sibling Node service or a route prefix inside `banking_api_server` (recommendation: sibling service — see §1)
- Where the service API key for the API-key backend is stored (recommendation: configStore with `public: false` — see §2)
- Exact tool names (recommendation: `get_special_offers` + `get_user_profile_card` — see §4)
- Visual identity of the three result pages (recommendation: blue / amber / teal — see §6)

### Deferred Ideas (OUT OF SCOPE)
- No mapped REQ-IDs — this is a demo enhancement phase outside the v1 requirement matrix
- v2 production hardening (multi-tenant API-key rotation, audit logs for credential swaps)
- Mobile or native-app variants
- Replacing or modifying any existing tool or backend (Phase 266 is purely **additive**)

---

## Project Constraints (from CLAUDE.md)

These are non-negotiable for every plan in this phase:

1. **Token custody** — Tokens NEVER exposed to the browser. The BFF (`banking_api_server`) is the sole token custodian. The new ID-token result page MUST receive **decoded claims**, never the raw `id_token` string. Apply `sanitizeClaims()` from `agentMcpTokenService.js:104` before returning to the SPA. `[CITED: CLAUDE.md "Token custody rule"]`
2. **`bffAxios` for all BFF calls** — Never plain `axios`. `[CITED: CLAUDE.md "Architecture"]`
3. **No emojis in UI text** — Hard rule. Use CSS icons, semantic HTML, or plain text. The existing `ResourceServerPage.jsx` has emoji headers (`🔐`, `🎫`, `🪪`) — **do not copy that pattern**; new pages must use plain headers. `[CITED: REGRESSION_PLAN.md §0]`
4. **Build gate** — After ANY `banking_api_ui` edit, `cd banking_api_ui && npm run build` must exit 0. `[CITED: CLAUDE.md "Build"]`
5. **Minimal diff** — Touch only what the task requires. Don't refactor `BankingAgent.js` (8503 LOC) — append, don't rewrite. `[CITED: CLAUDE.md "Agent behavior"]`
6. **Module systems** — `banking_api_server` is CommonJS; `banking_mcp_gateway` + `banking_mcp_invest` + `banking_mcp_server` are TypeScript with ES imports; `banking_api_ui/src` is ES modules + JSX in `.js`. New services must match the convention of the directory they live in. `[CITED: CLAUDE.md "Module system by package"]`
7. **`run-bank.sh` SVC_LIST table** — Adding new backend services REQUIRES extending `SVC_LIST` / `SVC_BUILD` / `SVC_INSTALL_FLAGS` in `run-bank.sh:612` AND the table in CLAUDE.md "Node services and what each needs to start". Don't guard launches with `[[ -f dist/index.js ]]`. Don't `|| true` away build errors. `[CITED: CLAUDE.md]`
8. **Vercel posture** — `banking_mcp_server` is NOT on Vercel; new backends similarly run separately. `vercel.json` rewrites `/api/*` to `api/handler.js` → `banking_api_server/server.js`. Any new BFF route MUST be mounted on `banking_api_server` to be reachable on Vercel. `[CITED: CLAUDE.md "Vercel deployment"]`
9. **Regression — MCP Inspector unauthenticated** — `GET /api/mcp/inspector/tools` must respond 200 without auth. Do not propagate auth requirements that would break this. `[CITED: REGRESSION_PLAN.md §1]`
10. **Regression — `ff_authorize_fail_open` defaults to false** — New backend routes that pass through `mcpToolAuthorizationService` inherit this. `[CITED: REGRESSION_PLAN.md §1]`

---

## Phase Requirements

No mapped REQ-IDs (per ROADMAP.md:2169: "Plans: 0 plans" and "No mapped REQ-IDs"). The four scope items from ROADMAP.md §266 act as implicit requirements:

| Implicit ID | Description | Research Support |
|----|----|----|
| 266-R1 | API-key backend variant — accepts `X-API-Key`, returns "special data", gateway swaps user token for API key | §1, §2, §4 (new service `banking_demo_apikey_backend/`, gateway routing, `get_special_offers` tool) |
| 266-R2 | ID-token + access-token backend — accepts both tokens, renders ID-token-derived user data | §1, §3, §4 (new service `banking_demo_userinfo_backend/`, id_token forward, `get_user_profile_card` tool) |
| 266-R3 | Three visually distinct result pages — header / badge / colour differ enough to ID in a screenshot | §6 (recommendation: blue / amber / teal, plain-text headers, prominent backend-name badge) |
| 266-R4 | Update `/architecture/flow` and `/sequence-diagram` — promote aspirational nodes to live, add new edges for credential swap and id-token forward | §7 (React Flow node arrays in `ArchitectureFlowPage.js` + `SequenceDiagramPage.js`, plus `.mmd` sources rebuilt via `npm run build:diagrams`) |

---

## Standard Stack

### Core (all in-repo, no new dependencies needed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `ws` | ^8.x (already in gateway/invest) | WebSocket transport for MCP JSON-RPC | The two existing MCP backends and the gateway all use it; matches MCP 2025-11-25 lifecycle. `[VERIFIED: banking_mcp_invest/package.json + banking_mcp_gateway/package.json import]` |
| `jsonwebtoken` | already used in `banking_mcp_invest` | Decode + verify JWTs at the new backends | Existing pattern: `banking_mcp_invest/src/server/tokenValidator.ts` does decode-and-validate against `aud`. `[VERIFIED: file exists]` |
| `dotenv` | ^16.x | Load per-service `.env` | Both gateway and invest server use it. `[VERIFIED: source imports]` |
| `axios` | already in `banking_mcp_gateway` | Outbound HTTP for `tokenExchange.ts`-style PingOne calls | Already wired in `banking_mcp_gateway/src/tokenExchange.ts`. `[VERIFIED]` |
| `@xyflow/react` | already in `banking_api_ui` | React Flow diagram | Used by `ArchitectureFlowPage.js`. `[VERIFIED: import line 14-23]` |
| `mermaid-cli` (via `npx`) | `@mermaid-js/mermaid-cli@10` | Regenerate `.mmd` → PNG | `scripts/build-diagrams.sh` invokes this. `[VERIFIED]` |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `configStore` (in-repo singleton) | n/a | Persist `demo_apikey_backend_service_key` etc. | When secrets need both env-var override AND admin-UI persistence. See `banking_api_server/services/configStore.js:36, 154` for the `public: false` pattern. |
| `appEventService.logEvent` | in-repo | Telemetry for the new flows | Already wired across the existing token-exchange path. New tools should call it too. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| New sibling Node services | Route prefixes on `banking_api_server` (e.g., `/api/v2-apikey/*`, `/api/v2-userinfo/*`) | Lower install burden (no new SVC_LIST entry) — but obscures the demo's whole point ("look, a separate backend with totally different auth!"). Also forces the BFF process to host two more handlers behind the same Express auth middleware. **Not recommended** — the demo's pedagogical value is that the gateway brokers DIFFERENT backends. |
| WebSocket transport for new backends | HTTP/REST | An HTTP backend would be more "honest" for an API-key REST service (the typical real-world shape). But the gateway is WebSocket-native (`proxyJsonRpc` in `banking_mcp_gateway/src/proxy.ts`). Mixed transports would force the gateway to grow an HTTP-proxy path. **Compromise:** Both new backends speak MCP-over-WS (same as `banking_mcp_invest`) so the gateway stays uniform; the **credential** at the hop is what differs. |
| Storing service API key in env-only | configStore | Env-only is simpler but means the admin can't rotate the key from the `/config` UI. configStore matches the existing pattern for `helix_api_key`. **Use configStore.** |

**Installation:** No new npm packages required. Phase 266 reuses existing deps across `banking_mcp_gateway`, `banking_mcp_invest`, `banking_api_server`, and `banking_api_ui`.

**Version verification:** Skipped — no new libraries are introduced.

---

## Architecture Patterns

### Recommended Project Structure

```
banking/
├── banking_demo_apikey_backend/   # NEW — port 8082; MCP-over-WS; X-API-Key out the back
│   ├── src/
│   │   ├── index.ts               # Modeled on banking_mcp_invest/src/index.ts
│   │   ├── server/tokenValidator.ts   # validates inbound OAuth bearer (gateway sends aud=demo-apikey)
│   │   └── tools/
│   │       ├── apiKeyTools.ts     # get_special_offers definition
│   │       └── apiKeyToolHandler.ts   # uses X-API-Key to call the "upstream" (in-process mock data)
│   ├── openapi/
│   │   └── mcp-apikey.openapi.json
│   ├── package.json
│   └── tsconfig.json
├── banking_demo_userinfo_backend/ # NEW — port 8083; MCP-over-WS; requires id_token + access_token
│   ├── src/
│   │   ├── index.ts
│   │   ├── server/
│   │   │   ├── tokenValidator.ts
│   │   │   └── idTokenValidator.ts    # validates inbound id_token claims (nonce, iss, aud, exp)
│   │   └── tools/
│   │       ├── userInfoTools.ts       # get_user_profile_card definition
│   │       └── userInfoToolHandler.ts
│   ├── openapi/
│   ├── package.json
│   └── tsconfig.json
├── banking_mcp_gateway/src/
│   ├── router.ts                  # MODIFIED — add apikey | userinfo targets
│   ├── credentialSwap.ts          # NEW — per-target credential selection (oauth_bearer | api_key | dual_token)
│   ├── proxy.ts                   # MODIFIED — accept credential descriptor instead of single bearer
│   └── config.ts                  # MODIFIED — add demo_apikey_*  + demo_userinfo_* config vars
└── banking_api_ui/src/components/
    ├── ApiKeyResultPage.jsx       # NEW — amber theme, "API-KEY BACKEND" badge
    ├── UserInfoResultPage.jsx     # NEW — teal theme, "ID-TOKEN BACKEND" badge
    └── BankingAgent.js            # MODIFIED — extend ResultsPanel (line 1389) with two new panel.type cases
```

### Pattern 1: New MCP Backend (mirror `banking_mcp_invest`)
**What:** A self-contained Node service that speaks MCP-over-WebSocket on a unique port, validates inbound tokens for `aud === MCP_SERVER_RESOURCE_URI`, and exposes a small tool list.
**When to use:** Any time a new "destination backend" needs to plug into the gateway.
**Example:**
```typescript
// Source: banking_mcp_invest/src/index.ts (verified pattern, lines 22-211)
const PORT = parseInt(process.env.PORT || '8082', 10);   // new variants pick 8082, 8083
const RESOURCE_URI = process.env.MCP_SERVER_RESOURCE_URI || 'https://mcp-apikey.bxf.com';

function handleHttp(req, res) {
  if (req.url === '/.well-known/oauth-protected-resource') { /* RFC 9728 metadata */ }
  if (req.url === '/health') { /* liveness */ }
}

async function handleMessage(rawMsg, token, send) {
  // 1. initialize → return protocolVersion 2025-11-25
  // 2. tools/list → decodeAndValidate(token, RESOURCE_URI); filterByScopes
  // 3. tools/call → per-tool scope check → dispatchTool(toolName, args, token)
}

const wss = new WebSocket.Server({ server: httpServer });
wss.on('connection', (ws, req) => {
  const token = extractBearerFromAuthHeader(req.headers.authorization);
  if (!token) ws.close(4001, 'Bearer token required');
  ws.on('message', raw => handleMessage(raw.toString(), token, ws.send));
});
```

### Pattern 2: Gateway Credential Swap (extends `tokenExchange.ts`)
**What:** Per-target decision: when the gateway forwards a tool call, decide which credential goes on the outbound WebSocket.
**When to use:** Each tool routes to exactly one backend; the credential is a property of the target backend, not the tool.
**Example:**
```typescript
// New file: banking_mcp_gateway/src/credentialSwap.ts
// Pattern matches existing exchangeTokenForBackend in tokenExchange.ts
import { GatewayConfig } from './config';
import { exchangeTokenForBackend } from './tokenExchange';

export type CredentialKind = 'oauth_bearer' | 'api_key' | 'dual_token';

export interface OutboundCredential {
  kind: CredentialKind;
  authorization?: string;           // for oauth_bearer or dual_token (access_token)
  apiKeyHeader?: { name: 'X-API-Key'; value: string };
  idToken?: string;                 // for dual_token only
}

export async function selectCredentialForBackend(
  target: BackendTarget,
  subjectToken: string,
  idToken: string | null,
  config: GatewayConfig,
): Promise<OutboundCredential> {
  if (target === 'apikey') {
    // Swap: drop the user token entirely, attach the service API key
    return { kind: 'api_key', apiKeyHeader: { name: 'X-API-Key', value: config.demoApiKeyServiceKey } };
  }
  if (target === 'userinfo') {
    // Re-exchange access token for userinfo audience; forward id_token alongside
    const accessToken = await exchangeTokenForBackend(subjectToken, config.demoUserInfoResourceUri, config);
    if (!idToken) throw new Error('id_token required for userinfo backend but absent from request');
    return { kind: 'dual_token', authorization: `Bearer ${accessToken}`, idToken };
  }
  // Existing path — olb, invest
  const accessToken = await exchangeTokenForBackend(subjectToken, backendResourceUri(target, config), config);
  return { kind: 'oauth_bearer', authorization: `Bearer ${accessToken}` };
}
```

### Pattern 3: SPA Result Page with Backend Identity (extends `ResourceServerPage.jsx`)
**What:** Three distinct React components, each branded by color + plain-text badge, each fetching its own BFF endpoint.
**When to use:** Required by 266-R3 (visible page identification).
**Example:** See §6 for full markup.

### Anti-Patterns to Avoid
- **Don't fold the new backends into `banking_api_server` routes.** It defeats the demo's pedagogical point. `[VERIFIED: ROADMAP.md §266 scope text]`
- **Don't copy the emoji-laden headers from `ResourceServerPage.jsx` lines 161, 211, 270, 283.** That file pre-dates §0 enforcement and is on the cleanup list. New pages must be plain-text from day one. `[VERIFIED: REGRESSION_PLAN.md §0]`
- **Don't write the raw `id_token` string to the SPA payload.** Decode it server-side in the new BFF endpoint, sanitize, return claims only. `[VERIFIED: same pattern as `banking_api_server/routes/resourceServer.js:50-65`]`
- **Don't pass the API key through the user's session.** The key is a service credential. Read from `configStore.getEffective('demo_apikey_backend_service_key')` on each gateway call. `[VERIFIED: configStore pattern in services/configStore.js:154 for `helix_api_key`]`
- **Don't add `[[ -f dist/index.js ]]` guards in `run-bank.sh` launch blocks.** Let the dependency loop build, then launch unconditionally. `[CITED: CLAUDE.md]`

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| MCP JSON-RPC handshake | A custom `initialize`/`notifications/initialized` sequencer | Copy `banking_mcp_invest/src/index.ts:96-105` verbatim | MCP 2025-11-25 lifecycle has version-negotiation subtleties (`PINGAUTHORIZE_WORKER_ID`, supported-version disconnect) already handled. |
| JWT decode for the new backends | `Buffer.from(jwt.split('.')[1], 'base64url')` everywhere | Reuse `decodeJwtClaims` + `sanitizeClaims` from `agentMcpTokenService.js:96, 104` | Already handles bad input, returns null safely, strips non-display claims. |
| RFC 8693 re-exchange to a new audience | A new POST to the token endpoint | Reuse `banking_mcp_gateway/src/tokenExchange.ts` `exchangeTokenForBackend()` | Already caches by `(subjectToken, targetAud)`, sets correct grant_type, handles `expires_in`. |
| WebSocket connection pool | Custom retry/backoff | The proxy is intentionally stateless — open a fresh WS per request (`proxy.ts:32`) | Comment at `proxy.ts:6-7`: "no persistent connection pool needed for demo scale". |
| RFC 9728 protected-resource metadata | Inline JSON for each new server | Same metadata block as `banking_mcp_invest/src/index.ts:42-58` | Required by MCP 2025-11-25 spec; gateway's discovery is built around it. |
| ID-token nonce/issuer validation | Custom checks | The `jose.jwtVerify()` already wired in `BankingToolProvider.ts:23, 28-41` (uses `createRemoteJWKSet`) | Handles JWKS rotation correctly; same library used by gateway. |
| React Flow node styling for "new backend variants" | Bespoke divs | Extend `ArchNode` in `ArchitectureFlowPage.js:42`. The `aspirational:true` prop already exists at line 49 — flip it to `false` on the API-key node and add a new `id-token-backend` node with the same shape. | Already supports `colorClass` per state, badges, and dashed variant. |

**Key insight:** **Every pattern this phase needs already exists in the repo.** The work is 80% copy/adapt-from-template (`banking_mcp_invest`, `ResourceServerPage.jsx`, `ArchitectureFlowPage.js`), 20% glue (gateway router extension, new heuristic NL patterns, new diagram nodes). Phase 266 is a **wiring phase**, not a research-heavy one.

---

## Runtime State Inventory

> Phase 266 is **purely additive** (greenfield from the existing codebase's perspective). No renames, refactors, or migrations are in scope. Therefore most categories are not applicable — but documenting explicitly per the protocol:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | **None — verified.** No existing data is renamed or migrated. New backends will store their own demo data in-memory (mirror `banking_mcp_invest` which has no persistent store). | none |
| Live service config | **One item — PingOne app + resource server provisioning.** New aud values (`mcp-apikey.bxf.com`, `mcp-userinfo.bxf.com`) need PingOne resource-server registrations so the gateway's RFC 8693 re-exchange can target them. Currently provisioned via `npm run pingone:bootstrap` from a static list. | Add two new entries to the bootstrap config (`banking_api_server/scripts/pingone-bootstrap.js`) so `npm run setup:fresh` provisions them. Tag as a separate plan. |
| OS-registered state | **None — verified.** No Task Scheduler / launchd / pm2 entries reference these new services. `run-bank.sh` handles process lifecycle. | Update `SVC_LIST` array in `run-bank.sh:612` to include `banking_demo_apikey_backend` + `banking_demo_userinfo_backend`. Update the table in CLAUDE.md "Node services and what each needs to start". |
| Secrets / env vars | **One new secret + several new config keys.** `DEMO_APIKEY_BACKEND_SERVICE_KEY` (the API key the gateway swaps in) — random opaque string, NOT a JWT. New env vars for ports/audiences/WS URLs (`MCP_APIKEY_WS_URL`, `MCP_APIKEY_RESOURCE_URI`, `MCP_USERINFO_WS_URL`, `MCP_USERINFO_RESOURCE_URI`). | Add the secret to `configStore.js` with `public: false` (same pattern as `helix_api_key`). Add the URI/URL configs to `gateway/src/config.ts` `loadConfig()`. Update `.env.example` files at repo root and `banking_mcp_gateway/`. |
| Build artifacts | **None pre-existing.** Two new `dist/` directories will be created on first build. | `.gitignore` already excludes `dist/`. No action. |

---

## Common Pitfalls

### Pitfall 1: id_token already exists in session — don't "fix" what isn't broken
**What goes wrong:** A planner unfamiliar with the codebase assumes `id_token` needs a new session-schema change. They write a 4-task plan to add `req.session.oauthTokens.idToken` storage.
**Why it happens:** The phase description ("BFF must have stored it from the original OIDC login") sounds aspirational.
**How to avoid:** Verify first. The id_token is stored at `banking_api_server/routes/oauthUser.js:471` and ALSO embedded in the signed `_auth` cookie at line 594. The full audit chain: callback `tokenData.id_token` → `oauthTokens.idToken` → `req.session.oauthTokens.idToken` → consumed by `/api/resource-server/summary` at `resourceServer.js:23-25`. `[VERIFIED: codebase grep]`
**Warning signs:** A plan that touches `oauthUser.js` for "id_token persistence". Reject it during plan-check — the work is exposing the existing data to the gateway, not storing it.

### Pitfall 2: Upstash 8KB header limit when forwarding id_token
**What goes wrong:** The gateway sends `Authorization: Bearer <access>` + a second header (e.g., `X-ID-Token: <jwt>`) to the userinfo backend. PingOne id_tokens are 1-3KB; combined with cookies + other headers, an Upstash KV REST request (during gateway's session-fetch-via-BFF path) hits the 8KB header limit.
**Why it happens:** The new dual-token transport adds a fat header.
**How to avoid:** The userinfo backend lives **separately from Vercel** (same as `banking_mcp_server`). The id_token only crosses gateway↔backend over WebSocket, which has no header limit issue. The id_token does NOT need to be embedded in any Upstash key. **However:** the BFF's call to the gateway (`mcpGatewayClient.js`) needs to include the id_token. Use the WebSocket connection body (JSON-RPC `params`), NOT an HTTP header.
**Warning signs:** A plan that adds `X-ID-Token` to HTTP headers anywhere on the BFF→Gateway hop. Push to body.

### Pitfall 3: Heuristic NL routing silently misses the new prompts
**What goes wrong:** A user types "show my special offers" and the heuristic returns `kind: 'none'` → falls back to Ollama → Ollama isn't running on Vercel → user sees `"I didn't catch that"`.
**Why it happens:** `nlIntentParser.js` parseHeuristic only recognizes pre-registered patterns (verified at `services/nlIntentParser.js:193-275` — every action returns `{kind:'banking', banking:{action:'X'}}`). New prompts need new heuristic regexes.
**How to avoid:** Add two new heuristic entries in `nlIntentParser.js` (one for each new tool) AND add the corresponding actions to `BankingAgent.js` `ACTIONS` + `runAction` switch + `result.banking.action` dispatcher (line 5439+). Don't rely on the LLM fallback for headline demo prompts.
**Warning signs:** A plan that adds new tool names to `BankingToolRegistry` but no new heuristic patterns. The chat won't route to them.

### Pitfall 4: REGRESSION_PLAN §1 — MCP Inspector unauthenticated catalog must still work
**What goes wrong:** New tools are registered but `GET /api/mcp/inspector/tools` (no auth) doesn't list them; OR adding auth to the inspector route breaks the dev path.
**Why it happens:** The new backends register tools with `requiresUserAuth: true`. The local catalog endpoint may filter incorrectly.
**How to avoid:** Mirror the existing pattern in `banking_api_server/services/mcpLocalTools.js` (the local fallback catalog that `respondLocalCatalog` returns when MCP is unreachable). Add the two new tools to the local catalog list. Verify `GET /api/mcp/inspector/tools` returns ≥ 11 tools after the change (current 9 + 2 new).
**Warning signs:** The MCP Tools popup in the agent UI doesn't show the new tools after rebuild.

### Pitfall 5: `ResourceServerPage.jsx` has emojis — copying it propagates §0 violations
**What goes wrong:** Plan author opens `ResourceServerPage.jsx` as the template, sees `🔐 OIDC Resource Server` (line 161), and copies that pattern.
**Why it happens:** The existing file violates §0 and is on the cleanup list ("Files cleaned" in §0 does NOT include `ResourceServerPage.jsx` — it's still dirty).
**How to avoid:** New pages use plain text. Use CSS for visual differentiation (background color, border style, an inline SVG icon if needed). The page identity comes from color + the badge text, not glyphs.
**Warning signs:** Any new `.jsx` file with `🔐`, `🎫`, `🪪`, `📍`, `🤖`, `🔄`, `🪪`, `ℹ️`, `⚠️` in `<h1>`/`<h2>`/`<h3>`/`<p>` text content.

### Pitfall 6: `npm run build:diagrams` requires Chromium / Puppeteer
**What goes wrong:** A plan task says "regenerate diagrams" but the CI / sandbox can't run Puppeteer.
**Why it happens:** `scripts/build-diagrams.sh:13-15` notes the Chromium dependency. First run downloads ~150 MB.
**How to avoid:** Make diagram regeneration a separate task with a graceful fallback. Plan task notes: "If `npm run build:diagrams` fails for sandbox reasons, hand-edit the `.png` references or paste source `.mmd` into https://mermaid.live and commit the rendered PNG."
**Warning signs:** A task that says "run `npm run build:diagrams`" with no fallback.

### Pitfall 7: `aud` mismatch — gateway re-exchanges before knowing the target
**What goes wrong:** Gateway calls `exchangeTokenForBackend()` for the API-key backend, even though the API-key backend doesn't validate `aud` (it expects `X-API-Key` instead). The exchange is wasted at best, or fails at worst because no PingOne resource server is registered for that aud.
**Why it happens:** Existing pattern in `router.ts:33` always returns a `BackendTarget` and the index.ts always re-exchanges (line 318).
**How to avoid:** Refactor `index.ts:312-324` so the credential decision happens **before** the exchange: `selectCredentialForBackend()` returns the descriptor, and only the `oauth_bearer` and `dual_token` paths trigger `exchangeTokenForBackend`. The `api_key` path skips PingOne entirely.
**Warning signs:** A plan that registers a PingOne resource server for `mcp-apikey.bxf.com` — it shouldn't need one; the gateway speaks API-key out, not OAuth.

---

## Code Examples

### Example A: New backend `index.ts` (API-key variant)
```typescript
// banking_demo_apikey_backend/src/index.ts
// Source pattern: banking_mcp_invest/src/index.ts (verified, 1:1 structure)
'use strict';
import dotenv from 'dotenv';
dotenv.config();

import { createServer, IncomingMessage, ServerResponse } from 'http';
import WebSocket from 'ws';
import { API_KEY_TOOLS, filterByScopes } from './tools/apiKeyTools';
import { dispatchTool } from './tools/apiKeyToolHandler';
import { decodeAndValidate, extractScopes, TokenError } from './server/tokenValidator';

const PORT = parseInt(process.env.PORT || '8082', 10);
const RESOURCE_URI = process.env.MCP_SERVER_RESOURCE_URI || 'https://mcp-apikey.bxf.com';
// IMPORTANT: this backend validates the gateway's INBOUND access token (so the gateway
// has done a real RFC 8693 re-exchange for aud=mcp-apikey). The OUTBOUND credential to
// "the real API-key API" is the X-API-Key the gateway already attached as a header.
// In this demo the "real API" is in-process — but the data the tool returns is clearly
// labeled "API-Key Backend special data" so the chain is visible end-to-end.

const KEY_FROM_HEADER = process.env.DEMO_APIKEY_BACKEND_SERVICE_KEY || '';
// ...
```

### Example B: Gateway routing with credential swap
```typescript
// banking_mcp_gateway/src/router.ts (extended)
// Add to existing patterns
const APIKEY_TOOLS = new Set(['get_special_offers']);
const USERINFO_TOOLS = new Set(['get_user_profile_card']);

export type BackendTarget = 'olb' | 'invest' | 'apikey' | 'userinfo';

export function routeTool(toolName: string): BackendTarget {
  if (INVEST_TOOLS.has(toolName))   return 'invest';
  if (APIKEY_TOOLS.has(toolName))   return 'apikey';
  if (USERINFO_TOOLS.has(toolName)) return 'userinfo';
  return 'olb';
}
```

### Example C: BFF route exposing decoded id-token claims
```javascript
// banking_api_server/routes/userInfoResultRoute.js (NEW)
// Source pattern: banking_api_server/routes/resourceServer.js:50-86
const express = require('express');
const router = express.Router();
const { decodeJwtClaims, sanitizeClaims } = require('../services/agentMcpTokenService');

router.get('/summary', (req, res) => {
  if (!req.session?.oauthTokens?.accessToken) {
    return res.status(401).json({ error: 'authentication_required' });
  }
  const idToken = req.session.oauthTokens.idToken;
  if (!idToken) {
    return res.status(412).json({ error: 'id_token_missing',
      message: 'Sign in again to obtain an id_token (login flow must include openid scope).' });
  }
  const idDecoded = decodeJwtClaims(idToken);
  const idClaims = sanitizeClaims(idDecoded?.claims) || {};
  res.json({
    backendName: 'ID-Token + Access-Token Backend',
    backendBadge: 'DUAL-TOKEN BACKEND',
    backendColor: 'teal',
    profile: {
      sub:                idClaims.sub,
      name:               idClaims.name,
      email:              idClaims.email,
      preferred_username: idClaims.preferred_username,
      given_name:         idClaims.given_name,
      family_name:        idClaims.family_name,
      picture:            idClaims.picture || null,
    },
    idTokenClaims: idClaims,
  });
});
module.exports = router;
```

### Example D: Heuristic NL pattern additions
```javascript
// banking_api_server/services/nlIntentParser.js (new patterns appended)
// Trigger: "show special offers", "get my offers", "what offers do I have", "promotions"
if (/(?:show|get|my|what)?\s*(?:special\s+)?offers?|promotions?/i.test(t)) {
  return { kind: 'banking', banking: { action: 'special_offers' } };
}
// Trigger: "show my profile", "who am i", "my user info", "my profile card"
if (/(?:show|view|my)?\s*(?:user\s+)?profile(?:\s+card)?|who\s+am\s+i|user\s+info/i.test(t)) {
  return { kind: 'banking', banking: { action: 'user_profile_card' } };
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Single MCP backend (`banking_mcp_server` only) | Two-backend gateway routing (`olb` + `invest`) | Phase 209+ | Demonstrates "one gateway, many backends" — Phase 266 extends to 4 backends. |
| OAuth bearer everywhere | Mixed credentials (bearer + API-key + dual-token) at gateway | **Phase 266 (this phase)** | New "credential broker" pattern at the gateway is the demo's pedagogical point. |
| Aspirational dashed nodes in `ArchitectureFlowPage` | Live nodes when implemented | Phase 266 promotes the API-key node | Visual "we built the planned thing" moment for demos. |

**Deprecated / outdated:**
- Emoji-laden result page headers (in `ResourceServerPage.jsx`) — slated for cleanup but not in Phase 266 scope. New pages must NOT inherit the pattern.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The two new backends should speak MCP-over-WebSocket (same transport as `banking_mcp_invest`) rather than plain REST/HTTP | §1 Pattern 1 | If user expects HTTP/REST backends, the gateway needs a second proxy code path. ~1 plan of additional work. |
| A2 | The "service API key" for the API-key backend is a static opaque string (not a rotating JWT) | §2 / configStore | If rotation is required, add a `keyRotationSchedule` field and a rotation job. Out of v1 demo scope. |
| A3 | The id-token result page should show **decoded claims only**, never the raw JWT | §6 | Strong claim — this is mandated by CLAUDE.md "Token custody rule". Negligible risk. |
| A4 | The recommended visual identities (existing=blue, api-key=amber, id-token=teal) match the demo's design language | §6 | Trivially reversible — re-tag CSS variables. |
| A5 | `npm run build:diagrams` will succeed in the dev environment when this phase ships | §7 | Documented fallback path (mermaid.live + manual PNG commit) covers failure. |
| A6 | No mapped REQ-IDs means no requirements traceability matrix update is needed | §Phase Requirements | If the team wants traceability, four implicit IDs (266-R1 to 266-R4) are documented above. |
| A7 | "Picture" claim in id_token will be sparsely populated by PingOne (often absent) | §1 Pattern 3 + Example C | Plan should gracefully render `null` (already in Example C). |

---

## Open Questions (RESOLVED)

> All four open questions raised during research were resolved by CONTEXT.md (the
> in-session user pivot recorded 2026-05-10). RESOLVED markers added per W3 (revision
> 2026-05-10) so downstream agents can see the resolution path without re-deriving.

1. **Does PingOne issue id_tokens with a `picture` claim in this environment?**
   - What we know: id_token shape varies by IDP and user attribute mapping. PingOne can return `picture` if mapped from a user attribute.
   - What's unclear: Whether this specific demo environment has `picture` mapped.
   - Recommendation: Render `picture || null`; show a CSS-styled placeholder initial circle when absent. Tag as A7 in the assumptions log.
   - **RESOLVED:** CONTEXT.md §Path B specifies "decoded id-token claims (name, email, sub, picture if PingOne emits it)" — render `picture || null`. The plan handles absence gracefully (Plan 04 AccessIdTokenPathPage renders whatever sanitized claims arrive; missing fields simply do not render).

2. **Should the API-key backend's "special data" be persisted, or always synthetic per-call?**
   - What we know: `banking_mcp_invest` returns synthetic-per-call data (no store).
   - What's unclear: Whether the demo wants "special offers" to feel personalized to the user (would require keying off something — e.g., the inbound token's `sub` even though the backend ignores OAuth otherwise).
   - Recommendation: Keep it synthetic-per-call but include a `recommended_for` field with a generic label (e.g., "Premium customers"). Avoid `sub`-based personalization on the API-key path — it muddies the "this backend doesn't know who the user is" narrative.
   - **RESOLVED:** Moot — CONTEXT.md §Path A locks the demo as "no banking data returned on this path — it demonstrates the credential-swap pattern." There is no backend call, hence no data shape to design. The Path A info page renders only the masked API key + an explanatory message.

3. **Does Phase 266 need to update the LangChain agent (port 8888) or only the heuristic NL path?**
   - What we know: Heuristic NL covers the demo flow; LangChain agent is an "optional component, not primary demo path" (REQUIREMENTS.md v2 deferred line 53).
   - What's unclear: Whether the demo will run from LangChain on stage.
   - Recommendation: Heuristic-only for Phase 266. If LangChain coverage is added later, it's a small follow-up phase.
   - **RESOLVED:** Deferred per CONTEXT.md §Deferred Ideas — "LangChain agent (port 8888) integration — heuristic-only NL routing for Phase 266; LangChain deferred." Plan 02 extends `nlIntentParser.js` heuristics only.

4. **Does the existing `BankingAgent.js` `runAction` switch dispatcher need a new `case` for each new tool, or can the heuristic route through the existing `mcp_tools` path?**
   - What we know: `runAction` has explicit cases per action (accounts, transactions, balance, deposit, withdraw, transfer, mcp_tools, web_search, sensitive-account-details, sequential_think, plus AI). New tools that produce a custom result panel need explicit cases.
   - What's unclear: Whether a generic "call this MCP tool, render this panel" abstraction would be cleaner than two more explicit cases.
   - Recommendation: Add two explicit cases (`special_offers`, `user_profile_card`). Don't refactor the dispatcher — that's outside Phase 266 scope and violates minimal-diff.
   - **RESOLVED:** Explicit cases, no refactor — per CONTEXT.md §Implementation Decisions §Architecture (minimal-diff principle, "no new backend services," "existing resource server is unchanged in behavior") and CLAUDE.md "Don't refactor BankingAgent.js (8503 LOC)". Plan 04 Task 2 appends two explicit cases (`api_key_demo`, `dual_token_demo`) to the dispatcher — no abstraction layer introduced.

---

## Environment Availability

Run-bank.sh-managed dev environment is the target. The new backends require:

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js >= 20 | All Node services | ✓ (per CLAUDE.md "engines.node": ">=20") | varies | — |
| TypeScript 5 | New backend services | ✓ (already in mcp_server / mcp_invest / gateway) | per their package.json | — |
| `ws` (WebSocket) | All MCP backends | ✓ | already installed in mcp_invest | — |
| `mkcert` + `/etc/hosts` entry for `api.ping.demo` | gateway HTTPS in dev | ✓ documented in CLAUDE.md "One-time setup" | — | gateway runs HTTP in fallback mode |
| Chromium / Puppeteer for `npm run build:diagrams` | §7 diagram regen | partial (downloaded on first run) | — | Manual fallback: paste `.mmd` into https://mermaid.live, commit PNG |
| PingOne tenant with admin credentials | new resource-server provisioning | ✓ documented under "Fresh install / migration" | — | Mock mode: skip provisioning, set `MCP_GW_DEV_BYPASS=true` |
| Free ports 8082, 8083 | new backends | likely ✓ | — | If clash, change `PORT` env var and update gateway config + run-bank.sh |

**Missing dependencies with no fallback:** None blocking. All dependencies for Phase 266 are already in the dev contract.

**Missing dependencies with fallback:**
- Chromium for diagram regen — fallback is documented at the top of `scripts/build-diagrams.sh`.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest 29 (banking_api_server, banking_mcp_server, banking_mcp_gateway each have their own jest config) + Playwright for E2E in banking_api_ui |
| Config file | `banking_api_server/jest.config.js` exists; each TS service has its own `package.json` `"test"` script; root `package.json` has `npm test` orchestration |
| Quick run command | `npx jest <pattern> -x` (within service dir) |
| Full suite command | `npm test` (from repo root) — runs all suites |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| 266-R1 | API-key backend accepts `X-API-Key`, returns identifiable "API-Key Backend" data | unit | `cd banking_demo_apikey_backend && npx jest --testPathPattern='apiKeyTools'` | ❌ Wave 0 |
| 266-R1 | API-key backend REJECTS calls without `X-API-Key` (4xx) | unit | same file | ❌ Wave 0 |
| 266-R1 | Gateway swaps OAuth token for API key when target=apikey (verify no `Authorization` header on outbound) | unit | `cd banking_mcp_gateway && npx jest credentialSwap.test` | ❌ Wave 0 |
| 266-R1 | Heuristic NL routes "show special offers" → `action: 'special_offers'` | unit | `cd banking_api_server && npx jest nlIntentParser` | ✅ (extends existing test) |
| 266-R2 | Userinfo backend accepts BOTH access_token AND id_token; rejects either-missing | unit | `cd banking_demo_userinfo_backend && npx jest --testPathPattern='userInfoTools'` | ❌ Wave 0 |
| 266-R2 | BFF `/api/userinfo-backend/summary` returns only decoded ID-token claims (raw JWT never appears in response body) | integration | `cd banking_api_server && npx jest userInfoResultRoute.regression` | ❌ Wave 0 |
| 266-R2 | Gateway forwards id_token to userinfo backend (in JSON-RPC params, not HTTP header) | unit | `cd banking_mcp_gateway && npx jest dualToken` | ❌ Wave 0 |
| 266-R3 | Each of the 3 result pages renders a distinct badge string in the DOM | component | `cd banking_api_ui && npx jest ApiKeyResultPage UserInfoResultPage ResourceServerPage` | ❌ Wave 0 (component tests for new pages) |
| 266-R3 | No emoji glyphs in the new page component source (CI grep) | static | `grep -P '[\x{1F300}-\x{1F6FF}\x{1F900}-\x{1F9FF}]' banking_api_ui/src/components/{ApiKeyResultPage,UserInfoResultPage}.jsx` returns nothing | ✅ (CI grep, no file needed) |
| 266-R4 | `ArchitectureFlowPage` has no `aspirational:true` on `api-key-backend` node | static | `grep "api-key-backend.*aspirational" banking_api_ui/src/components/ArchitectureFlowPage.js` returns no `true` after edit | ✅ (CI grep) |
| 266-R4 | New `id-token-backend` node exists in INITIAL_NODES | static | `grep "id-token-backend" banking_api_ui/src/components/ArchitectureFlowPage.js` returns ≥ 1 line | ✅ (CI grep) |
| All | `npm run build` exits 0 from banking_api_ui after every commit | smoke | `cd banking_api_ui && npm run build` | ✅ |
| All | All seven services start cleanly via `./run-bank.sh` | manual smoke | `./run-bank.sh && ./run-bank.sh status` shows 9 services up (current 7 + 2 new) | ✅ |

### Sampling Rate
- **Per task commit:** `cd <touched_service> && npx jest --bail` (~5-15s)
- **Per wave merge:** `cd banking_api_server && npm test` AND `cd banking_api_ui && npm run build`
- **Phase gate:** Full `npm test` from repo root + `./run-bank.sh` smoke + screenshot of 3 distinct result pages

### Wave 0 Gaps
- [ ] `banking_demo_apikey_backend/__tests__/apiKeyTools.test.ts` — covers 266-R1 backend contract
- [ ] `banking_demo_userinfo_backend/__tests__/userInfoTools.test.ts` — covers 266-R2 backend contract
- [ ] `banking_mcp_gateway/src/__tests__/credentialSwap.test.ts` — covers gateway credential decision matrix
- [ ] `banking_api_server/routes/__tests__/userInfoResultRoute.regression.test.js` — verify no raw id_token leaks (use existing two-tier regression+integration pattern from CLAUDE.md "Test patterns")
- [ ] `banking_api_ui/src/components/__tests__/ApiKeyResultPage.test.jsx` + `UserInfoResultPage.test.jsx`
- [ ] No framework install needed — Jest already present in every target service.
- [ ] `banking_api_server/services/__tests__/nlIntentParser.test.js` — append cases for `special_offers` and `user_profile_card` (file already exists; extend it).

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Existing PingOne OAuth — no change. New backends inherit access via gateway's RFC 8693 re-exchange. |
| V3 Session Management | yes | `connect.sid` httpOnly cookie + Upstash KV store on Vercel (REGRESSION_PLAN §1). No session schema change required (id_token already stored). |
| V4 Access Control | yes | Per-tool `requiredScopes` already enforced at MCP server level; new tools declare scopes (`banking:read`). API-key backend additionally validates inbound aud (RFC 8693 narrowed). |
| V5 Input Validation | yes | JSON Schema on tool inputs (in `BankingToolRegistry` pattern). Body parsing for new BFF route via `express.json()`. |
| V6 Cryptography | yes | Never hand-roll. `jose.jwtVerify()` for id_token signature check. `jsonwebtoken` for decode-only paths. Symmetric API key is opaque random bytes, NOT a hash. |
| V8 Data Protection | yes | id_token never sent to SPA (decoded claims only). API key never sent to SPA. Service key stored configStore with `public: false`. |
| V9 Communications | yes | All gateway↔backend hops over WS; in dev over `ws://localhost`, in production over `wss://`. RFC 9728 metadata at each backend. |
| V11 Business Logic | n/a | No transactional logic added — read-only demo tools. |

### Known Threat Patterns for {Node + MCP-over-WS + PingOne OAuth stack}

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Raw id_token leakage to SPA | Info Disclosure | BFF endpoint returns sanitized claims only (`sanitizeClaims()` from `agentMcpTokenService.js:104`). |
| API key leakage to SPA | Info Disclosure | Key lives in BFF/gateway only. SPA never sees it. configStore `public: false`. |
| API key leakage in logs | Info Disclosure | Log lines must redact `X-API-Key` header value. Pattern: existing `console.log('[oauth/user/callback] access_token :', oauthTokens.accessToken || '(none)')` at `oauthUser.js:532` is acceptable for dev console; do NOT log the API key the same way in production paths. |
| Cross-backend token replay (token issued for `mcp-apikey` aud replayed against `mcp-userinfo`) | Tampering | Backend `decodeAndValidate(token, RESOURCE_URI)` rejects on aud mismatch — existing pattern in `banking_mcp_invest/src/server/tokenValidator.ts`. |
| id_token forwarded to a backend that doesn't need it | Info Disclosure | Gateway only forwards id_token when `target === 'userinfo'` (verified by router decision). |
| Nonce replay on id_token validation | Tampering | id_token consumed by BFF (already validated at login per `oauthUser.js:356-365`); the forwarded copy is for **display claims only** at the userinfo backend, NOT a re-authentication. Document this clearly. |
| Missing aud check at userinfo backend | Spoofing | Same `decodeAndValidate(token, MCP_USERINFO_RESOURCE_URI)` pattern at the new backend. |

---

## Dependencies & Risks

### Files to read first (for the planner)
1. `banking_mcp_invest/src/index.ts` — the canonical template for both new backends
2. `banking_mcp_invest/src/tools/investTools.ts` + `investToolHandler.ts` — tool definition + dispatch pattern
3. `banking_mcp_gateway/src/router.ts` — extension point for new targets
4. `banking_mcp_gateway/src/index.ts:312-324` — where credential-swap logic injects
5. `banking_mcp_gateway/src/tokenExchange.ts` — reuse for `oauth_bearer` and `dual_token` paths
6. `banking_api_server/routes/resourceServer.js` — template for new BFF result endpoint
7. `banking_api_ui/src/components/ResourceServerPage.jsx` — template visual structure (BUT strip emojis)
8. `banking_api_ui/src/components/BankingAgent.js:1389` (`ResultsPanel`), `:5430` (`runAction` action dispatcher), `:125` (`ACTION_GROUPS`)
9. `banking_api_server/services/nlIntentParser.js:193-275` — heuristic pattern reference
10. `banking_api_ui/src/components/ArchitectureFlowPage.js:136-181` — INITIAL_NODES + INITIAL_EDGES + simulation steps (`SIMULATE_STEPS`)
11. `banking_api_ui/src/components/SequenceDiagramPage.js` (3447 LOC — read top + grep for participant arrays)
12. `architecture-simple.mmd`, `architecture.mmd`, `i4ai-ref-arch.mmd`, `mcp-security-gateway.mmd` (repo root) — `.mmd` sources for `npm run build:diagrams`
13. `scripts/build-diagrams.sh` — regen workflow
14. `run-bank.sh:612` — SVC_LIST extension point

### Risks worth flagging
- **R1 — Diagram regen tooling friction.** `npm run build:diagrams` needs Puppeteer/Chromium (~150 MB on first run). Plan must include manual fallback (`https://mermaid.live`).
- **R2 — `BankingAgent.js` is 8503 LOC.** Editing the `runAction` switch + `ACTION_GROUPS` is a needle in a haystack; do it surgically with grep-anchored Edits (no Write rewrites).
- **R3 — `ResourceServerPage.jsx` has §0 emoji violations.** The new pages must NOT inherit them. Static CI grep recommended (see Validation §266-R3).
- **R4 — PingOne resource-server provisioning lag.** Adding `mcp-userinfo.bxf.com` to the bootstrap requires the team to re-run `npm run pingone:bootstrap` once (or `npm run setup:fresh`). API-key backend does NOT need PingOne provisioning (it speaks API-key, not OAuth) — that's a feature, not a bug.
- **R5 — Cookie size pressure.** The `_auth` signed cookie already carries `idToken` (line 594 of `oauthUser.js`). It's tight but works. No new cookie fields needed for Phase 266.
- **R6 — Two new services double the install surface.** Update fresh-install docs (CLAUDE.md table at "Node services and what each needs to start" — 7 rows → 9 rows). Update README service count if it appears anywhere.
- **R7 — `npm run build` (banking_api_ui) is the gating test.** Every plan that touches `banking_api_ui/src/` must end with a confirmed-zero-exit-code build.
- **R8 — Vercel deployability of new backends.** `banking_mcp_server` is "not on Vercel" per CLAUDE.md. New backends inherit the same posture; they run on Docker/Railway alongside the existing MCP server. No `vercel.json` changes needed.

---

## Recommended PLAN.md Split

Phase 266 maps cleanly to **6 plans across 4 waves**. Parallelism is high because the two new backends are independent of each other, and the diagram work is fully separate from the runtime work.

```
Wave 1 (parallel):
  ├─ 266-01-PLAN.md — banking_demo_apikey_backend (new service)
  │                   • New directory + package.json + tsconfig
  │                   • src/index.ts (model on mcp-invest)
  │                   • src/tools/apiKeyTools.ts + handler
  │                   • src/server/tokenValidator.ts (aud=mcp-apikey)
  │                   • __tests__/apiKeyTools.test.ts
  │                   • run-bank.sh SVC_LIST extension
  │                   • CLAUDE.md service table extension
  │                   • Files: ~10 new, ~2 modified
  │                   • REQ: 266-R1
  │
  └─ 266-02-PLAN.md — banking_demo_userinfo_backend (new service)
                      • Same structure as 266-01
                      • Additionally: src/server/idTokenValidator.ts
                      • REQ: 266-R2

Wave 2 (depends on Wave 1 having defined the audiences):
  └─ 266-03-PLAN.md — banking_mcp_gateway routing + credential swap
                      • src/router.ts: add APIKEY_TOOLS + USERINFO_TOOLS sets
                      • src/credentialSwap.ts (new file): selectCredentialForBackend()
                      • src/config.ts: 4 new config vars (demo_apikey_*, demo_userinfo_*)
                      • src/proxy.ts: accept OutboundCredential descriptor (refactor proxyJsonRpc signature)
                      • src/index.ts:312-324: call selectCredentialForBackend before/instead of exchangeTokenForBackend
                      • __tests__/credentialSwap.test.ts
                      • REQ: 266-R1, 266-R2 (gateway side)

Wave 3 (parallel — BFF routes + SPA result pages + NL routing, all consume Wave 2):
  ├─ 266-04-PLAN.md — BFF result endpoints + heuristic NL extension
  │                   • routes/apiKeyResultRoute.js (new, ~50 lines, model on resourceServer.js)
  │                   • routes/userInfoResultRoute.js (new, ~50 lines)
  │                   • server.js: mount both at /api/apikey-backend, /api/userinfo-backend
  │                   • services/nlIntentParser.js: append 2 heuristic patterns (special_offers, user_profile_card)
  │                   • services/configStore.js: add demo_apikey_backend_service_key with public:false
  │                   • services/mcpLocalTools.js: add 2 new tools to local catalog (REGRESSION §1 compliance)
  │                   • __tests__: apiKeyResultRoute.regression + .integration; nlIntentParser pattern test extension
  │                   • REQ: 266-R1, 266-R2 (BFF side)
  │
  └─ 266-05-PLAN.md — SPA result pages + BankingAgent dispatch wiring
                      • components/ApiKeyResultPage.jsx + .css (amber theme, no emojis)
                      • components/UserInfoResultPage.jsx + .css (teal theme, no emojis)
                      • BankingAgent.js: extend ACTION_GROUPS (2 new actions), runAction switch (2 new cases), ResultsPanel panel.type cases
                      • App.js: optional routes /api-key-backend and /userinfo-backend (if non-modal pages are wanted)
                      • Static no-emoji check passes
                      • cd banking_api_ui && npm run build exits 0
                      • REQ: 266-R3

Wave 4 (depends on Waves 1-3 being merged so the backends are live + named):
  └─ 266-06-PLAN.md — Architecture diagrams + sequence diagram updates
                      • ArchitectureFlowPage.js:
                          - Flip 'api-key-backend' aspirational:true → false
                          - Add new 'id-token-backend' node at ~(840, 360)
                          - Add new edges from mcp-gw with proper labels ('X-API-Key', 'Bearer + ID-Token')
                          - Extend SIMULATE_STEPS with two new scenarios (one per backend)
                      • SequenceDiagramPage.js: add new scenarios (cred swap at gateway, id-token forward)
                      • .mmd source updates:
                          - architecture-simple.mmd
                          - architecture.mmd
                          - i4ai-ref-arch.mmd
                          - mcp-security-gateway.mmd
                      • Run npm run build:diagrams (with documented fallback)
                      • Update banking_api_ui/public/architecture/*.png (commit regenerated files)
                      • REQ: 266-R4
```

**Why this split:**
- Waves 1 + 2 are isolated (the new backends have no UI dependency).
- Wave 3 can fan out (BFF and SPA touch different files).
- Wave 4 is intentionally last — diagrams document **what shipped**, not **what's planned**.
- Each plan is small (3-7 task units), keeps `npm run build` green at every commit, and has its own test surface.

**Estimated effort:** 6 plans × ~4-6 tasks each ≈ 24-36 task units. Wave 1 and Wave 3 are the bulk; Wave 4 is mostly text/diagram editing.

---

## Sources

### Primary (HIGH confidence — verified by codebase read)
- `banking_mcp_invest/src/index.ts` (1-211) — backend template
- `banking_mcp_invest/src/tools/investTools.ts` (1-87) — tool definition pattern
- `banking_mcp_gateway/src/router.ts` (1-46) — routing extension point
- `banking_mcp_gateway/src/index.ts` (1-417) — full gateway flow including credential resolution at line 312-324
- `banking_mcp_gateway/src/tokenExchange.ts` (1-67) — RFC 8693 reuse target
- `banking_mcp_gateway/src/proxy.ts` (1-105) — WebSocket proxy with Bearer-token-in-header (the swap point)
- `banking_mcp_gateway/src/config.ts` (1-95) — gateway config schema extension point
- `banking_api_server/routes/oauthUser.js` (460-600) — verifies id_token IS in session
- `banking_api_server/routes/resourceServer.js` (1-89) — BFF result endpoint template
- `banking_api_server/services/agentMcpTokenService.js` (1-130) — `decodeJwtClaims` + `sanitizeClaims` exports
- `banking_api_server/services/configStore.js` (36, 154, 279) — `public: false` secret-storage pattern
- `banking_api_server/services/nlIntentParser.js` (193-275) — heuristic action patterns
- `banking_api_ui/src/components/ResourceServerPage.jsx` (1-302) — SPA result page template
- `banking_api_ui/src/components/ArchitectureFlowPage.js` (42-181) — React Flow nodes + edges + aspirational pattern
- `banking_api_ui/src/components/BankingAgent.js` — ACTION_GROUPS (125+), ResultsPanel (1389), runAction switch (3120), dispatcher (5430+)
- `scripts/build-diagrams.sh` (1-50) — diagram regen workflow
- `run-bank.sh` (612+, 730+) — SVC_LIST schema with mcp_invest as reference
- `CLAUDE.md` — token custody rules, build gate, module systems, service table
- `REGRESSION_PLAN.md` §0 (no-emoji rule), §1 (MCP Inspector unauthenticated, ff_authorize_fail_open default false)
- `ROADMAP.md` lines 2141-2173 — Phase 266 scope
- `.planning/REQUIREMENTS.md` — confirmed no mapped REQ-IDs for Phase 266

### Secondary (MEDIUM)
- `.planning/STATE.md` line 25, line 303 — Phase 265 complete, Phase 266 added to roadmap

### Tertiary (LOW — none)

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already in-repo; no new deps
- Architecture: HIGH — directly extends two proven patterns (`banking_mcp_invest` + gateway routing); aspirational node already drawn
- Pitfalls: HIGH — derived from codebase grep + CLAUDE.md/REGRESSION_PLAN explicit rules
- Validation: HIGH — Jest + Playwright already covers comparable surfaces
- Plan split: HIGH — clean wave separation falls naturally out of dependency graph

**Research date:** 2026-05-10
**Valid until:** 2026-06-10 (30 days — codebase is stable post-Phase 265; only risk is unrelated refactors of `BankingAgent.js`)
