# Flat Scope Model Redesign — Design

**Date:** 2026-05-17
**Status:** Approved (pending user spec review)
**Author:** Curtis Muir (with Claude)

**Supersedes:** `docs/superpowers/specs/2026-05-16-scope-chain-diagram-design.md`
(the `ai_agent`-removal + scope-chain-diagram spec). That work is now folded in:
`ai_agent` removal is one sub-case of the flattening; the scope-chain diagram
is the final part, drawn against the new model.

## Problem

The codebase carries **23 distinct OAuth scope strings** (full inventory in
the research appendix below) with inconsistent depth (1–4 "parts"), several
dead/never-granted scopes (`ai_agent`, `banking:two-exchange:intermediate`,
`banking:two-exchange:final`), and overlapping meanings
(`banking:accounts:read` vs `banking:read`; `banking:ai:agent` vs
`banking:ai:agent:read` vs `ai_agent`). This is hard to teach, violates the
"only two levels of hierarchy" OAuth norm, and the synthetic intermediate
marker scopes only exist to work around our own resource sprawl.

## Goal

A **minimal, flat (2-part max), least-privilege** scope set with **incremental
up-scoping** and **agent-side scope memory**, aligned with OAuth best practice
and PingOne's resource/scope rules.

## OAuth / PingOne grounding

- `resource:action`, **two levels max** — "only two levels of hierarchy are
  seen in scopes in the wild" (FusionAuth, WorkOS, Google, Auth0).
- `read`/`write` action suffixes; minimal set; least privilege; **incremental
  authorization** (request scopes when the feature needs them; remember what's
  already granted).
- Avoid catch-all `admin` scopes (→ we keep `admin:read` / `admin:write`
  split, not a single `banking:admin`).
- PingOne: cannot mix PingOne-API + custom-resource scopes in one request;
  multiple custom resources in one request require explicit app config or
  PingOne errors *"May not request scopes for multiple custom resources"*
  (this is the real constraint the T-10 marker scopes were working around).
  Reference: https://docs.pingidentity.com/pingone/applications/p1_resource_scopes.html

## Part A — The flat scope set (6 scopes)

All on the **single banking custom resource**. `p1:read:user` /
`p1:update:user` are PingOne-API scopes (Worker app only) and are **out of
scope** — they cannot be mixed with custom scopes anyway.

| Scope | Replaces (merged/deleted) | Meaning |
|---|---|---|
| `banking:read` | `banking:accounts:read`, `banking:transactions:read`, `banking:mortgage:read`, `banking:accounts` | read banking data |
| `banking:write` | `banking:transactions:write` | mutate banking data |
| `banking:sensitive` | `banking:sensitive:read` | full PAN / routing numbers |
| `banking:agent` | `banking:ai:agent`, `banking:ai:agent:read`, `ai_agent`, `banking:agent:invoke`, `banking:mcp:invoke` | delegated-agent identity + MCP/gateway invocation |
| `admin:read` | (kept) | admin list/view/audit/status |
| `admin:write` | `admin:delete`, `users:read`, `users:manage`, `banking:admin` | admin modify/delete/manage users |

**Deleted entirely:** `banking:two-exchange:intermediate`,
`banking:two-exchange:final`, `ai_agent`.

Rationale for the two debated calls (user decisions, 2026-05-17):
- **Admin split kept** (`admin:read` / `admin:write`, not one `banking:admin`):
  honors least-privilege for destructive ops while staying flat 2-part.
- **`banking:agent` is single**: one scope means "this caller is the delegated
  agent AND may invoke MCP/gateway" — drives `clientType` detection, the MCP
  gateway gate, and `query_user_by_email` reachability.

## Part B — Remove intermediate marker scopes

`banking:two-exchange:intermediate` / `:final` exist only as Token-Chain-UI
audience markers; they are never granted. Post-T-10, both RFC 8693 exchanges
already request a single real scope. New behavior: **both exchanges request
`banking:agent`** (single scope, single resource — satisfies PingOne's
no-multiple-custom-resources rule with a real scope, not a synthetic marker).
The Token Chain UI reads the real `aud` from the returned token, not a scope.

## Part C — Incremental up-scoping + agent scope memory

Textbook incremental authorization. Current state: introspection is cached
per-session (`agentMcpTokenService.js`), but **no scope-delta memory exists** —
this is net-new.

**Design — per-session granted-scope ledger (BFF-side):**

- A ledger keyed by session `sub`, held BFF-side (token-custody rule: agent and
  browser never see tokens or the ledger).
- On a tool call needing scope set `S`:
  1. Compute `missing = S \ ledger[sub]`.
  2. If `missing` is empty → reuse cached token for those scopes (no exchange).
  3. Else perform RFC 8693 exchange requesting `missing` (the delta), e.g.
     holding `banking:read`, a `banking:write` tool requests only
     `banking:write`.
  4. Union the returned token's scopes back into `ledger[sub]`.
- **Invalidation:** logout or token expiry — reuse the existing session-token
  expiry signal; no new lifecycle.
- **Correctness independent of the ledger:** a cold/empty ledger simply
  requests the full scope set. The ledger is a pure optimization layer; it can
  never grant access the token doesn't actually carry (enforcement still reads
  real token claims downstream).

