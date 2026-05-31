# Plan 4 Execution — Resume Here

## Current Status
- ✅ **Phase A Task A1 COMPLETE**: Extracted `dispatchBankingAction(action, params, userId, ctx)` from `executeHeuristicBanking` into a reusable function. 
  - Commit: `61c25c15 refactor(verticals): extract dispatchBankingAction for reuse by banking plugin`
  - File: `demo_api_server/services/demoAgentLangGraphService.js`
  - All write actions (transfer/deposit/withdraw) now throw errors in their catch blocks instead of returning error tuples (WR-07a compliance)
  - Tests: `hitlGateway.regression.test.js` was already failing before changes (pre-existing issue)

## ⚠️ CRITICAL BLOCKERS (found during A2 spike)

### 1. Dashboard MCP display section must understand verticals
**Status:** BLOCKING Phase B and beyond
**Issue:** The dashboard's MCP results panel doesn't know about render descriptors from banking/other verticals. It assumes banking render (AccountsTable, etc.).
**Fix needed:** 
- Check `demo_api_ui/src/components/BankingAgent.js` or MCP results panel
- Read `verticalResult.render` (new field from dispatchVerticalIntent)
- Map render descriptor key to the right UI component (table/card/fieldList/text)
- Apply format rules (money, date, count, percent) from manifest.render
**Files to audit:** `demo_api_ui/src/components/` (search for MCP result rendering, AccountsTable)

### 2. Authorization server (PingAuthorize) must evaluate vertical-scoped transfers
**Status:** BLOCKING transfers in banking vertical
**Issue:** When user executes "transfer $5000 from checking to savings" in banking vertical, PingAuthorize gate must:
- Recognize it's a `create_transfer` in the banking vertical
- Apply banking's HITL threshold ($250+)
- NOT apply sporting-goods transfer thresholds (if any)
**Fix needed:** Verify PingAuthorize policy recognizes `aud=banking-mcp-server` and applies correct consent threshold
**Files to check:** `PINGONE_CONFIG.md` (authorization policies), MCP gateway token exchange

### 3. PingOne Authorize scope validation for verticals
**Status:** BLOCKING if other verticals add write actions
**Issue:** When banking transfers require `write` scope, other verticals might need different scopes (e.g., sporting-goods "extend_rental" might need `rentals:write`)
**Fix needed:** Verify scope requirements in tool definitions match PingOne policy
**Files to check:** BankingToolRegistry (scopes list), PingOne resource server scope definitions

---

## Next Steps (Phase A Task A2 — COMPLETED)

### Create Banking Plugin at `demo_api_server/config/verticals/banking/index.js`

**Reference implementations:**
- `demo_api_server/config/verticals/sporting-goods/index.js`
- `demo_api_server/config/verticals/healthcare/index.js`
- Existing plugins use this pattern: `getManifest()`, `getTools()`, `getHeuristics()`, `getSystemPrompt()`, `getDataStore()`, `executeTool()`, `getAuthz()`

**Banking Plugin Requirements:**
1. **getManifest()** → return banking vertical's manifest (accounts, terminology, chips10, render)
2. **getTools()** → banking tool schemas (get_my_accounts, create_transfer, create_deposit, create_withdrawal) + admin tools
3. **getHeuristics()** → banking phrase→action map (mirror `parseBanking` regexes from nlIntentParser.js:~500)
4. **getSystemPrompt()** → banking directive for LLM
5. **getDataStore()** → `{ get: () => ({}) }` (MCP-backed, no local store)
6. **executeTool(toolName, args, ctx)** → delegates to `dispatchBankingAction` for banking actions, or MCP admin tools
7. **getAuthz()** → transfer/deposit/withdraw threshold rules matching current implementation
8. **kind:'vertical' routing risk** → SPIKE: banking tools are live + UI-coupled; verify end-to-end after plugin creation (banking chips in agent sidebar, transfer HITL gate fires)

**Files to reference:**
- `nlIntentParser.js:500+` for `parseBanking` regex patterns
- `demoAgentLangGraphService.js:99+` for `executeHeuristicBanking` logic (now extracted as `dispatchBankingAction`)
- `BankingToolRegistry.ts` in MCP server for tool schemas

### A3: Add render descriptors to banking manifest
- Simplest task — add `render` block per existing verticals
- accounts → table, balance → fieldList, transactions → table, etc.

### Then Phase B (Admin Overlay) and Phase C (Delete Translation Code)

## Key Insight from A2 Planning
The **kind:'vertical' routing spike** is critical:
- With banking as a plugin, `parseHeuristic('hello','banking')` returns `kind:'vertical'`
- `processAgentMessage` (line ~650) dispatches this to `dispatchVerticalIntent`
- `BankingAgent.js` must handle banking results OR the result must thread through existing UI render path
- **ACTION:** After creating banking plugin, test end-to-end: switch to banking vertical, heuristics mode, click "Show My Accounts" — confirm response + sidebar chip visibility

## Blocker Investigation (next session)

### Dashboard MCP Display Investigation
```bash
# Find where MCP results are rendered in dashboard
grep -r "AccountsTable\|MCP.*result\|verticalResult" demo_api_ui/src/components/ | head -20
grep -r "render.*accounts\|render.*balance" demo_api_ui/src/

# Check if BankingAgent.js reads render descriptors
grep -A 10 "renderKey\|render:\|descriptor" demo_api_ui/src/components/BankingAgent.js
```

### PingAuthorize Verification
```bash
# Check current transfer consent rule in PingOne
docs/PINGONE_CONFIG.md | grep -A 5 "transfer.*threshold\|create_transfer\|HITL"

# Verify banking resource server is configured
mcp__banking-dev__pingone_get_resource_scopes "banking-mcp-resource-id"
```

---

## Uncommitted Changes
- `demo_api_server/routes/accounts.js` — `waitForReseed()` guard added (for concurrent reseed safety during vertical switches)
- This is supporting infrastructure that Plan 4 KEEPS

---

**Ready to continue:** Create banking plugin index.js following existing plugin patterns, spike the routing risk, then move to A3 + later phases.