---
created: 2026-05-15T10:12:14.000Z
title: run-bank.sh does not pass VAULT_PASSWORD to gateway or agent
area: ops
files:
  - run-bank.sh
  - banking_mcp_gateway/src/vault.ts
  - banking_agent_service/src/vault.ts
---

## Problem

Both `banking_mcp_gateway` and `banking_agent_service` have a vault loader
(`loadVaultIntoEnv()`) that sources OAuth credentials from the encrypted
`secrets.vault` at startup. The loader requires `VAULT_PASSWORD` in the
environment to open the vault:

- If `secrets.vault` exists but `VAULT_PASSWORD` is unset, the loader
  **refuses to start** (`refusing to start` — fail-fast by design,
  REGRESSION_PLAN §1 "Vault BFF startup" / "Vault Agent startup").
- If no `secrets.vault` exists, it transparently falls back to `process.env`.

`run-bank.sh` launches the gateway and agent **without** passing
`VAULT_PASSWORD` into their process environment (verified: no `VAULT_PASSWORD`
reference near the `bank-mcp-gateway` / `bank-agent-service` launch blocks).

Consequence: the moment an operator actually creates and populates a
`secrets.vault` (the whole point of the Phase 269 vault + the
2026-05-15 agent vault-awareness work), `./run-bank.sh` will **fail to start
the gateway and agent** with `secrets.vault exists but VAULT_PASSWORD not set
— refusing to start`. Today this is masked only because no vault file exists
on dev machines.

This is a pre-existing operational gap that predates and is shared with the
gateway — it was deliberately left out of scope of the agent vault-awareness
change (2026-05-15 §4 entry) because it is a `run-bank.sh` concern touching
launch env for two services, not a code-parity concern.

## Solution

Teach `run-bank.sh` to pass `VAULT_PASSWORD` into the gateway and agent
launch environments when a `secrets.vault` is present. Open questions to
resolve during implementation:

- **Source of the password.** The BFF already resolves `VAULT_PASSWORD`
  (env or interactive prompt at `setup:fresh` time via `configureVault()`).
  Decide whether `run-bank.sh` prompts once and exports to all vault-consuming
  services, reads from a gitignored local file, or relies on the operator
  having `VAULT_PASSWORD` exported in their shell before invoking the script.
- **Consistency with the BFF.** The BFF loads the vault into configStore;
  gateway/agent load into `process.env`. Whatever password-supply mechanism
  is chosen should be identical across all three so a single unlock serves
  the whole stack.
- **No-vault case unchanged.** When no `secrets.vault` exists, behavior must
  stay byte-identical to today (no prompt, no failure, fall back to env).
- **Secret hygiene.** `VAULT_PASSWORD` must not land in logs, `ps` output,
  or the `/tmp/bank-*.log` files. Prefer env passthrough over CLI args.

Cross-reference: REGRESSION_PLAN §1 rows "Vault BFF startup" and
"Vault Agent startup"; the 2026-05-15 §4 entry "banking_agent_service made
vault-aware" which explicitly logged this as a follow-up.
