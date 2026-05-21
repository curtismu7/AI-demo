---
name: skip-proof-pipeline-tests
description: 'Skip-proof, single-source-of-truth e2e testing for the Super Banking chip → routing → MCP pipeline. USE FOR: add/modify a banking chip and prove every chip still routes (heuristic vs Helix vs Helix-fallback) and runs the full RFC 8693 → Authorize → gateway pipeline without silently skipping a leg; write or edit all-chips-pipeline.real.spec.js / chipPipeline.js / extractChips.js; debug a chip test that false-passes; understand why a pipeline test must hard-fail (401) instead of skipping. DO NOT USE FOR: chip UI/rendering (use banking-api-ui — BankingChips.jsx); routing heuristic vs LLM internals (use banking-agent-service / langchain-agent); RFC 8693 / Authorize semantics (use oauth-pingone); gateway routing (use banking-mcp-gateway); generic Playwright setup (use webapp-testing); REGRESSION_PLAN discipline (use regression-guard).'
argument-hint: 'Describe the chip/pipeline test change or false-pass to debug'
---

# Skip-proof pipeline tests (narrow scope)

The chip test harness proves a non-obvious property: **every chip routes correctly
AND drives the full RFC 8693 → Authorize → gateway → MCP pipeline, with no leg
silently skipped or false-passed.** It is deliberately built to *fail loudly*
rather than skip. Naive edits re-introduce false passes — this skill encodes the traps.

Anything beyond this harness defers:
- Chip definitions / rendering → [banking-api-ui](../banking-api-ui/SKILL.md) (`BankingChips.jsx`)
- Heuristic vs LLM routing → [banking-agent-service](../banking-agent-service/SKILL.md)
- RFC 8693 / Authorize → [oauth-pingone](../oauth-pingone/SKILL.md)
- Gateway routing → [banking-mcp-gateway](../banking-mcp-gateway/SKILL.md)
- Protected-file discipline → [regression-guard](../regression-guard/SKILL.md)

## The three files

| File | Role | Don't |
|---|---|---|
| `banking_api_server/scripts/extractChips.js` | Single source of truth — regex-parses `HEURISTIC_CHIPS`/`LLM_CHIPS` out of `BankingChips.jsx` (JSX, not require-able) | Hand-maintain a chip list in the test. Tests must drift-fail with the UI. |
| `banking_api_ui/tests/e2e/helpers/chipPipeline.js` | `runChip` (customer-scoped: tokenEvents + token-chain growth) + `assertAdminPipelineEvents` (admin-scoped: Authorize + gateway categories) | Assert pipeline legs from the customer context — customer can't see Authorize/gateway events. |
| `banking_api_ui/tests/e2e/all-chips-pipeline.real.spec.js` | 3 conditions × all chips, dual-session (customer + admin), real login, real Helix | Collapse to one session or one condition. |

Run: `cd banking_api_server && npm run test:chips` (extractor + integration), or the
real e2e spec via Playwright with `E2E_CUSTOMER_*` + `E2E_ADMIN_*` set.

## The five traps (each is a real false-pass)

1. **Heuristic floor false-pass.** The heuristic runs *first by design*. If Helix is
   unconfigured, the router falls back to heuristic and a "Helix-only" condition
   passes without Helix doing anything. Mitigation: a **hard gate** that probes Helix
   with a phrase the heuristic cannot resolve ("capital of France?") and asserts
   `source === 'helix'` *before* the condition body. Never weaken this to a skip.
2. **Helix is NOT vault-sourced.** Helix creds come from configStore /
   `HELIX_API_KEY` / `LLM2.json` / builtin — not the vault. A green local run can
   red in CI purely from missing Helix config. The hard gate's failure message must
   say this verbatim.
3. **Skip = pass is the bug.** `test.skip` on missing env is correct for *opt-in*;
   but the no-token negative test must assert **401 `unauthenticated`** — proving the
   pipeline was *never entered*. 403 (Authorize DENY) or 428 (consent) still mean the
   pipeline ran; only 401 proves hard-fail-before-exchange.
4. **APIRequestContext TLS.** `ctx.request` is a separate Node TLS client that does
   *not* trust the mkcert CA even though Chromium does. Scope `ignoreHTTPSErrors:true`
   to this spec only — never globally (production/Vercel targets need strict TLS).
5. **afterAll must always restore.** Condition 3 points `helix_base_url` at a dead
   URL. Restore in `afterAll` with `.catch(()=>{})` so a thrown assertion still
   restores config — otherwise the next run's Condition 2 false-fails.

## Skip-proof assertion contract (`runChip`)

A chip "executed" only when `result.kind === 'banking'`. When it did:
- `tokenEvents` contains an RFC 8693 exchange event (`claims.act` OR label matches
  `/exchang|mcp.*token|delegat/i`) — proves token exchange ran.
- `token-chain` grew **and** `mcpToolCallsChain` count increased — proves the BFF
  drove the pipeline, not a canned reply.
- `mcp/tool` status `!== 401` (we are logged in; 401 here is a real bug).
- Admin context independently sees `authorize` + (`gateway_path`|`mcp`) event
  categories in the chip's time window (`since` bound).

## When adding a chip

1. Add it to `BankingChips.jsx` only — extractor picks it up automatically.
2. If it maps to a tool, add the `action → tool` entry in `chipPipeline.js`
   `toolByAction`. A missing mapping is treated as intentionally non-pipeline
   (web_search/logout/education) — confirm that's what you want, don't leave it implicit.
3. Run `npm run test:chips`; then the real spec for the 3 routing conditions.
4. Bug fix? Add a `REGRESSION_PLAN.md` §4 entry (use [regression-guard](../regression-guard/SKILL.md)).
