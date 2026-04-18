---
phase: 186
plan: 01
status: complete
---

## Summary: Backend 401 Handler + OIDC Auth + Token Exchange Wiring

### What Was Done

Added the dual-token ID token exchange backend — `performTokenExchangeWithActorIdToken()` method and corresponding route.

### Key Discovery

Significant infrastructure already existed from prior phases:
- `performTokenExchangeFromIdToken()` (single-token, no actor) at oauthService.js:318
- `performTokenExchangeWithActor()` (dual-token, but hardcodes access_token as subject_token_type) at oauthService.js:373
- The actual gap was a method using ID token as subject WITH an actor token

### Files Modified

| File | Change |
|------|--------|
| `banking_api_server/services/oauthService.js` | Added `performTokenExchangeWithActorIdToken()` (~line 421) — uses `subject_token_type: id_token` + `actor_token_type: access_token` |
| `banking_api_server/routes/pingoneTestRoutes.js` | Added `GET /api/pingone-test/exchange-idtoken-agent-to-mcp` route (~line 677), FF-gated by `ff_id_token_exchange` |

### Verification

- `npm run build` → exit 0
- Method confirmed: `grep -n "performTokenExchangeWithActorIdToken" banking_api_server/services/oauthService.js`
- Route confirmed: `grep -n "exchange-idtoken-agent-to-mcp" banking_api_server/routes/pingoneTestRoutes.js`

### Commit

`5649a64` — feat(186): dual ID token + agent CC exchange (Phase 186)
