# Scope Model Redesign (SoT + Hybrid + Per-Server) — Design

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

A **minimal, least-privilege** scope set with a **single committed source of
truth** (no drift), **per-server scope ownership**, **incremental up-scoping**,
and **agent-side scope memory**, aligned with OAuth best practice and PingOne's
resource/scope rules.

## Part 0 — Single Source of Truth (SoT)

**Decision: NOT the vault.** The vault (`vaultLoader.js`) is an encrypted
secrets store: argon2 KEK/DEK, `VAULT_PASSWORD` required at boot, zeroed after
load, **bypassed entirely on Vercel** (the demo's primary deploy target).
Scopes are *public configuration*, not secrets (configStore marks them
`public: true`). Putting scopes in the vault would mean the app can't enumerate
its own scopes without a boot password, scopes vanish on Vercel, and they stop
being git-diffable/reviewable — the opposite of "no drift, documented." The
vault is the wrong, too-heavy tool here (user-confirmed 2026-05-17).

**SoT = `banking_api_server/config/scopes.js` (extended).** This one committed
module is the *only* place a scope string, its description, and its owning
server are written. Everything else **reads from it**, never duplicates it:

```
config/scopes.js   ← THE source of truth (strings + descriptions + owner)
   ├──► configStore  — defaults reference it (no copied strings)
   ├──► pingoneProvisionService — created-scopes + grants read from it
   ├──► middleware/auth, BankingToolRegistry, mcpWebSocketClient — import it
   └──► build step  — generates docs/SCOPES.md FROM it (human reference)
```

A drift test asserts no scope literal exists outside `config/scopes.js`
(grep-based, in CI) so the SoT property is enforced, not merely intended.

## Goal (scope shape)

**Hybrid depth** (user decision 2026-05-17, supersedes the earlier "flat 2-part
only"): 2-part for cross-cutting capabilities; **3-part only where a server or
resource needs its own isolated scope**. Max 3 parts — **never 4**. This gives
each server its own scope where isolation matters (the new requirement) while
keeping the common capabilities flat.

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

## Part A — The hybrid scope set (7 scopes) + per-server ownership

`p1:read:user` / `p1:update:user` are PingOne-API scopes (Worker app only) and
are **out of scope** — they cannot be mixed with custom scopes anyway.

| Scope | Parts | Owning server / resource | Replaces (merged/deleted) | Meaning |
|---|---|---|---|---|
| `banking:read` | 2 | Banking API (BFF data) | `banking:accounts:read`, `banking:transactions:read`, `banking:accounts` | read banking data |
| `banking:write` | 2 | Banking API (BFF data) | `banking:transactions:write` | mutate banking data |
| `banking:sensitive` | 2 | Banking API (BFF data) | `banking:sensitive:read` | full PAN / routing numbers |
| `banking:mortgage:read` | 3 | **Mortgage server (:8082, not in PingOne)** | (kept, 3-part for server isolation) | read mortgage data (Path A api-key swap) |
| `banking:mcp:invoke` | 3 | **MCP gateway + MCP server** | `banking:ai:agent`, `banking:ai:agent:read`, `ai_agent`, `banking:agent:invoke` | invoke MCP tools via gateway |
| `admin:read` | 2 | Admin (PingOne admin app) | (kept) | admin list/view/audit/status |
| `admin:write` | 2 | Admin (PingOne admin app) | `admin:delete`, `users:read`, `users:manage`, `banking:admin` | admin modify/delete/manage users |

**Deleted entirely:** `banking:two-exchange:intermediate`,
`banking:two-exchange:final`, `ai_agent`, and the standalone agent-identity
scope (folded into `banking:mcp:invoke` — see note).

**Per-server ownership** (documented in `config/scopes.js` + generated
`SCOPES.md`; PingAuthorize owns none — it is a policy decision point that
*evaluates* the scopes already on the token, user decision 2026-05-17):

| Server / resource | In PingOne? | Owns |
|---|---|---|
| Banking API (BFF data) | yes (banking resource) | `banking:read`, `banking:write`, `banking:sensitive` |
| Mortgage server (:8082) | no | `banking:mortgage:read` |
| MCP gateway + MCP server | yes (mcp resources) | `banking:mcp:invoke` |
| Admin (PingOne admin app) | yes | `admin:read`, `admin:write` |
| PingAuthorize | no | none — consumes/evaluates the above |

Rationale for the debated calls (user decisions, 2026-05-17):
- **Hybrid depth**: 3-part only where a server needs an isolated scope
  (`banking:mortgage:read`, `banking:mcp:invoke`); 2-part for everything
  cross-cutting. Max 3, never 4.
- **Admin split kept** (`admin:read` / `admin:write`, not one `banking:admin`):
  least-privilege for destructive ops.
- **Agent identity folded into `banking:mcp:invoke`**: the delegated agent is
  exactly "the caller permitted to invoke MCP". `clientType` detection, the MCP
  gateway gate, and `query_user_by_email` reachability all key off
  `banking:mcp:invoke` — no separate identity scope needed.

## Part B — Remove intermediate marker scopes

`banking:two-exchange:intermediate` / `:final` exist only as Token-Chain-UI
audience markers; they are never granted. Post-T-10, both RFC 8693 exchanges
already request a single real scope. New behavior: **both exchanges request
`banking:mcp:invoke`** (single scope, single MCP resource — satisfies PingOne's
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
provisioner (idempotent) so PingOne holds only the new scopes (6 custom scopes
created in PingOne — `banking:mortgage:read` is owned by the non-PingOne
mortgage server but is still defined as a banking-resource scope so the token
can carry it; all 7 are in the SoT). Old tokens become invalid; users re-login.
No alias/compat layer (no transition cruft). `npm run pingone:bootstrap` after
deploy.

## Change surface

| File | Change |
|---|---|
| **`config/scopes.js` (SoT — do this first)** | Rewrite as the authoritative module: the 7 scopes with `{ name, description, owner }`, helper exports (list, by-owner, validation set). Remove `AI_AGENT_IDENTITY` + old taxonomy. Everything below reads from this; no scope literal copied elsewhere. |
| `services/configStore.js` | `mcp_token_exchange_scopes`, `agent_mcp_allowed_scopes`, login grant (~:231), `agent_gateway_cc_scope`, `mcp_gateway_cc_scope`, `two_exchange_*_scope`, `pingone_mcp_token_exchanger_client_scopes` → **derive from `config/scopes.js`** (not literal strings); delete dead `ai_agent_scope`; rewrite `buildAllowedScopesByAudience` from the SoT owner map |
| `pingoneProvisionService.js` | Created-scopes arrays (banking ~1214, mcp-server ~1183, gateway, agent-gw, two-ex) + all 12 `grantScopesToApplication` lists → **read from `config/scopes.js`**; delete 4-part + `ai_agent` |
| `services/agentMcpTokenService.js` | Exchange scope strings from SoT; **add per-session granted-scope ledger** + delta-request logic; both exchanges request `banking:mcp:invoke` |
| `banking_mcp_server/src/tools/BankingToolRegistry.ts` | Per-tool `requiredScopes` → new names (TS side: mirror constants from SoT or a shared JSON the build copies; no hand-typed literals) |
| `services/mcpWebSocketClient.js` | `MCP_TOOL_SCOPES` map → SoT names (`query_user_by_email` → `banking:mcp:invoke`) |
| `middleware/auth.js` | `clientType==='ai_agent'` derived from presence of `banking:mcp:invoke`; `requireScopes` unaffected (admin role + `ff_oidc_only_authorize` bypasses preserved) |
| `utils/oauthAuthorizeResource.js` | Drop `\|\| s === 'ai_agent'` (redundant under `startsWith('banking:')`) |
| `banking_mcp_server/openapi/mcp-olb.openapi.json` | `ai_agent` → `banking:mcp:invoke` (security + x-required-scopes) |
| **`docs/SCOPES.md` + generator** | Build step generates `SCOPES.md` from `config/scopes.js` (scope, parts, owner, description, who-uses-it). Human reference; regenerated, never hand-edited. |
| **drift test (CI)** | Grep-based test asserting no scope literal exists outside `config/scopes.js` (+ generated artifacts) — enforces the SoT property |
| `scripts/build-diagrams.sh`, `scope-chain.mmd`, `banking_api_ui/src/App.js` | Part D diagram + route |
| `REGRESSION_PLAN.md §4` | Bug Fix Log entry per regression-guard template; note hard-cutover re-provision requirement + new SoT invariant in §1 |

## Verification / success criteria

- `REGRESSION_PLAN.md` §0–1 read first; "what I will not break" stated before
  editing `middleware/auth.js`, `agentMcpTokenService.js`, provisioning.
- Targeted tests pass: `npx jest auth users agentMcpTokenService` + MCP suites.
- `cd banking_mcp_server && npm run build` exits 0; `cd banking_api_ui &&
  npm run build` exits 0.
- **SoT enforced:** the drift test passes — no scope literal exists outside
  `config/scopes.js` and its generated artifacts. Changing a scope in
  `config/scopes.js` alone propagates to configStore, provisioner, enforcement,
  and `docs/SCOPES.md`.
- `docs/SCOPES.md` is generated, lists all 7 scopes with parts + owner +
  description, and matches `config/scopes.js` exactly.
- Very-thorough re-search: only the 7 new scopes (+ `p1:*`) appear as literals
  *only inside `config/scopes.js`*; zero `ai_agent`, `banking:*:read` legacy
  3-part (`accounts`/`transactions`), `:accounts`, `two-exchange`,
  `banking:ai:agent*`, `banking:agent:invoke`.
- Fresh `npm run pingone:bootstrap` provisions exactly the 6 PingOne custom
  scopes; full agent flow (1-exchange + 2-exchange) works end-to-end; Token
  Chain shows real `aud` and new scope names.
- Ledger: second tool call needing an already-held scope performs **no**
  redundant exchange (observable in `[McpExchangerToken]` logs); cold ledger
  still works (requests full set).
- Diagram: `/architecture/scopes` loads; every scope string matches the SoT.

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
