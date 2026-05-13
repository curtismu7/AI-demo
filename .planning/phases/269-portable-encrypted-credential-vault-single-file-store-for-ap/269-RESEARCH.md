# Phase 269: Portable encrypted credential vault — Research

**Researched:** 2026-05-13
**Domain:** Application-layer secrets storage, password-based authenticated encryption, Node 20+ CLI tooling
**Confidence:** HIGH on crypto primitives + format; MEDIUM on consumer wiring (depends on follow-up decisions in discuss-phase)

## Summary

The phase asks for a portable, password-decrypted, single-file credential store with AEAD + integrity protection and per-entry sealing. The most defensible design for this codebase is a **JSON envelope with Argon2id KEK + a per-entry AES-256-GCM-wrapped DEK**, written to `secrets.vault` at repo root, owned by a small Node CommonJS CLI shipped in `banking_api_server/scripts/vault.js` and a `lib/vault.js` library shared via `require()`.

This design (a) reuses crypto primitives the BFF already runs on (`node:crypto` AES-256-GCM, used today in `configStore.js`), (b) lets per-entry sealing genuinely be per-entry — adding a new key writes one new entry, no global re-encryption — and (c) keeps the password out of `process.env` so it can be supplied interactively or piped from `VAULT_PASSWORD` in CI.

**Primary recommendation:** AES-256-GCM (native `node:crypto`, no new heavy dependency), Argon2id KDF via the `argon2` npm package (v0.44.0, Aug 2025), 4-byte magic + 1-byte version file header, per-entry GCM-wrapped DEK design, vault path = repo-root `secrets.vault` with `VAULT_PATH` env override, CLI invoked via `npm run vault:get|set|rotate|list|delete`, forgotten-password recovery = re-provision (documented, no backdoor), append-only `vault.audit.log` next to the vault (plaintext metadata only — never values).

The phase's only consumer wired today is the BFF (`banking_api_server` reads `HELIX_API_KEY` via `helixAgentKeyLoader.js` + `configStore.helix_api_key` env fallback). The roadmap aspiration "MCP Gateway reads AI keys from the vault" is **not implemented today** — the gateway currently only handles OAuth bearer / API-key / dual-token credential paths via `credentialSwap.ts` and has no Helix dependency. Discuss-phase should confirm whether Phase 269 actually wires the gateway or only the BFF.

## User Constraints (from CONTEXT.md)

No CONTEXT.md exists at the time of research. The phase prompt itself provides the constraint frame: pick cipher, KDF parameters, file format, vault location, CLI shape, recovery procedure, audit trail. Locked decisions will be captured by `/gsd-discuss-phase` before planning.

## Project Constraints (from CLAUDE.md)

These directives bind every plan in this phase:

1. **Token custody:** the BFF is the sole token custodian. The SPA must never see vault contents or the vault password. Any UI exposure goes through a BFF route — never a direct file read from the browser. (CLAUDE.md "Token custody rule" + REGRESSION_PLAN §1.)
2. **Quote secrets in `.env`:** `VAULT_PASSWORD` env override, if used in CI, must be quoted in `.env`/`.env.example` examples because `~`, `.`, `-` break shell parsing (CLAUDE.md "Environment Variable Best Practices").
3. **Module systems:** `banking_api_server` is CommonJS (`require`/`module.exports`); the vault library MUST be CJS so it can be `require()`'d from existing routes without a build step. If the MCP Gateway later consumes it, that's TypeScript — re-export a typed wrapper there.
4. **Emoji rule:** only `⚠️`, `✅`, `❌`. CLI output and audit-log entries must follow this.
5. **Read REGRESSION_PLAN §1 before editing protected files.** The vault touches `configStore.js`'s precedence chain — that's a §1 protected file (row: "Config UI / configStore"). State what you will not break.
6. **Minimal diff.** A vault library that's 200 lines and a CLI that's 150 lines beats a 1000-line "vault management subsystem."
7. **UI build gate.** If any vault touch leaks into `banking_api_ui/`, `cd banking_api_ui && npm run build` must exit 0 (CLAUDE.md non-negotiable §3). Recommended approach: keep the vault entirely server-side and never expose its contents to the UI.

## Phase Requirements

No requirement IDs were assigned in `.planning/REQUIREMENTS.md` for Phase 269. The 13 research questions in the orchestrator prompt are the de-facto requirement set; they will be lifted into PLAN.md as REQ-VAULT-01 through REQ-VAULT-13 by the planner. Suggested mapping:

| Suggested ID | Description | Research Support |
|---|---|---|
| REQ-VAULT-01 | Cipher choice + justification | "Cipher choice (AES-256-GCM)" |
| REQ-VAULT-02 | KDF + parameters | "KDF: Argon2id" |
| REQ-VAULT-03 | File format / envelope | "File format" |
| REQ-VAULT-04 | Vault location + discovery | "Vault location & extension" |
| REQ-VAULT-05 | CLI shape (get/set/list/rotate/delete) | "CLI shape" |
| REQ-VAULT-06 | Forgotten-password recovery procedure | "Recovery procedure" |
| REQ-VAULT-07 | Audit trail format | "Audit trail" |
| REQ-VAULT-08 | MCP Gateway integration | "Consumer wiring — gateway" |
| REQ-VAULT-09 | BFF integration | "Consumer wiring — BFF" |
| REQ-VAULT-10 | CI / non-interactive password handling | "Non-interactive password supply" |
| REQ-VAULT-11 | Vercel / serverless treatment | "Serverless treatment" |
| REQ-VAULT-12 | Test strategy | "Test strategy" + Validation Architecture |
| REQ-VAULT-13 | Validation Architecture (Nyquist) | Validation Architecture section |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---|---|---|---|
| `node:crypto` (built-in) | Node 20+/24 | AEAD via `createCipheriv('aes-256-gcm', ...)`, `randomBytes`, `timingSafeEqual` | Already used by `configStore.js` at lines 320/336. No new dep. `node:crypto` ciphers list confirms `aes-256-gcm` and `chacha20-poly1305` are available on Node 20+/24. [VERIFIED: `node -e "require('crypto').getCiphers()"` returns both on the dev machine (Node v24.3.0).] |
| `argon2` (npm) | 0.44.0 (published 2025-08-10) | Argon2id KDF. Default algo is `argon2id`. Native node-gyp binding wraps the reference C implementation. | Most-used Argon2 binding in the Node ecosystem; the only one with a current node-gyp build chain for Node 20/22/24. [VERIFIED: `npm view argon2 version` = `0.44.0`, modified 2025-08-10.] [CITED: github.com/ranisalt/node-argon2] |
| `commander` (npm) | 14.x | CLI argument parsing for `npm run vault:get|set|rotate|list|delete` | Already a pattern in this repo's scripts (e.g. `scripts/setupFresh.js` uses inline argv parsing today; commander is the idiomatic upgrade for a multi-subcommand tool). Tiny dep, no native bits. [ASSUMED: version 14.x — verify at install with `npm view commander version`.] |

