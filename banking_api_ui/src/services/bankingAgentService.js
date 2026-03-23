/**
 * Banking Agent service — MCP edition.
 *
 * Calls the banking_api_server's `/api/mcp/tool` proxy, which forwards requests
 * to the banking_mcp_server via WebSocket (JSON-RPC).
 *
 * Returns { result, tokenEvents } so callers can push events to TokenChainContext.
 * tokenEvents is an array of token lifecycle objects from the BFF:
 *   - User Token (T1) decoded claims + may_act status
 *   - Token Exchange (RFC 8693) request + result
 *   - Exchanged Token (T2) decoded claims + act status
 */

// ─── Low-level MCP tool call ──────────────────────────────────────────────────

/**
 * Execute a single MCP tool via the server-side proxy.
 * Returns { result, tokenEvents } — tokenEvents may be empty if the server
 * does not support the field (backwards compat).
 *
 * @param {string} tool   - MCP tool name (e.g. 'get_my_accounts')
 * @param {object} params - Tool parameters
 * @returns {Promise<{ result: any, tokenEvents: Array }>}
 */
export async function callMcpTool(tool, params = {}) {
  const response = await fetch('/api/mcp/tool', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tool, params }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ message: response.statusText }));
    // Surface tokenEvents even on error responses (e.g. token_exchange_failed)
    const tokenEvents = err.tokenEvents || [];
    throw Object.assign(new Error(err.message || `MCP error: ${response.status}`), { tokenEvents });
  }

  const data = await response.json();
  return {
    result: data.result,
    tokenEvents: data.tokenEvents || [],
  };
}

// ─── Named tool helpers ───────────────────────────────────────────────────────
// Each helper returns { result, tokenEvents } for the caller to consume.

export function getMyAccounts() {
  return callMcpTool('get_my_accounts');
}

export function getAccountBalance(accountId) {
  return callMcpTool('get_account_balance', { account_id: accountId });
}

export function getMyTransactions(limit = 10) {
  return callMcpTool('get_my_transactions', { limit });
}

export function createTransfer(fromAccountId, toAccountId, amount, description) {
  return callMcpTool('create_transfer', {
    from_account_id: fromAccountId,
    to_account_id: toAccountId,
    amount,
    description: description || 'Agent transfer',
  });
}

export function createDeposit(accountId, amount, description) {
  return callMcpTool('create_deposit', {
    account_id: accountId,
    amount,
    description: description || 'Agent deposit',
  });
}

export function createWithdrawal(accountId, amount, description) {
  return callMcpTool('create_withdrawal', {
    account_id: accountId,
    amount,
    description: description || 'Agent withdrawal',
  });
}
