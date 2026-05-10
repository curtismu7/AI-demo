---
phase: 266
slug: add-api-key-and-id-token-backend-variants-with-dedicated-res
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-10
---

# Phase 266 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 29 (banking_api_server, banking_mcp_server, banking_mcp_gateway, new backend services); React Testing Library for UI components |
| **Config file** | `banking_api_server/jest.config.js`; each TS service has its own `package.json` `"test"` script; root `package.json` orchestrates via `npm test` |
| **Quick run command** | `cd <service> && npx jest --bail` |
| **Full suite command** | `npm test` (from repo root) |
| **Estimated runtime** | ~5–15s per service quick run; full suite ~60–120s |

---

## Sampling Rate

- **After every task commit:** Run `cd <touched_service> && npx jest --bail` (~5–15s)
- **After every plan wave:** Run `cd banking_api_server && npm test` AND `cd banking_api_ui && npm run build` (must exit 0)
- **Before `/gsd-verify-work`:** Full `npm test` from repo root green + `./run-bank.sh status` shows all 9 services up + manual screenshot of 3 distinct result pages
- **Max feedback latency:** 15 seconds per task commit

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 266-01-01 | 01 | 1 | 266-R1 | — | API-key backend accepts `X-API-Key` header and returns identifiable "API-Key Backend" payload | unit | `cd banking_demo_apikey_backend && npx jest --testPathPattern='apiKeyTools'` | ❌ W0 | ⬜ pending |
| 266-01-02 | 01 | 1 | 266-R1 | T-266-01 | API-key backend REJECTS requests missing `X-API-Key` (4xx, no data leak) | unit | same file as 01-01 | ❌ W0 | ⬜ pending |
| 266-02-01 | 02 | 1 | 266-R2 | — | Userinfo backend accepts BOTH access_token AND id_token; renders only ID-token-claim data | unit | `cd banking_demo_userinfo_backend && npx jest --testPathPattern='userInfoTools'` | ❌ W0 | ⬜ pending |
| 266-02-02 | 02 | 1 | 266-R2 | T-266-02 | Userinfo backend REJECTS when either token is missing (4xx) | unit | same file as 02-01 | ❌ W0 | ⬜ pending |
| 266-03-01 | 03 | 2 | 266-R1 | T-266-03 | Gateway swaps OAuth bearer for `X-API-Key` when target=apikey (NO `Authorization` header outbound) | unit | `cd banking_mcp_gateway && npx jest credentialSwap.test` | ❌ W0 | ⬜ pending |
| 266-03-02 | 03 | 2 | 266-R2 | — | Gateway forwards id_token to userinfo backend in JSON-RPC params, not HTTP header | unit | `cd banking_mcp_gateway && npx jest dualToken` | ❌ W0 | ⬜ pending |
| 266-04-01 | 04 | 2 | 266-R1, 266-R2 | T-266-04 | BFF `/api/userinfo-backend/summary` returns decoded claims only (raw JWT never in response body) | integration | `cd banking_api_server && npx jest userInfoResultRoute.regression userInfoResultRoute.integration` | ❌ W0 | ⬜ pending |
| 266-04-02 | 04 | 2 | 266-R1 | — | Heuristic NL routes "show special offers" → `action: 'special_offers'`; "show my profile card" → `action: 'user_profile_card'` | unit | `cd banking_api_server && npx jest nlIntentParser` | ✅ (extends existing) | ⬜ pending |
| 266-05-01 | 05 | 3 | 266-R3 | — | Each of 3 result pages renders a DISTINCT badge string in the DOM | component | `cd banking_api_ui && npx jest ApiKeyResultPage UserInfoResultPage ResourceServerPage` | ❌ W0 | ⬜ pending |
| 266-05-02 | 05 | 3 | 266-R3 | — | No emoji glyphs in new page component source (REGRESSION_PLAN §0) | static | `grep -P '[\x{1F300}-\x{1F6FF}\x{1F900}-\x{1F9FF}]' banking_api_ui/src/components/{ApiKeyResultPage,UserInfoResultPage}.jsx` returns nothing | ✅ CI grep | ⬜ pending |
| 266-06-01 | 06 | 3 | 266-R4 | — | `ArchitectureFlowPage` has no `aspirational:true` on `api-key-backend` node | static | `grep "api-key-backend.*aspirational" banking_api_ui/src/components/ArchitectureFlowPage.js` returns no `true` after edit | ✅ CI grep | ⬜ pending |
| 266-06-02 | 06 | 3 | 266-R4 | — | New `id-token-backend` node exists in INITIAL_NODES | static | `grep "id-token-backend" banking_api_ui/src/components/ArchitectureFlowPage.js` returns ≥ 1 line | ✅ CI grep | ⬜ pending |
| 266-ALL | * | * | all | — | `npm run build` exits 0 from banking_api_ui after every commit | smoke | `cd banking_api_ui && npm run build` | ✅ | ⬜ pending |
| 266-ALL | * | * | all | — | All 9 services (current 7 + 2 new) start cleanly via `./run-bank.sh` | manual smoke | `./run-bank.sh && ./run-bank.sh status` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `banking_demo_apikey_backend/__tests__/apiKeyTools.test.ts` — stubs for 266-R1 (backend contract: accept/reject by `X-API-Key`)
- [ ] `banking_demo_userinfo_backend/__tests__/userInfoTools.test.ts` — stubs for 266-R2 (backend contract: accept/reject by dual-token presence; claim extraction)
- [ ] `banking_mcp_gateway/src/__tests__/credentialSwap.test.ts` — gateway credential-decision matrix (oauth_bearer | api_key | dual_token)
- [ ] `banking_mcp_gateway/src/__tests__/dualToken.test.ts` — gateway forwards id_token in JSON-RPC params
- [ ] `banking_api_server/routes/__tests__/userInfoResultRoute.regression.test.js` — regression-style (mock configStore) verifying no raw id_token leak
- [ ] `banking_api_server/routes/__tests__/userInfoResultRoute.integration.test.js` — integration-style (real configStore, mock data) per CLAUDE.md two-tier pattern
- [ ] `banking_api_ui/src/components/__tests__/ApiKeyResultPage.test.jsx` — badge text + visual identity assertions
- [ ] `banking_api_ui/src/components/__tests__/UserInfoResultPage.test.jsx` — badge text + claim rendering assertions
- [ ] Extend `banking_api_server/services/__tests__/nlIntentParser.test.js` — append cases for `special_offers` and `user_profile_card` actions

*No framework install needed — Jest already present in every target service.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| 3 result pages visually distinct in screenshots | 266-R3 | Visual distinctness is judged by humans; CI grep verifies badge strings but not the actual rendered colour/header layout | Run `./run-bank.sh`, open `/agent`, send prompts: "show my accounts" (blue OAuth page), "show special offers" (amber API-key page), "show my profile card" (teal ID-token page). Confirm all 3 surfaces have visibly different headers/badges/colours. Capture screenshot. |
| Architecture/flow simulation walks through new flows | 266-R4 | Animation timing and step text correctness is reviewed visually | Open `/architecture/flow`, run each of the 3 simulation scenarios (OAuth, API-key swap, dual-token). Confirm new backend nodes are live (not dashed) and new steps appear in the simulation timeline. |
| Sequence diagram includes new divergent steps | 266-R4 | Diagram layout is hand-arranged | Open `/sequence-diagram`, confirm new steps for "credential swap at gateway (API key)" and "id_token forward (userinfo path)" are present and readable. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
