# 21-01 SUMMARY — Customer Diagrams: Token Exchange Flow + Token Anatomy

**Phase:** 21-customer-diagrams-token-exchange-flow-and-token-anatomy-before-after-exchange
**Plan:** 01 of 01
**Status:** Complete
**Date:** 2026-04-02

---

## What Was Built

Two customer-facing draw.io XML diagram files added to `docs/`:

### 1. `docs/BX-Finance-Token-Exchange-Customer.drawio`
Swim-lane sequence diagram showing the full RFC 8693 delegation flow:
- **5 swim lanes:** User Browser / BFF / AI Agent / MCP Server / Resource Server
- **1-Exchange path:** User login → Subject Token → BFF exchange #1 → MCP Token → Resource Server
- **2-Exchange (delegated chain) path:** Subject Token → AI Agent exchange #1 → Agent Exchanged Token → MCP exchange #2 → MCP Exchanged Token → Resource Server → PAZ validation
- Labeled tokens with key claims (sub, aud, scope, act.sub)
- Color-coded by actor: blue=user, green=BFF/1-exchange, yellow=AI agent, orange=MCP, purple=resource server
- RFC 8693 legend bar at bottom

### 2. `docs/BX-Finance-Token-Anatomy.drawio`
Three side-by-side token anatomy panels:
- **Panel 1 — Subject Token:** sub, aud (bff-client-id), scope, may_act claim. No act chain. Annotation: "Standard OIDC token — no act chain yet"
- **Panel 2 — MCP Token (after Exchange #1):** sub preserved, aud changes to MCP server URL, NEW `act: {sub: bff-client-id}` highlighted in blue/green
- **Panel 3 — Resource Token (after Exchange #2):** sub preserved, aud = resource server, nested `act: {sub: MCP_CLIENT_ID, act: {sub: AI_AGENT_CLIENT_ID}}` highlighted in orange/yellow
- RFC 8693 key legend at bottom explaining color coding

---

## Files Created

| File | Size (approx) | Format |
|------|---------------|--------|
| `docs/BX-Finance-Token-Exchange-Customer.drawio` | ~13KB | draw.io mxGraph XML |
| `docs/BX-Finance-Token-Anatomy.drawio` | ~11KB | draw.io mxGraph XML |

---

## Verification

- `xmllint --noout` — both files pass XML validation
- Both contain `<mxGraphModel>` root element
- Flow diagram: contains "RFC 8693", "MCP Token", "Resource Token", "Subject Token", "PAZ"
- Anatomy diagram: contains "Subject Token", "MCP Token", "Resource Token", "act" claims, nested "act.act"
- Claim values consistent with `docs/PINGONE_MAY_ACT_TWO_TOKEN_EXCHANGES.md` (user-id-12345, MCP_CLIENT_ID, AI_AGENT_CLIENT_ID)

---

## Must-Haves Met

- [x] BX-Finance-Token-Exchange-Customer.drawio exists as valid draw.io XML
- [x] BX-Finance-Token-Anatomy.drawio exists as valid draw.io XML
- [x] Flow diagram shows 1-exchange and 2-exchange delegated act chain
- [x] Anatomy diagram shows claims at each stage with progressive act chain build-up
- [x] Consistent with PINGONE_MAY_ACT_TWO_TOKEN_EXCHANGES.md claim structure

---

## Commit

`git add docs/BX-Finance-Token-Exchange-Customer.drawio docs/BX-Finance-Token-Anatomy.drawio`
