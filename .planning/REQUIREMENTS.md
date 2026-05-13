# Requirements — BX Finance AI Banking Demo

**Milestone:** v1.0 — Complete Demo + Educational Content
**Date:** 2026-03-31

---

## v1 Requirements

### Authentication Flows

- [x] **AUTH-01**: CIBA flow fully wired end-to-end in UI — initiate → poll → approval notification → agent unblocks with approved token
- [x] **AUTH-02**: Agent-triggered login HITL — agent encounters mid-flow auth challenge → user presented inline login → agent resumes automatically after approval
- [x] **AUTH-03**: Home page login entry point polished — clear role routing (admin vs customer), smooth first-time landing experience

### Token Exchange

- [x] **TOKEN-01**: 1-exchange vs 2-exchange live toggle — UI control to switch between paths in real time, showing token diff (act claim presence/absence)
- [x] **TOKEN-02**: Live token inspector panel — decoded JWT displayed during agent operations: sub, act, may_act, aud, scope, expiry — human-readable

### Stability

- [ ] **STAB-01**: SSE flow diagram on Vercel — agent flow milestones stream correctly in serverless (Redis pub/sub or static-frame fallback)
- [ ] **STAB-02**: Cold-start account persistence — investment and custom accounts survive Lambda cold-start (demoScenarioStore KV backing)
- [ ] **STAB-03**: Production safety guard — `SKIP_TOKEN_SIGNATURE_VALIDATION=true` + `NODE_ENV=production` raises `process.exit(1)`, not just `console.error`

### Educational Content

- [ ] **EDU-01**: OIDC 2.1 education panel — what changed from OIDC Core, why it matters for AI agents, key spec references
- [ ] **EDU-02**: MCP spec 2025-11-25 panel — protocol lifecycle, tool call flow, auth challenge mechanism, how this demo implements it
- [ ] **EDU-03**: RFC reference cards — one card per RFC (8693, 9396, 7519, 9700, OIDC CIBA) with "see it live in this demo" links to relevant panels/flows
- [ ] **EDU-04**: Guided demo tour — linear presentation mode that sequences all 3 auth flows with narration; designed for a 5-min conference walkthrough

### CUA Education

- [x] **CUA-01**: CUA training slide-out exists as a standard education drawer with 5 tabs covering definition, loop, comparison, security, and demo relevance
- [x] **CUA-02**: CUA panel is discoverable from NL intent routing, RFC Index, sidebar learn navigation, and agent education commands
- [x] **CUA-03**: CUA panel is cross-linked with Agent Gateway, Human-in-the-Loop, and MCP Protocol panels, and accurately explains that this demo uses MCP/tool-use instead of direct CUA browser control

### Documentation

- [x] **DOC-01**: User-facing setup guide — end-to-end: PingOne app config → environment variables → `npm run` locally → verify each auth flow
- [x] **DOC-02**: Architecture walkthrough — annotated sequence diagrams (draw.io) for each auth flow; "what token is where at each step" narrative

### Token Exchange Fix

- [ ] **TOKEN-FIX-01**: The BFF `agentMcpTokenService.js` uses the correct PingOne client authentication method (client_secret_basic, client_secret_post, or private_key_jwt) configured in the exchange-client app so that the token exchange never returns "Unsupported authentication method"
- [ ] **TOKEN-FIX-02**: Both the 1-exchange path (user token → MCP token) and 2-exchange path (user token + agent actor → MCP token with `act` claim) complete successfully end-to-end with agent tool calls reaching the banking API

---

## v2 (Deferred)

- Advanced step-up MFA flows (step-up already partially built; deeper integration deferred)
- LangChain agent expansion (optional component, not primary demo path)
- Mobile-native PKCE flow (OIDC for native apps)
- Multi-IdP support (only PingOne for v1)

---

## Out of Scope

- Production hardening / penetration testing — demo only
- SaaS / multi-tenant deployment — single-env demo
- Custom IdP support — PingOne only for this milestone
- Mobile / native apps — web only

---

## Traceability

| Requirement | Phase |
|-------------|-------|
| AUTH-01, AUTH-02, AUTH-03 | Phase 1 — Auth Flows |
| TOKEN-01, TOKEN-02 | Phase 2 — Token Exchange Showcase |
| STAB-01, STAB-02, STAB-03 | Phase 3 — Vercel Stability |
| EDU-01, EDU-02, EDU-03, EDU-04 | Phase 4 — Educational Content |
| DOC-01, DOC-02 | Phase 5 — User Documentation |
| TOKEN-FIX-01, TOKEN-FIX-02 | Phase 6 — Token Exchange Fix |
| CUA-01, CUA-02, CUA-03 | Phase 181 — CUA Training Slide-Out |

### Portable Encrypted Credential Vault (Phase 269)

