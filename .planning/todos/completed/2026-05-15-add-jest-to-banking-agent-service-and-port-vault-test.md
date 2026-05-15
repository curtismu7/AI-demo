---
created: 2026-05-15T10:12:14.000Z
title: Add jest to banking_agent_service and port vault.test.ts from the gateway
area: testing
files:
  - banking_agent_service/package.json
  - banking_agent_service/src/vault.ts
  - banking_mcp_gateway/tests/vault.test.ts
---

## Problem

`banking_agent_service` has **no test infrastructure** — no `jest` /
`ts-jest` in `package.json`, no `jest.config.*`, no test files. Its only
verification scripts are `build` (`tsc`) and `typecheck` (`tsc --noEmit`).

The 2026-05-15 change "banking_agent_service made vault-aware" added
`banking_agent_service/src/vault.ts` (a near-verbatim copy of
`banking_mcp_gateway/src/vault.ts`) and wired `loadVaultIntoEnv()` into
`index.ts`. The gateway's equivalent loader is covered by
`banking_mcp_gateway/tests/vault.test.ts`. The agent's copy is **not**
unit-tested — standing up a test runner in a service that has none was
explicitly out of scope for that change (documented in the
REGRESSION_PLAN §4 entry's "Test-infrastructure note").

The agent vault loader was instead verified by: `tsc` build, `tsc --noEmit`
typecheck, a runtime no-vault-fallback smoke, and an inline allowlist-regex
assertion. That is adequate for the no-vault path but leaves the vault-present
paths (open success, open failure fail-fast, allowlist filtering,
VAULT_PASSWORD deletion, Vercel bypass) without a regression net in this
service.

## Solution

1. Add `jest` + `ts-jest` (+ `@types/jest`) to
   `banking_agent_service/package.json` devDependencies and a `test` script,
   matching the gateway's jest/ts-jest config versions for consistency.
2. Add a `jest.config.*` mirroring `banking_mcp_gateway`'s.
3. Port `banking_mcp_gateway/tests/vault.test.ts` to
   `banking_agent_service/tests/vault.test.ts`, adjusting the allowlist
   expectations for the agent's widened regex
   (`/^(AGENT_|MCP_GW_|PROVIDER_|HELIX_|BFF_INTERNAL_)[A-Z0-9_]+$/`):
   - `AGENT_CLIENT_ID` / `AGENT_CLIENT_SECRET` MUST be allowed (the delta
     vs the gateway).
   - `LD_PRELOAD` / `NODE_OPTIONS` / bare-prefix MUST still be rejected
     (T-269-17 injection guard).
   - No-vault-file → transparent no-op fallback; Vercel bypass; vault-open
     failure → throw (caller `process.exit(1)`); `VAULT_PASSWORD` deleted
     after open; `vault.close()` in `finally`.
4. Wire `npm run test:agent-service` into the root test orchestration if the
   repo's root `package.json` aggregates per-service suites.

Cross-reference: REGRESSION_PLAN §1 "Vault Agent startup"; the 2026-05-15
§4 entry which logged this as a follow-up. The shared-test alternative
(one test exercising both gateway and agent copies) was considered and
declined in planning — keep the suites per-service.
