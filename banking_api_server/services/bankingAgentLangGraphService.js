/**
 * Banking Agent LangGraph Service
 * LangGraph agent executor for banking operations with MCP tools + HITL gates
 * Priority: heuristic regex (instant, zero-cost) → LangGraph LLM (when regex returns kind:'none')
 */

const { createBankingAgent, MAX_TOOL_ITERATIONS } = require('./agentBuilder');
const { GraphRecursionError } = require('@langchain/langgraph');
const appEventService = require('./appEventService');
const { parseHeuristic } = require('./nlIntentParser');
const dataStore = require('../data/store');
const axios = require('axios');
const https = require('https');
const fs = require('fs');
const path = require('path');

/**
 * WR-07(b): Sanitize an account identifier before it lands in a transaction
 * `description` string. accountType is user-controlled (set at account
 * creation) and flows unsanitized into the audit log + Token Chain
 * explanation strings. Strip control chars and template/markup-injection-ish
 * characters, collapse whitespace, and bound the length. Not a
 * code-execution vector — defence-in-depth so a hostile account label can't
 * inject into logged/persisted free text.
 */
function sanitizeAccountLabel(value) {
  return String(value == null ? '' : value)
    .replace(/[\u0000-\u001f\u007f]/g, '') // control chars
    .replace(/[`$<>{}\\]/g, '')            // template / markup injection chars
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 64) || 'account';
}

/**
 * POST to /api/transactions via internal HTTP, going through all auth/HITL gates.
 * Uses HTTPS if certs are present (matching server.js startup logic), HTTP otherwise.
 */
async function _callTransactionsApi(body, userToken) {
  if (!userToken) throw new Error('No user token — cannot call /api/transactions');
  const PORT = process.env.PORT || 3001;
  const certFile = path.join(__dirname, '../certs/api.ping.demo+2.pem');
  const useHttps = fs.existsSync(certFile);
  const host = 'localhost';
  const baseUrl = `${useHttps ? 'https' : 'http'}://${host}:${PORT}`;
  const config = {
    method: 'POST',
    url: `${baseUrl}/api/transactions`,
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${userToken}` },
    data: body,
    validateStatus: () => true,
  };
  if (useHttps) {
    // CR-04: Default to TLS verification ON. Previously this passed
    // `rejectUnauthorized: false` unconditionally, sending a PingOne bearer
    // over an unverified TLS channel. mkcert installs the local CA, so the
    // default agent verifies api.ping.demo / localhost loopback certs fine.
    //
    // Dev escape hatch (mirrors BL-04 in agentMcpTokenService._resolveFinalMcpAudience):
    // only relax verification when NODE_ENV is non-production AND the target
    // is a loopback hostname. Production hard-ignores the flag.
    const isProd = process.env.NODE_ENV === 'production';
    const isLoopback = host === 'localhost' || host === '127.0.0.1';
    if (!isProd && isLoopback) {
      config.httpsAgent = new https.Agent({ rejectUnauthorized: false });
    }
  }
  return axios(config);
}

/**
 * Execute a banking action identified by the heuristic parser, returning a chat-style reply.
 * Handles Phase 2-3 token exchange if needed.
 * @returns {{ reply: string, success: boolean, toolsCalled: string[], tokensUsed: number, requiresConsent: boolean, agentConfigured: boolean, tokenEvents: any[] } | null}
 */
async function executeHeuristicBanking(parsed, userId, userToken, req = null, subjectToken = null) {
  const action = parsed?.banking?.action;
  const params = parsed?.banking?.params || {};
  if (!action) return null;

  const sessionRole = req?.session?.user?.role;
  const isAdmin = sessionRole === 'admin';

  try {
    if (action === 'accounts') {
      // Admin: return all accounts system-wide; user: own accounts only
      const accounts = isAdmin
        ? (dataStore.getAllAccounts ? dataStore.getAllAccounts() : await dataStore.getAccountsByUserId(userId))
        : await dataStore.getAccountsByUserId(userId);
      if (!accounts || accounts.length === 0) {
        return { reply: isAdmin ? 'No customer accounts found in the system.' : 'You don\'t have any accounts yet.', success: true, toolsCalled: ['get_my_accounts'], tokensUsed: 0, requiresConsent: false, agentConfigured: true, tokenEvents: [] };
      }
      // Normalize to snake_case keeping all detail fields so AccountsTable renders full info
      const normalizedAccounts = accounts.map(a => ({
        id: a.id,
        account_type: a.accountType,
        type: a.accountType,
        account_number: a.accountNumber,
        accountNumber: a.accountNumber,
        balance: a.balance,
        currency: a.currency || 'USD',
        name: a.name,
        status: a.status || 'active',
        accountHolderName: a.accountHolderName || null,
        iban: a.iban || null,
        swiftCode: a.swiftCode || null,
        branchName: a.branchName || null,
        branchCode: a.branchCode || null,
        openedDate: a.openedDate || null,
      }));
      const lines = accounts.map(a =>
        `• **${a.accountType}** (${a.accountNumber || '—'}) — **$${Number(a.balance).toFixed(2)}** ${a.currency || 'USD'}`
      );
      return { reply: `${isAdmin ? 'Here are all customer accounts' : 'Here are your accounts'}:\n\n${lines.join('\n\n')}`, success: true, toolsCalled: ['get_my_accounts'], tokensUsed: 0, requiresConsent: false, agentConfigured: true, tokenEvents: [], accounts: normalizedAccounts };
    }

    if (action === 'balance') {
      const accounts = await dataStore.getAccountsByUserId(userId);
      if (!accounts || accounts.length === 0) {
        return { reply: 'No accounts found.', success: true, toolsCalled: ['get_account_balance'], tokensUsed: 0, requiresConsent: false, agentConfigured: true, tokenEvents: [] };
      }
      // If a specific account was requested, find it
      if (params.accountId) {
        const acct = accounts.find(a => a.id === params.accountId || a.accountType === params.accountId);
        if (acct) {
          return { reply: `Your **${acct.accountType}** balance is **$${Number(acct.balance).toFixed(2)}**.`, success: true, toolsCalled: ['get_account_balance'], tokensUsed: 0, requiresConsent: false, agentConfigured: true, tokenEvents: [], balance: acct.balance };
        }
      }
      // Show all balances — return as accounts list
      const lines = accounts.map(a => `• **${a.accountType}**: $${Number(a.balance).toFixed(2)}`);
      const normalizedAccounts = accounts.map(a => ({
        id: a.id, account_type: a.accountType, type: a.accountType,
        account_number: a.accountNumber, accountNumber: a.accountNumber,
        balance: a.balance, currency: a.currency || 'USD', name: a.name,
        status: a.status || 'active',
        accountHolderName: a.accountHolderName || null,
        iban: a.iban || null, swiftCode: a.swiftCode || null,
        branchName: a.branchName || null, branchCode: a.branchCode || null,
        openedDate: a.openedDate || null,
      }));
      return { reply: `Your balances:\n\n${lines.join('\n')}`, success: true, toolsCalled: ['get_account_balance'], tokensUsed: 0, requiresConsent: false, agentConfigured: true, tokenEvents: [], accounts: normalizedAccounts };
    }

    if (action === 'transactions') {
      const txns = await dataStore.getTransactionsByUserId(userId);
      if (!txns || txns.length === 0) {
        return { reply: 'No recent transactions found.', success: true, toolsCalled: ['get_my_transactions'], tokensUsed: 0, requiresConsent: false, agentConfigured: true, tokenEvents: [] };
      }
      const recent = txns.slice(-5).reverse();
      const lines = recent.map(t => `• ${t.type} — $${Number(t.amount).toFixed(2)} — ${t.description || t.type}`);
      return { reply: `Recent transactions:\n\n${lines.join('\n')}`, success: true, toolsCalled: ['get_my_transactions'], tokensUsed: 0, requiresConsent: false, agentConfigured: true, tokenEvents: [], transactions: recent };
    }

    if (action === 'transfer') {
      if (!params.fromId || !params.toId || !params.amount) {
        const missing = [];
        if (!params.fromId) missing.push('source account (e.g. "from checking")');
        if (!params.toId) missing.push('destination account (e.g. "to savings")');
        if (!params.amount) missing.push('amount (e.g. "$100")');
        return { reply: `I can help you transfer funds. Please provide: ${missing.join(', ')}.\n\nExample: "Transfer $100 from checking to savings"`, success: true, toolsCalled: [], tokensUsed: 0, requiresConsent: false, agentConfigured: true, tokenEvents: [] };
      }
      // Full params — execute via data store
      const accounts = await dataStore.getAccountsByUserId(userId);
      const fromAcct = accounts?.find(a => a.accountType?.toLowerCase() === params.fromId?.toLowerCase() || a.id === params.fromId);
      const toAcct = accounts?.find(a => a.accountType?.toLowerCase() === params.toId?.toLowerCase() || a.id === params.toId);
      if (!fromAcct || !toAcct) {
        return { reply: `❌ Could not find the specified accounts. Your accounts: ${(accounts || []).map(a => a.accountType).join(', ')}`, success: false, toolsCalled: ['transfer'], tokensUsed: 0, requiresConsent: false, agentConfigured: true, tokenEvents: [] };
      }
      // Resolve account types to account IDs for frontend consumption (prevents "account not found" API errors)
      params.fromId = fromAcct.id;
      params.toId = toAcct.id;
      const amount = parseFloat(params.amount);
      if (isNaN(amount) || amount <= 0) {
        return { reply: '❌ Please specify a valid positive amount.', success: false, toolsCalled: ['transfer'], tokensUsed: 0, requiresConsent: false, agentConfigured: true, tokenEvents: [] };
      }
      if (Number(fromAcct.balance) < amount) {
        return { reply: `Insufficient funds in ${fromAcct.accountType}. Balance: $${Number(fromAcct.balance).toFixed(2)}`, success: false, toolsCalled: ['transfer'], tokensUsed: 0, requiresConsent: false, agentConfigured: true, tokenEvents: [] };
      }
      try {
        const txRes = await _callTransactionsApi({
          fromAccountId: fromAcct.id,
          toAccountId: toAcct.id,
          amount,
          type: 'transfer',
          // WR-07(b): sanitize account labels before they land in the
          // transaction description (flows to audit log + Token Chain text).
          description: params.description || `Transfer from ${sanitizeAccountLabel(fromAcct.accountType)} to ${sanitizeAccountLabel(toAcct.accountType)}`,
        }, userToken);
        if (txRes.status === 428) {
          const body = txRes.data;
          return { reply: body.error_description || 'This transfer requires your approval. Please confirm in the consent dialog.', success: false, toolsCalled: ['create_transfer'], tokensUsed: 0, requiresConsent: false, agentConfigured: true, tokenEvents: [], error: 'hitl_required', hitl: body.hitl || { type: 'consent' }, hitl_threshold_usd: body.hitl_threshold_usd || body.amount || amount, fromAccountId: fromAcct.id, toAccountId: toAcct.id, transactionAmount: amount, transactionType: 'transfer' };
        }
        if (txRes.status === 403) {
          const body = txRes.data;
          return { reply: `Transfer denied: ${body.error_description || body.error || 'Policy denied this transaction.'}`, success: false, toolsCalled: ['create_transfer'], tokensUsed: 0, requiresConsent: false, agentConfigured: true, tokenEvents: [] };
        }
        if (txRes.status >= 400) {
          const body = txRes.data;
          return { reply: `Transfer failed: ${body.error_description || body.error || 'Unknown error'}`, success: false, toolsCalled: ['create_transfer'], tokensUsed: 0, requiresConsent: false, agentConfigured: true, tokenEvents: [] };
        }
        return { reply: `Transferred **$${amount.toFixed(2)}** from ${fromAcct.accountType} to ${toAcct.accountType}.`, success: true, toolsCalled: ['create_transfer'], tokensUsed: 0, requiresConsent: false, agentConfigured: true, tokenEvents: [] };
      } catch (err) {
        // WR-07(a): non-Error throws have no .message — surface the real value.
        return { reply: `Transfer failed: ${(err && err.message) ? err.message : String(err)}`, success: false, toolsCalled: ['create_transfer'], tokensUsed: 0, requiresConsent: false, agentConfigured: true, tokenEvents: [] };
      }
    }

    if (action === 'deposit') {
      if (!params.toId || !params.amount) {
        const missing = [];
        if (!params.toId) missing.push('account (e.g. "into checking")');
        if (!params.amount) missing.push('amount (e.g. "$50")');
        return { reply: `I can help you deposit funds. Please provide: ${missing.join(', ')}.\n\nExample: "Deposit $50 into checking"`, success: true, toolsCalled: [], tokensUsed: 0, requiresConsent: false, agentConfigured: true, tokenEvents: [] };
      }
      const accounts = await dataStore.getAccountsByUserId(userId);
      const toAcct = accounts?.find(a => a.accountType?.toLowerCase() === params.toId?.toLowerCase() || a.id === params.toId);
      if (!toAcct) {
        return { reply: `❌ Could not find account "${params.toId}". Your accounts: ${(accounts || []).map(a => a.accountType).join(', ')}`, success: false, toolsCalled: ['deposit'], tokensUsed: 0, requiresConsent: false, agentConfigured: true, tokenEvents: [] };
      }
      // Resolve account type to account ID for frontend consumption (prevents "account not found" API error)
      params.toId = toAcct.id;
      const amount = parseFloat(params.amount);
      if (isNaN(amount) || amount <= 0) {
        return { reply: '❌ Please specify a valid positive amount.', success: false, toolsCalled: ['deposit'], tokensUsed: 0, requiresConsent: false, agentConfigured: true, tokenEvents: [] };
      }
      try {
        const txRes = await _callTransactionsApi({
          toAccountId: toAcct.id,
          amount,
          type: 'deposit',
          description: params.description || 'Agent deposit',
        }, userToken);
        if (txRes.status === 428) {
          const body = txRes.data;
          return { reply: body.error_description || 'This deposit requires your approval. Please confirm in the consent dialog.', success: false, toolsCalled: ['create_deposit'], tokensUsed: 0, requiresConsent: false, agentConfigured: true, tokenEvents: [], error: 'hitl_required', hitl: body.hitl || { type: 'consent' }, hitl_threshold_usd: body.hitl_threshold_usd || body.amount || amount, toAccountId: toAcct.id, transactionAmount: amount, transactionType: 'deposit' };
        }
        if (txRes.status === 403) {
          const body = txRes.data;
          return { reply: `Deposit denied: ${body.error_description || body.error || 'Policy denied this transaction.'}`, success: false, toolsCalled: ['create_deposit'], tokensUsed: 0, requiresConsent: false, agentConfigured: true, tokenEvents: [] };
        }
        if (txRes.status >= 400) {
          const body = txRes.data;
          return { reply: `Deposit failed: ${body.error_description || body.error || 'Unknown error'}`, success: false, toolsCalled: ['create_deposit'], tokensUsed: 0, requiresConsent: false, agentConfigured: true, tokenEvents: [] };
        }
        return { reply: `Deposited **$${amount.toFixed(2)}** into ${toAcct.accountType}.`, success: true, toolsCalled: ['create_deposit'], tokensUsed: 0, requiresConsent: false, agentConfigured: true, tokenEvents: [] };
      } catch (err) {
        // WR-07(a): non-Error throws have no .message — surface the real value.
        return { reply: `Deposit failed: ${(err && err.message) ? err.message : String(err)}`, success: false, toolsCalled: ['create_deposit'], tokensUsed: 0, requiresConsent: false, agentConfigured: true, tokenEvents: [] };
      }
    }

    if (action === 'withdraw') {
      if (!params.fromId || !params.amount) {
        const missing = [];
        if (!params.fromId) missing.push('account (e.g. "from checking")');
        if (!params.amount) missing.push('amount (e.g. "$50")');
        return { reply: `I can help you withdraw funds. Please provide: ${missing.join(', ')}.\n\nExample: "Withdraw $50 from checking"`, success: true, toolsCalled: [], tokensUsed: 0, requiresConsent: false, agentConfigured: true, tokenEvents: [] };
      }
      const accounts = await dataStore.getAccountsByUserId(userId);
      const fromAcct = accounts?.find(a => a.accountType?.toLowerCase() === params.fromId?.toLowerCase() || a.id === params.fromId);
      if (!fromAcct) {
        return { reply: `Could not find account "${params.fromId}". Your accounts: ${(accounts || []).map(a => a.accountType).join(', ')}`, success: false, toolsCalled: ['withdraw'], tokensUsed: 0, requiresConsent: false, agentConfigured: true, tokenEvents: [] };
      }
      // Resolve account type to account ID for frontend consumption (prevents "From account not found" API error)
      params.fromId = fromAcct.id;
      const amount = parseFloat(params.amount);
      if (isNaN(amount) || amount <= 0) {
        return { reply: 'Please specify a valid positive amount.', success: false, toolsCalled: ['withdraw'], tokensUsed: 0, requiresConsent: false, agentConfigured: true, tokenEvents: [] };
      }
      if (Number(fromAcct.balance) < amount) {
        return { reply: `Insufficient funds in ${fromAcct.accountType}. Balance: $${Number(fromAcct.balance).toFixed(2)}`, success: false, toolsCalled: ['withdraw'], tokensUsed: 0, requiresConsent: false, agentConfigured: true, tokenEvents: [] };
      }
      try {
        const txRes = await _callTransactionsApi({
          fromAccountId: fromAcct.id,
          amount,
          type: 'withdrawal',
          description: params.description || 'Agent withdrawal',
        }, userToken);
        if (txRes.status === 428) {
          const body = txRes.data;
          return { reply: body.error_description || 'This withdrawal requires your approval. Please confirm in the consent dialog.', success: false, toolsCalled: ['create_withdrawal'], tokensUsed: 0, requiresConsent: false, agentConfigured: true, tokenEvents: [], error: 'hitl_required', hitl: body.hitl || { type: 'consent' }, hitl_threshold_usd: body.hitl_threshold_usd || body.amount || amount, fromAccountId: fromAcct.id, transactionAmount: amount, transactionType: 'withdrawal' };
        }
        if (txRes.status === 403) {
          const body = txRes.data;
          return { reply: `Withdrawal denied: ${body.error_description || body.error || 'Policy denied this transaction.'}`, success: false, toolsCalled: ['create_withdrawal'], tokensUsed: 0, requiresConsent: false, agentConfigured: true, tokenEvents: [] };
        }
        if (txRes.status >= 400) {
          const body = txRes.data;
          return { reply: `Withdrawal failed: ${body.error_description || body.error || 'Unknown error'}`, success: false, toolsCalled: ['create_withdrawal'], tokensUsed: 0, requiresConsent: false, agentConfigured: true, tokenEvents: [] };
        }
        return { reply: `Withdrew **$${amount.toFixed(2)}** from ${fromAcct.accountType}.`, success: true, toolsCalled: ['create_withdrawal'], tokensUsed: 0, requiresConsent: false, agentConfigured: true, tokenEvents: [] };
      } catch (err) {
        // WR-07(a): non-Error throws have no .message — surface the real value.
        return { reply: `Withdrawal failed: ${(err && err.message) ? err.message : String(err)}`, success: false, toolsCalled: ['create_withdrawal'], tokensUsed: 0, requiresConsent: false, agentConfigured: true, tokenEvents: [] };
      }
    }

    // For mcp_tools — let LangGraph handle (needs MCP connection)

    if (action === 'sensitive_account_details') {
      const { get_sensitive_account_details } = require('./mcpLocalTools');
      // Use the real req (which has session.stepUpVerified) when available.
      // Fall back to a fakeReq built from token ACR claims when called without req.
      let effectiveReq = req;
      if (!effectiveReq && userToken) {
        try {
          const payload = JSON.parse(Buffer.from(userToken.split('.')[1], 'base64').toString());
          effectiveReq = { user: { acr: payload.acr || payload['pingone:acr'] || '' } };
        } catch (e) { /* token decode failed — step-up will be required */ }
      }
      const result = await get_sensitive_account_details({}, userId, effectiveReq);
      if (result.error === 'hitl_required' || result.hitl_required) {
        return { reply: '🔒 Viewing sensitive account details requires your approval. Please confirm in the consent modal to continue.', success: false, toolsCalled: ['get_sensitive_account_details'], tokensUsed: 0, requiresConsent: true, agentConfigured: true, tokenEvents: [], error: 'hitl_required', hitl: { type: 'consent' }, hitl_threshold_usd: 0 };
      }
      if (!result.ok) {
        return { reply: `❌ ${result.error || 'Could not retrieve sensitive account details.'}`, success: false, toolsCalled: ['get_sensitive_account_details'], tokensUsed: 0, requiresConsent: false, agentConfigured: true, tokenEvents: [] };
      }
      const lines = result.accounts.map(a => {
        const parts = [`• **${a.accountType}** — ${a.name || a.accountType}`];
        if (a.accountNumberFull) parts.push(`  Account #: ${a.accountNumberFull}`);
        if (a.routingNumber) parts.push(`  Routing #: ${a.routingNumber}`);
        if (a.swiftCode) parts.push(`  SWIFT: ${a.swiftCode}`);
        return parts.join('\n');
      });
      return { 
        reply: `Here are your sensitive account details:\n\n${lines.join('\n\n')}`, 
        success: true, 
        toolsCalled: ['get_sensitive_account_details'], 
        tokensUsed: 0, 
        requiresConsent: false, 
        agentConfigured: true, 
        tokenEvents: [],
        // Include structured account data for UI panel display
        accountData: {
          user: result.user,
          accounts: result.accounts
        }
      };
    }
  } catch (err) {
    // WR-07(a): non-Error throws (string, MCP-error object without .message)
    // previously logged `undefined` and were swallowed — the function then
    // returned null, so the caller fell through to the LLM path which could
    // RE-EXECUTE a write tool (transfer/deposit/withdraw) a second time.
    // Log the real value, and re-throw for write actions so a partially
    // executed mutation is surfaced instead of silently double-run.
    const detail = (err && err.message) ? err.message : String(err);
    console.warn('[heuristicBanking] Error executing action:', action, detail);
    if (['transfer', 'deposit', 'withdraw'].includes(action)) {
      throw (err instanceof Error) ? err : new Error(`[heuristicBanking] ${action} failed: ${detail}`);
    }
  }
  return null;
}

