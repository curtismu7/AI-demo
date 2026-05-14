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

### Admin Vault Routes (Phase 269.1)

- [ ] **REQ-VAULT-ADMIN-01**: Mount `POST /api/admin/vault/unlock` requiring `authenticateToken + requireAdmin` (no new scope).
- [ ] **REQ-VAULT-ADMIN-02**: Mount `POST /api/admin/vault/rotate` requiring `authenticateToken + requireAdmin`; require vault already unlocked + currentPassword re-verify.
- [ ] **REQ-VAULT-ADMIN-03**: Mount `GET /api/admin/vault/status` returning `{unlocked: bool, entriesLoaded: N, vaultFilePresent: bool}` (no password material).
- [ ] **REQ-VAULT-ADMIN-04**: Add `services/vaultLoader.js` export `unlockVaultAtRuntime({password, vaultPath, configStore, vaultLib, logger})` — sibling to `loadVaultIntoConfigStore` — does NOT touch `process.env.VAULT_PASSWORD`, NOT gated by `isVercel` (caller decides).
- [ ] **REQ-VAULT-ADMIN-05**: Password supplied in POST body JSON `{password: string}` (unlock) or `{currentPassword, newPassword}` (rotate) — never URL/query.
- [ ] **REQ-VAULT-ADMIN-06**: Audit every unlock/rotate via `lib/vault/audit.recordAudit` to existing `secrets.vault.audit.log` NDJSON file using already-allowed fields `{op, key, result, caller}` only.
- [ ] **REQ-VAULT-ADMIN-07**: Failure UX: same opaque message as Plan 01 for wrong password / tampered file (no enumeration oracle).
- [ ] **REQ-VAULT-ADMIN-08**: Per-process rate limit on unlock: `express-rate-limit` with 5 attempts / 5 min window per session sub (or IP if anonymous, which shouldn't happen because route is admin-only).
- [ ] **REQ-VAULT-ADMIN-09**: Vercel guard: `process.env.VERCEL === '1'` → routes return 503 `{error:'vault_disabled_serverless'}`.
- [ ] **REQ-VAULT-ADMIN-10**: Concurrent rotate guard: in-memory mutex (single async lock) so two parallel rotate calls cannot both observe stale state.
- [ ] **REQ-VAULT-ADMIN-11**: React page `components/AdminVaultPage.jsx` at route `/admin/vault` wrapped in `<AdminLayout>` like every other admin page; two forms (unlock + rotate); status indicator; success/failure banners; no password echo.
- [ ] **REQ-VAULT-ADMIN-12**: UI build gate: `cd banking_api_ui && npm run build` exits 0.
- [ ] **REQ-VAULT-ADMIN-13**: After-rotate operator-UX hint: docs/vault.md gains a section: *"After /admin/vault rotate succeeds, also update `VAULT_PASSWORD` in your shell/.env/secret store before next BFF restart, otherwise startup will fail-fast on the now-wrong password."*
- [ ] **REQ-VAULT-ADMIN-14**: Threat model documented in this RESEARCH; STRIDE for each route + mitigation; planner mirrors into REGRESSION_PLAN §1 entry "Vault runtime routes".
- [ ] **REQ-VAULT-ADMIN-15**: Critical regression suite (REQ-VAULT-13 from Phase 269) — `oauthStatus.regression`, `oauthStatus.integration`, `hitlRoute.regression`, `hitlRoute.integration` — stays green after these changes (39 tests minimum after this phase).

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

---

## Architecture Diagram Completeness (Phase 270)

- [ ] **REQ-DIAGRAM-01**: Every `run-bank.sh` SVC_LIST entry (banking_api_server, banking_mcp_server, banking_api_ui, banking_mcp_gateway, banking_hitl_service, banking_agent_service, banking_mcp_invest, banking_mortgage_service) appears as a node label substring in at least one `.mmd` source at repo root.
- [ ] **REQ-DIAGRAM-02**: Inter-service edges drawn — BFF→Gateway, Gateway→MCP Server, Gateway→banking_resource_server, MCP→MCP Invest, BFF→Helix, BFF→PingOne AS, BFF→PingOne Management, HITL↔BFF.
- [ ] **REQ-DIAGRAM-03**: Every OAuth grant in active use is labelled — Auth Code+PKCE, Client Credentials, RFC 8693 single-exchange, RFC 8693 dual-token, CIBA, RFC 7662 introspection (in at least one of the four `.mmd` sources).
- [ ] **REQ-DIAGRAM-04**: External cloud nodes present and distinguished — PingOne AS, PingOne Management API, PingOne Authorize PDP, Helix LLM (with optional providers).
- [ ] **REQ-DIAGRAM-05**: Phase 266 paths (A api_key, B dual_token, C oauth_bearer) drawn with distinct edge styles in at least one .mmd source.
- [ ] **REQ-DIAGRAM-06**: Phase 268 K8s topology drawn as `planned` (stroke-dasharray subgraph) in `architecture.mmd`.
- [ ] **REQ-DIAGRAM-07**: Phase 269 `secrets.vault` startup-load arrow into BFF drawn in `architecture-simple.mmd` and `architecture.mmd`.
- [ ] **REQ-DIAGRAM-08**: No emojis outside REGRESSION_PLAN §0 allowlist (⚠️ ✅ ❌) in any `.mmd` source.
- [ ] **REQ-DIAGRAM-09**: Jest sync test `banking_api_ui/src/components/__tests__/ArchitectureDiagram.completeness.test.js` asserts every SVC_LIST entry appears in at least one .mmd source.
- [ ] **REQ-DIAGRAM-10**: Jest sync test asserts OAuth grant markers (PingOne, RFC 8693, PKCE, client_credentials) appear in at least one .mmd source.
- [ ] **REQ-DIAGRAM-11**: Stale port label `:3000` removed from `architecture.mmd` (UI runs on `:4000` under run-bank.sh); OpenAI-only LLM label replaced with Helix-default fallback chain.
- [ ] **REQ-DIAGRAM-12**: New REGRESSION_PLAN §1 row added: "Architecture diagram completeness" pointing at the sync test as the enforcer.
- [ ] **REQ-DIAGRAM-13**: PNGs regenerated via `scripts/build-diagrams.sh`; all four output PNGs (overview, overview2, token-flow, token-flow2) have non-zero size and mtime newer than their .mmd source.
- [ ] **REQ-DIAGRAM-14**: `InteractiveArchDiagram.js` retained per locked user decision (not removed), with a top-of-file comment noting the authoritative source is `architecture-simple.png`.
- [ ] **REQ-DIAGRAM-15**: Sync test asserts no .mmd source contains a secret-value substring pattern (VAULT_PASSWORD=, client_secret=, _SECRET=, api_key= with value); arrow labels reference mechanisms (`startup-load`, `X-API-Key`), never values.
