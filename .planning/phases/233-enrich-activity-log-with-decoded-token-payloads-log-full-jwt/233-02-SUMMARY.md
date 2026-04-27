---
plan: 233-02
status: complete
completed_at: 2026-04-26
commit: 4d070f64
---

# Summary — 233-02: Shared JWT Decode Utility

## What was done
- Created `banking_api_server/utils/tokenUtils.js` with two exports:
  - `decodeJwt(token)` — decodes JWT header + claims without signature verification, returns `{ header, claims }` or null; never throws
  - `sanitizePingOneResponse(body)` — strips `access_token`, `id_token`, `refresh_token`, `client_secret` from response objects before logging
- Replaced `decodeJwtClaims` inline logic in `agentMcpTokenService.js` with a call to `decodeJwt` from the shared utility
- Added `decodeJwt` import + enriched `rfc8693-success` logEvent in `agentMcpTokenService.js` with structured `request`, `response`, and `jwtFullDecode` metadata fields
- Enriched LangGraph `llm_invoke` / `llm_complete` logEvents in `bankingAgentLangGraphService.js` with `prompt`, `systemPrompt`, `model`, `toolsAvailable`, and `response` metadata; removed `.slice(0, 120)` truncation

## Files changed
- `banking_api_server/utils/tokenUtils.js` (new)
- `banking_api_server/services/agentMcpTokenService.js`
- `banking_api_server/services/bankingAgentLangGraphService.js`

## Verification
- `node -e "const { decodeJwt, sanitizePingOneResponse } = require('./utils/tokenUtils'); console.log(decodeJwt('a.b.c'));"` → null (invalid JWT handled gracefully)
- `sanitizePingOneResponse` verified strips token fields via node REPL
- Pre-existing circular dependency warning unchanged (not introduced by this plan)