/**
 * Process incoming user message through the agent
 */
async function processAgentMessage({ message, userId, userToken, sessionId, tokenEvents = [], langchainConfig = {}, req = null }) {
  try {
    console.log('[processAgentMessage] Starting');
    appEventService.logEvent('agent', 'info', 'Agent processing message…', { tag: 'agent/message' });
    console.log('[processAgentMessage] userId:', userId);
    console.log('[processAgentMessage] userToken present:', !!userToken);
    console.log('[processAgentMessage] userToken length:', userToken?.length || 0);
    console.log('[processAgentMessage] sessionId:', sessionId);
    console.log('[processAgentMessage] tokenEvents count:', tokenEvents?.length || 0);
    console.log('[processAgentMessage] message length:', message?.length || 0);

    // Extract subject token from request (Phase 3: user has authorized)
    const subjectToken = req?.body?.subjectToken;
    if (subjectToken) {
      console.log('[processAgentMessage] Subject token provided, Phase 3 token exchange available');
      if (req?.recordTokenEvent) {
        req.recordTokenEvent('subject_token_provided', {
          source: 'agent_request',
        });
      }
    }

    // ── Heuristic first: handle known banking intents without LLM ──
    // Falls through to LangGraph/LLM only if heuristic doesn't match or if disabled.
    const heuristicEnabled = require('../services/configStore').getEffective('ff_heuristic_enabled') !== 'false';

    if (heuristicEnabled) {
      const heuristic = parseHeuristic(message);
      if (heuristic && heuristic.kind === 'banking') {
        const heuristicResult = await executeHeuristicBanking(heuristic, userId, userToken, req, subjectToken);
        if (heuristicResult) {
          console.log('[processAgentMessage] Heuristic matched:', heuristic.banking?.action, '— skipping LLM');
          appEventService.logEvent('agent', 'info', `Heuristic: ${heuristic.banking?.action}`, { tag: 'agent/heuristic' });
          appEventService.logEvent('agent_prompt', 'info', `Heuristic tool dispatch: ${heuristic.banking?.action}`,
            { tag: 'agent_prompt/heuristic_tool', metadata: { action: heuristic.banking?.action, userId } });
          return heuristicResult;
        }
        // Heuristic matched but couldn't execute (transfer/deposit/etc.) — fall through to LLM
      }
    } else {
      console.log('[processAgentMessage] Heuristic disabled via ff_heuristic_enabled flag — using LLM for all queries');
      if (req?.recordTokenEvent) {
        req.recordTokenEvent('heuristic_disabled', { reason: 'ff_heuristic_enabled=false' });
      }
    }

    // Note: Ollama (default) needs no API key. Cloud LLMs need keys added via /llm-config.

    console.log('[processAgentMessage] Creating banking agent...');
    appEventService.logEvent('agent', 'info', 'Initializing LangGraph agent', { tag: 'agent/init' });
    const { graph, initialState } = await createBankingAgent({
      userId,
      userToken,
      sessionId,
      tokenEvents,
      langchainConfig,
      subjectToken,
      req,
    });
    console.log('[processAgentMessage] Agent created successfully');

    // Invoke the LangGraph with the user message
    console.log('[processAgentMessage] Invoking LangGraph agent...');
    appEventService.logEvent('agent', 'info', 'LLM reasoning…', { tag: 'agent/invoke' });
    appEventService.logEvent('agent_prompt', 'info', `LLM prompt: ${String(message)}`,
      { tag: 'agent_prompt/llm_invoke', metadata: { userId, sessionId, messageLength: message?.length || 0, prompt: String(message), systemPrompt: langchainConfig?.systemPrompt || undefined, model: langchainConfig?.model || undefined, toolsAvailable: initialState?.tools?.map(t => t.name || t) || undefined } });
    let finalState;
    try {
      // WR-03: cap the agent⇄tools loop. recursionLimit counts every node
      // step; MAX_TOOL_ITERATIONS mirrors the agent_service orchestrator.
      finalState = await graph.invoke({
        ...initialState,
        messages: [{ role: 'user', content: message }],
      }, { recursionLimit: MAX_TOOL_ITERATIONS });
    } catch (invokeErr) {
      // WR-03: LangGraph throws GraphRecursionError when the cap is hit
      // (LLM kept emitting tool_calls). Stop the loop and return a clear
      // limit response instead of letting it surface as a generic error /
      // upstream timeout. Shape matches this file's other return objects.
      if (invokeErr instanceof GraphRecursionError) {
        console.warn('[processAgentMessage] Max tool iteration limit reached:', MAX_TOOL_ITERATIONS);
        appEventService.logEvent('agent', 'warning',
          `Agent reached maximum tool iteration limit (${MAX_TOOL_ITERATIONS})`,
          { tag: 'agent/recursion_limit' });
        return {
          reply: 'Agent reached maximum tool iteration limit. Please rephrase your request or try a simpler query.',
          success: false,
          toolsCalled: [],
          tokensUsed: 0,
          requiresConsent: false,
          agentConfigured: true,
          tokenEvents: tokenEvents || [],
          error: 'max_tool_iterations',
        };
      }
      throw invokeErr;
    }
    console.log('[processAgentMessage] Agent invoke completed');
    appEventService.logEvent('agent', 'info', 'Agent response ready', { tag: 'agent/complete' });
    appEventService.logEvent('agent_prompt', 'info', `LLM response: ${String(finalState?.messages?.[finalState.messages.length - 1]?.content || '')}`,
      { tag: 'agent_prompt/llm_complete', metadata: { userId, messageCount: finalState?.messages?.length || 0, response: String(finalState?.messages?.[finalState.messages.length - 1]?.content || ''), model: langchainConfig?.model || undefined } });
    console.log('[processAgentMessage] Final state keys:', Object.keys(finalState || {}));
    console.log('[processAgentMessage] Final messages count:', finalState?.messages?.length || 0);
    console.log('[processAgentMessage] Token events count:', finalState?.tokenEvents?.length || 0);

    // Extract the last message from the agent response
    const lastMessage = finalState.messages[finalState.messages.length - 1];
    const responseContent = lastMessage?.content || lastMessage?.text || 'No response from agent';

    return {
      reply: responseContent,
      success: true,
      toolsCalled: [],
      tokensUsed: 0,
      requiresConsent: false,
      agentConfigured: true,
      tokenEvents: finalState?.tokenEvents || []
    };
  } catch (error) {
    // TOKEN_INACTIVE must propagate so the route can return 401 + need_auth
    if (error.code === 'TOKEN_INACTIVE') throw error;
    // Tag with source module if not already tagged — makes stack traces immediately actionable
    if (!error.source) error.source = 'bankingAgentLangGraphService';
    if (!error.message.startsWith('[')) error.message = `[bankingAgentLangGraphService] ${error.message}`;
    console.error('[processAgentMessage] ERROR: Agent processing error');
    appEventService.logEvent('agent', 'error', `Agent error: ${error.message}`, { tag: 'agent/error' });
    console.error('[processAgentMessage] Error name:', error.name);
    console.error('[processAgentMessage] Error message:', error.message);
    console.error('[processAgentMessage] Error stack:', error.stack);
    console.error('[processAgentMessage] Error code:', error.code);
    console.error('[processAgentMessage] Full error object:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));

    // Return a graceful error response instead of throwing
    let userMessage = 'The banking agent encountered an error. Please try again.';
    if (error.message.includes('model') && (error.message.includes('not found') || error.message.includes('not_found'))) {
      userMessage = 'No AI model is configured (Ollama not running). Your request could not be understood — try rephrasing with keywords like "show accounts", "my balance", or "transfer".';
    } else if (error.message.includes('API key') || error.message.includes('401')) {
      userMessage = 'Authentication error. Please log out and log in again.';
    } else if (error.message.includes('timeout') || error.message.includes('ETIMEDOUT') || error.name === 'AbortError') {
      userMessage = 'The AI service took too long to respond. Please try again.';
    } else if (error.message.includes('429') || error.message.includes('rate limit')) {
      userMessage = 'Too many requests. Please wait a moment and try again.';
    }
    return {
      reply: userMessage,
      success: false,
      error: error.message,
      toolsCalled: [],
      tokensUsed: 0,
      requiresConsent: false,
      agentError: true,
      errorMessage: error.message
    };
  }
}

module.exports = {
  processAgentMessage
};
