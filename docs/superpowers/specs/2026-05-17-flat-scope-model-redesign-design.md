# Scope Model Redesign (SoT + Hybrid + Per-Server, Phased) — Design

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
  exactly "the caller permitted to invoke MCP". This fold is **not safe as a
  bare rename** — `banking:ai:agent:read` is today the load-bearing delegation
  trigger for 1-exchange Path B (verified C3). **P4 redesigns Path A/B and
  `clientType` derivation to key off a stable concept first**; only then (P5)
  does the literal scope get renamed/removed. The "no separate identity scope"
  end state is reached *after* P4 proves no authorization decision flips.

## Delivery model — independently-shippable phases (no big-bang)

A code review (superpowers, 2026-05-17) found the original single-cutover plan
mis-stated the starting point on its highest-risk surfaces. Verified facts:

- **C2 (verified):** `pingoneProvisionService.createScopes` (`:396-424`) only
  GET→reuse→POST. **No scope DELETE path exists.** Re-running bootstrap *adds*
  new scopes alongside old — "PingOne holds only new scopes" is false without
  new reconcile code.
- **C3 (verified):** `banking:ai:agent:read` is the **delegation trigger** for
  1-exchange Path B (`agentMcpTokenService.js:937-999`,
  `DELEGATION_ONLY_SCOPES` `:946`); granted to the user app (`:1402`) and MCP
  server app (`:1625`) so real tokens carry it. Folding/deleting it is a
  load-bearing logic redesign, not a string swap.
- **C1 (verified):** `configStore.js` and `pingoneProvisionService.js` hardcode
  scope literals today; neither imports `config/scopes.js`. The SoT is a
  rewrite + wiring project, not an "extend". Current `config/scopes.js` also
  defines scopes the target deletes (`banking:admin`, `ai_agent`) and is
  consumed by `auth.js`/`transactions.js`/CIBA via `ROUTE_SCOPE_MAP` etc.

Resolution: **phase the work so each phase ships green on its own**, the one
unavoidable cutover is mechanical-only and isolated, and the load-bearing logic
change is verified *before* the cutover.

## Anti-drift: build-time generation, NOT a sync service

Scopes are used across the whole app (configStore, provisioner, setup script,
enforcement, token-chain labels, docs, diagrams, monitoring). The instinct is
"a central service that keeps them in sync." **Rejected as too heavy and
self-defeating:** a runtime sync service is itself a moving part that can
drift, fail, or desync — "a service that keeps things in sync" is deferred
drift with extra steps, plus new infra in a demo.

**The correct weight is build-time generation from the SoT** (industry norm:
codegen from a schema, not a daemon). Nothing "stays in sync" because nothing
is duplicated to begin with:

```
config/scopes.js  ← THE fact (the only place a scope string is written)
   │  generator (build step, CI-enforced by the drift test)
   ├─► configStore defaults + buildAllowedScopesByAudience
   ├─► pingoneProvisionService created-scopes + 12 grant lists
   ├─► setup script (npm run setup:fresh / pingone:bootstrap path)
   ├─► generated scopes.json  → consumed by the 3 TS/JSON artifacts
   ├─► docs/SCOPES.md   (human reference)
   ├─► token-chain scope labels (BFF tokenEvents)
   └─► architecture diagrams + monitoring views (P7/P8/P9)
```

The **CI drift test fails the build** if any of these contains a scope literal
not sourced from the SoT. Drift becomes *structurally impossible*, not
*monitored*. This generator is part of P1 and every consumer is wired to it in
the phase that touches that consumer.

**Definition of done, every phase:** UI/TS builds exit 0; the **full ~20-file
scope test corpus** passes (`src/__tests__` scope/oauth/provision/auth suites),
not just targeted runs; `REGRESSION_PLAN.md` §4 entry; phase success criteria
met; `REGRESSION_PLAN.md` §0–1 read and "what I will not break" stated before
editing any §1 file (`middleware/auth.js`, `agentMcpTokenService.js`,
provisioning).

