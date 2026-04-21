/**
 * Banking Agent LangGraph Service
 * LangGraph agent executor for banking operations with MCP tools + HITL gates
 * Priority: heuristic regex (instant, zero-cost) → LangGraph LLM (when regex returns kind:'none')
 */

const { createBankingAgent } = require('./agentBuilder');
const appEventService = require('./appEventService');
const { parseHeuristic } = require('./nlIntentParser');
const dataStore = require('../data/store');

/**
 * Execute a banking action identified by the heuristic parser, returning a chat-style reply.
 * @returns {{ reply: string, success: boolean, toolsCalled: string[], tokensUsed: number, requiresConsent: boolean, agentConfigured: boolean, tokenEvents: any[] } | null}
 */
async function executeHeuristicBanking(parsed, userId, userToken, req = null) {
  const action = parsed?.banking?.action;
  const params = parsed?.banking?.params || {};
  if (!action) return null;

  try {
    if (action === 'accounts') {
      const accounts = await dataStore.getAccountsByUserId(userId);
      if (!accounts || accounts.length === 0) {
        return { reply: 'You don\'t have any accounts yet.', success: true, toolsCalled: ['get_my_accounts'], tokensUsed: 0, requiresConsent: false, agentConfigured: true, tokenEvents: [] };
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
      const lines = accounts.map(a => {
        const parts = [`• **${a.accountType}** (${a.accountNumber || '—'}) — **$${Number(a.balance).toFixed(2)}** ${a.currency || 'USD'}`];
        if (a.accountHolderName) parts.push(`  Holder: ${a.accountHolderName}`);
        if (a.iban) parts.push(`  IBAN: ${a.iban}`);
        if (a.swiftCode) parts.push(`  SWIFT: ${a.swiftCode}`);
        if (a.branchName) parts.push(`  Branch: ${a.branchName}${a.branchCode ? ` (${a.branchCode})` : ''}`);
        if (a.openedDate) parts.push(`  Opened: ${a.openedDate}`);
        if (a.status) parts.push(`  Status: ${a.status}`);
        return parts.join('\n');
      });
      return { reply: `Here are your accounts:\n\n${lines.join('\n\n')}`, success: true, toolsCalled: ['get_my_accounts'], tokensUsed: 0, requiresConsent: false, agentConfigured: true, tokenEvents: [], accounts: normalizedAccounts };
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
      const amount = parseFloat(params.amount);
      if (isNaN(amount) || amount <= 0) {
        return { reply: '❌ Please specify a valid positive amount.', success: false, toolsCalled: ['transfer'], tokensUsed: 0, requiresConsent: false, agentConfigured: true, tokenEvents: [] };
      }
      if (Number(fromAcct.balance) < amount) {
        return { reply: `❌ Insufficient funds in ${fromAcct.accountType}. Balance: $${Number(fromAcct.balance).toFixed(2)}`, success: false, toolsCalled: ['transfer'], tokensUsed: 0, requiresConsent: false, agentConfigured: true, tokenEvents: [] };
      }
      try {
        await dataStore.createTransaction({ userId, accountId: fromAcct.id, type: 'transfer_out', amount: -amount, description: `Transfer to ${toAcct.accountType}` });
        await dataStore.createTransaction({ userId, accountId: toAcct.id, type: 'transfer_in', amount, description: `Transfer from ${fromAcct.accountType}` });
        await dataStore.updateAccountBalance(fromAcct.id, -amount);
        await dataStore.updateAccountBalance(toAcct.id, amount);
        return { reply: `✅ Transferred **$${amount.toFixed(2)}** from ${fromAcct.accountType} to ${toAcct.accountType}.`, success: true, toolsCalled: ['create_transfer'], tokensUsed: 0, requiresConsent: false, agentConfigured: true, tokenEvents: [] };
      } catch (err) {
        return { reply: `❌ Transfer failed: ${err.message}`, success: false, toolsCalled: ['create_transfer'], tokensUsed: 0, requiresConsent: false, agentConfigured: true, tokenEvents: [] };
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
      const amount = parseFloat(params.amount);
      if (isNaN(amount) || amount <= 0) {
        return { reply: '❌ Please specify a valid positive amount.', success: false, toolsCalled: ['deposit'], tokensUsed: 0, requiresConsent: false, agentConfigured: true, tokenEvents: [] };
      }
      try {
        await dataStore.createTransaction({ userId, accountId: toAcct.id, type: 'deposit', amount, description: params.description || 'Agent deposit' });
        await dataStore.updateAccountBalance(toAcct.id, amount);
        return { reply: `✅ Deposited **$${amount.toFixed(2)}** into ${toAcct.accountType}.`, success: true, toolsCalled: ['create_deposit'], tokensUsed: 0, requiresConsent: false, agentConfigured: true, tokenEvents: [] };
      } catch (err) {
        return { reply: `❌ Deposit failed: ${err.message}`, success: false, toolsCalled: ['create_deposit'], tokensUsed: 0, requiresConsent: false, agentConfigured: true, tokenEvents: [] };
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
        return { reply: `❌ Could not find account "${params.fromId}". Your accounts: ${(accounts || []).map(a => a.accountType).join(', ')}`, success: false, toolsCalled: ['withdraw'], tokensUsed: 0, requiresConsent: false, agentConfigured: true, tokenEvents: [] };
      }
      const amount = parseFloat(params.amount);
      if (isNaN(amount) || amount <= 0) {
        return { reply: '❌ Please specify a valid positive amount.', success: false, toolsCalled: ['withdraw'], tokensUsed: 0, requiresConsent: false, agentConfigured: true, tokenEvents: [] };
      }
      if (Number(fromAcct.balance) < amount) {
        return { reply: `❌ Insufficient funds in ${fromAcct.accountType}. Balance: $${Number(fromAcct.balance).toFixed(2)}`, success: false, toolsCalled: ['withdraw'], tokensUsed: 0, requiresConsent: false, agentConfigured: true, tokenEvents: [] };
      }
      try {
        await dataStore.createTransaction({ userId, accountId: fromAcct.id, type: 'withdrawal', amount: -amount, description: params.description || 'Agent withdrawal' });
        await dataStore.updateAccountBalance(fromAcct.id, -amount);
        return { reply: `✅ Withdrew **$${amount.toFixed(2)}** from ${fromAcct.accountType}.`, success: true, toolsCalled: ['create_withdrawal'], tokensUsed: 0, requiresConsent: false, agentConfigured: true, tokenEvents: [] };
      } catch (err) {
        return { reply: `❌ Withdrawal failed: ${err.message}`, success: false, toolsCalled: ['create_withdrawal'], tokensUsed: 0, requiresConsent: false, agentConfigured: true, tokenEvents: [] };
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
      if (result.step_up_required) {
        return { reply: '🔒 Viewing sensitive account details requires step-up authentication (MFA). Please complete the step-up challenge first.', success: false, toolsCalled: ['get_sensitive_account_details'], tokensUsed: 0, requiresConsent: false, agentConfigured: true, tokenEvents: [], stepUpRequired: true, stepUpMethod: result.step_up_method };
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
    console.warn('[heuristicBanking] Error executing action:', action, err.message);
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

    // ── Heuristic disabled: let all queries go through LangGraph → MCP ──
    // (Heuristic short-circuits the MCP flow and produces no MCP Traffic; disabled for demo fidelity)
    // To re-enable: uncomment the block below and set HEURISTIC_ENABLED=true
    const _heuristic_disabled = true; // eslint-disable-line
    /*
    const heuristic = parseHeuristic(message);
    if (heuristic && heuristic.kind === 'banking') {
      const heuristicResult = await executeHeuristicBanking(heuristic, userId, userToken, req);
      if (heuristicResult) {
        console.log('[processAgentMessage] Heuristic matched:', heuristic.banking?.action, '— skipping LLM');
        appEventService.logEvent('agent', 'info', `Heuristic: ${heuristic.banking?.action}`, { tag: 'agent/heuristic' });
        return heuristicResult;
      }
      // Heuristic matched but couldn't execute (transfer/deposit/etc.) — fall through to LLM
    }
    */

    // Note: Ollama (default) needs no API key. Cloud LLMs need keys added via /llm-config.

    console.log('[processAgentMessage] Creating banking agent...');
    appEventService.logEvent('agent', 'info', 'Initializing LangGraph agent', { tag: 'agent/init' });
    const { graph, initialState } = await createBankingAgent({
      userId,
      userToken,
      sessionId,
      tokenEvents,
      langchainConfig
    });
    console.log('[processAgentMessage] Agent created successfully');

    // Invoke the LangGraph with the user message
    console.log('[processAgentMessage] Invoking LangGraph agent...');
    appEventService.logEvent('agent', 'info', 'LLM reasoning…', { tag: 'agent/invoke' });
    let finalState;
    try {
      finalState = await graph.invoke({
        ...initialState,
        messages: [{ role: 'user', content: message }],
      });
    } catch (invokeErr) {
      throw invokeErr;
    }
    console.log('[processAgentMessage] Agent invoke completed');
    appEventService.logEvent('agent', 'info', 'Agent response ready', { tag: 'agent/complete' });
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
    console.error('[processAgentMessage] ERROR: Agent processing error');
    appEventService.logEvent('agent', 'error', `Agent error: ${error.message}`, { tag: 'agent/error' });
    console.error('[processAgentMessage] Error name:', error.name);
    console.error('[processAgentMessage] Error message:', error.message);
    console.error('[processAgentMessage] Error stack:', error.stack);
    console.error('[processAgentMessage] Error code:', error.code);
    console.error('[processAgentMessage] Full error object:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));

    // Return a graceful error response instead of throwing
    let userMessage = 'The banking agent encountered an error. Please try again.';
    if (error.message.includes('model') && error.message.includes('not_found')) {
      userMessage = 'The AI model is not available. Please contact support or try again later.';
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
