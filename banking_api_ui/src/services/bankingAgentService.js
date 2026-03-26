/**
 * Banking Agent service — MCP edition.
 *
 * Calls the banking_api_server's `/api/mcp/tool` proxy, which forwards requests
 * to the banking_mcp_server via WebSocket (JSON-RPC).
 *
 * Returns { result, tokenEvents } so callers can push events to TokenChainContext.
 * tokenEvents is an array of token lifecycle objects from the Backend-for-Frontend (BFF):
 *   - User Token decoded claims + may_act status (+ jwtFullDecode JSON)
 *   - Token Exchange (RFC 8693) request + result
 *   - MCP Token (delegated) decoded claims + act status (+ jwtFullDecode JSON)
 */
import { appendTokenEvents } from './apiTrafficStore';

// ─── Session refresh (RFC 6749 §6) — same endpoints as Backend-for-Frontend (BFF) auto-refresh ───────

/**
 * Tries end-user refresh, then admin refresh. Does not log the user out.
 * @returns {Promise<{ ok: boolean, expiresAt?: number }>}
 */
export async function refreshOAuthSession() {
  const endpoints = ['/api/auth/oauth/user/refresh', '/api/auth/oauth/refresh'];
  for (const url of endpoints) {
    const res = await fetch(url, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    });
    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      return { ok: true, expiresAt: data.expiresAt };
    }
  }
  return { ok: false };
}

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
  const body = JSON.stringify({ tool, params });
  const fetchOpts = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    credentials: 'include',
  };

  let response = await fetch('/api/mcp/tool', fetchOpts);
  if (response.status === 401) {
    const err401 = await response.clone().json().catch(() => ({}));
    // Cookie-only / empty Redis session: refresh cannot add tokens — avoid spamming refresh endpoints.
    if (err401.error !== 'session_not_hydrated') {
      const refreshed = await refreshOAuthSession();
      if (refreshed.ok) {
        response = await fetch('/api/mcp/tool', fetchOpts);
      }
    }
  }

  if (!response.ok) {
    const err = await response.json().catch(() => ({ message: response.statusText }));
    const tokenEvents = err.tokenEvents || [];
    // Surface any partial token events (e.g. exchange-failed) in the API Traffic viewer
    appendTokenEvents(tool, tokenEvents);
    const e = Object.assign(new Error(err.message || `MCP error: ${response.status}`), {
      tokenEvents,
      statusCode: response.status,
      code: err.error,
    });
    throw e;
  }

  const data = await response.json();
  // Push token-event entries (user token, RFC 8693 exchange, MCP token) to API Traffic viewer
  appendTokenEvents(tool, data.tokenEvents || []);
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
