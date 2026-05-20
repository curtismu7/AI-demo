# Transaction Tokens (TraT) — MCP Gateway → MCP Server Security

**Date:** 2026-05-20
**Status:** Approved
**Spec ref:** [draft-oauth-transaction-tokens-for-agents-00](https://datatracker.ietf.org/doc/draft-oauth-transaction-tokens-for-agents/00/)

---

## 1. Problem Statement

The MCP Gateway forwards a delegated bearer token to the MCP server over WebSocket. That token is bound to a user identity and a resource audience, but carries no context about the specific transaction: which tool was called, in which session, for what purpose, by which agent. A token captured from the gateway→server leg could be replayed outside its originating transaction.

IETF Transaction Tokens (TraT) solve this by binding short-lived, workload-scoped context claims to every token that crosses a service boundary inside an agent call chain.

---

## 2. Goals

- Cryptographically bind MCP tool calls to their originating transaction context (tool name, session, correlation id, purpose, delegation chain)
- Use PingOne Authorize to enforce TraT claims at the MCP server — consistent with the existing HITL and step-up Authorize pattern
- Keep the current RFC 8693 flow as the default; gate the new behaviour behind `ff_trat_mode`
- Simulate TraT until PingOne natively supports the draft — with an honest `trat_sim` marker in the UI
- Provision the PingOne token policy claims automatically during bootstrap (always, idempotent)
- Add a dedicated education panel explaining the draft, the demo implementation, and upgrade path

---

## 3. Approach

**Approach A — BFF enriches the RFC 8693 exchange, PingOne issues a token with TraT-like custom claims.**

The BFF adds TraT context as extra parameters during the existing RFC 8693 exchange it already owns. PingOne issues a normal access token carrying the custom claims. The gateway and MCP server consume the claims from the bearer they already receive — no new token type, no new signing key, one trust root.

If PingOne's token policy does not emit the custom claims (expected until native TraT support lands), the BFF shim path activates: the BFF injects a `X-TraT-Context` JSON header alongside the bearer. Both paths produce identical claim sets; `trat_sim: true` distinguishes them in the UI.

---

## 4. Feature Flag

```
ff_trat_mode   default: false   public: true
```

Added to `demo_api_server/services/configStore.js` alongside the existing RFC 8693 flags (`ff_skip_token_exchange`, `ff_inject_may_act`, etc.).

- `false` (default): existing RFC 8693 path, zero behaviour change
- `true`: BFF injects TraT claims into the exchange request; MCP server sends claims to Authorize

Config UI helper text: _"Requires PingOne token policy setup — run `npm run pingone:setup:trat` or re-run bootstrap."_

---

## 5. TraT Claims

| Claim | Type | Value | TraT draft field |
|---|---|---|---|
| `reqctx` | object | `{ tool, session_id, correlation_id }` | Request context |
| `purp` | string | `"banking:mcp:tool_call"` | Purpose |
| `azd` | object | `{ sub: userId, act: agentClientId, gateway: gatewayClientId }` | Authorized delegation |
| `rctx` | object | `{ ip, user_agent: "banking-bff/1.0", timestamp }` | Requester context |
| `trat_sim` | boolean | `true` when BFF-simulated; absent when PingOne-native | Simulation marker |

Claims mirror §3 of `draft-oauth-transaction-tokens-for-agents-00`.

---

## 6. Token Flow

### TraT mode OFF (default — unchanged)

```
Browser → BFF → RFC 8693 exchange → PingOne token (aud: gateway)
       → Gateway RFC 8693 re-exchange → PingOne token (aud: mcp-olb)
       → MCP Server (Bearer)
       → Tool execution
```

### TraT mode ON — PingOne native path (future)

```
Browser → BFF → RFC 8693 exchange + TraT params → PingOne token (aud: gateway, + reqctx/purp/azd/rctx)
       → Gateway RFC 8693 re-exchange → PingOne token (aud: mcp-olb, claims preserved)
       → MCP Server (Bearer with TraT claims)
       → Extract claims → PingOne Authorize decision (TraT context in environment)
       → PERMIT → Tool execution
```

### TraT mode ON — simulation path (current)

```
Browser → BFF → RFC 8693 exchange → PingOne token (aud: gateway)
              + BFF injects X-TraT-Context: { reqctx, purp, azd, rctx, trat_sim: true }
       → Gateway forwards X-TraT-Context header to MCP Server
       → MCP Server (Bearer + X-TraT-Context header)
       → Extract claims from header → PingOne Authorize decision
       → PERMIT → Tool execution
```

---

## 7. Component Changes

### 7.1 BFF — `demo_api_server/services/agentMcpTokenService.js`

When `ff_trat_mode` is on:

1. Build TraT context object from current request: `{ tool, session_id, correlation_id, purp, azd, rctx }`
2. Attempt to pass as extra parameters in the RFC 8693 request body (PingOne native path)
3. After receiving the exchanged token, decode it and check for `reqctx` claim
4. If `reqctx` absent → activate simulation shim: attach `X-TraT-Context` header (JSON-serialised TraT object + `trat_sim: true`) on the outbound call to the gateway
5. Emit a `trat` token event into the existing `tokenEvents` array so Token Chain UI can display it

### 7.2 MCP Gateway — `demo_mcp_gateway/src/proxy.ts`

Single addition: forward `X-TraT-Context` header when present in the inbound request to the upstream WebSocket connection header set. No new logic, no new auth.

### 7.3 MCP Server — `demo_mcp_server/src/`

When `ff_trat_mode` is on (read from env `MCP_TRAT_MODE_ENABLED=true`, set by gateway config):

1. After token validation, extract TraT claims: from bearer JWT first; fall back to `X-TraT-Context` header
2. Build enriched PingOne Authorize payload (additive — existing Authorize call structure unchanged):
   ```json
   {
     "environment": {
       "trat_purp": "banking:mcp:tool_call",
       "trat_azd_act": "<agentClientId>",
       "trat_session_id": "<sessionId>",
       "trat_tool": "<toolName>",
       "trat_sim": true
     }
   }
   ```
3. `PERMIT` → proceed to `BankingToolProvider.executeTool()`
4. `DENY` / `INDETERMINATE` → return JSON-RPC error `{ code: -32403, message: "TraT policy denied" }`

New file: `demo_mcp_server/src/auth/TratClaimsExtractor.ts` — pure function, extracts and normalises claims from either source.

The same Authorize enrichment applies on **both transports**:
- `HttpMCPTransport.ts` — HTTP POST /mcp path
- `MCPMessageHandler.ts` — WebSocket path (existing handler shared by gateway and direct WS clients)

### 7.4 BFF Config Store — `demo_api_server/services/configStore.js`

Add to FIELD_DEFS:
```javascript
ff_trat_mode: { public: true, default: 'false' }
```

---

## 8. PingOne Provisioning

### 8.1 One-off setup script

New file: `demo_api_server/scripts/setupTratClaims.js`

- Uses the PingOne Management API to add custom claim mappings to the MCP Token Exchanger application's token policy
- Claims: `reqctx`, `purp`, `azd`, `rctx` as passthrough mappings from the exchange request context
- Idempotent: checks if claims already exist before writing
- Runnable standalone: `npm run pingone:setup:trat`

Add to `demo_api_server/package.json` scripts:
```json
"pingone:setup:trat": "node scripts/setupTratClaims.js"
```

### 8.2 Bootstrap integration — `demo_api_server/scripts/bootstrapPingOne.js`

- Call `setupTratClaims.js` as a post-provisioning step after the 7 apps + resource servers are created
- Always runs (not flag-gated) — idempotent guard inside `setupTratClaims.js` prevents duplicate writes
- Logs: `[Bootstrap] TraT claims: already provisioned` or `[Bootstrap] TraT claims: provisioned ✅`

---

## 9. Token Chain UI

### 9.1 TraT badge — `demo_api_ui/src/components/TokenChainDisplay.js`

- When a token event has `trat_sim: true`: amber badge reading `TraT (simulated)`
- When claims came from PingOne natively (no `trat_sim`): green badge reading `TraT`
- Badge style matches existing `act` / `may_act` badges

### 9.2 Claims expansion

Clicking the badge expands an inline detail row showing `reqctx`, `purp`, `azd`, `rctx` key-value pairs. Same expand/collapse pattern as the existing `act` claim detail row.

### 9.3 Deep link to education panel

Badge info icon (`ⓘ`) opens `EDU.TRANSACTION_TOKENS` panel via `useEducationUI()`.

---

## 10. Education Panel — `TransactionTokensPanel.js`

**Registry:** `EDU.TRANSACTION_TOKENS = "transaction-tokens"` added to `educationIds.js`

**Registered in:** `EducationPanelsHost.js`

### Tabs

| Tab | Content |
|---|---|
| **What & Why** | Problem statement — replay attacks, context binding, workload identity in multi-hop agent chains. Link to `draft-oauth-transaction-tokens-for-agents-00` on IETF datatracker. |
| **How It Works** | Step-by-step flow diagram: BFF → RFC 8693 + TraT claims → Gateway → MCP Server → Authorize decision. Follows `TokenExchangeDiagram.js` style. |
| **Claims Reference** | Table of `reqctx`, `purp`, `azd`, `rctx`, `trat_sim` — spec field name, type, example value, and role in this demo. |
| **Draft Status** | IETF maturity: individual draft, OAUTH WG. Link to datatracker. Note that PingOne support is pending. Instructions for checking for spec updates. |
| **This Demo** | Explains simulation mode vs native PingOne mode. What `trat_sim: true` means. How to enable `ff_trat_mode`. How to provision PingOne claims (`npm run pingone:setup:trat`). |

---

## 11. Files Touched

| File | Change |
|---|---|
| `demo_api_server/services/configStore.js` | Add `ff_trat_mode` to FIELD_DEFS |
| `demo_api_server/services/agentMcpTokenService.js` | Inject TraT params into RFC 8693 exchange; simulation shim; emit `trat` token event |
| `demo_api_server/scripts/setupTratClaims.js` | New — idempotent PingOne claim provisioning script |
| `demo_api_server/scripts/bootstrapPingOne.js` | Call `setupTratClaims.js` post-provisioning |
| `demo_api_server/package.json` | Add `pingone:setup:trat` script |
| `demo_mcp_gateway/src/proxy.ts` | Forward `X-TraT-Context` header |
| `demo_mcp_server/src/auth/TratClaimsExtractor.ts` | New — extract + normalise TraT claims |
| `demo_mcp_server/src/server/HttpMCPTransport.ts` | Pass TraT context to Authorize payload when flag on |
| `demo_mcp_server/src/server/MCPMessageHandler.ts` | Same — WebSocket path |
| `demo_api_ui/src/components/TokenChainDisplay.js` | TraT badge + claims expansion |
| `demo_api_ui/src/components/TokenChainDisplay.css` | Badge styles |
| `demo_api_ui/src/components/education/educationIds.js` | Add `TRANSACTION_TOKENS` |
| `demo_api_ui/src/components/education/TransactionTokensPanel.js` | New — education panel |
| `demo_api_ui/src/components/education/EducationPanelsHost.js` | Register new panel |

---

## 12. Success Criteria

- `ff_trat_mode=false` (default): zero behaviour change, all existing tests pass
- `ff_trat_mode=true` + simulation: Token Chain shows `TraT (simulated)` amber badge with expanded claims; MCP tool calls proceed (Authorize permits)
- `ff_trat_mode=true` + PingOne native: Token Chain shows `TraT` green badge; `trat_sim` absent from token
- Bootstrap always provisions TraT claims; re-running is idempotent (no duplicate writes, no errors)
- `npm run pingone:setup:trat` runs standalone without error on a provisioned environment
- `TransactionTokensPanel` opens from Token Chain badge info icon and from education nav
- UI build passes (`cd demo_api_ui && npm run build` exit 0)
- No regressions on existing OAuth, HITL, or step-up flows

---

## 13. Draft Spec Notes

**Spec:** `draft-oauth-transaction-tokens-for-agents-00`
**IETF datatracker:** https://datatracker.ietf.org/doc/draft-oauth-transaction-tokens-for-agents/00/
**WG:** OAUTH
**Maturity:** Individual draft (00) — pre-WG adoption as of May 2026

**Key differences between this demo's simulation and the real draft:**
- Real draft: TraT is a distinct token type with its own `token_type` value and a Transaction Token Service (TTS) endpoint
- This demo: TraT claims are embedded in a standard access token issued by PingOne (simulation) or injected via `X-TraT-Context` header (shim)
- Real draft: TraT has a very short lifetime (seconds, not minutes)
- This demo: lifetime matches the access token; `trat_sim: true` marks the difference

**To check for spec updates:** Visit https://datatracker.ietf.org/doc/draft-oauth-transaction-tokens-for-agents/ — the education panel links directly to the datatracker page.
