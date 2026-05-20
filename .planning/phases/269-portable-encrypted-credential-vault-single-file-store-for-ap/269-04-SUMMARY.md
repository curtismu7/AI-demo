---
phase: 269
plan: 04
subsystem: banking_mcp_gateway/vault
tags: [vault, mcp-gateway, typescript, allowlist, vercel-bypass, security, env-vars]
dependency_graph:
  requires:
    - banking_api_server/lib/vault/index.js (Plan 01 — openVault, error classes)
    - banking_api_server/node_modules/argon2 (transitively, via parent-walk module resolution)
  provides:
    - banking_mcp_gateway/src/vault.ts — loadVaultIntoEnv() async function (TS shim)
    - banking_mcp_gateway/src/index.ts startup wiring — async IIFE awaits vault load before loadConfig
    - banking_mcp_gateway/.env.example documentation for VAULT_PATH + VAULT_PASSWORD
  affects:
    - Plan 05 (setupFresh) — writes VAULT_PATH into banking_api_server/.env; gateway sees it via the run-bank.sh ensure_service_env symlink
tech-stack:
  added: []
  patterns:
    - "TS shim over CommonJS lib via `require()` + `any` cast — minimal diff, no .d.ts file"
    - "Allowlist regex /^(MCP_GW_|PROVIDER_|HELIX_|BFF_INTERNAL_)[A-Z0-9_]+$/ blocks env-var injection (T-269-17)"
    - "Async IIFE wraps entire module body — vault load awaits BEFORE loadConfig/.listen (minimal diff)"
    - "argon2 resolved via parent-walk: banking_mcp_gateway requires '../../banking_api_server/lib/vault'; that module's internal require('argon2') walks UP from banking_api_server/lib/vault → banking_api_server/node_modules/argon2"
    - "Vercel bypass — VERCEL=1 short-circuits before any FS access (T-269-15)"
    - "process.env.VAULT_PASSWORD deleted in finally block immediately after vault.close() (T-269-06)"
    - "Generic err.message only (never err.stack) — no Argon2/KEK/DEK leak via stack-trace (T-269-20)"
key-files:
  created:
    - banking_mcp_gateway/src/vault.ts
    - banking_mcp_gateway/tests/vault.test.ts
  modified:
    - banking_mcp_gateway/src/index.ts (29 line diff — import + IIFE wrap)
    - banking_mcp_gateway/.env.example (added VAULT_PATH/VAULT_PASSWORD section)
decisions:
  - "TS shim approach: `const vaultLib: any = require('../../banking_api_server/lib/vault')` — chose plain `require()` + `any` cast over `import = require()` because it avoids depending on tsconfig's exact `esModuleInterop`/`isolatedModules` settings and keeps the line count low. No .d.ts file added."
  - "Allowlist regex final value: `/^(MCP_GW_|PROVIDER_|HELIX_|BFF_INTERNAL_)[A-Z0-9_]+$/` — matches the threat-model T-269-17 expectation. LD_PRELOAD / NODE_OPTIONS / RANDOM_KEY all blocked by direct test."
  - "Scope: gateway loads MCP_GW_, PROVIDER_, HELIX_, BFF_INTERNAL_ entries only. HELIX_API_KEY stays in the BFF (Plan 03) — no gateway Helix dependency today; HELIX_ prefix is a forward-compatibility hook."
  - "VAULT_PATH propagation: Plan 05 writes VAULT_PATH to banking_api_server/.env; the gateway's .env is a runtime-managed symlink (run-bank.sh's ensure_service_env), so the gateway sees VAULT_PATH automatically. No gateway-side .env write needed in Plan 05."
  - "argon2 NOT added to banking_mcp_gateway/package.json — verified by grep. Native module resolves via banking_api_server/node_modules through Node's parent-directory walk."
  - "Async IIFE wraps entire module body (~30 line diff) — preferred over restructuring index.ts because loadConfig is synchronous and config is referenced throughout the file. The IIFE captures config via closure with zero change to existing function bodies."
metrics:
  duration: "~12 minutes (RED test → GREEN impl → IIFE wiring + smoke tests)"
  tasks_completed: 2
  tests_added: 8
  completed: 2026-05-13
---

# Phase 269 Plan 04: Wire vault into MCP Gateway startup

Wired the Plan 01 vault library into `banking_mcp_gateway/src/index.ts` so the gateway can read its own credentials (MCP_GW_CLIENT_SECRET, BFF_INTERNAL_SECRET, future PROVIDER_*/HELIX_* keys) from `secrets.vault` at startup. Falls back to existing env-var behavior when no vault file is present. Fails fast when a vault file exists but VAULT_PASSWORD is missing — refuses to bind any port.

## TypeScript shim approach used

The vault library at `banking_api_server/lib/vault/` is CommonJS with no `.d.ts` types. The gateway is strict TypeScript (`tsconfig.json` has `"strict": true`). Choices considered:

