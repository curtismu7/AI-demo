# Phase 20: Postman Collections — Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in `20-CONTEXT.md` — this log preserves the alternatives considered.

**Date:** 2026-04-02
**Areas discussed:** B, A, C, D

---

## Area B — Environment File Strategy

**Discovery:** Two naming families exist across the four collections:
- UPPERCASE family (`sub-steps`, `MayAct-Chain`): `PINGONE_ENVIRONMENT_ID`, `PINGONE_CORE_CLIENT_ID`, etc.
- lowercase family (`pi.flow-1x`, `pi.flow-2x`): `env_id`, `client_id`, `ai_agent_client_id`, etc.

This mismatch is the root cause of the sub-steps utilities breakage — someone pairing sub-steps with the 2-Exchange env file (lowercase) gets `undefined` for every UPPERCASE variable.

**Options presented:**
1. Keep two families, clarify pairing in docs
2. Unify to lowercase (practitioner style) — one env file
3. Unify to UPPERCASE matching server `.env.example` — one env file

**Decision: Option 3** — UPPERCASE, aligned to `banking_api_server/.env.example`. Developer can cross-reference Postman vars with server env vars directly. `ai_agent_client_id` (pi.flow Webinar naming) maps to `PINGONE_CORE_CLIENT_ID` (the worker/BFF client — confirmed in `.env.example` line 14).

---

## Area A — Collection Consolidation (MayAct-Chain vs sub-steps)

**Discovery:** `BX-Finance-MayAct-Chain` and `BX Finance — 1-Exchange Delegated Chain (sub-steps)` are structurally identical — same 10 requests, same names, same order. Script comparison revealed 3 differences, all in favour of MayAct-Chain:

- **Step 1a test** (1603 vs 1366 chars): sub-steps has verbose `_links` debug logging; MayAct-Chain has cleaner early-bail on non-200 / error payload
- **Step 1b pre-request** (742 vs 1275 chars): MayAct-Chain adds a **120-second staleness check** on `flow_id` (`flow_id_issued_at` timestamp) — prevents the #1 learner frustration (stale flow = NOT_FOUND on Step 1b)
- **Step 1b test** (578 vs 922 chars): MayAct-Chain adds `COMPLETED` / `FAILED` status branching with guidance

MayAct-Chain is a newer, improved version of sub-steps.

**Options presented:**
1. MayAct-Chain wins, retire sub-steps, rename to `BX-Finance-1-Exchange-Step-by-Step`
2. Merge best-of-both into sub-steps, retire MayAct-Chain
3. Keep both, document separately

**Decision: Option 1** — MayAct-Chain is canonical. Rename to `BX-Finance-1-Exchange-Step-by-Step.postman_collection.json`. Delete sub-steps.

---

## Area C — AI-IAM-CORE Webinar Collection

**Discovery:** The Webinar collection in the repo root has messy names ("Copy 3", "Copy 2") and uses non-standard lowercase vars. Content comparison vs pi.flow-2x:

**Duplicate** (already in pi.flow-2x, better):
- BankingApp login flow (Steps 1–4 equiv.)
- Agent Exchange Token
- MCP Exchange Token
- CheckIntrospection (equiv. to Utility A)
- Get Worker Access Token

**Unique value** (not in any other collection):
- **Call PAZ** — PingOne Authorize policy decision endpoint. Sends MCP token to `POST /environments/{envID}/decisionEndpoints/{id}` to check agent permissions via policy engine. Has hardcoded UUID `cc26aaa9...` needing parameterisation.
- **Token Revocation** — `POST /as/revoke`. Clean lifecycle request not in any current collection.

**Options presented:**
1. Fold PAZ + Revocation into pi.flow-2x as new utilities, leave Webinar in root
2. Clean, promote as `docs/BX-Finance-Advanced-Utilities.postman_collection.json`
3. Leave as-is, dev reference only

**Decision: Option 2** — Create `docs/BX-Finance-Advanced-Utilities.postman_collection.json`. Extract PAZ and Revocation as first-class requests with proper names, UPPERCASE vars, `{{PAZ_DECISION_ENDPOINT_ID}}` to replace hardcoded UUID. Webinar file stays in root untouched (source only).

---

## Area D — Documentation Format

**Options presented:**
1. In-collection descriptions only
2. README only (`docs/POSTMAN-GUIDE.md`)
3. Both — in-collection descriptions + README with role-based quick-start guides

**Decision: Option 3** — Both. In-collection: request descriptions, variable requirements, response documentation. `docs/POSTMAN-GUIDE.md`: three quick-start paths by audience (learner / demo runner / engineer) + prerequisites checklist + common errors table.