### Supporting

| Library | Version | Purpose | When to Use |
|---|---|---|---|
| `@inquirer/password` (npm) | 5.0.13 | Interactive TTY password prompt (no echo, double-confirm on set) | When CLI runs interactively and `VAULT_PASSWORD` env var is absent. Replaces hand-rolled `readline` with terminal-mode dance. [VERIFIED: `npm view @inquirer/password version` = `5.0.13`.] |
| `node:fs/promises` (built-in) | Node 20+ | Atomic vault writes (`writeFile` → `rename`) | All vault mutations. Use `fs.writeFile(tmp, …); fs.rename(tmp, final)` to avoid partial-write corruption — matches the `store.js` `_atomicWrite` pattern this repo already uses. |
| Existing `jest` 29.7.0 | already installed | Unit tests for vault library | Same Jest version is in both `banking_api_server` and `banking_mcp_gateway` — no new test framework needed. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|---|---|---|
| AES-256-GCM | XChaCha20-Poly1305 | XChaCha20-Poly1305 has a 24-byte nonce vs GCM's 12 bytes, eliminating practical nonce-reuse risk under random-nonce regimes for very long-lived keys. **But** Node's built-in `chacha20-poly1305` is the 12-byte-nonce IETF variant, not XChaCha20 — to get XChaCha20 you need a library (`@noble/ciphers` 2.2.0, `libsodium-wrappers`, etc.). For a per-entry-fresh-DEK design like the one recommended here, GCM's 12-byte nonce is comfortably safe (each entry generates a fresh random IV; we never approach the 2³² safe-nonce limit per key because we use a fresh DEK per entry). GCM wins on **zero new dependencies** and **alignment with existing `configStore.js` code**. [VERIFIED: `getCiphers()` shows `chacha20-poly1305` (IETF, 12-byte nonce) only.] [CITED: nodejs.org/api/crypto.html#class-cipher] |
| `argon2` (node-gyp) | `@node-rs/argon2` 2.0.2 (Rust/N-API binding, no node-gyp) | `@node-rs/argon2` avoids the node-gyp build dance — useful on machines without Xcode CLT / Python. But it's smaller-community and lags behind `argon2` on parameter additions. **Recommend `argon2` (0.44.0) as primary**, with a documented `@node-rs/argon2` swap if any user can't build node-gyp. |
| Argon2id | `node:crypto.scryptSync` | scrypt is in core, no new dep. **But** Argon2id is the OWASP-recommended modern KDF for password hashing and the only one with side-channel-resistant tuning across memory + time + parallelism. The phase prompt explicitly mentions Argon2id. scrypt is acceptable only as a documented fallback for environments where `argon2` cannot install (CI with read-only `/tmp`, etc.). [CITED: cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html] |
| JSON envelope | Custom binary format | Binary is ~30% smaller but breaks `git diff`, breaks `cat`, breaks the "accidentally committed survives because encrypted at rest" property the prompt wants — a JSON file with base64 ciphertexts is human-grep-able for its **structure** (you can see "yes there are 4 entries") without revealing **contents**. The phase prompt's "single-file store ... portable across machines" demands maximum tooling compatibility; JSON wins. |
| Per-entry DEK wrapping | Single global key → one big AEAD blob | "Per-entry sealing" in the prompt rules out single-blob designs: adding a new entry must not require re-encrypting existing entries. Per-entry DEK design satisfies this naturally — each entry's DEK is independently wrapped by the master KEK. |

**Installation:**

```bash
cd banking_api_server
npm install --save argon2@^0.44.0 commander@^14.0.0 @inquirer/password@^5.0.0
```

**Version verification:**

- `argon2` `0.44.0` — verified 2026-05-13 via `npm view argon2 version`. Last published 2025-08-10. License MIT. Provenance signed.
- `commander` `14.x` — assumed latest; verify with `npm view commander version` before install.
- `@inquirer/password` `5.0.13` — verified 2026-05-13 via `npm view @inquirer/password version`.

## Architecture Patterns

### Recommended Project Structure

```
banking_api_server/
├── lib/
│   └── vault/
│       ├── index.js          # public API: openVault, readEntry, writeEntry, listEntries, rotatePassword
│       ├── format.js         # parse/serialize the on-disk JSON envelope
│       ├── crypto.js         # AES-256-GCM wrap/unwrap helpers + Argon2id KEK derivation
│       └── audit.js          # append-only audit log writer
├── scripts/
│   └── vault.js              # commander CLI: get/set/list/rotate/delete subcommands
└── tests/
    └── vault/
        ├── format.test.js    # round-trip envelope parsing
        ├── crypto.test.js    # KDF determinism, GCM tag tamper detection
        ├── audit.test.js     # log append + line shape
        └── integration.test.js # full CLI flow via child_process.spawnSync
```

`lib/vault/` lives under `banking_api_server/` because that's where CommonJS lives and where the first consumer (BFF startup) loads it. If the MCP Gateway later consumes it, it imports via relative path or a shared monorepo workspace — don't extract to a separate package until two consumers actually exist.

### Pattern 1: KEK / DEK envelope (the load-bearing design)

**What:** master KEK derived once per vault-open from the password; each entry has its own DEK (256-bit random) used to encrypt the value, and the DEK itself is encrypted (wrapped) by the KEK. Rotating the password re-derives the KEK and re-wraps every DEK — but does not touch the encrypted values. Adding a new entry generates a new DEK, encrypts the value, and wraps the DEK; the rest of the file is untouched.

**Why this exactly satisfies "per-entry sealing without re-encrypting everything":** the wrap operation is cheap and only re-runs on password rotation; per-entry adds/deletes are isolated to that entry's record.

**On-disk envelope (`secrets.vault`):**

```jsonc
{
  "magic": "BNKV",
  "version": 1,
  "kdf": {
    "alg": "argon2id",
    "salt": "base64(16 bytes)",
    "memCost": 65536,        // 64 MiB
    "timeCost": 3,           // 3 iterations
    "parallelism": 4,
    "hashLen": 32            // 32-byte KEK
  },
  "createdAt": "2026-05-13T20:00:00Z",
  "rotatedAt": null,
  "entries": {
    "HELIX_API_KEY": {
      "wrappedDek": "base64(12-byte IV || 16-byte tag || 32-byte ciphertext-of-DEK)",
      "valueIv":    "base64(12 bytes)",
      "valueTag":   "base64(16 bytes)",
      "value":      "base64(ciphertext)",
      "updatedAt":  "2026-05-13T20:00:00Z",
      "note":       "optional human description"
    },
    "PINGONE_ADMIN_CLIENT_SECRET": { /* ... */ }
  },
  "fileHmac": "base64(HMAC-SHA256 over the entire JSON minus this field, key=HKDF(KEK, 'fileHmac'))"
}
```

