# Phase 260: Gateway Auth Pipeline Compliance — Architecture Spec

**Gathered:** 2026-05-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Produce the authoritative architecture specification and execution checklist for
fixing the 7 gateway auth pipeline compliance gaps identified after Phase 259.
The spec document is the primary deliverable consumed by Phase 261 (which
implements the code changes).

**This phase is a spec/research phase — no production code changes.**

The 7 gaps span: JSON-RPC error format, required_scopes propagation, may_act
claim on login tokens, TX token details, MCP server second token exchange, HTTP
vs WebSocket gateway divergence, and RFC 9728 scopes_supported.

Gap status at time of planning (some gaps partially addressed in recent branches):
- Gap 1 (JSON-RPC error format): Partially addressed — index.ts has jsonRpcError()
  but HTTP path (GatewayServer.ts) still returns plain JSON
- Gap 2 (required_scopes to UI): Not implemented — BFF maps to generic errors
- Gap 3 (may_act in login): PingOne config gap — authRoutes.js does not request it
- Gap 4 (TX token details): Not implemented — bare RFC 8693 exchange only
- Gap 5 (MCP second token exchange): Not implemented — 2-hop vs 3-hop
- Gap 6 (HTTP vs WebSocket divergence): Partially addressed — toolScopes.ts exists
- Gap 7 (scopes_supported hardcoded): Fixed — toolScopes.ts derives from scopeTopology

</domain>

<decisions>
## Implementation Decisions

### D-01: Scope of Phase 260
Phase 260 produces:
1. `docs/GATEWAY_COMPLIANCE_SPEC.md` — authoritative compliance architecture spec
   covering all 7 gaps with: current state, target state, files to change, wave
   order, acceptance criteria per gap.
2. Updates to `.planning/phases/260-to-fix-these-gaps/260-CONTEXT.md` to reflect
   the true phase scope (this file).
3. ROADMAP.md Phase 260 goal updated to reflect spec-phase purpose.

Phase 261 CONTEXT.md already references `/Users/cmuir/Documents/260-EXECUTION-CHECKLIST.md`
as the Phase 260 deployment guide — this gap must be filled. The spec document
replaces that reference in Phase 261's implementation notes.

### D-02: Gap Prioritization (for spec)
The spec must categorize each gap by:
- **Severity**: High / Medium / Low
- **Type**: Code fix / PingOne config / Architecture decision
- **Wave**: Which Phase 261 wave implements it
- **Status**: Not started / Partial / Complete

Gaps 3 and 5 are **High** severity — prerequisite for the full 3-hop token chain.
Gap 6 (divergence) is **Medium** — teaches HTTP vs WebSocket gateway paths.

### D-03: Canonical Wave Order
The compliance spec must define wave order matching Phase 261's plans:
- Wave 1: Gateway structured denial metadata (Gaps 1, 2, 7)
- Wave 2: Agent service recovery + retry (Gap 2 downstream)
- Wave 3: BFF propagation + login resume (Gap 2 BFF leg)
- Wave 4: UI flow checklist + status strip
- Wave 5: MCP OLB downstream resource token exchange (Gap 5)
- Wave 6: PingOne claim/scope diagnostics (Gap 3)

### D-04: Omit Production Code in Phase 260
Phase 260 does NOT produce production code changes. All code changes are
deferred to Phase 261. Phase 260 only produces:
- The spec document (Markdown, committed to docs/)
- ROADMAP.md goal update
- This CONTEXT.md update

### Claude's Discretion
- Exact filename for the spec document (docs/GATEWAY_COMPLIANCE_SPEC.md is preferred)
- Level of detail in acceptance criteria sections — should be sufficient for Phase 261
  to execute without further research
- Whether to include sequence diagrams in the spec (use ASCII mermaid if helpful)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Gap Analysis (primary input)
- `.planning/phases/260-to-fix-these-gaps/260-GAP-ANALYSIS.md` — 7 gaps with
  severity, files, and current vs expected behavior
- `.planning/phases/260-to-fix-these-gaps/agent-flow-gap-analysis.md` — step-by-step
  flow analysis; 12 agent flow steps with gap annotations

### Phase 261 Context (spec consumer)
- `.planning/phases/261-phase-260-compliance-gateway-denial-metadata-agent-recovery-/261-CONTEXT.md`
  — Phase 261 implementation decisions; the spec must be consistent with D-01 through D-04 here

### Current gateway code
- `demo_mcp_gateway/src/index.ts` — WebSocket path; jsonRpcError() helper
- `demo_mcp_gateway/src/server/GatewayServer.ts` — HTTP path; plain JSON error returns
- `demo_mcp_gateway/src/middleware/authorizeMcpRequest.ts` — HTTP auth middleware
- `demo_mcp_gateway/src/auth/toolScopes.ts` — Per-tool scope map (Gap 7 fixed)
- `demo_mcp_gateway/src/auth/McpTokenExchangeClient.ts` — RFC 8693 exchange (Gap 4)

### Regression guard
- `REGRESSION_PLAN.md` — §1 protected files list; spec must flag any changes to these

</canonical_refs>

<specifics>
## Specific Ideas

- The spec document should include a "Current vs Target" table for each gap so
  Phase 261 planners can verify implementation at a glance
- Wave 5 (MCP OLB downstream resource token exchange) is the most complex — spec
  must include the exact token chain shape: sub: user1, aud: olb-resource, act: agent1
- Gap 3 (may_act) is primarily a PingOne configuration task — the spec should include
  the exact PingOne token policy SPEL expression needed

</specifics>

<deferred>
## Deferred Ideas

- Step 9a (vault integration for invest MCP server) — explicitly out of scope per
  Phase 261 CONTEXT.md
- Full CIBA agent-initiated loop (Step 12/12a) — complex; may become Phase 262+
- mTLS between gateway and MCP servers — architecture discussion only, no implementation

</deferred>