| Phase | Goal | Ships green alone? |
|---|---|---|
| **P1 — SoT + generator, no renames** | Rewrite `config/scopes.js` to define **all 23 current scopes** as authoritative data (`{name, description, owner, parts}`) + helper exports, preserving `PINGONE_OIDC_DEFAULT_SCOPES_SPACE` (M1) and a migrated `ROUTE_SCOPE_MAP`/`USER_TYPE_SCOPES`. Build the **generator** (build step): emits `scopes.json` + `docs/SCOPES.md` from the SoT. Wire `configStore.js` (scope defaults + `buildAllowedScopesByAudience`), `pingoneProvisionService.js` (created-scopes + 12 grant lists), the **setup script** (`setup:fresh`/`pingone:bootstrap` path), `auth.js`/`transactions.js`, and the **token-chain scope labels** to **read from the SoT/generated artifacts**. Add grep-based CI **drift test** (explicit exclusion list: generated artifacts + named test dirs — I4). **Zero scope-string changes; behavior identical.** | ✅ pure refactor |
| **P2 — provisioner reconcile (dormant)** | Add a scope-reconcile capability to the provisioner: per resource, PUT app grants to the SoT set **first**, then DELETE resource scopes not in the SoT (respecting PingOne "scope in use" ordering). Ships with reconcile list = current 23 → **deletes nothing** (proven inert). | ✅ no-op until P5 |
| **P3 — delete verified-dead scopes** | Remove only the never-granted scopes: `ai_agent`, `banking:two-exchange:intermediate`, `banking:two-exchange:final` (define-only, confirmed). Update SoT; reconcile (P2) now actually prunes them on re-provision. No flatten, no Path A/B change. | ✅ dead-code removal |
| **P4 — Path A/B redesign** | Decouple the 1-exchange delegation trigger from a soon-to-be-renamed scope: redesign `DELEGATION_ONLY_SCOPES` + Path A/B (`agentMcpTokenService.js:934-999`) and `clientType` derivation (`auth.js:31/58/388`, `AI_AGENT_SCOPE`, `configStore ai_agent_scope`) so delegation/identity keys off a stable concept, not the literal `banking:ai:agent:read`. Ships on **current** scope names — pure logic change, fully testable pre-rename. Enumerate every `clientType`/`requireAIAgent`/`requireEndUser` consumer; prove no decision flips (I5). | ✅ logic change, verified |
| **P5 — mechanical rename + cutover** | Flatten 23→7 in the SoT (Part A) + the **three** TS/JSON artifacts (`BankingToolRegistry.ts`, `toolScopeMap.ts`, `mcp-olb.openapi.json`) via a generated checked-in `scopes.json` + build copy + drift test (C5); reconcile `banking:sensitive:read`→`banking:sensitive`. Fix `oauthAuthorizeResource.js` filter to be `banking:`/`admin:` aware (I2). Specify the explicit SoT-owner→audience-env-var map for `buildAllowedScopesByAudience` (I3). **Offline window**: deploy all services in dependency order → `npm run pingone:bootstrap` (reconcile from P2 makes it truthful) → invalidate session store → smoke test. Purely mechanical because P4 de-risked the logic. | ❌ the one accepted cutover |
| **P6 — incremental up-scope ledger** | BFF-side per-session granted-scope ledger keyed by `sub`: request only the missing scope delta, union returned scopes back, invalidate on logout/expiry. Cold ledger = full request (correctness independent — enforcement still reads real token claims). Respects HITL/step-up narrowing and the RFC 8707 single-resource rule (delta must not span resources — assert). | ✅ independent optimization |
| **P7 — scope chain diagram** | Standalone zoomable `/architecture/scopes` from a new `scope-chain.mmd` via `scripts/build-diagrams.sh`, routed in `App.js` (reuse `/architecture/overview` pattern). Teaches token contents (not the allowlist) + the P6 ledger. Drawn against the now-consistent system. | ✅ docs only |
| **P8 — regenerate all diagrams** | Not just the new scope-chain diagram: every architecture diagram that names a scope (`architecture.mmd`, `i4ai-ref-arch.mmd`, `mcp-security-gateway.mmd`, etc.) regenerated so no rendered PNG shows a legacy scope. Scope labels in diagrams sourced from the generated artifact where feasible; otherwise a P8 check greps rendered `.mmd` sources for legacy scope strings and fails if any remain. | ✅ docs only |
| **P9 — monitoring refresh** | Every app under **Monitoring** in the side-nav reflects the new scopes (per-service monitoring views, scope displays, any scope filters/labels). Audit each Monitoring sub-view for hardcoded legacy scope strings; route them through the generated artifact or fix inline. | ✅ UI/docs only |

### The cutover sequence (P5 only — answers "without breaking everything")

A zero-break cutover is impossible (name-based enforcement + old tokens carry
deleted names → every session re-logs in; accepted for a demo). P1–P4 and
P6 carry **no** cutover. P5's window is minimized to:

1. Land P5 code (rename in SoT + 3 TS/JSON artifacts) on a branch; both TS
   packages build 0; full scope corpus green on new names.
2. Confirm P2 reconcile is active (not dormant) for the new SoT set.
3. Brief offline window (no rolling option without the compat alias the user
   rejected).