| Option | Notes | Picked? |
|---|---|---|
| `import vaultLib = require('../../banking_api_server/lib/vault')` (TS-style CJS interop) | Cleanest TypeScript syntax but depends on `esModuleInterop` + the module type detection working through 4 directory levels | No |
| Generate a `.d.ts` for the vault lib | Adds a new file to maintain; the public API is 5 functions + 5 error classes — too much overhead for a 2-task plan | No |
| **`const vaultLib: any = require('../../banking_api_server/lib/vault')` (plain require + any cast)** | One line. Compiles cleanly under `strict: true`. The internal calls (`vaultLib.openVault`, `vault.list()`, `vault.read()`, `vault.close()`) are then `any`-typed but their usage is local to the shim — out of the loadVaultIntoEnv return type. | **Yes** |

The `vaultLib: any` cast is bounded — the only places it's touched are inside `loadVaultIntoEnv` itself. Callers receive a strongly-typed `Promise<VaultLoadResult>` shape and never see `any`.

## Allowlist regex (final value)

```typescript
const DEFAULT_ALLOWED = /^(MCP_GW_|PROVIDER_|HELIX_|BFF_INTERNAL_)[A-Z0-9_]+$/;
```

Verified against the threat model (T-269-17 "Attacker writes a vault with `LD_PRELOAD` or `NODE_OPTIONS` entry"):

| Entry name | Allowed? | Test |
|---|---|---|
| `MCP_GW_CLIENT_SECRET` | ✅ | unit + real-vault test |
| `PROVIDER_OPENAI_KEY` | ✅ | unit + real-vault test |
| `HELIX_API_KEY` | ✅ | unit + real-vault test |
| `BFF_INTERNAL_SECRET` | ✅ | unit |
| `LD_PRELOAD` | ❌ — logger.warn skip | real-vault test asserts `process.env.LD_PRELOAD === undefined` |
| `NODE_OPTIONS` | ❌ — logger.warn skip | unit |
| `RANDOM_KEY` | ❌ — logger.warn skip | real-vault test |
| `mcp_gw_client_secret` (lowercase) | ❌ | unit (regex direct check) |

The vault library's own NAME_RE is `/^[A-Z_][A-Z0-9_]*$/` (uppercase-only), so lowercase entries cannot exist in the vault. The gateway's allowlist is the additional second-tier filter that catches uppercase entries outside the four prefixes.

## Lines changed in banking_mcp_gateway/src/index.ts

```
$ git diff --stat banking_mcp_gateway/src/index.ts
 banking_mcp_gateway/src/index.ts | 30 +++++++++++++++++++++++++++++-
 1 file changed, 29 insertions(+), 1 deletion(-)
```

Within the plan's "approximately 20-25 lines" target — the extra 5 lines are the multi-paragraph doc-comment explaining WHY the IIFE wrap is needed (future-readers benefit). The mechanical diff is:

- 1 new import line: `import { loadVaultIntoEnv } from './vault';`
- 11 lines: the async IIFE opener `(async () => {` + the `await loadVaultIntoEnv()` block + the `try/catch` that exits 1 on failure
- 7 lines of doc-comment explaining the IIFE rationale
- 1 line at the bottom: `})();` closing the IIFE

The existing `let config: GatewayConfig; try { config = loadConfig(); ... }; assertProductionSecrets(config);` block sits inside the IIFE byte-for-byte — no semantic change to that or any later code.

## argon2 dependency invariant

```
$ grep -c '"argon2"' banking_mcp_gateway/package.json
0
```

Confirmed: argon2 is NOT added to `banking_mcp_gateway/package.json`. The native module resolves via Node's parent-directory walk:

```
banking_mcp_gateway/src/vault.ts
  → require('../../banking_api_server/lib/vault')
    → banking_api_server/lib/vault/index.js
      → require('./crypto')
        → banking_api_server/lib/vault/crypto.js
          → require('argon2')
            → Node walks UP from banking_api_server/lib/vault/:
                banking_api_server/lib/vault/node_modules/argon2 (no)
                banking_api_server/lib/node_modules/argon2     (no)
                banking_api_server/node_modules/argon2          ✅ FOUND
```

Verified at runtime — the smoke tests below all loaded the vault successfully, which requires argon2 to deriveKek inside `openVault()`.

## Smoke test transcript (3 scenarios)

### Scenario 1 — no vault file, dev bypass enabled (CI / fresh checkouts default)

