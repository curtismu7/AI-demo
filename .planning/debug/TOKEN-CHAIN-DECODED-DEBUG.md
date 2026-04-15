---
status: awaiting_human_verify
trigger: "token-chain-no-decoded-token — decoded JWT payload missing/blank in TokenChainDisplay"
created: 2026-04-14T00:00:00Z
updated: 2026-04-14T12:05:00Z
---

## Current Focus

hypothesis: CONFIRMED — fetchSessionPreview calls wrong endpoint (/api/token-chain instead of /api/tokens/session-preview)
test: Fix fetchSessionPreview to call correct endpoint and use data.tokenEvents directly
expecting: After fix, decoded claims, jwtFullDecode, alg, mayActPresent, educational boxes all render correctly
next_action: Apply one-function fix in TokenChainDisplay.js

## Symptoms

expected: TokenChainDisplay shows decoded JWT payload alongside each token (access_token, id_token, exchange tokens)
actual: Decoded token section is not visible — token chain shows but decoded JWT payload is absent/blank
errors: No JS error. Visual only — decoded section blank/missing
reproduction: Log in → dashboard → trigger agent (FAB) or view token chain panel → expanded entries show no decoded JWT fields
started: Potentially related to Phase 146 scope vocabulary alignment work

## Eliminated

- hypothesis: decodeJwtClaims() broken server-side
  evidence: Code reads fine. Buffer.from(parts[1], 'base64url') → JSON.parse. No changes detected.
  timestamp: 2026-04-14T12:00:00Z

- hypothesis: sanitizeClaims() stripping all fields
  evidence: sanitizeClaims() preserves sub, aud, scope, iss, exp, iat, nbf, may_act, act, etc.
  timestamp: 2026-04-14T12:00:00Z

- hypothesis: live tool-call events (from setTokenEvents) missing claims
  evidence: BankingAgent.js correctly calls tokenChain.setTokenEvents(actionId, tokenEvents) with server-built events.
  timestamp: 2026-04-14T12:00:00Z

## Evidence

- timestamp: 2026-04-14T12:00:00Z
  checked: TokenChainDisplay.js fetchSessionPreview function (line ~1060)
  found: Calls fetch('/api/token-chain', ...) — NOT /api/tokens/session-preview
  implication: Wrong endpoint. /api/token-chain returns tokenChainService in-memory audit events (tokenSub, tokenAct, scopes, audience, issuer, expiry schema). A manual transform builds a claims object from those fields which is incomplete and uses wrong event IDs.

- timestamp: 2026-04-14T12:00:00Z
  checked: tokenChainService.js event schema vs buildTokenEvent() schema
  found: /api/token-chain returns events with {tokenSub, tokenAct, scopes, audience, issuer, expiry}. /api/tokens/session-preview returns events with {id, label, status, alg, claims:{sub,aud,scope,...}, jwtFullDecode, mayActPresent, explanation, rfc}.
  implication: The transformation in fetchSessionPreview produces events missing: alg, jwtFullDecode, mayActPresent, actPresent, audExpected, rfc, explanation. Event IDs don't match 'user-token' so AudienceEduBox/MayActEduBox/ClaimsStrip don't render.

- timestamp: 2026-04-14T12:00:00Z
  checked: /api/tokens/session-preview — buildSessionPreviewTokenEvents(req)
  found: Registered at server.js WITHOUT authenticateToken (pre-auth fallback) so it works for regular user sessions. Returns {tokenEvents:[...]} already in correct format for ClaimsPanel, EventDetail.
  implication: Simply switching the endpoint + using data.tokenEvents directly is the complete fix.

## Resolution

root_cause: fetchSessionPreview in TokenChainDisplay.js calls /api/token-chain (in-memory audit log, wrong schema) instead of /api/tokens/session-preview (session-decoded token chain, correct schema). The manual claims transformation produces an incomplete event object — no alg, no jwtFullDecode, wrong event IDs, missing delegation flags — causing ClaimsPanel, educational boxes, and ClaimsStrip to show nothing.
fix: Change fetchSessionPreview to call /api/tokens/session-preview and use data.tokenEvents directly, removing the manual transformation entirely.
verification:
files_changed:
  - banking_api_ui/src/components/TokenChainDisplay.js