4. Deploy in dependency order: `banking_api_server` → `banking_mcp_server` +
   `banking_mcp_gateway` (rebuild `dist/`) → `banking_agent_service` →
   `langchain_agent`. Mortgage service has no scope logic (gateway enforces
   `banking:mortgage:read` upstream) — order-independent.
5. `npm run pingone:bootstrap` with P2 reconcile → verify via PingOne API that
   exactly the target set exists per resource, no legacy scope remains (this is
   what makes `SCOPES.md` + P7 diagram truthful).
6. Invalidate the session store (SQLite/Redis/Upstash) — don't wait for natural
   expiry.
7. Smoke: admin→`/admin`; customer→`/dashboard`; one chip → Token Chain shows
   new names + real `aud`; transfer (HITL); `show_mortgage` (api_key path);
   2-exchange path; logs show no "multiple resources" / no
   `missing_exchange_scopes` (the C3 regression signature).
8. Drift test + `SCOPES.md` regen in CI: zero legacy literals outside allowlist.

## Per-phase verification / success criteria

- **P1:** drift test passes; `SCOPES.md` generated & matches `config/scopes.js`;
  full scope corpus green; **a diff proves zero scope-string changes** (P1 is a
  refactor); `buildAllowedScopesByAudience` output byte-identical pre/post.
- **P2:** unit test proves reconcile with list=current deletes nothing; a
  fixture test proves it *would* delete an orphan and re-PUTs grants first.
- **P3:** very-thorough search → zero `ai_agent` / `two-exchange:*`; re-provision
  prunes them; full corpus green.
- **P4:** every `clientType`/`requireAIAgent`/`requireEndUser` consumer
  enumerated with a test asserting no authorization decision flips; 1-exchange
  Path A and Path B both still resolve on current scope names; `MIN_USER_SCOPES_
  FOR_MCP` guard still satisfied (I1).
- **P5:** fresh `npm run pingone:bootstrap` → exactly the target scopes per
  resource, **no legacy scope remains** (PingOne API check); full agent flow
  (1+2 exchange) end-to-end; Token Chain shows new names + real `aud`; both TS
  builds 0; UI build 0.
- **P6:** second call for an already-held scope → **no** redundant exchange
  (`[McpExchangerToken]` logs); cold ledger still works; HITL-narrowed session
  does not over-grant; delta never spans two resources.
- **P7:** `/architecture/scopes` loads; every scope string matches the SoT.
- **P8:** very-thorough grep of every `.mmd` source + rendered diagram asset →
  **zero** legacy scope strings; all diagrams regenerated.
- **P9:** every Monitoring side-nav sub-view audited → zero hardcoded legacy
  scope strings; UI build 0.

### Hard gate — NO legacy scopes (post-P5)

This is a blocking gate, not advisory. After P5 (and re-verified at P8/P9), a
single very-thorough search across the **entire repo** (all 8 services, UI,
docs, diagrams, tests-except-the-named-migration-fixtures) must return **zero**
legacy scope literals: `ai_agent`, `banking:accounts`, `banking:accounts:read`,
`banking:transactions:read`, `banking:transactions:write`,
`banking:ai:agent`, `banking:ai:agent:read`, `banking:agent:invoke`,
`banking:two-exchange:*`, `banking:admin`, `admin:delete`, `users:read`,
`users:manage`, `banking:sensitive:read`. Any hit fails the phase. The CI
drift test encodes this list as the denylist.

### ARCHITECTURE-TRUTHS deliverables

`ARCHITECTURE-TRUTHS.md` gains two entries (added in P1 for the api_key
invariant — it is true today and independent of the scope work; and updated in
P5 with the scopes pointer once the model is final):

1. **api_key disposition (P1):** "Credential disposition
   (api_key/dual_token/oauth_bearer) lives in the **MCP Gateway**
   (`credentialSwap.ts`, `router.ts`). The **MCP server never originates
   backend credentials**. On the api_key path the user OAuth bearer is
   **dropped at the gateway**; the mortgage backend authenticates via
   `X-API-Key` + `X-User-Sub` (Phase 266/267). Moving api_key into the MCP
   server is a security regression (separation of duties; single egress audit
   point)."
2. **Scopes pointer (P5):** a TRUTH line pointing at `config/scopes.js` (SoT)
   + `docs/SCOPES.md` (generated reference) as the authoritative scope source;
   "no scope literal exists outside the SoT + generated artifacts (CI drift
   test enforced)."

## Out of scope

- `p1:read:user` / `p1:update:user` (PingOne-API, Worker-only; cannot mix with
  custom scopes anyway).
- Any change to RFC 8693 exchange **topology** (still 1- and 2-exchange).
- Marketing pages.
- A compat/alias layer (user explicitly rejected; this is why P5 has an offline
  window rather than zero-downtime).

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