```
$ MCP_GW_DEV_BYPASS=true PORT=33305 node dist/index.js
[GW vault] no vault file at /Users/.../secrets.vault — using process.env only
[GatewayServer] TLS enabled — cert: /Users/.../certs/api.ping.demo+2.pem
[GW] banking-mcp-gateway running on 0.0.0.0:33305
[GW] Gateway resource URI: mcp-gw.ping.demo
[GW] mcp-olb backend: ws://localhost:8080 (aud: mcp-server.ping.demo)
[GW] mcp-invest backend: ws://localhost:8081 (aud: mcp-invest.ping.demo)
[GW] RFC 9728 + HTTP MCP ingress — POST /mcp ...
```

✅ Vault loader silently skipped, gateway proceeded to `.listen` unchanged.

### Scenario 2 — vault present, correct password

Built a test vault via Plan 01 lib API:

```
$ node -e "const{createVault}=require('./banking_api_server/lib/vault');(async()=>{const v=await createVault('/tmp/gw-vault-task2.vault','smoke-test-pw');v.set('MCP_GW_CLIENT_SECRET','override-from-vault');await v.save();v.close();})();"
vault built
```

Started gateway pointing at it:

```
$ MCP_GW_DEV_BYPASS=true VAULT_PATH=/tmp/gw-vault-task2.vault VAULT_PASSWORD=smoke-test-pw PORT=33306 node dist/index.js
[GW vault] loaded 1 entries from /tmp/gw-vault-task2.vault
[GW vault] loaded 1 entries into process.env
[GatewayServer] TLS enabled — cert: ...
[GW] banking-mcp-gateway running on 0.0.0.0:33306
[GW] Gateway resource URI: mcp-gw.ping.demo
...
```

✅ "loaded 1 entries" line appeared BEFORE the "running on" line — proves vault load happens before port bind. The double log line (once from `vault.ts`, once from `index.ts` IIFE) is intentional — the inner log confirms the orchestrator ran.

### Scenario 3 — vault present, password missing (fail-fast)

```
$ VAULT_PATH=/tmp/gw-vault-task2.vault PORT=33307 node dist/index.js
[GW vault] secrets.vault exists but VAULT_PASSWORD not set — refusing to start
[GW vault] startup load failed; refusing to start. [GW vault] secrets.vault exists but VAULT_PASSWORD not set — refusing to start
EXITED AS EXPECTED
```

✅ Process exited with code 1 BEFORE any port binding. Both the inner (`vault.ts`) and outer (`index.ts`) error logs fired — gives operators a clear diagnostic.

## Scope decision recap

Per the plan's `<objective>` block, this plan wired the gateway as an **OPTIONAL** consumer with these constraints:

1. ✅ Gateway has NO Helix dependency today — `HELIX_API_KEY` stays in the BFF (Plan 03). The HELIX_ prefix is in the allowlist as a forward-compatibility hook for future gateway tools that may need a Helix key directly.
2. ✅ Gateway DOES read its own credentials (`MCP_GW_CLIENT_SECRET`, `MCP_GW_CLIENT_ID`, `BFF_INTERNAL_SECRET`, etc.) — these are the secrets the prompt wanted out of `.env`.
3. ✅ Future provider keys (`PROVIDER_*` — Anthropic, OpenAI) are recognized via the allowlist regex.

## VAULT_PATH propagation

The gateway reads `VAULT_PATH` from `process.env` — same contract as the BFF (Plan 03). Plan 05 Task 3 will write `VAULT_PATH` into `banking_api_server/.env`. The gateway's `.env` is typically a SYMLINK to `banking_api_server/.env` created at runtime by `run-bank.sh`'s `ensure_service_env()` helper. So writing `VAULT_PATH` to the BFF's `.env` automatically makes it visible to the gateway when `run-bank.sh` boots it.

Plan 05 does NOT need to write to `banking_mcp_gateway/.env` separately. The gateway's `.env.example` is updated HERE so operators understand the contract.

## REGRESSION_PLAN §1 statement

The MCP Gateway is NOT in REGRESSION_PLAN.md §1 protected files. However, minimal-diff discipline still applies per CLAUDE.md "Agent behavior" rule 3 ("Touch only what you must"):

- 0 routes touched, 0 middleware touched
- HTTP server construction, WebSocket server construction, signal handlers: byte-for-byte preserved (now inside the IIFE)
- Existing dev-bypass flow (`MCP_GW_DEV_BYPASS=true`) continues to work — vault load and dev-bypass are independent gates. Vault values override dev-bypass stubs when both are present.
- 55/55 existing gateway tests still pass after the IIFE wrap.

## Acceptance Criteria — Status

### Task 1 (vault.ts + tests + .env.example)

