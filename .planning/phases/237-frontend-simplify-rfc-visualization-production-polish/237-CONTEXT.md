---
phase: 237
name: frontend-simplify-rfc-visualization-production-polish
milestone: v1.0
status: planned
---

# Phase 237 — Frontend: Simplify, RFC Visualization, Production Polish

## Why this phase exists

The UI was built rapidly across many phases. It works, but it shows the seams:
- Education panels are 400–620 lines of deeply nested JSX with inline styles
- The two token exchange flows are inconsistently named and visually unclear
- RFC labels in the token chain have no links to the actual specs
- The live JWT hop-by-hop diagram does not clearly show the two-hop exchange structure
- RFC 9728 metadata is not fetched live from the running servers
- Several dead components and backup files (.backup.css) still exist

This phase makes the UI production-ready and fully educational:
**a developer should be able to read the token chain, click an RFC link, and understand exactly what happened.**

## The two token exchange flows (canonical names)

There are exactly two exchange flows in this system:

| Name | subject_token | actor_token | When used |
|---|---|---|---|
| **2-Token Exchange** | `access_token` (user) | agent `client_credentials` token | Standard flow — user already has an access_token |
| **ID Token 2-Token Exchange** | `id_token` (user) | agent `client_credentials` token | OIDC flow — uses identity assertion as subject; enabled via `ff_id_token_exchange` feature flag |

All UI copy, toggle labels, and panel headings must use these exact names.

## Scope

### Plan 01 — Audit & dead-code removal
- Identify and delete unused/backup files (`*.backup.css`, unreferenced components)
- Reduce inline styles to CSS classes (no `style={{ ... }}` blocks in education panels)
- Break oversized components (>300 lines) into focused sub-components where the split is clean
- No behavior changes — audit + cleanup only

### Plan 02 — RFC education panels: links + correct naming
- Every RFC mention gets a clickable link to the official spec:
  - RFC 8693 → https://www.rfc-editor.org/rfc/rfc8693
  - RFC 9728 → https://www.rfc-editor.org/rfc/rfc9728
  - RFC 7521 → https://www.rfc-editor.org/rfc/rfc7521
  - RFC 7636 → https://www.rfc-editor.org/rfc/rfc7636
  - RFC 6749 → https://www.rfc-editor.org/rfc/rfc6749
  - MCP 2025-11-25 → https://spec.modelcontextprotocol.io/specification/2025-11-25/
- Rename all exchange flow labels to canonical names (2-Token / ID Token 2-Token)
- Add decoded JWT payload examples (static, clearly labelled as "example") at each hop:
  - Hop 0: user access_token or id_token
  - Hop 1: GW-scoped delegated token (sub=user, act={sub:agent}, aud=mcp-gw)
  - Hop 2: Backend-scoped token (aud=mcp-olb or mcp-invest)
- RFC 7521 panel: show private_key_jwt assertion structure with field annotations
- MCP handshake panel: show the initialize → notifications/initialized → tools/list → tools/call sequence

### Plan 03 — Token chain: live RFC annotations + hop labels
- `TokenChainDisplay.js`: add RFC badge (e.g. "RFC 8693 §4") at each exchange step, linking to the spec section
- Label each token node with its audience value (e.g. `aud: mcp-gw.bxf.com`)
- Show the `act` claim propagation visually (arrow or annotation between hops)
- The token chain header toggle must use canonical flow names: "2-Token Exchange" / "ID Token 2-Token Exchange"
- Claims panel: highlight `act`, `aud`, `sub` with tooltips explaining the RFC role of each claim

### Plan 04 — RFC 9728 live metadata display
- On the Resource Server page and in the RFC 9728 education panel: fetch live metadata from `/.well-known/oauth-protected-resource` on each running service and render the JSON response
- Show which fields are required vs optional per the spec
- Add an "Audit" button that checks all four services respond correctly (BFF, mcp-server, mcp-gateway, mcp-invest)

### Plan 05 — Build verification + backend integration test
- `npm run build` in `banking_api_ui` → exit 0
- Start backend with `run.sh` (or subset), manually verify:
  - Token chain updates live during agent tool call
  - RFC 9728 live fetch returns real metadata
  - Both exchange flows (2-Token and ID Token 2-Token) render correctly in the token chain
  - All RFC links open correct spec URLs
- Fix any regressions found

## Files likely touched

```
banking_api_ui/src/
  components/education/RFC8693Panel.js
  components/education/TokenExchangePanel.js
  components/education/TokenChainPanel.js
  components/education/RFC9728Content.js
  components/education/enhancedRFC9728Content.js
  components/education/JwtClientAuthPanel.js
  components/education/McpProtocolPanel.js
  components/education/RFCIndexPanel.js
  components/TokenChainDisplay.js
  components/TokenChainDisplay.css
  components/ExchangeModeToggle.js
  components/ExchangeModeToggle.css
  components/ResourceServerPage.jsx  (RFC 9728 live fetch)
  [deleted] components/BankingAgent.backup.css
```

## Definition of done

- [ ] `npm run build` → exit 0
- [ ] Zero `--chase-*` CSS vars (already done in Phase 236)
- [ ] Every RFC mention in UI has a working link to the spec
- [ ] Token chain shows: audience per hop, RFC badge per exchange, `act` claim annotation
- [ ] Two exchange flows named exactly: "2-Token Exchange" and "ID Token 2-Token Exchange"
- [ ] RFC 9728 panel fetches live metadata from at least the BFF endpoint
- [ ] No `.backup.css` or other dead files remain
- [ ] Backend integration test passes (agent tool call → token chain updates)