- [ ] **REQ-VAULT-01**: AES-256-GCM AEAD encryption of all entry values; auth tag detects single-byte tampering on any byte of iv/tag/ct.
- [ ] **REQ-VAULT-02**: Argon2id KDF with parameters m=65536 (64 MiB) / t=3 / p=4 / hashLen=32; KDF_PARAMS Object.freeze'd in `lib/vault/crypto.js`.
- [ ] **REQ-VAULT-03**: JSON envelope with magic 'BNKV' + version 1 + whole-file HMAC-SHA256 over canonical JSON; magic/version/HMAC mismatch raises VaultIntegrityError BEFORE any per-entry AEAD attempt.
- [ ] **REQ-VAULT-04**: Vault discovered at `VAULT_PATH || repo-root/secrets.vault`; missing file is a benign skip (BFF still starts on env+configStore fallbacks).
- [ ] **REQ-VAULT-05**: CLI subcommands `vault:get | set | list | delete | rotate` work end-to-end with TTY password prompt (no echo) and `VAULT_PASSWORD` env override for non-TTY use.
- [ ] **REQ-VAULT-06**: Forgotten-password recovery is documented as "no recovery — re-provision from source"; CLI prints `⚠️` warning on `set` and `rotate`; no `--recover` flag exists.
- [ ] **REQ-VAULT-07**: NDJSON audit log at `secrets.vault.audit.log` records `{ts,op,key,pid,caller,host,result}`; physically cannot contain decrypted values (audit module does not import crypto.js or format.js; recordAudit signature rejects any field other than {op,key,result,caller}).
- [ ] **REQ-VAULT-08**: MCP Gateway reads optional provider-key entries (new keys, not HELIX) from vault at startup. Phase 269 scope: gateway library wiring + dev-bypass behavior when vault absent. Existing HELIX flow stays in BFF — gateway has no Helix dependency today.
- [ ] **REQ-VAULT-09**: BFF startup loads every vault entry into `configStore.setRaw(name.toLowerCase(), value, {persist:false})`; deletes `process.env.VAULT_PASSWORD` immediately after open; fails fast if `secrets.vault` exists but `VAULT_PASSWORD` unset.
- [ ] **REQ-VAULT-10**: `VAULT_PASSWORD` env var honored when stdin is not a TTY; interactive `@inquirer/password` prompt when stdin is a TTY; both paths reach the same vault.openVault code.
- [ ] **REQ-VAULT-11**: On Vercel (`process.env.VERCEL === '1'`), vault load is skipped (Vercel keeps using Encrypted Environment Variables — out of scope per RESEARCH.md "Serverless treatment").
- [ ] **REQ-VAULT-12**: Golden file fixtures `tests/vault/fixtures/{valid-v1,corrupted-v1}.vault` round-trip; corrupted golden raises VaultIntegrityError on every release build (regression-guards format drift).
- [ ] **REQ-VAULT-13**: Critical existing regression suite (`oauthStatus.regression`, `oauthStatus.integration`, `hitlRoute.regression`, `hitlRoute.integration`) continues to pass after BFF startup change in Plan 03.

### MCP Server Advanced Capabilities (Phase 32)

- [ ] **MCP-ADV-01**: `sequential_think` MCP tool — AI agents can reason step-by-step through complex banking decisions; steps rendered inline in agent chat as a collapsible "Reasoning" chain; tool callable without user auth
- [ ] **MCP-ADV-02**: Async long-running task UX — configurable display mode for long-running tool calls (job ID / spinner / transparent) selectable on the Demo Config page, stored in localStorage
- [ ] **MCP-ADV-03**: `.well-known/mcp-server` discovery endpoint — publicly accessible GET endpoint on the MCP server returning a JSON manifest with tool list, auth requirements, version, and contact fields; no auth required
- [ ] **MCP-ADV-04**: Audit trail observability — GET /api/mcp/audit BFF route backed by AuditLogger.queryAuditLogs(); new /audit admin page showing filterable event table with summary stats
- [ ] **MCP-ADV-05**: MCP registry integration — `mcpServers` field in banking_mcp_server/package.json + README "AI Client Setup" section with Claude Desktop, Cursor, and Windsurf config snippets

---

## Family Delegation (Phase 38)

- [x] **DELEG-01**: Delegation data service — SQLite-backed (local) / in-memory (Vercel) store for delegation records. Schema: `{ id, delegatorUserId, delegateUserId, delegateEmail, delegatorEmail, scopes[], status, granted_at, revoked_at }`. CRUD via `delegationService.js`.
- [x] **DELEG-02**: Delegation REST API — `POST /api/delegation` (grant), `GET /api/delegation` (list active), `DELETE /api/delegation/:id` (revoke), `GET /api/delegation/history` (all records). Auth-guarded by `authenticateToken`.
- [x] **DELEG-03**: PingOne delegate user provisioning — on grant, look up delegate by email; create PingOne user if not found (worker client_credentials, Management API).
- [x] **DELEG-04**: Email notifications — send PingOne User Message API email to delegate on grant and revoke. Best-effort (errors logged; do not block delegation operation).
- [x] **DELEG-05**: Worker App config tab — new "Worker App" tab on `/config` page. Editable fields for `pingone_client_id`, `pingone_client_secret`, `pingone_environment_id`. Save via existing `configStore`. "Test Connection" button calls `GET /api/admin/config/worker-test` and shows pass/fail.
- [x] **DELEG-06**: `/delegation` management page — dedicated React page with: add-delegate form (email + scope checkboxes), active delegates list with revoke, delegation history table.
- [x] **DELEG-07**: App wiring — `/delegation` route in React Router, "Manage Delegates" nav link in UserDashboard. `npm run build` exits 0.
