# Plan 4 Execution — Resume Here

## Current Status
- ✅ **Phase A Task A1 COMPLETE**: Extracted `dispatchBankingAction(action, params, userId, ctx)` from `executeHeuristicBanking` into a reusable function. 
  - Commit: `61c25c15 refactor(verticals): extract dispatchBankingAction for reuse by banking plugin`
  - File: `demo_api_server/services/demoAgentLangGraphService.js`
  - All write actions (transfer/deposit/withdraw) now throw errors in their catch blocks instead of returning error tuples (WR-07a compliance)
  - Tests: `hitlGateway.regression.test.js` was already failing before changes (pre-existing issue)

## Next Steps (Phase A Task A2)

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

## Uncommitted Changes
- `demo_api_server/routes/accounts.js` — `waitForReseed()` guard added (for concurrent reseed safety during vertical switches)
- This is supporting infrastructure that Plan 4 KEEPS

---

**Ready to continue:** Create banking plugin index.js following existing plugin patterns, spike the routing risk, then move to A3 + later phases.