---
status: awaiting_human_verify
trigger: "token-chain-no-decoded-display"
created: 2026-04-14T12:05:00Z
updated: 2026-04-14T12:05:00Z
---

## Current Focus

hypothesis: CONFIRMED AND FIXED
test: Build passes (exit 0). Awaiting human verification in browser.
expecting: After fix, session preview shows decoded claims, alg, jwtFullDecode, educational boxes (AudienceEduBox, MayActEduBox, etc.) render correctly on the user-token row.
next_action: User verifies in browser

## Symptoms

expected: Token chain shows decoded JWT payload (sub, aud, scope, exp, may_act, act etc) in the ClaimsPanel / inspector.
actual: Decoded payload/claims section blank or missing — no JWT fields visible.
errors: No JS error; visual only.
reproduction: Log in → dashboard → inspect token chain → claims section empty.
started: Noticed during Phase 146 work session.

## Eliminated

- hypothesis: Server-side JWT decode broken (decodeJwtClaims)
  evidence: Buffer.from(parts[1], 'base64url') → JSON.parse — correct. sanitizeClaims preserves all key claims.
  timestamp: 2026-04-14T12:00:00Z

- hypothesis: Live tool-call events (via setTokenEvents) affected
  evidence: Live path (BankingAgent.js → tokenChain.setTokenEvents) uses server-built events directly — not affected by this bug.
  timestamp: 2026-04-14T12:00:00Z

## Evidence

- timestamp: 2026-04-14T12:00:00Z
  checked: TokenChainDisplay.js fetchSessionPreview (line ~1060)
  found: Called fetch('/api/token-chain') — the in-memory audit log endpoint. Returns {tokenSub, tokenAct, scopes, audience, issuer, expiry} schema. Code manually rebuilt claims from those fields and left out alg, jwtFullDecode, mayActPresent, event IDs matching 'user-token' etc.
  implication: Root cause — ClaimsPanel, educational boxes, and ClaimsStrip all received wrong/empty data.

- timestamp: 2026-04-14T12:00:00Z
  checked: /api/tokens/session-preview (tokenChainService.buildSessionPreviewTokenEvents)
  found: Returns {tokenEvents:[...]} with fully-formed events — correct id ('user-token'), alg, claims (sanitized JWT claims), jwtFullDecode, mayActPresent, mayActValid, rfc, explanation.
  implication: Switching to this endpoint and removing the transformation is the complete fix.

## Resolution

root_cause: fetchSessionPreview called /api/token-chain (audit-log schema) instead of /api/tokens/session-preview (JWT decode schema). Manual transformation produced incomplete events with wrong IDs, missing alg/jwtFullDecode/mayActPresent fields — all causing decoded claims display to be blank.
fix: Changed fetchSessionPreview to GET /api/tokens/session-preview and use data.tokenEvents directly. Removed all manual transformation code.
verification: npm run build → exit 0. Awaiting browser verification.
files_changed:
  - banking_api_ui/src/components/TokenChainDisplay.js
