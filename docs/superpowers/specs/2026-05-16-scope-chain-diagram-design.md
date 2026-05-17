# Scope Chain Diagram — Design

**Date:** 2026-05-16
**Status:** Approved
**Author:** Curtis Muir (with Claude)

## Problem

The Architecture section has a System Architecture diagram and a Token Exchange
Flow sequence diagram. The sequence diagram mentions scopes inline at various
hops but does not make the *scope narrowing* legible: a viewer cannot easily see
the exact scope set carried by each token and how RFC 8693 token exchange
narrows scopes at every step. There is no diagram dedicated to answering
"what scopes does each token have, and why."

## Goal

Add a standalone, zoomable **scope-narrowing diagram** that places the
**server (1-exchange)** and **agent (2-exchange delegation)** flows side by
side, with every token node labelled with its exact `aud` and scope set, so a
viewer can trace scope narrowing across token exchanges and understand the
RFC 8707 single-resource rule that shapes the 2-exchange path.

## Verified scope data (source of truth)

All scope strings below were extracted from code/config, not approximated.

### Server path — 1-exchange

| Step | Token | aud | Scopes carried | Source |
|---|---|---|---|---|
| Login | User subject token | banking-api | `banking:read banking:write` (subset of login grant) | `configStore.js:231` |
| RFC 8693 exchange | MCP token | `PINGONE_RESOURCE_MCP_SERVER_URI` | `banking:read banking:write banking:mcp:invoke` (default `mcp_token_exchange_scopes`) | `configStore.js:288`; allowlisted at `configStore.js:1141-1145` |
| Tool gate | validated at MCP server | — | per-tool `requiredScopes` (e.g. `banking:read`; `banking:write`; `banking:read banking:sensitive:read`) | `BankingToolRegistry.ts:28,65,103,171` |

### Agent path — 2-exchange delegation

| Step | Token | aud | Scopes carried | Source |
|---|---|---|---|---|
| Subject token | User | agent-gateway | `banking:read banking:write` | `configStore.js:231` |
| Actor CC (Exchange #1 actor) | Agent gateway CC | agent-gateway | `banking:ai:agent` (single CC scope; `agent_gateway_cc_scope`) | `agentMcpTokenService.js` (agent_gateway_cc_scope), allowlisted at `configStore.js:1125-1128` |
| Exchange #1 (RFC 8693) | Agent exchanged token | AI-Agent intermediate | `banking:mcp:invoke` only — RFC 8707 single-resource rule (T-10) | `agentMcpTokenService.js:1687-1689` |
| Exchange #2 (RFC 8693) | MCP/RS token | two-exchange resource server | `banking:read banking:write banking:mcp:invoke`, `act:{sub:agent}` chain preserved | `agentMcpTokenService.js` (final scopes); allowlisted at `configStore.js:1151-1155` |
| Tool gate | validated downstream | — | per-tool `requiredScopes` | `BankingToolRegistry.ts` |

> **Allowlist vs. token contents.** `buildAllowedScopesByAudience()` in
> `configStore.js` defines the RFC 8707 *validation allowlist* (which scopes
> *may* be requested against an audience), NOT what each minted token actually
> carries. The "Scopes carried" column above reflects what each token actually
> carries; the diagram teaches token contents, with the allowlist mentioned
> only as the gate that validates each request.
>
> **`ai_agent` (bare, unprefixed) is excluded.** It appears in the login grant
> string (`configStore.js:231`) and the agent-gateway allowlist
> (`configStore.js:1127`) and is configurable via `ai_agent_scope`
> (`configStore.js:286`), but it is never requested or enforced by
> `agentMcpTokenService.js`. It is treated as a legacy alias / unused scope and
> is NOT taught in the diagram (decision 2026-05-17). Flagged as tech debt to
> remove separately — out of scope for this diagram.

### Key teaching point

Exchange #1 deliberately narrows to a single `banking:mcp:invoke` scope to
satisfy the RFC 8707 single-resource rule (a token-exchange request may not span
scopes from multiple resources). Exchange #2 then re-requests the real tool
scopes against the final resource, while the `act` claim chain
(`act:{sub:agent}`) is preserved end-to-end. The diagram must make both the
narrowing at Exchange #1 and the re-widening at Exchange #2 visually obvious.

## Design

### Components / changes

1. **`scope-chain.mmd`** (new, repo root) — a Mermaid `flowchart` with two
   labelled lanes (Server / Agent). Each token is a node showing its `aud` and
   scope list. Edges are labelled with the governing RFC
   (`RFC 8693`, `RFC 8707 single-resource narrowing`). Per-tool gate shown as a
   terminal node listing representative `requiredScopes`.

2. **`scripts/build-diagrams.sh`** — add one additive `ENTRIES` row:
   `"scope-chain scope-chain.mmd ${OUT_DIR}/scope-chain.png 2800"`.
   The script already copies the `.mmd` next to the PNG so the UI can show
   source; no other change needed.

3. **`banking_api_ui/src/App.js`** — add a `scopes` sub-route under the
   existing `/architecture/*` route block, reusing the same zoomable
   image-viewer pattern already used by `/architecture/overview` (zoom steps,
   open-in-new-tab, scroll/pan container).

4. Render the PNG (`bash scripts/build-diagrams.sh scope-chain`) and run
   `cd banking_api_ui && npm run build` (exit 0).

### Out of scope (YAGNI)

- No new tab in `ArchitectureTabsPanel` — standalone route only (user decision).
- No live/interactive scope highlighting — static rendered PNG, consistent with
  the other architecture diagrams.
- No changes to token-exchange logic — diagram and routing only.

## Verification / success criteria

- `bash scripts/build-diagrams.sh scope-chain` renders `scope-chain.png` with
  zero failures.
- `cd banking_api_ui && npm run build` exits 0.
- `/architecture/scopes` loads the zoomable image and is reachable.
- Every scope string in the rendered diagram matches the verified table above.
- No `REGRESSION_PLAN.md` §1 protected file is modified destructively — the
  `App.js` route addition and `build-diagrams.sh` entry are both additive.
