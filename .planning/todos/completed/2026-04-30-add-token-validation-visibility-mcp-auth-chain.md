---
created: 2026-04-30T10:32:01.536Z
title: Add token validation and visibility at each step in the MCP auth chain
area: auth
files:
  - banking_mcp_server/src/tools/BankingToolProvider.ts:988-1005
  - banking_mcp_server/src/auth/TokenIntrospector.ts
  - banking_mcp_server/src/auth/TokenExchangeService.ts
  - banking_api_ui/src/components/ApiTrafficPanel.js
  - banking_api_ui/src/services/apiTrafficStore.js
---

## Problem

Items 1-8 from AI_SECURITY_BEST_PRACTICES.md are now done, but token validation
is still structural/local-only (base64 decode of JWT payload, no signature
verification). The current `assertTokenClaims()` in BankingToolProvider checks
`exp/iss/aud` via local decode — fast but unsigned, so a tampered token would
pass the check.

The user wants:
1. **Cryptographic token validation** at each step in the MCP auth chain
   (user token → delegated/exchanged token → agent token).
2. **User-visible output** so the demo is educational — every validation step
   should surface in the UI (API Traffic viewer or a dedicated token-validation
   panel) so learners can see what happened.
3. **Token introspection** (PingOne `/as/introspect`) is preferred for at least
   the user token because it's server-authoritative and produces a visible BFF→
   PingOne call. For the exchanged token, secure JWT decoding (signature
   verification using JWKS) is acceptable and would show claim details without
   an extra network round-trip.
4. **SSE** was mentioned as a possible transport for streaming validation events
   to the UI in real time.

## Solution

### Option A — Introspection for user token + JWKS verify for exchanged token
- Call PingOne `/as/introspect` for the session user token before it's used in
  `executeSpecificTool()`. This adds one BFF→PingOne hop that appears in MCP
  Traffic (educational). Cache the introspection result with a short TTL (30s).
- For the RFC 8693 exchanged token: fetch PingOne JWKS from
  `/.well-known/jwks.json`, cache the key set, and verify the token signature
  + `exp`/`iss`/`aud` claims using `jose` or `jsonwebtoken`. Show the decoded
  claims in the API Traffic entry.
- Emit appEventService events for both steps so they appear in the Spinner
  activity feed and MCP Traffic panel.
- (Optional) Add an SSE endpoint (`GET /api/token-validation-stream`) that emits
  NDJSON validation events as they happen, allowing the UI to show a live
  step-by-step validation timeline — good for demos.

### Key files to touch
- `banking_mcp_server/src/auth/TokenIntrospector.ts` — already exists,
  wire it into `BankingToolProvider.executeSpecificTool()` pre-flight.
- `banking_mcp_server/src/tools/BankingToolProvider.ts:assertTokenClaims` —
  upgrade from local decode to full JWKS verification for exchanged token.
- `banking_api_server/routes/mcp.js` or new route — (optional) SSE endpoint.
- `banking_api_ui/src/services/apiTrafficStore.js` — new entry kind
  `token-validation` so validation results render distinctly in the UI.
- `banking_api_ui/src/components/ApiTrafficPanel.js` — render `token-validation`
  rows with claim detail (alg, exp, iss, aud, act) and a PASS/FAIL badge.

### Constraints
- Do NOT add introspection to the hot path without caching — it would add
  200-400ms per tool call in demo.
- Keep the appEventService emission pattern (don't invent new global state).
- Tokens stay server-side; only decoded claims (not raw tokens) go to the UI.
- The educational callout should explain *why* each step matters (OIDC/OAuth
  trust chain, what an attacker could do if skipped).
