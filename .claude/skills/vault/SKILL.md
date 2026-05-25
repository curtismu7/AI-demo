---
name: vault
description: >
  USE FOR anything touching the encrypted secrets vault — the AES-256-GCM vault
  library (demo_api_server/lib/vault/), the startup loader (vaultLoader.js),
  admin UI (/api/admin/vault/* routes + AdminVaultPage), vault reads in the MCP
  gateway and agent service, VAULT_PASSWORD env var, vault trust model,
  rotating/adding entries, and the CLI scripts (vault.js, vault-migrate.js).
  DO NOT USE FOR: general configStore patterns (use bff-sessions); PingOne
  credential storage (use pingone-api-calls); OAuth token custody (use
  oauth-pingone).
argument-hint: "Describe the vault operation: startup load, runtime unlock, rotate password, add/read entry, CLI usage, gateway/agent vault, or Vercel behavior."
---

# Vault Skill

Covers the encrypted credential vault introduced in Phase 269. All references
below are repo-relative paths.

---

## 1. Purpose and trust model

The vault exists to store long-lived secrets (API keys, client secrets,
SESSION_SECRET) **encrypted at rest** so they do not appear in plaintext in
`.env`, `git diff`, or `ls -la`. The only auth factor is `VAULT_PASSWORD`.

Key trust properties from the source:

- **No machine-bound keys.** The vault file is portable — it can be copied to
  another host and opened with the same password.
- **KEK/DEK zeroing.** `vault.close()` calls `kek.fill(0)` and `dek.fill(0)`
  on every entry's DEK. This runs unconditionally in every `finally` block, even
  when the read loop throws partway through, because "a leaked-key process is
  worse than a partially-cached one" (vaultLoader.js comment).
- **VAULT_PASSWORD deleted after load.** Both the startup loader and the gateway
  loader call `delete process.env.VAULT_PASSWORD` immediately after
  `vault.close()` to shrink the `/proc/<pid>/environ` leak window (T-269-06).
  The runtime unlock path (`unlockVaultAtRuntime`) deliberately does NOT do this
  because the password came from `req.body`, not from env.
- **Opaque errors.** `VaultAuthError` and `VaultIntegrityError` are thrown with
  the same message (`'vault: open failed (bad password or tampered file)'`) so
  there is no oracle to distinguish wrong password from file tampering.
- **No stack trace logging.** All callers log only `err.message` — never
  `err.stack`, because stack traces expose Argon2/KEK/DEK internal symbol names
  (T-269-20).
- **Vercel bypass.** When `process.env.VERCEL === '1'`, all loaders return early
  without touching the vault. Use Vercel Encrypted Environment Variables instead.

---

## 2. Crypto layer: `demo_api_server/lib/vault/`

| File | Role |
|------|------|
| `demo_api_server/lib/vault/index.js` | Public API: `openVault`, `createVault`, five error classes. Handle methods: `read`, `set`, `delete`, `list`, `rotate`, `save`, `close`. |
| `demo_api_server/lib/vault/crypto.js` | `deriveKek` (Argon2id, m=64MiB t=3 p=4), `aeadSeal` / `aeadOpen` (AES-256-GCM), `hkdfFileHmacKey` (HKDF-SHA256, label `fileHmac/v1`). |
| `demo_api_server/lib/vault/format.js` | On-disk JSON envelope: MAGIC, VERSION, `parseEnvelope`, `computeFileHmac`, `verifyFileHmac`, `canonicalJson`. |
| `demo_api_server/lib/vault/errors.js` | `VaultIntegrityError`, `VaultAuthError`, `VaultNotFoundError`, `VaultEntryNotFoundError`, `VaultPasswordRequiredError`. |
| `demo_api_server/lib/vault/audit.js` | `recordAudit(filePath, {op, key, result, caller})` — append-only NDJSON at `secrets.vault.audit.log`. 4-field allowlist; write failures are non-fatal. |

### Crypto envelope summary

```
secrets.vault (JSON, mode 0o600):
  kdf.alg = argon2id, kdf.salt (base64), memCost=65536, timeCost=3, parallelism=4
  entries.<NAME>:
    wrappedDek   = AES-256-GCM(DEK, KEK)     [12B IV | 16B tag | 32B ct]
    valueIv / valueTag / value = AES-256-GCM(plaintext, DEK)
  fileHmac = HMAC-SHA256(envelope, HKDF(KEK, 'fileHmac/v1'))
```

Atomic save: writes `secrets.vault.tmp`, then renames.

### Entry name constraints

Names must match `/^[A-Z_][A-Z0-9_]*$/`. Values are capped at 64 KiB.

---

## 3. Startup loader: `demo_api_server/services/vaultLoader.js`

### Function: `loadVaultIntoConfigStore(opts?)`

Called from `demo_api_server/server.js` at startup, before `.listen()`.

**Path resolution** (critical — empty-string bug was fixed):
```js
const _envVaultPath = (process.env.VAULT_PATH || '').trim();
const vaultPath = opts.vaultPath ?? (_envVaultPath || DEFAULT_VAULT_PATH);
```
`VAULT_PATH=""` (exported by `run.sh` when unset) was historically treated as a
real path, causing vault to silently not load. The `.trim()` + `||` guards fix
this. `DEFAULT_VAULT_PATH` = `<repo-root>/secrets.vault`.

**Startup sequence:**
1. Vercel bypass → return `{loaded:false, reason:'vercel'}`.
2. No vault file → silent no-op (env-var + configStore values still resolve).
3. Vault file exists + no `VAULT_PASSWORD` → **fail-fast**, throw with
   `err.code = 'VAULT_PASSWORD_MISSING'`. Caller in `server.js` logs `err.message`
   and `process.exit(1)`. Never silently falls through to env-only mode (T-269-14).
4. `vaultLib.openVault(vaultPath, password)` — log only `err.message` on failure.
5. In a `try` block: `for name of vault.list()` → collect into `data[name.toLowerCase()]`.
6. `configStore.setRaw(data, {persist: false})` — values land in the **in-memory
   cache only, never in SQLite**. Restarting without the vault password causes
   them to disappear (the intended security property).
7. `finally`: `vault.close()` (KEK+DEKs zeroed), then `delete process.env.VAULT_PASSWORD`.
8. Sets module-scoped `_unlocked = true` and `_entriesLoaded = entryCount`.

**DI shape** (all overridable for tests):
```js
loadVaultIntoConfigStore({ vaultPath, password, configStore, vaultLib, logger, isVercel })
```

### Function: `unlockVaultAtRuntime(opts?)`

Used by `POST /api/admin/vault/unlock`. Differences from startup loader:
- `password` is **required** — no `process.env.VAULT_PASSWORD` fallback.
- Does **not** check `process.env.VERCEL` (the route handler handles that with 503).
- Does **not** `delete process.env.VAULT_PASSWORD` (password came from `req.body`).
- Otherwise identical: `setRaw(data, {persist:false})`, `vault.close()` in `finally`.

### Exported helpers

| Export | Purpose |
|--------|---------|
| `loadVaultIntoConfigStore(opts?)` | Startup loader |
| `unlockVaultAtRuntime(opts?)` | Runtime unlock (called by admin route) |
| `isVaultUnlockedThisProcess()` | Returns `_unlocked` boolean |
| `vaultEntryCountThisProcess()` | Returns `_entriesLoaded` integer |
| `DEFAULT_VAULT_PATH` | `<repo-root>/secrets.vault` |

---

## 4. Admin routes: `demo_api_server/routes/adminVault.js`

Mounted in `server.js` at:
```js
app.use('/api/admin/vault', authenticateToken, require('./routes/adminVault'));
```
`authenticateToken` runs first — unauthenticated callers get 401 before reaching
this router.

### Vercel bypass (router-level middleware)

All three routes return 503 `{error:'vault_disabled_serverless'}` when
`VERCEL=1`. This runs after `authenticateToken` but before per-handler
`requireAdmin` — no oracle about vault state is exposed.

### Rate limiter on unlock

5 attempts per 5 minutes, keyed by `req.user?.sub || req.ip` (express-rate-limit ^7).

### `GET /api/admin/vault/status`

Auth: `requireAdmin`.
Returns:
```json
{
  "unlocked": true,
  "entriesLoaded": 12,
  "vaultFilePresent": true,
  "vaultPath": "secrets.vault"
}
```
`vaultPath` is `path.basename()` only — never the full path.
`entriesLoaded` is the integer count (not a boolean) so the admin can confirm
"loaded N entries as expected" after unlock/rotate.

### `POST /api/admin/vault/unlock`

Auth: `requireAdmin` + rate limiter.
Body: `{ password: string }`.
Calls `unlockVaultAtRuntime`. On success: `{ok:true, entriesLoaded:N}`.
On bad password or tampered file: 401 with opaque message.
On vault file not found: 404.

### `POST /api/admin/vault/rotate`

Auth: `requireAdmin`.
Body: `{ currentPassword: string, newPassword: string }`.
Validations before calling vault:
- Both fields required (400).
- `newPassword.length >= 12` (400 `weak_password`).
- `currentPassword !== newPassword` (400 `same_password`).
- `isVaultUnlockedThisProcess()` must be true (423 `vault_locked`).
- Module-scoped `rotateInProgress` mutex — concurrent rotate → 409.

Sequence: `openVault(currentPassword)` → `vault.rotate(newPassword)` →
`vault.save()` → `vault.close()` in `finally`.

Response: `{ok:true, message:"Vault password rotated. Update VAULT_PASSWORD before next BFF restart."}`.

### Audit log

Every write operation calls `recordAudit(auditPath, {op, key, caller, result})`.
The 4-field allowlist in `audit.js` physically prevents a password value from
reaching disk. Audit write failures are non-fatal (the primary response still
goes out).

---

## 5. Admin UI: `demo_api_ui/src/components/AdminVaultPage.jsx`

Three sections rendered on the admin vault page:

1. **Status card** — calls `GET /api/admin/vault/status` on mount and on
   demand via a refresh button. Shows locked/unlocked state, entry count,
   vault file presence.
2. **Unlock form** — calls `POST /api/admin/vault/unlock`. On success, clears
   the password field (never retains after success). On failure, keeps it
   populated for retry.
3. **Rotate form** — calls `POST /api/admin/vault/rotate`. Client-side
   validation fires before any request: new/confirm match, minimum length,
   same-as-current check.

All calls go through `apiClient` (cookie auth, traffic logger, spinner) — not
raw `axios` or `fetch`. Passwords are held only in component-local `useState`.
Banner text never echoes typed passwords.

---

## 6. Gateway vault: `demo_mcp_gateway/src/vault.ts`

### Function: `loadVaultIntoEnv(opts?)`

Loads vault entries into `process.env` (not into configStore) **before**
`loadConfig()` runs.

**Allowlist regex** (T-269-17 — blocks `LD_PRELOAD` etc.):
```
/^(MCP_GW_|PROVIDER_|HELIX_|BFF_INTERNAL_)[A-Z0-9_]+$/
```
Non-matching entries are logged via `logger.warn` and skipped.

**Typical keys stored for gateway:**
- `MCP_GW_CLIENT_SECRET`
- `MCP_GW_CLIENT_ID`
- `HELIX_API_KEY`
- `PROVIDER_OPENAI_KEY`
- `BFF_INTERNAL_SECRET`

Vault library accessed via relative require:
`require('../../demo_api_server/lib/vault')` — the gateway must be co-located
with `demo_api_server` or this fails with a self-describing error.

Same VAULT_PASSWORD lifecycle: `delete process.env.VAULT_PASSWORD` after close.
Vercel bypass when `VERCEL=1`.

---

## 7. Agent service vault: `demo_agent_service/src/vault.ts`

Architecturally identical to the gateway vault. Function is also called
`loadVaultIntoEnv`.

**Allowlist regex** (adds `AGENT_` prefix):
```
/^(AGENT_|MCP_GW_|PROVIDER_|HELIX_|BFF_INTERNAL_)[A-Z0-9_]+$/
```

**Typical keys stored for agent service:**
- `AGENT_CLIENT_ID`
- `AGENT_CLIENT_SECRET`
- `MCP_GW_RESOURCE_URI` (matched by `MCP_GW_` prefix)

Same rules: inject before `loadConfig()`, delete `VAULT_PASSWORD` after close,
Vercel bypass, log only `err.message` on failure.

---

## 8. CLI usage (`demo_api_server/scripts/vault.js`)

Run from inside `demo_api_server/`:

| npm script | Action |
|-----------|--------|
| `npm run vault:create` | Create empty `secrets.vault` (fails if file exists) |
| `npm run vault:get <NAME>` | Print decrypted value to stdout (pipe-friendly) |
| `npm run vault:set <NAME>` | Set/overwrite entry (value via stdin or masked TTY prompt) |
| `npm run vault:list` | Print entry names, one per line (never values) |
| `npm run vault:delete <NAME>` | Remove an entry |
| `npm run vault:rotate` | Rotate password (re-wraps all DEKs, value ciphertexts unchanged) |
| `npm run vault:migrate-from-env` | Copy selected env vars from `.env` into vault (one-shot) |

**Password supply priority (all subcommands):**
1. `VAULT_PASSWORD` env var.
2. Masked TTY prompt (`@inquirer/password`, input hidden).
3. Non-TTY without `VAULT_PASSWORD` → fail-fast exit 1.

**Stdout discipline:** `vault:get` and `vault:list` write ONLY their output to
stdout. All banners, warnings, success messages go to stderr. This keeps the
commands pipe-friendly.

**Exit codes:**
| Code | Meaning |
|------|---------|
| 0 | ok |
| 1 | generic error (password missing, file already exists) |
| 2 | `VaultEntryNotFoundError` |
| 3 | `VaultAuthError` / `VaultIntegrityError` |
| 4 | `VaultNotFoundError` |
| 64 | Unknown subcommand |

**Rotate in non-interactive mode:** pass `VAULT_NEW_PASSWORD` env var (the
`--no-browser` / CI path).

### Migration script (`vault-migrate.js`)

```bash
npm run vault:migrate-from-env               # migrate from .env
npm run vault:migrate-from-env -- --dry-run  # preview only
npm run vault:migrate-from-env -- --force    # overwrite existing entries
```

Closed allowlist — only these env var names are considered (never sweeps all
of process.env):
```
HELIX_API_KEY, PINGONE_ADMIN_CLIENT_SECRET, PINGONE_AI_CORE_CLIENT_SECRET,
PINGONE_AI_AGENT_CLIENT_SECRET, PINGONE_MCP_TOKEN_EXCHANGER_CLIENT_SECRET,
MCP_GW_CLIENT_SECRET, MCP_GW_CLIENT_ID, AGENT_CLIENT_ID, AGENT_CLIENT_SECRET,
BFF_INTERNAL_SECRET, CONFIG_ENCRYPTION_KEY, SESSION_SECRET,
PINGONE_USER_CLIENT_SECRET, PINGONE_AUTHORIZE_WORKER_CLIENT_SECRET,
PINGONE_MANAGEMENT_CLIENT_SECRET, PINGONE_MGMT_CLIENT_SECRET,
PINGONE_SESSION_SECRET, PINGONE_INTROSPECTION_CLIENT_SECRET, POSTHOG_API_KEY
```

---

## 9. Vercel behavior

When `process.env.VERCEL === '1'`:
- `loadVaultIntoConfigStore` returns `{loaded:false, reason:'vercel'}` immediately.
- `loadVaultIntoEnv` (gateway + agent) returns `{loaded:false, reason:'vercel'}` immediately.
- `GET/POST /api/admin/vault/*` returns 503 `vault_disabled_serverless`.

Use Vercel Encrypted Environment Variables as the replacement. No vault file,
no `VAULT_PASSWORD`, no admin routes needed on Vercel.

---

## 10. Common mistakes

### ⚠️ `VAULT_PATH=""` treated as a real path

`run.sh` exports `VAULT_PATH=""` when the operator did not set a custom path.
The old code used `process.env.VAULT_PATH ?? DEFAULT_VAULT_PATH` — the `??`
operator only falls through on `null`/`undefined`, so an empty string was
treated as a real path `""`, causing `[vault] no vault file at  — skipping`.
The fix is:
```js
const _envVaultPath = (process.env.VAULT_PATH || '').trim();
const vaultPath = opts.vaultPath ?? (_envVaultPath || DEFAULT_VAULT_PATH);
```
Both loaders (BFF + gateway + agent service) have this fix applied.

### ⚠️ Rotating SESSION_SECRET consequences

`SESSION_SECRET` is in the vault migration allowlist. If you rotate it (change
the value in the vault), **all existing sessions are invalidated** on next
restart. Users will be logged out. Plan this rotation during maintenance.

### ❌ Never log `err.stack` in vault error handlers

Stack traces from Argon2/AES operations expose internal function names (`argon2`,
`deriveKek`, `aeadOpen`, etc.). All catch blocks in vault-related code must use
`logger.error('[vault] failed:', err.message)` — never `err.stack`.

### ❌ Never take vault path from `req.body`

The rotate route explicitly notes: "Vault path is NEVER taken from req.body
(T-269.1-09) — `process.env.VAULT_PATH` or `DEFAULT_VAULT_PATH` only." This
prevents path-traversal attacks on the vault file.

### ⚠️ Rotate requires vault to be unlocked first

`POST /api/admin/vault/rotate` returns 423 `vault_locked` if
`isVaultUnlockedThisProcess()` is false. The operator must unlock via
`POST /api/admin/vault/unlock` first (or set `VAULT_PASSWORD` and restart so
the startup loader unlocks automatically).

### ⚠️ configStore entries from vault are in-memory only

`setRaw(data, {persist: false})` never writes to SQLite/LMDB. If the BFF
restarts without `VAULT_PASSWORD` set, vault-supplied values will be absent
from `configStore.getEffective()` and the BFF will fall back to `.env` values
(or throw if no fallback exists for a required key). This is the intended
security property.

### ⚠️ Gateway requires co-location with `demo_api_server`

`demo_mcp_gateway/src/vault.ts` does:
```js
vaultLib = require('../../demo_api_server/lib/vault');
```
This is a hard relative path from `demo_mcp_gateway/dist/vault.js`. If the
gateway is deployed without `demo_api_server` as a sibling, startup fails with
a self-describing error. The agent service has the identical constraint.

---

## 11. Files to read before editing

| File | When to read |
|------|-------------|
| `demo_api_server/lib/vault/index.js` | Any change to crypto API, handle methods, or error semantics |
| `demo_api_server/lib/vault/crypto.js` | Any change to KDF params or AEAD primitives (FROZEN — version bump required) |
| `demo_api_server/lib/vault/errors.js` | Adding/changing error classes |
| `demo_api_server/lib/vault/audit.js` | Changing audit field set |
| `demo_api_server/services/vaultLoader.js` | Startup load, runtime unlock, `_unlocked` flag |
| `demo_api_server/routes/adminVault.js` | Admin API routes, rate limiter, rotate mutex |
| `demo_api_server/scripts/vault.js` | CLI subcommands |
| `demo_api_server/scripts/vault-migrate.js` | Migration from `.env`, closed allowlist |
| `demo_mcp_gateway/src/vault.ts` | Gateway vault loader, gateway-specific allowlist |
| `demo_agent_service/src/vault.ts` | Agent vault loader, agent-specific allowlist |
| `demo_api_ui/src/components/AdminVaultPage.jsx` | Admin UI |
| `REGRESSION_PLAN.md` §1 | Non-negotiable do-not-break list before editing any listed file |
