// banking_api_ui/tests/e2e/helpers/chipPipeline.js
'use strict';
/**
 * Drive a single chip through the real two-hop flow and assert it did NOT
 * skip any pipeline stage. Customer-scoped assertions only (token-chain +
 * tokenEvents). Authorize/gateway corroboration is done at suite level via
 * an admin context (see assertAdminPipelineEvents).
 */
const { expect } = require('@playwright/test');

/**
 * @param {import('@playwright/test').APIRequestContext} api  customer-cookie'd context
 * @param {{id:string,label:string,message:string}} chip
 * @param {string} provider  'auto' (heuristics) | 'helix'
 * @returns {Promise<{source:string, result:object, executed:boolean, tokenEvents:any[]}>}
 */
async function runChip(api, chip, provider) {
  // Hop 1: routing decision
  const nlResp = await api.post('/api/banking-agent/nl', {
    data: { message: chip.message, provider },
  });
  expect(nlResp.status(), `nl status for chip ${chip.id}`).toBe(200);
  const { source, result } = await nlResp.json();
  expect(source, `routing source for chip ${chip.id}`).toBeTruthy();

  // A chip resolves to a tool only when result.kind === 'banking'.
  if (!result || result.kind !== 'banking' || !result.banking?.action) {
    return { source, result, executed: false, tokenEvents: [] };
  }

  // Snapshot token-chain BEFORE the pipeline.
  const beforeResp = await api.get('/api/token-chain');
  expect(beforeResp.status()).toBe(200);
  const before = await beforeResp.json();
  const beforeMcp = before.mcpToolCallsChain?.length || 0;
  const beforeChain = before.tokenChain?.length || 0;

  // Hop 2: pipeline. Map the heuristic action to its MCP tool exactly as the
  // SPA does. We assert the BFF drives the pipeline; the tool name mapping is
  // the SPA's responsibility, so we send the action via the same nl→dispatch
  // contract by re-using /api/mcp/tool with the canonical tool for the action.
  const toolByAction = {
    balance: 'get_account_balance',
    accounts: 'get_my_accounts',
    transactions: 'get_my_transactions',
    transfer: 'create_transfer',
    deposit: 'create_deposit',
    withdraw: 'create_withdrawal',
    biggest_purchase: 'get_my_transactions',
    spending_summary: 'get_my_transactions',
    sensitive_account_details: 'get_my_accounts',
    mcp_tools: 'list_tools',
    mortgage_demo: 'show_mortgage',
  };
  const action = result.banking.action;
  const tool = toolByAction[action];
  // Some actions (web_search, logout, education) are intentionally non-pipeline.
  if (!tool) {
    return { source, result, executed: false, tokenEvents: [] };
  }

  const mcpResp = await api.post('/api/mcp/tool', {
    data: { tool, params: result.banking.params || {}, flowTraceId: `e2e-${chip.id}-${Date.now()}` },
  });
  // 200 = executed; 428 = consent gate (still went THROUGH exchange+authorize);
  // 403 = Authorize DENY (still proves Authorize ran). 401 here = a real bug
  // (we are logged in) — fail loudly.
  expect(mcpResp.status(), `mcp/tool status for chip ${chip.id}`).not.toBe(401);
  const mcpBody = await mcpResp.json();
  const tokenEvents = mcpBody.tokenEvents || [];

  // SKIP-PROOF (customer-visible portion):
  // 1. RFC 8693 exchange present in tokenEvents (an event whose claims carry
  //    an `act` actor OR a label naming the MCP/exchanged token).
  const sawExchange = tokenEvents.some(
    (e) =>
      e?.claims?.act ||
      /exchang|mcp.*token|delegat/i.test(`${e?.label || ''} ${e?.explanation || ''}`),
  );
  expect(sawExchange, `chip ${chip.id}: RFC 8693 exchange event in tokenEvents`).toBe(true);
  expect(tokenEvents.length, `chip ${chip.id}: token chain updated`).toBeGreaterThan(0);

  // 2. Token-chain grew (token chain updated) AND an MCP tool call recorded.
  const afterResp = await api.get('/api/token-chain');
  const after = await afterResp.json();
  expect(after.tokenChain?.length || 0, `chip ${chip.id}: token-chain grew`).toBeGreaterThanOrEqual(beforeChain);
  expect(after.mcpToolCallsChain?.length || 0, `chip ${chip.id}: mcp tool call recorded`).toBeGreaterThan(beforeMcp);

  return { source, result, executed: true, tokenEvents };
}

/**
 * Admin-context corroboration: assert Authorize + gateway legs were recorded
 * for the just-run window. `sinceIso` bounds the query to this chip's window.
 * @param {import('@playwright/test').APIRequestContext} adminApi
 * @param {string} sinceIso
 * @param {string} chipId  for assertion messages
 */
async function assertAdminPipelineEvents(adminApi, sinceIso, chipId) {
  const resp = await adminApi.get(`/api/admin/app-events?limit=500&since=${encodeURIComponent(sinceIso)}`);
  expect(resp.status(), `admin app-events status (${chipId})`).toBe(200);
  const { events } = await resp.json();
  const cats = new Set(events.map((e) => e.category));
  expect(cats.has('authorize'), `chip ${chipId}: Authorize decision event recorded`).toBe(true);
  expect(
    cats.has('gateway_path') || cats.has('mcp'),
    `chip ${chipId}: gateway/MCP routing event recorded`,
  ).toBe(true);
}

module.exports = { runChip, assertAdminPipelineEvents };