## Part D — Scope chain diagram

After Parts A–C land and the system is consistent, add the standalone,
zoomable scope-narrowing diagram (server 1-exchange vs agent 2-exchange) at
`/architecture/scopes`, rendered from a new `scope-chain.mmd` via
`scripts/build-diagrams.sh`, routed in `banking_api_ui/src/App.js` reusing the
`/architecture/overview` zoomable-image pattern. The diagram teaches **token
contents** (not the validation allowlist) and the incremental up-scope ledger.

## Migration — hard cutover + re-provision (user decision)

Demo context: re-bootstrap is one command. Delete old scopes, re-run the
provisioner (idempotent) so PingOne holds only the 6 new scopes. Old tokens
become invalid; users re-login to obtain new-scope tokens. No alias/compat
layer (no transition cruft). `npm run pingone:bootstrap` after deploy.

## Change surface

| File | Change |
|---|---|
| `pingoneProvisionService.js` | Created-scopes arrays (banking ~1214, mcp-server ~1183, gateway, agent-gw, two-ex) → only the 6 new scopes; delete 4-part + `ai_agent`; update all 12 `grantScopesToApplication` scope lists |
| `services/configStore.js` | `mcp_token_exchange_scopes`, `agent_mcp_allowed_scopes`, login grant (~:231), `agent_gateway_cc_scope`, `mcp_gateway_cc_scope`, `two_exchange_*_scope`, `pingone_mcp_token_exchanger_client_scopes` → new names; delete dead `ai_agent_scope`; rewrite `buildAllowedScopesByAudience` allowlist to new set |
| `services/agentMcpTokenService.js` | Exchange scope strings → new names; **add per-session granted-scope ledger** + delta-request logic; both exchanges request `banking:agent` |
| `banking_mcp_server/src/tools/BankingToolRegistry.ts` | Per-tool `requiredScopes` → new names |
| `services/mcpWebSocketClient.js` | `MCP_TOOL_SCOPES` map → new names (`query_user_by_email` → `banking:agent`) |
| `middleware/auth.js` | `clientType==='ai_agent'` derived from `banking:agent`; `requireScopes` unaffected (admin role + `ff_oidc_only_authorize` bypasses preserved) |
| `config/scopes.js` | Rewrite `BANKING_SCOPES` / taxonomy to the 6 scopes; remove `AI_AGENT_IDENTITY` |
| `utils/oauthAuthorizeResource.js` | Drop `\|\| s === 'ai_agent'` (redundant under `startsWith('banking:')`) |
| `banking_mcp_server/openapi/mcp-olb.openapi.json` | `ai_agent` → `banking:agent` (security + x-required-scopes) |
| `scripts/build-diagrams.sh`, `scope-chain.mmd`, `banking_api_ui/src/App.js` | Part D diagram + route |
| `REGRESSION_PLAN.md §4` | Bug Fix Log entry per regression-guard template; note hard-cutover re-provision requirement |

## Verification / success criteria

- `REGRESSION_PLAN.md` §0–1 read first; "what I will not break" stated before
  editing `middleware/auth.js`, `agentMcpTokenService.js`, provisioning.
- Targeted tests pass: `npx jest auth users agentMcpTokenService` + MCP suites.
- `cd banking_mcp_server && npm run build` exits 0; `cd banking_api_ui &&
  npm run build` exits 0.
- Very-thorough re-search: only the 6 new scopes (+ `p1:*`) appear; zero
  `ai_agent`, `banking:*:read` 3-part, `:accounts`, `two-exchange` scopes.
- Fresh `npm run pingone:bootstrap` provisions exactly 6 scopes; full agent
  flow (1-exchange + 2-exchange) works end-to-end; Token Chain shows real
  `aud` and new scope names.
- Ledger: second tool call needing an already-held scope performs **no**
  redundant exchange (observable in `[McpExchangerToken]` logs); cold ledger
  still works (requests full set).
- Diagram: `/architecture/scopes` loads; every scope string matches the 6-set.

## Out of scope

- `p1:read:user` / `p1:update:user` (PingOne-API, Worker-only).
- Any change to the RFC 8693 exchange topology (still 1-exchange and
  2-exchange; only scope strings + ledger change).
- Marketing pages.

## Research appendix — current 23-scope inventory (pre-redesign)

1-part: `ai_agent`.
2-part (11): `banking:read`, `banking:write`, `banking:admin`,
`banking:sensitive`, `banking:accounts`, `admin:read`, `admin:write`,
`admin:delete`, `users:read`, `users:manage`, `banking:ai:agent`.
3-part (8 + 2 P1): `banking:accounts:read`, `banking:transactions:read`,
`banking:transactions:write`, `banking:mortgage:read`,
`banking:ai:agent:read`, `banking:mcp:invoke`, `banking:agent:invoke`,
(`p1:read:user`, `p1:update:user`).
4-part define-only (2): `banking:two-exchange:intermediate`,
`banking:two-exchange:final`.

Agent scope memory: none today beyond per-login introspection cache — the
Part C ledger is net-new.