The `fileHmac` is what makes "a single flipped byte fails decryption with a clear error" true even for the JSON structure itself — without it, a flipped byte in `createdAt` would deserialize fine and only the affected entry would AEAD-fail. With it, the whole-file integrity check fires first and the CLI says `vault corrupted: file HMAC mismatch` instead of `decryption failed`.

**Why a separate `fileHmac` when entries are already AEAD-protected:** GCM tags catch tampering inside each ciphertext, but JSON structure changes (adding a fake entry, deleting one, swapping `valueIv` between two entries) wouldn't be caught by individual GCM tags alone. The file HMAC is structural integrity; the per-entry GCM tags are content integrity. Both are needed.

**Magic + version:** 4-byte ASCII `BNKV` + integer version. Lets future formats (version 2 might use XChaCha20-Poly1305) be detected and rejected with a helpful "this vault was written by a newer CLI; upgrade" message instead of a confusing AEAD failure.

### Pattern 2: Open-vault session, not a singleton

**What:** the vault library exposes `openVault(filePath, password)` which returns a handle with `read(name)`, `set(name, value)`, `list()`, `rotate(newPassword)`, `close()`. The handle holds the **decrypted KEK and the decrypted entries map** in process memory for the lifetime of the handle. The password is dropped from memory immediately after KEK derivation.

**Why not a process-wide singleton:** the BFF startup might want to open the vault, copy needed values into the configStore, then close the handle — minimizing the window where a KEK lives in memory. A singleton makes that pattern awkward.

```javascript
// Source: design spec for this phase
const vault = await openVault(process.env.VAULT_PATH || './secrets.vault', password);
try {
  const helixKey = vault.read('HELIX_API_KEY');
  configStore.setRaw('helix_api_key', helixKey, { source: 'vault' });
  // ... other keys
} finally {
  vault.close();  // zeroes KEK buffer
}
```

### Pattern 3: Audit log is plaintext metadata, never values

**Format:** newline-delimited JSON, append-only, in the same directory as the vault:

```
secrets.vault
secrets.vault.audit.log
```

Each line:

```json
{"ts":"2026-05-13T20:00:00.123Z","op":"read","key":"HELIX_API_KEY","pid":12345,"caller":"vault.js","host":"laptop-curtis","result":"ok"}
{"ts":"2026-05-13T20:00:05.456Z","op":"set","key":"NEW_KEY","pid":12345,"caller":"vault.js","host":"laptop-curtis","result":"ok"}
{"ts":"2026-05-13T20:00:10.789Z","op":"read","key":"MISSING","pid":12345,"caller":"vault.js","host":"laptop-curtis","result":"not_found"}
{"ts":"2026-05-13T20:01:00.000Z","op":"open","key":null,"pid":12345,"caller":"BFF.startup","host":"laptop-curtis","result":"bad_password"}
```

**Why plaintext:** the audit log is metadata about access — when, by whom, to what name — not the secret values themselves. The point of an audit log is that it's readable without the password. If it were encrypted with the vault password, anyone debugging a `bad_password` failure couldn't see prior `open` events, defeating the point. Caveat in `## Common Pitfalls` below: never log values; only key names.

### Anti-Patterns to Avoid

- **Storing the password in `process.env` for the long-running BFF.** Pass it in once at startup (`VAULT_PASSWORD=… node server.js`), have the BFF copy what it needs into configStore, then unset it (`delete process.env.VAULT_PASSWORD`) so a later `process.env` dump can't leak it. This is exactly the "process listings (`/proc/<pid>/environ`)" risk the prompt mentions — by the time `/proc/<pid>/environ` is read, the env var is gone.
- **Reusing a single nonce across entries.** Every GCM operation in the vault gets a fresh `randomBytes(12)`. With per-entry DEKs this is overkill (a fresh DEK gives you 2⁹⁶ nonce space practically forever), but the discipline is cheap and prevents class of catastrophe.
- **Using SHA-256(password) as the KEK.** Even with salt. Argon2id exists for exactly this reason. A laptop GPU can brute-force SHA-256 at ~10⁹/s; Argon2id with 64 MiB / 3 iterations / 4 lanes is closer to 10² attempts per second per attacker GPU. The cost difference is decisive.
- **Hand-rolling base64 of the whole file as "encryption."** It's not. The vault must use authenticated encryption with random IVs. If a reviewer cannot point at the GCM `setAuthTag` call, the implementation is broken.
- **Putting the vault behind admin auth in the UI.** Tempting, never appropriate. The UI doesn't need to see vault contents — only the BFF does, at startup. If the operator wants to view/edit, they use the CLI on the host (which is access-controlled by OS permissions on the host, not by an HTTP route).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---|---|---|---|
| Password hashing for KEK | Custom PBKDF / SHA-iteration loop | `argon2.hash` with type=`argon2id` | Sidechannel-resistant, memory-hard, GPU-resistant. Custom iteration loops are universally broken in subtle ways. |
| AEAD | Encrypt-then-HMAC by hand | `node:crypto` `createCipheriv('aes-256-gcm', …)` + `getAuthTag()` | Native, FIPS-blessed, audited. Hand-rolled EtM is the #1 source of crypto vulnerabilities in CTF history. |
| Random IV / salt | `Date.now() % N`, `Math.random()` | `crypto.randomBytes(12)` for IV, `crypto.randomBytes(16)` for salt | CSPRNG only. Anything else is broken. |
| Constant-time compare | `a === b` on auth tags or HMACs | `crypto.timingSafeEqual(buf1, buf2)` | Variable-time string compare leaks the tag byte-by-byte over thousands of probes. |
| TTY password prompt | Hand-rolled `readline.question` with manual echo masking | `@inquirer/password` | Handles terminal modes correctly on TTY + piped stdin. Stripping echo via `process.stdin.setRawMode(true)` has at least three known platform-specific bugs. |
| Atomic file write | `fs.writeFileSync(path, data)` directly over the vault | `fs.writeFile(tmp, data); fs.rename(tmp, final)` | A crash during `writeFileSync` leaves the vault truncated/corrupted. Atomic rename is the universal fix; `data/store.js` already uses this pattern (`_atomicWrite`). |

