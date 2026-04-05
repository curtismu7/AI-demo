/**
 * Banking Agent service — MCP edition.
 *
 * Calls the banking_api_server's `/api/mcp/tool` proxy, which forwards requests
 * to the banking_mcp_server via WebSocket (JSON-RPC).
 *
 * Returns { result, tokenEvents } so callers can push events to TokenChainContext.
 * tokenEvents is an array of token lifecycle objects from the Backend-for-Frontend (BFF):
 *   - User access token decoded claims + may_act status (+ jwtFullDecode JSON)
 *   - Token Exchange (RFC 8693) request + result
 *   - MCP access token (delegated) decoded claims + act status (+ jwtFullDecode JSON)
 */
import { appendTokenEvents } from './apiTrafficStore';
import { appendMcpCall } from './mcpCallStore';
import { agentFlowDiagram } from './agentFlowDiagramService';
import { openMcpFlowSse } from './mcpFlowSseClient';

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
  // Client-side validation to prevent 400 errors and improve debugging
  if (!tool || typeof tool !== 'string') {
    console.error('[callMcpTool] Invalid tool parameter:', { tool, toolType: typeof tool, params });
    throw new Error(`Invalid tool name: ${tool} (type: ${typeof tool}). Expected non-empty string.`);
  }

  // Defensive check for browser extension interference
  try {
    console.log('[callMcpTool] Calling MCP tool:', { tool, paramsKeys: Object.keys(params || {}) });
  } catch (err) {
    console.warn('[callMcpTool] Console logging failed (possible extension interference):', err);
  }
  
  try {
    agentFlowDiagram.startMcpToolCall(tool);
  } catch (err) {
    console.warn('[callMcpTool] Flow diagram initialization failed:', err);
  }

  const flowTraceId =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

  const closeSse = openMcpFlowSse(flowTraceId, (data) => {
    try {
      agentFlowDiagram.applyServerEvent(data);
    } catch (err) {
      console.warn('[callMcpTool] Failed to apply server event:', err);
    }
  });

  // Defensive body construction with validation
  let body;
  try {
    const requestBody = { tool, params: params || {}, flowTraceId };
    body = JSON.stringify(requestBody);
    
    // Validate the body was created successfully
    if (!body || typeof body !== 'string') {
      throw new Error('Failed to serialize request body');
    }
  } catch (err) {
    console.error('[callMcpTool] Failed to construct request body:', { tool, params, err });
    throw new Error(`Request body construction failed: ${err.message}`);
  }

  const fetchOpts = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    credentials: 'include',
  };

  const t0 = Date.now();
  try {
    let response = await fetch('/api/mcp/tool', fetchOpts);
    
    // Enhanced 400 error handling
    if (response.status === 400) {
      const err400 = await response.clone().json().catch(() => ({ 
        error: 'unknown_400',
        message: 'Bad request - invalid tool parameters',
        debug: { status: 400, body: body.substring(0, 200) }
      }));
      
      console.error('[callMcpTool] 400 error from server:', {
        error: err400,
        requestBody: { tool, params, flowTraceId },
        bodyLength: body.length
      });
      
      const tokenEvents = err400.tokenEvents || [];
      appendMcpCall(tool, 400, Date.now() - t0, null, err400.message);
      appendTokenEvents(tool, tokenEvents);
      
      try {
        agentFlowDiagram.completeMcpToolCall({
          toolName: tool,
          tokenEvents,
          ok: false,
          errorMessage: `400 Error: ${err400.message}`,
        });
      } catch (flowErr) {
        console.warn('[callMcpTool] Failed to complete flow diagram:', flowErr);
      }
      
      throw Object.assign(new Error(`MCP 400 Error: ${err400.message}`), {
        tokenEvents,
        statusCode: 400,
        code: err400.error,
        isClientError: true
      });
    }
    
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
      appendMcpCall(tool, response.status, Date.now() - t0, null, err.message || `HTTP ${response.status}`);
      appendTokenEvents(tool, tokenEvents);
      agentFlowDiagram.completeMcpToolCall({
        toolName: tool,
        tokenEvents,
        ok: false,
        errorMessage: err.message || `HTTP ${response.status}`,
      });
      const e = Object.assign(new Error(err.message || `MCP error: ${response.status}`), {
        tokenEvents,
        statusCode: response.status,
        code: err.error,
      });
      throw e;
    }

    const data = await response.json();
    appendMcpCall(tool, response.status, Date.now() - t0, data.result);
    appendTokenEvents(tool, data.tokenEvents || []);
    agentFlowDiagram.completeMcpToolCall({
      toolName: tool,
      tokenEvents: data.tokenEvents || [],
      ok: true,
      errorMessage: null,
    });
    return {
      result: data.result,
      tokenEvents: data.tokenEvents || [],
    };
  } catch (e) {
    // HTTP error path already completed the diagram before throw
    if (e.statusCode == null) {
      agentFlowDiagram.completeMcpToolCall({
        toolName: tool,
        tokenEvents: e.tokenEvents || [],
        ok: false,
        errorMessage: e.message || 'Network error',
      });
    }
    throw e;
  } finally {
    closeSse();
  }
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
    to_account_id: accountId,
    amount,
    description: description || 'Agent deposit',
  });
}

export function createWithdrawal(accountId, amount, description) {
  return callMcpTool('create_withdrawal', {
    from_account_id: accountId,
    amount,
    description: description || 'Agent withdrawal',
  });
}

// ─── Consent-challenge retry helpers (used by BankingAgent after HITL modal confirms) ───────────────
// These call the REST endpoint directly with a consentChallengeId so the
// server's HITL gate is satisfied. They return { result, tokenEvents } to
// match the shape returned by callMcpTool().

async function callRestTransaction(body) {
  const res = await fetch('/api/transactions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = Object.assign(
      new Error(data.message || data.error || `Transaction failed: ${res.status}`),
      { statusCode: res.status, code: data.error }
    );
    throw e;
  }
  return { result: data, tokenEvents: [] };
}

export function createTransferWithConsent(fromAccountId, toAccountId, amount, description, consentChallengeId) {
  return callRestTransaction({
    fromAccountId,
    toAccountId,
    amount,
    type: 'transfer',
    description: description || 'Agent transfer',
    consentChallengeId,
  });
}

export function createDepositWithConsent(accountId, amount, description, consentChallengeId) {
  return callRestTransaction({
    toAccountId: accountId,
    fromAccountId: null,
    amount,
    type: 'deposit',
    description: description || 'Agent deposit',
    consentChallengeId,
  });
}

export function createWithdrawalWithConsent(accountId, amount, description, consentChallengeId) {
  return callRestTransaction({
    fromAccountId: accountId,
    toAccountId: null,
    amount,
    type: 'withdrawal',
    description: description || 'Agent withdrawal',
    consentChallengeId,
  });
}