- ✅ `test -f banking_mcp_gateway/src/vault.ts` — present
- ✅ `grep -c "loadVaultIntoEnv" banking_mcp_gateway/src/vault.ts` → 2 (export + doc-comment reference)
- ✅ `grep -c "DEFAULT_ALLOWED\s*=\s*/\^(MCP_GW_|PROVIDER_|HELIX_|BFF_INTERNAL_)" banking_mcp_gateway/src/vault.ts` → 1
- ✅ `grep -c "delete process.env.VAULT_PASSWORD" banking_mcp_gateway/src/vault.ts` → 2 (call + JSDoc reference)
- ✅ `grep -c "err.stack" banking_mcp_gateway/src/vault.ts` → 0 (no stack logging)
- ✅ `grep -cE "VERCEL|isVercel" banking_mcp_gateway/src/vault.ts` → 4 (interface + default + check + log)
- ✅ `grep -c '"argon2"' banking_mcp_gateway/package.json` → 0
- ✅ `cd banking_mcp_gateway && npm run build` → exit 0
- ✅ `npx jest tests/vault.test.ts --bail` → 8/8 tests pass
- ✅ Allowlist test passes — vault entry `LD_PRELOAD='/evil.so'` does NOT set `process.env.LD_PRELOAD`
- ✅ `grep -cE "VAULT_PATH|VAULT_PASSWORD" banking_mcp_gateway/.env.example` → 8 (≥ 2)
- ✅ `grep -cE "symlink|ensure_service_env" banking_mcp_gateway/.env.example` → 3 (≥ 1)

### Task 2 (server.js wiring + smoke tests)

- ✅ `grep -c "loadVaultIntoEnv" banking_mcp_gateway/src/index.ts` → 2 (import + call)
- ✅ `grep -c "from './vault'" banking_mcp_gateway/src/index.ts` → 1
- ✅ `cd banking_mcp_gateway && npm run build` → exit 0
- ✅ `dist/index.js` contains compiled `loadVaultIntoEnv`/`[GW vault]` → 3 hits
- ✅ `cd banking_mcp_gateway && npm test` → 55/55 tests pass
- ✅ Smoke test (no vault, dev-bypass) → "[GW vault] no vault file" + "banking-mcp-gateway running" both logged
- ✅ Smoke test (with vault) → "[GW vault] loaded 1 entries from ..." BEFORE port bind
- ✅ Smoke test (vault but no password) → "[GW vault] secrets.vault exists but VAULT_PASSWORD not set — refusing to start" + process exits 1

## Test Commands

```bash
# Plan 04 new tests (8 tests)
cd banking_mcp_gateway && npx jest tests/vault.test.ts --bail --colors=false

# Full gateway suite (55 tests, all passing)
cd banking_mcp_gateway && npm test

# Build check (must exit 0)
cd banking_mcp_gateway && npm run build

# argon2 dependency invariant (must return 0)
grep -c '"argon2"' banking_mcp_gateway/package.json
```

## Deviations from Plan

**None — plan executed exactly as written.**

One minor adjustment within the plan's stated flexibility:

1. **TypeScript shim style:** the plan offered two options — `import = require(...)` with `// @ts-expect-error`, or `const vaultLib = require(...)` with eslint-disable. Picked the second (plain `require()` with `any` cast) because it compiles cleanly under `tsconfig.strict: true` without depending on the exact `esModuleInterop` mode. Same observable behavior; the plan explicitly listed this as a fallback.

## Commits

| Task | Phase | Hash | Files | Tests |
|-----:|------:|------|-------|------:|
| 1 RED | tests | `e419434d` | 1 created — tests/vault.test.ts (8 cases) | 8 added (failing) |
| 1 GREEN | impl | `cf50487b` | 1 created — src/vault.ts, 1 modified — .env.example, 1 modified — tests/vault.test.ts (TS strict fix) | 8/8 passing; 55/55 full gateway suite |
| 2 | wiring | `2215edfc` | 1 modified — src/index.ts (29-line diff, async IIFE wrap) | 55/55 still passing |

## Self-Check: PASSED

**Files created — verified present:**
- ✅ banking_mcp_gateway/src/vault.ts
- ✅ banking_mcp_gateway/tests/vault.test.ts

**Files modified — verified present in git:**
- ✅ banking_mcp_gateway/src/index.ts (commit 2215edfc)
- ✅ banking_mcp_gateway/.env.example (commit cf50487b)

**Commits — verified in git log:**
- ✅ e419434d — test(269-04): add failing tests for gateway vault loader (RED)
- ✅ cf50487b — feat(269-04): implement banking_mcp_gateway vault loader (GREEN)
- ✅ 2215edfc — feat(269-04): wire loadVaultIntoEnv into gateway startup

**Tests — verified pass at SUMMARY-write time:**
- ✅ 8/8 vault.test.ts (loadVaultIntoEnv behavior)
- ✅ 55/55 full gateway suite (no regressions)
- ✅ `npm run build` exits 0

**Smoke tests — manually executed and logged above:**
- ✅ Scenario 1 (no vault) → silent skip, port binds
- ✅ Scenario 2 (with vault) → entries load, port binds
- ✅ Scenario 3 (no password) → fail-fast exit 1, no port bind