**Key insight:** the vault is small enough that the temptation to "just write it from scratch in 50 lines of crypto" is strong. Resist it. Every line of hand-rolled crypto is technical debt with security implications. Lean entirely on `node:crypto` AEAD + the `argon2` npm package; do not introduce a fourth dependency or invent a fifth primitive.

## Common Pitfalls

### Pitfall 1: Forgotten-password "recovery" via a backdoor

**What goes wrong:** someone adds a "recovery key" derived from a hardcoded master secret so that `--admin-recover` can decrypt a vault without the password.
**Why it happens:** users forget passwords, and the dev wants to be helpful.
**How to avoid:** **document explicitly that there is no recovery.** A forgotten password means the vault is gone; the operator re-provisions every secret from its source (issue a new Helix key, regenerate worker secrets, etc.). The whole point of the vault is that loss of the password = loss of access. Adding any backdoor instantly devalues the vault.
**Warning signs:** any PR that adds an `--admin-recover`, `--reset`, or `--recover` flag. Reject on sight.

### Pitfall 2: Logging the decrypted value during debugging

**What goes wrong:** `console.log('Read entry:', name, value)` makes it into a commit. The audit log starts containing the secret.
**Why it happens:** debugging is hard and `console.log` is the path of least resistance.
**How to avoid:** the vault library's only methods that return decrypted bytes are `read(name)` (caller-visible) and the internal unwrap helper (not exported). The audit log writer is a separate module that **physically cannot** see decrypted values — it only sees `{op, key, result}`. Cement this by writing a unit test that grep's `vault.audit.log` for known-test-value bytes and asserts they never appear.
**Warning signs:** any `console.log` in `lib/vault/crypto.js` that includes a parameter; any `console.log` whose first argument isn't a literal string.

### Pitfall 3: Vault password leaks via process listing

**What goes wrong:** `VAULT_PASSWORD=secret node server.js` is run; `ps auxe` shows the env var; or `/proc/<pid>/environ` exposes it for the process lifetime.
**Why it happens:** env vars feel safe but aren't on multi-user hosts.
**How to avoid:** on the BFF, after `openVault(path, process.env.VAULT_PASSWORD)`, immediately `delete process.env.VAULT_PASSWORD`. The startup window where the password is visible shrinks to ~10ms. For CI, the env var is fine — CI runners are single-tenant by design.
**Warning signs:** `process.env.VAULT_PASSWORD` referenced anywhere after the initial `openVault` call.

### Pitfall 4: Re-encrypting on every read

**What goes wrong:** a naive "rotate IVs" feature re-encrypts every entry on every vault open to "freshen the nonces." This doubles file-write rate, multiplies the corruption window, and breaks the "adding a key doesn't touch other keys" guarantee.
**Why it happens:** misunderstanding of nonce-reuse threats (which are about *encryption* under the same key+nonce, not about decryption + re-encryption).
**How to avoid:** the vault is mutated only on explicit `set`, `delete`, or `rotate-password`. Reads are pure.
**Warning signs:** any code path in `openVault` that writes back to the file.

### Pitfall 5: KEK lifetime longer than needed

**What goes wrong:** the BFF holds the decrypted KEK in memory for the whole process lifetime (24+ hours in some deployments). A memory dump leaks every secret.
**Why it happens:** convenience — keeping the handle open means re-reads don't need re-decryption.
**How to avoid:** **the vault is read once at startup, copied into configStore (which has its own AES-256-GCM at-rest encryption keyed by SESSION_SECRET), then closed.** The KEK lives in memory for ~50ms during startup, not for hours. Subsequent reads go through `configStore.getEffective(key)` — same pattern as everything else.
**Warning signs:** `vault.close()` is missing from the BFF startup; `vault.read(...)` calls outside of `server.js` boot.

### Pitfall 6: Argon2 parameters too low (or too high)

**What goes wrong:** memCost=4096 (4 MiB) gives no real GPU resistance; or memCost=1048576 (1 GiB) makes the CI runner OOM.
**Why it happens:** copy-pasted from a "minimum viable" tutorial, or "I want to be safe" guesswork.
**How to avoid:** the recommended parameters below are explicit and justified. **Do not change them without a written rationale.** If a future faster machine needs higher parameters, bump the format version (v2) and migrate on next `rotate-password`.
**Warning signs:** Argon2 parameters are non-constant (`{ memCost: process.env.FOO || ... }`).

## Code Examples

### Recommended Argon2id parameters (developer-laptop threat model)

```javascript
// Source: OWASP Password Storage Cheat Sheet (current as of 2025)
// + argon2 0.44.0 README defaults
const KDF_PARAMS = Object.freeze({
  type: argon2.argon2id,
  memoryCost: 65536,   // 64 MiB — fits on any laptop, prohibitive on a GPU
  timeCost: 3,         // 3 iterations
  parallelism: 4,      // 4 lanes
  hashLength: 32,      // 32-byte KEK for AES-256-GCM
});

async function deriveKek(password, saltBuf) {
  const raw = await argon2.hash(password, {
    ...KDF_PARAMS,
    salt: saltBuf,
    raw: true,         // return Buffer, not encoded string
  });
  return raw;          // 32-byte KEK
}
```

**Justification:** OWASP's current Argon2id recommendation is `m=64MiB, t=3, p=4` or `m=19MiB, t=2, p=1`. The higher setting is appropriate when the host is a developer laptop with 16+ GB RAM and the operation runs once at vault open (~300ms — acceptable startup cost). The lower setting is for high-throughput auth servers running thousands of password verifications per second, which isn't this use case. [CITED: cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html#argon2id]

### AES-256-GCM wrap/unwrap

```javascript
// Source: node:crypto docs + existing pattern in banking_api_server/services/configStore.js:316-345
const crypto = require('node:crypto');

function aeadSeal(plaintext, key) {
  if (key.length !== 32) throw new Error('key must be 32 bytes');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { iv, tag, ct };
}

function aeadOpen({ iv, tag, ct }, key) {
  if (key.length !== 32) throw new Error('key must be 32 bytes');
  if (iv.length !== 12)  throw new Error('iv must be 12 bytes');
  if (tag.length !== 16) throw new Error('tag must be 16 bytes');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]);
  // throws if tag is wrong → caller sees "bad password / tampered entry"
}
```

The existing `configStore.js` lines 316-345 use the same primitives but with a different (less rigorous) framing — that's a reference for "this pattern is already accepted in the codebase," not a code-copy target. The vault library uses fresh, correct length checks.

### CLI invocation shape

```bash
# Set a value (prompts for vault password + value)
npm run vault:set HELIX_API_KEY

# Get a value (prints to stdout; pipes well)
npm run vault:get HELIX_API_KEY

# List entry names (never values)
npm run vault:list

# Delete an entry
npm run vault:delete HELIX_API_KEY

# Rotate the vault password (re-wraps all DEKs; entries' ciphertexts unchanged)
npm run vault:rotate

# CI / non-interactive: pipe password via env
VAULT_PASSWORD='quoted password' npm run vault:get HELIX_API_KEY

# Custom vault location
VAULT_PATH=/etc/banking/secrets.vault npm run vault:list
```

`package.json` scripts in `banking_api_server`:

```jsonc
"scripts": {
  "vault:get":    "node scripts/vault.js get",
  "vault:set":    "node scripts/vault.js set",
  "vault:list":   "node scripts/vault.js list",
  "vault:delete": "node scripts/vault.js delete",
  "vault:rotate": "node scripts/vault.js rotate"
}
```

### BFF startup wiring

```javascript
// Source: design spec for this phase, written against banking_api_server/server.js patterns
// Runs synchronously-on-async early in server.js boot, BEFORE configStore is consulted by any route.
const { openVault } = require('./lib/vault');
const configStore = require('./services/configStore');

async function loadVaultSecretsIntoConfig() {
  const vaultPath = process.env.VAULT_PATH || path.join(__dirname, '..', 'secrets.vault');
  if (!fs.existsSync(vaultPath)) {
    console.log('[vault] no vault file at', vaultPath, '— skipping (env/configStore values will be used)');
    return;
  }
  const password = process.env.VAULT_PASSWORD;
  if (!password) {
    // Fail-fast: vault exists but no password. Do not silently fall through to weaker config.
    console.error('[vault] secrets.vault exists but VAULT_PASSWORD not set — refusing to start');
    process.exit(1);
  }
  const vault = await openVault(vaultPath, password);
  try {
    for (const name of vault.list()) {
      const value = vault.read(name);
      // configStore.setRaw writes to in-memory cache + encrypted SQLite, so subsequent
      // getEffective(name) calls find this value at the SQLite tier of the lookup chain.
      configStore.setRaw(name.toLowerCase(), value, { source: 'vault', persist: false });
    }
  } finally {
    vault.close();
    delete process.env.VAULT_PASSWORD;  // shrink leak window
  }
}
```

`persist: false` is important: the vault is the source of truth; we want the values in the in-memory cache for `getEffective`, but we **don't** want them written to `config.db` (which would duplicate them at rest and make rotations more complex). This requires `configStore.setRaw` to accept a `persist: false` option — that's a small extension to the existing API.

## Vault location & extension

**Recommended:** `secrets.vault` at the repo root. Override via `VAULT_PATH` env var.

**Rationale:**

- **Repo root** matches the existing `LLM2.json` discovery pattern (`helixAgentKeyLoader.js` searches repo root, `~/Documents`, `~/Downloads`). Users already drop credential files at repo root for this demo.
- **`.gitignore` entry** must be added: `secrets.vault` + `secrets.vault.audit.log` + `secrets.vault.tmp`. The existing `.gitignore` already covers a lot of secret-shaped files (lines 56-94 cover `data/persistent/`, `data/runtimeData.json`); add the vault paths explicitly.
- **Not in `banking_api_server/`** because the vault is shared across services (BFF today, MCP Gateway tomorrow). Repo root is the natural "shared" location.
- **Not in `~/.config/super-banking/`** because the prompt says "portable across machines" — a repo-root file moves with the repo when `git pull`'d on a new laptop (after the user separately copies the vault file across via scp / 1Password / etc.). A `~/.config` file is per-user and gets lost in migrations.
- **Extension `.vault`** is unambiguous and not used by any common tool. Alternatives like `.enc`, `.crypt`, `.gpg` falsely suggest GPG; `.json` would mis-cue `git diff` to try inline diffing.

**Discovery at startup:** the BFF reads `VAULT_PATH || './secrets.vault'`. The MCP Gateway (if/when it consumes the vault) does the same. No multi-location search like `helixAgentKeyLoader` — that pattern is fine for an optional dev convenience, but the vault is too important for "I wonder which vault we loaded today."

## Recovery procedure (forgotten password)

**There is no recovery. By design.** The documented procedure:

1. Delete `secrets.vault`.
2. For each entry that was in the vault, re-provision from its source:
   - `HELIX_API_KEY` → log into the Helix console, issue a new agent key, paste into the new vault via `npm run vault:set HELIX_API_KEY`.
   - `PINGONE_ADMIN_CLIENT_SECRET` → log into PingOne, regenerate the worker app secret, paste into the new vault.
   - Any other entries → similar — go to the issuing system, regenerate, paste into the new vault.
3. Restart all services so the new vault is read.

This procedure goes in the user-facing docs (`README.md` or `docs/vault.md`) verbatim. The CLI's password prompt (on `set`/`rotate`) should warn:

```
⚠️  There is no password recovery. Lose this password and the vault must be rebuilt
   from source secrets (regenerate Helix key, worker secrets, etc.). Confirm? [y/N]
```

## CI / non-interactive password supply

**Pattern:** `VAULT_PASSWORD` env var. The CLI checks `process.stdin.isTTY` — if false (piped) and `VAULT_PASSWORD` is unset, fail with `vault password required: set VAULT_PASSWORD env or run interactively`.

**For the test suite:** tests create a temp vault with a known password (`VAULT_PASSWORD='test-password-do-not-use'`), exercise the API, delete the vault. No persistence across test runs. This is a normal Jest pattern using `os.tmpdir()` + `afterEach` cleanup.

**For local dev where the user doesn't want to type the password 30 times a day:** document that they can keep `VAULT_PASSWORD` in a `direnv`-managed `.envrc` (which is already in `.gitignore` per line 70). This is a per-user laptop convenience that's not committed.

## Serverless / Vercel treatment

**Recommendation:** the vault is local-dev + self-hosted only.

**Why:** Vercel deploys have no persistent filesystem — `secrets.vault` would have to be bundled into the deployment artifact, which means it ships with the code. That's fine for an encrypted-at-rest file *if* you trust the deployer not to leak `VAULT_PASSWORD`, but it's a different threat model than the prompt describes ("portable across machines, decrypted only by a password"). On Vercel, the standard pattern is **Vercel Encrypted Environment Variables** — that's already what the BFF uses (`KV_REST_API_TOKEN`, etc.).

**What to do for Vercel deploys:**

1. If `VAULT_PATH` is unset and `process.env.VERCEL === '1'`, skip the vault load entirely.
2. Continue to read secrets from `process.env.HELIX_API_KEY` etc. as today.
3. Document that "vault = self-hosted; Vercel = env vars" so future users don't ask.

Note: the project's Vercel deployment history is mixed — Phase 268 (which 269 depends on) is K8s-focused; the BFF `services/bff-sessions` skill says "Vercel was removed in 2026" — so Vercel may not even be a live target. Discuss-phase should confirm.

## Test strategy

**Test layout:** mirrors the existing `banking_api_server/tests/` pattern.

| File | Type | What it asserts |
|---|---|---|
| `tests/vault/format.test.js` | unit | JSON envelope round-trips; magic + version rejected when wrong; HMAC mismatch raises `VaultIntegrityError` |
| `tests/vault/crypto.test.js` | unit | Argon2id derivation is deterministic for same password+salt+params; AEAD detects byte-flip; constant-time compare used for HMACs |
| `tests/vault/audit.test.js` | unit | Audit log lines have correct shape; concurrent writes don't interleave (each line is a single `appendFileSync` of `JSON.stringify + '\n'`); **no decrypted value ever appears in any log line** (grep test) |
| `tests/vault/cli.integration.test.js` | integration | `child_process.spawnSync('node', ['scripts/vault.js', 'set', 'FOO'], { env: { VAULT_PASSWORD: '...' }, input: 'value\n' })` — full subprocess round-trip |
| `tests/vault/bff-startup.test.js` | integration | Mock `openVault`; assert configStore.setRaw is called for each entry; assert `process.env.VAULT_PASSWORD` is deleted after load |

**Golden files:** include 2 golden vault files in `tests/vault/fixtures/`:

- `valid-v1.vault` — written by an earlier known-good run; assert decryption gives back the known plaintexts.
- `corrupted-v1.vault` — same as valid but with one byte flipped in `entries.X.value`; assert decryption fails with `VaultIntegrityError`.

Golden files are the strongest defense against accidental format drift — if a future change reorders JSON keys or changes base64 padding, the round-trip test still passes but the golden file test fails loudly.

**Property test (recommended):** use `fast-check` or hand-rolled randomization to generate 100 random `{name, value}` pairs, write them to a temp vault, read them back, assert equality. Catches edge cases like binary values, very long values, names with unusual characters.

**Coverage target:** vault module is small (~300 LOC) — aim for 95%+ line coverage. The crypto code path is non-negotiable: every branch must have a test.

## Runtime State Inventory

This is a greenfield phase, but it touches existing runtime state. Audit:

| Category | Items Found | Action Required |
|---|---|---|
| Stored data | `banking_api_server/data/persistent/config.db` — encrypted SQLite, keyed by SESSION_SECRET. Currently stores `helix_api_key`, `pingone_admin_client_secret`, ~80 other config keys. The vault will be **an additional source** for these values, NOT a replacement of `config.db`. | None — `config.db` continues to exist. Vault feeds in at startup, configStore caches as usual. |
| Live service config | `banking_api_server/.env`, `banking_mcp_gateway/.env` — committed-ignored `.env` files contain `HELIX_API_KEY`, `PINGONE_ADMIN_CLIENT_SECRET`, etc. | Vault becomes the **preferred source** but `.env` continues to work as fallback. Document migration: `npm run vault:migrate` could copy `.env` keys into the vault then prompt the user to delete them. (Optional CLI; not load-bearing.) |
| OS-registered state | None — no launchd / systemd / Task Scheduler entries reference vault file paths. | None. |
| Secrets / env vars | `VAULT_PASSWORD` (new), `VAULT_PATH` (new). All existing `HELIX_*`, `PINGONE_*` env vars continue to work as fallbacks. | Add to `.env.example` with quotes per CLAUDE.md rule. |
| Build artifacts | `argon2` is a node-gyp package — `npm install` builds a native `.node` binary in `node_modules/argon2/build/`. Adds ~30s to fresh install. | Document in CLAUDE.md "Node services and what each needs to start" — add note that fresh installs need a working node-gyp toolchain (Xcode CLT on macOS, build-essentials on Linux). Also add fallback in CI: `@node-rs/argon2` if node-gyp fails. |

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|---|---|---|---|---|
| Node 20+ | All vault code | ✓ | v24.3.0 | — |
| `node:crypto` AEAD ciphers (`aes-256-gcm`) | Vault encryption | ✓ | built-in | — |
| node-gyp toolchain (Xcode CLT / build-essentials) | `argon2` native build | ✓ on dev machine | — | `@node-rs/argon2` (Rust binding, no node-gyp) |
| Jest 29.7 | Tests | ✓ | 29.7.0 | — |
| Argon2 npm package | KDF | not installed yet | `0.44.0` (verified) | scrypt via `node:crypto.scryptSync` (documented fallback only — Argon2id is preferred) |

**Missing dependencies with no fallback:** none.

**Missing dependencies with fallback:** node-gyp on machines without Xcode CLT — fall back to `@node-rs/argon2` or document a `brew install` step.

## Validation Architecture

### Test Framework

| Property | Value |
|---|---|
| Framework | Jest 29.7.0 + ts-jest 29.4.9 (gateway only) |
| Config file | `banking_api_server/jest.config.js` (existing) |
| Quick run command | `cd banking_api_server && npx jest tests/vault/ --bail` |
| Full suite command | `cd banking_api_server && npm test` + critical regression suite |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|---|---|---|---|---|
| REQ-VAULT-01 | AES-256-GCM seals + detects tampering | unit | `npx jest tests/vault/crypto.test.js -x` | ❌ Wave 0 |
| REQ-VAULT-02 | Argon2id derives correct KEK from password+salt | unit | `npx jest tests/vault/crypto.test.js -t 'argon2'` | ❌ Wave 0 |
| REQ-VAULT-03 | Envelope round-trips; corrupted byte raises VaultIntegrityError | unit | `npx jest tests/vault/format.test.js -x` | ❌ Wave 0 |
| REQ-VAULT-04 | `VAULT_PATH` override respected; missing file is benign skip | unit | `npx jest tests/vault/discovery.test.js -x` | ❌ Wave 0 |
| REQ-VAULT-05 | CLI subcommands set/get/list/delete/rotate work end-to-end | integration | `npx jest tests/vault/cli.integration.test.js -x` | ❌ Wave 0 |
| REQ-VAULT-06 | Forgotten password recovery docs exist and CLI prompt mentions "no recovery" | manual + lint | grep `docs/vault.md` for `no recovery`; visual inspect | manual |
| REQ-VAULT-07 | Audit log lines have correct shape, no values leak | unit + grep | `npx jest tests/vault/audit.test.js -x` | ❌ Wave 0 |
| REQ-VAULT-08 | MCP Gateway integration (if scoped) | integration | TBD per discuss-phase | manual |
| REQ-VAULT-09 | BFF startup loads vault into configStore, drops password from env | integration | `npx jest tests/vault/bff-startup.test.js -x` | ❌ Wave 0 |
| REQ-VAULT-10 | `VAULT_PASSWORD` env var honored when piped; TTY prompt when interactive | manual | `echo 'pw' \| node scripts/vault.js get FOO`; expect success | manual |
| REQ-VAULT-11 | On Vercel (`VERCEL=1`), vault load is skipped | unit | `npx jest tests/vault/serverless.test.js -x` | ❌ Wave 0 |
| REQ-VAULT-12 | Golden file decrypts to known plaintexts; corrupted golden fails loud | unit | `npx jest tests/vault/golden.test.js -x` | ❌ Wave 0 |
| REQ-VAULT-13 | Critical existing regression suite still passes after BFF startup change | integration | `npx jest oauthStatus.regression oauthStatus.integration hitlRoute.regression hitlRoute.integration` | ✅ exists |

### Sampling Rate

- **Per task commit:** `cd banking_api_server && npx jest tests/vault/ --bail` (fast unit suite, < 5s)
- **Per wave merge:** full vault suite + critical regression suite: `npx jest tests/vault/ oauthStatus.regression oauthStatus.integration hitlRoute.regression hitlRoute.integration`
- **Phase gate:** `cd banking_api_server && npm test` green; `cd banking_api_ui && npm run build` exit 0 if any UI touched (should be none for this phase).

### Wave 0 Gaps

- [ ] `banking_api_server/tests/vault/format.test.js` — covers REQ-VAULT-03
- [ ] `banking_api_server/tests/vault/crypto.test.js` — covers REQ-VAULT-01, REQ-VAULT-02
- [ ] `banking_api_server/tests/vault/audit.test.js` — covers REQ-VAULT-07
- [ ] `banking_api_server/tests/vault/cli.integration.test.js` — covers REQ-VAULT-05
- [ ] `banking_api_server/tests/vault/bff-startup.test.js` — covers REQ-VAULT-09
- [ ] `banking_api_server/tests/vault/serverless.test.js` — covers REQ-VAULT-11
- [ ] `banking_api_server/tests/vault/golden.test.js` — covers REQ-VAULT-12
- [ ] `banking_api_server/tests/vault/discovery.test.js` — covers REQ-VAULT-04
- [ ] `banking_api_server/tests/vault/fixtures/valid-v1.vault` — golden file
- [ ] `banking_api_server/tests/vault/fixtures/corrupted-v1.vault` — golden file with one-byte flip
- [ ] No new framework install — Jest 29.7 already installed.
- [ ] No new test runner config — existing `banking_api_server/jest.config.js` is fine.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---|---|---|
| V2 Authentication | yes (vault password is an auth factor) | Argon2id KDF, no recovery backdoor, fail-fast on bad password |
| V3 Session Management | no | Vault is stateless; KEK lifetime is the only "session" and it's ~50ms |
| V4 Access Control | yes (CLI is OS-permission-gated; runtime is in-process) | File permissions: `chmod 600 secrets.vault` recommended; document it. No HTTP route exposes vault. |
| V5 Input Validation | yes | CLI subcommand args validated (key names match `[A-Z_][A-Z0-9_]*`); values size-limited (e.g. 64 KiB max) |
| V6 Cryptography | **critical** | AES-256-GCM (AEAD), Argon2id (KDF), HKDF-SHA256 (for fileHmac sub-key), `crypto.timingSafeEqual` (tag compare), `crypto.randomBytes` (IV/salt). **Never hand-roll.** |
| V7 Error Handling | yes | Decryption failures must NOT leak whether it's a bad password vs corrupted file vs missing entry — return generic `vault open failed` from CLI; verbose details to audit log only. |
| V14 Configuration | yes | `.gitignore` entries for `secrets.vault*` are mandatory; `chmod 600` documented. |

### Known Threat Patterns for `node:crypto` + Argon2id + JSON envelope

| Pattern | STRIDE | Standard Mitigation |
|---|---|---|
| Brute-force password offline | Spoofing | Argon2id with 64 MiB / 3 iter / 4 parallel — ~100× slower than scrypt at same RAM, ~10000× slower than SHA-256(salt+pw). |
| Tampered ciphertext / flipped byte | Tampering | AES-256-GCM auth tag catches every byte flip in `value`; whole-file HMAC catches structure tampering between entries. |
| Side-channel timing attack on auth tag compare | Information disclosure | GCM's tag verification is constant-time (handled by `node:crypto`). The file-HMAC compare uses `crypto.timingSafeEqual`. |
| Audit log leaks values | Information disclosure | Audit log writer module physically cannot see decrypted values — separation of concerns enforced by module boundaries + grep test. |
| Vault committed accidentally | Information disclosure | Encrypted at rest, so an accidental commit is recoverable (rotate password, force-push history rewrite). `.gitignore` is the primary defense. |
| `VAULT_PASSWORD` leaks via process listing | Information disclosure | `delete process.env.VAULT_PASSWORD` immediately after vault open. |
| Replay of old vault file | Tampering | `rotatedAt` field + audit log entries with timestamps — replay is detectable but not prevented. Out of scope for this phase. |
| Argon2 OOM under attack | DoS | KDF runs in-process at startup only; not exposed to network. Attacker would need shell already. N/A. |

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|---|---|---|---|
| PBKDF2-SHA256 | Argon2id | OWASP 2021 | Argon2id is GPU-resistant; PBKDF2 is not |
| AES-256-CBC + HMAC | AES-256-GCM (AEAD) | NIST SP 800-38D, 2007; ubiquitous since 2016 | One primitive instead of two; no encrypt-then-MAC pitfalls |
| Single global IV | Per-entry IV + per-entry DEK | Long-standing best practice | Adding a key doesn't touch other keys |
| Plaintext `.env` for secrets | Vault | This phase | Encrypted at rest; safe in `git diff`; portable across machines |

**Deprecated/outdated:**

- `crypto.createCipher` (no `iv` argument) — deprecated since Node 10. Use `createCipheriv`.
- `bcrypt` as a KDF for KEK derivation — bcrypt is for password verification (60-byte output), not key derivation; Argon2id is better in both dimensions.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|---|---|---|
| A1 | The MCP Gateway will consume the vault "future provider keys" (Helix-like) — but **not in this phase**. | "Summary" + "Consumer wiring" | If discuss-phase says the gateway IS in scope, add a Plan for `banking_mcp_gateway/src/config.ts` to read from the vault at startup. The crypto + format design above does not change. |
| A2 | Argon2id parameters `m=64MiB, t=3, p=4` are appropriate for a developer-laptop threat model. | "Recommended Argon2id parameters" | If the laptop is constrained (e.g. CI runner with 2GB RAM, or older devices), OOMs at vault open. Fallback: lower to `m=19MiB, t=2, p=1` (also OWASP-acceptable). |
| A3 | The vault is local-dev + self-hosted only; Vercel deploys keep using env vars. | "Serverless treatment" | If a future Vercel deploy is desired with vault contents, bundling the vault file into the build artifact is technically possible — but the threat model changes (anyone with the build artifact + `VAULT_PASSWORD` deployer env has the secrets). Re-research before adopting. |
| A4 | `commander` 14.x is appropriate; no current need switches the choice. | "Standard Stack" | Low — could swap to `yargs` or hand-rolled with no behavioral change. |
| A5 | The vault password is a single string; we don't need split-key / Shamir secret sharing. | implicit throughout | If the operator wants "two of three people must agree to open the vault," that's Shamir; this design doesn't do that. Out of scope but flag if discuss-phase asks. |
| A6 | `chmod 600 secrets.vault` is enforced by documentation, not by code. | "Security Domain V4" | A misconfigured permission lets another local user read the encrypted file (still safe — they don't have the password) but it's a defense-in-depth weakness. Optional: CLI warns on `set` if the file is world-readable. |
| A7 | `configStore.setRaw` can accept a `persist: false` option (small extension to existing API). | "BFF startup wiring" | If the existing `setRaw` always persists to `config.db`, that's a pre-condition for this phase — need to add the option as a small PR before the main vault PR. |
| A8 | The "audit trail of access" can be a plaintext NDJSON file. The phase doesn't require the audit log itself be encrypted. | "Audit log" | If discuss-phase wants encrypted audit logs, the format gets more complex (write-only encryption with a separate key, or HMAC-only signatures). Default to plaintext; revisit if requested. |

**Assumptions table is non-empty:** discuss-phase should confirm A1, A3, A7 before planning. The others are low-risk technical choices.

## Open Questions

1. **Is the MCP Gateway in scope for this phase?**
   - What we know: the roadmap says "consumers: (1) MCP Gateway ... (2) BFF startup." But the gateway has no Helix dependency today.
   - What's unclear: whether the phase plans should add gateway wiring, or defer it to a later phase.
   - Recommendation: in discuss-phase, ask: "Vault wires into BFF only this phase, gateway later? Or both?"

2. **Does any existing code read `helixAgentKeyLoader.js` after vault is in place?**
   - What we know: `helixAgentKeyLoader.js` is a fallback used by `configStore.getEffective('helix_api_key')`.
   - What's unclear: whether the vault wholly replaces the loader, or whether the loader stays as a tertiary fallback (vault → env → loader → SQLite → default).
   - Recommendation: keep the loader as a tertiary fallback. It's small and convenient for users who haven't set up a vault yet.

3. **What's the migration story for existing `.env` secrets?**
   - What we know: today's `HELIX_API_KEY` and PingOne secrets are in `.env` files.
   - What's unclear: do we want an `npm run vault:migrate` command that ingests `.env` and then offers to delete the secret entries?
   - Recommendation: yes, but as a separate small CLI command after the main vault is shipped. Don't gate the phase on it.

4. **`configStore.setRaw(key, value, opts)` — does it support `persist: false` today?**
   - What we know: `configStore.setRaw(key, value)` exists and is used (e.g. `banking_api_server/services/configStore.js`).
   - What's unclear: I didn't read the full method signature. The planner should grep for `setRaw` definition before assuming `persist: false` is free.
   - Recommendation: add a 1-line check in the planner's Plan 1 — "verify or add `persist: false` option to configStore.setRaw."

## Sources

### Primary (HIGH confidence)

- `node:crypto` documentation (Node 20+ / 24): `getCiphers()`, `createCipheriv('aes-256-gcm', ...)`, `randomBytes`, `timingSafeEqual`, `scryptSync`, `hkdf`. Verified locally: `node -e "console.log(require('crypto').getCiphers().filter(x => /gcm|chacha/.test(x)))"` returns aes-128-gcm, aes-192-gcm, aes-256-gcm, aria-*-gcm, chacha20, chacha20-poly1305 on Node 24.3.0.
- `argon2` npm package: version 0.44.0 verified via `npm view argon2`, published 2025-08-10, with provenance signature. Default algorithm is `argon2id`. [https://www.npmjs.com/package/argon2](https://www.npmjs.com/package/argon2)
- OWASP Password Storage Cheat Sheet — Argon2id recommendation. [CITED]
- `banking_api_server/services/configStore.js` lines 307-345 — existing AES-256-GCM usage pattern; this phase aligns to it.
- `banking_api_server/services/helixAgentKeyLoader.js` — existing pattern for "load file from repo root with sanitized filename and memoize." Vault discovery follows a similar style but simpler (no multi-location fallback).
- `banking_api_server/.gitignore` lines 56-94 — existing protection patterns; vault adds `secrets.vault*`.
- CLAUDE.md — project constraints (token custody, emoji rule, minimal diff, REGRESSION_PLAN §1).

### Secondary (MEDIUM confidence)

- `@inquirer/password` 5.0.13: verified via `npm view`, no API drift expected from 5.x.
- `commander` 14.x: assumed latest; not strictly verified.
- `@node-rs/argon2` 2.0.2: verified version exists; not load-bearing (fallback option only).

### Tertiary (LOW confidence)

- "XChaCha20-Poly1305 requires `@noble/ciphers` because Node only exposes IETF ChaCha20-Poly1305" — verified via `getCiphers()` (only `chacha20-poly1305` listed, which is the 12-byte-nonce variant). [VERIFIED locally; LOW because I haven't crosschecked Node release notes for XChaCha20 support arriving in Node 24+.]

## Metadata

**Confidence breakdown:**

- Standard stack (AES-256-GCM, Argon2id, JSON envelope, commander CLI): **HIGH** — Node builtins + the most mature Argon2 binding + a format that maps cleanly onto the stated requirements.
- Architecture (KEK/DEK + per-entry sealing + audit log): **HIGH** — direct mapping to "per-entry sealing without re-encrypting everything."
- Pitfalls (no recovery, KEK lifetime, value-leak in logs): **HIGH** — well-documented general crypto hygiene.
- Consumer wiring (BFF startup, MCP Gateway integration): **MEDIUM** — the BFF path is clear; the gateway path depends on discuss-phase scope decisions.
- Vercel/serverless treatment: **MEDIUM** — recommendation is "don't bother on Vercel" but the project's Vercel status is itself ambiguous (see Phase 268 transition).
- Test strategy + Validation Architecture: **HIGH** — patterns match existing repo conventions.

**Research date:** 2026-05-13
**Valid until:** 2026-07-13 (60 days — crypto primitives + Argon2 parameters are stable for ~12 months, but npm package versions drift faster)
