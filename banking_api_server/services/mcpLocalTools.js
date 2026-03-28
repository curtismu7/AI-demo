// banking_api_server/services/mcpLocalTools.js
/**
 * In-process fallback for banking MCP tool calls.
 *
 * Used when banking_mcp_server is not running (no MCP_SERVER_URL / ws://localhost:8080
 * unreachable). Implements the same 6 tool contracts that BankingToolProvider handles,
 * but directly against the local dataStore — no WebSocket round-trip needed.
 *
 * Return shape matches mcpWebSocketClient.mcpCallTool:
 *   { content: [{ type: 'text', text: string }] }
 */
'use strict';

const dataStore = require('../data/store');
const txConsent = require('./transactionConsentChallenge');

/**
 * Mirrors POST /api/transactions: non-admin writes over HIGH_VALUE_CONSENT_USD require a browser consent challenge.
 * Local MCP tools cannot complete that flow (no session challenge), so we refuse instead of bypassing HITL.
 */
function hitlBlocksLocalWrite(userId, amount, type) {
  const user = dataStore.getUserById(userId);
  if (user && user.role === 'admin') return false;
  const rounded = Math.round(parseFloat(amount) * 100) / 100;
  if (!Number.isFinite(rounded)) return false;
  if (!['transfer', 'withdrawal', 'deposit'].includes(type)) return false;
  return rounded > txConsent.HIGH_VALUE_CONSENT_USD;
}

const HITL_LOCAL_AGENT_MESSAGE =
  'Transfers, deposits, and withdrawals over $500 require human approval in the browser. Use the main dashboard to start the transaction and complete the consent screen. The banking assistant cannot complete this amount without that flow.';

// ─── helpers ─────────────────────────────────────────────────────────────────
// Return structured data objects directly so BankingAgent.js result panel
// (formatResult / setResultPanel) can find result.accounts, result.transactions, etc.

/**
 * Auto-provision demo accounts for first-time users.
 * Mirrors the logic in routes/accounts.js::provisionDemoAccounts.
 */
async function ensureAccounts(userId) {
  let accounts = dataStore.getAccountsByUserId(userId);
  if (accounts.length > 0) return accounts;

  const uid = userId.replace(/-/g, '').slice(0, 10);
  const checkingId = `chk-${uid}`;
  const savingsId  = `sav-${uid}`;

  const checking = await dataStore.createAccount({
    id: checkingId, userId,
    accountNumber: `CHK-${uid.toUpperCase()}`, accountType: 'checking',
    balance: 3000.00, currency: 'USD', name: 'Checking Account',
    createdAt: new Date('2024-01-15'),
  });
  const savings = await dataStore.createAccount({
    id: savingsId, userId,
    accountNumber: `SAV-${uid.toUpperCase()}`, accountType: 'savings',
    balance: 2000.00, currency: 'USD', name: 'Savings Account',
    createdAt: new Date('2024-01-15'),
  });

  const sampleTxns = [
    { fromAccountId: null,       toAccountId: checkingId, amount: 3500.00, type: 'deposit',    description: 'Direct deposit – Payroll',   createdAt: new Date('2024-03-01T09:00:00Z') },
    { fromAccountId: checkingId, toAccountId: savingsId,  amount:  500.00, type: 'transfer',   description: 'Monthly savings transfer',   createdAt: new Date('2024-03-03T11:15:00Z') },
    { fromAccountId: checkingId, toAccountId: null,       amount:  120.00, type: 'withdrawal', description: 'ATM withdrawal',             createdAt: new Date('2024-03-07T14:30:00Z') },
    { fromAccountId: null,       toAccountId: savingsId,  amount:  250.00, type: 'deposit',    description: 'Tax refund deposit',         createdAt: new Date('2024-03-10T10:00:00Z') },
    { fromAccountId: checkingId, toAccountId: null,       amount:   85.50, type: 'withdrawal', description: 'Grocery store',             createdAt: new Date('2024-03-14T17:45:00Z') },
    { fromAccountId: checkingId, toAccountId: null,       amount:  200.00, type: 'withdrawal', description: 'Utility bill – Electric',   createdAt: new Date('2024-03-18T08:00:00Z') },
    { fromAccountId: null,       toAccountId: checkingId, amount:   75.00, type: 'deposit',    description: 'Reimbursement',             createdAt: new Date('2024-03-20T13:00:00Z') },
  ];
  for (const txn of sampleTxns) {
    await dataStore.createTransaction({ ...txn, userId, status: 'completed' });
  }

  return [checking, savings];
}

// ─── account ID resolution ────────────────────────────────────────────────────

/**
 * Resolve a value that may be an account type name ('checking', 'savings') or partial
 * name to the actual account ID. Returns the original value if it already looks like an ID
 * AND that ID exists in the user's provisioned accounts.
 *
 * If the value looks like a real ID (chk-*, sav-*, UUID) but is NOT in the user's accounts
 * (e.g. a stale/fake ID from the UI fallback like 'chk-5'), we fall back to type-based
 * resolution so that create_deposit/create_withdrawal still work without an error.
 */
function resolveAccountId(idOrType, accounts) {
  if (!idOrType) return null;
  const s = String(idOrType).trim();
  // Already looks like an ID (chk-*, sav-*, or UUID)
  if (/^(chk-|sav-)/i.test(s) || /^[0-9a-f]{8}-/i.test(s)) {
    // Only trust it when it's actually in this user's account list.
    if (accounts.some(a => a.id === s)) return s;
    // Stale / fake ID (e.g. 'chk-5' from UI generateFakeAccounts): fall back by prefix type.
    if (/^chk-/i.test(s)) {
      const byType = accounts.find(a => String(a.accountType || '').toLowerCase() === 'checking');
      if (byType) return byType.id;
    }
    if (/^sav-/i.test(s)) {
      const byType = accounts.find(a => String(a.accountType || '').toLowerCase() === 'savings');
      if (byType) return byType.id;
    }
    // No type match — return as-is and let the caller report 'not found'.
    return s;
  }
  const lower = s.toLowerCase().replace(/^(my|the|primary|main)\s+/, '');
  const byType = accounts.find(a => String(a.accountType || '').toLowerCase() === lower);
  if (byType) return byType.id;
  const byName = accounts.find(a =>
    String(a.name || '').toLowerCase().includes(lower) ||
    String(a.accountType || '').toLowerCase().includes(lower)
  );
  return byName ? byName.id : s;
}

// ─── tool implementations ─────────────────────────────────────────────────────

async function get_my_accounts(params, userId) {
  const accounts = await ensureAccounts(userId);
  return { accounts };
}

async function get_account_balance(params, userId) {
  const raw = params.account_id;
  const rawStr =
    raw &&
    typeof raw === 'string' &&
    !/^(optional|omit|n\/a|none|unknown)$/i.test(String(raw).trim())
      ? raw
      : undefined;

  // Always load the user's accounts so we can resolve type-name IDs like 'checking'/'savings'
  // (the UI may submit these when liveAccounts hasn't loaded yet — resolveAccountId handles it).
  const accounts = await ensureAccounts(userId);
  const account_id = rawStr ? resolveAccountId(rawStr, accounts) : null;

  let account = null;
  if (account_id) {
    account = dataStore.getAccountById(account_id);
    if (!account) return { error: `Account ${account_id} not found` };
    if (account.userId !== userId) return { error: 'Access denied — not your account' };
  } else {
    account = accounts.find((a) => String(a.accountType || '').toLowerCase() === 'checking') || accounts[0];
    if (!account) return { error: 'No accounts found for this user' };
  }

  return {
    account_id: account.id,
    account_number: account.accountNumber,
    account_type: account.accountType,
    balance: account.balance,
    currency: account.currency,
  };
}

async function get_my_transactions(params, userId) {
  const limit = parseInt(params.limit, 10) || 10;
  const allTxns = dataStore.getTransactionsByUserId(userId);
  const limited = allTxns.slice(-limit).reverse(); // most recent first

  const enriched = limited.map(txn => {
    const accountId = txn.fromAccountId || txn.toAccountId;
    const account = accountId ? dataStore.getAccountById(accountId) : null;
    return {
      ...txn,
      accountInfo: account ? `${account.accountType} - ${account.accountNumber}` : 'Unknown',
    };
  });

  return { transactions: enriched, count: enriched.length };
}

async function create_deposit(params, userId) {
  const accounts = await ensureAccounts(userId);
  const account_id = resolveAccountId(params.account_id || params.to_account_id, accounts);
  const { amount, description } = params;

  const parsedAmount = parseFloat(amount);
  if (!Number.isFinite(parsedAmount) || parsedAmount <= 0)
    return { error: 'amount must be a positive number' };
  if (parsedAmount > 1_000_000)
    return { error: 'amount cannot exceed $1,000,000' };

  let account = null;
  if (account_id) {
    account = dataStore.getAccountById(account_id);
    if (!account) return { error: `Account "${account_id}" not found` };
    if (account.userId !== userId) return { error: 'Access denied — not your account' };
  } else {
    account = accounts.find((a) => String(a.accountType || '').toLowerCase() === 'checking') || accounts[0];
    if (!account) return { error: 'No accounts found for this user' };
  }
  const targetAccountId = account.id;

  const rounded = Math.round(parsedAmount * 100) / 100;
  if (hitlBlocksLocalWrite(userId, rounded, 'deposit')) {
    return {
      error: 'consent_challenge_required',
      message: HITL_LOCAL_AGENT_MESSAGE,
      consent_challenge_required: true,
      hitl_threshold_usd: txConsent.HIGH_VALUE_CONSENT_USD,
    };
  }

  await dataStore.updateAccountBalance(targetAccountId, rounded);

  const txn = await dataStore.createTransaction({
    toAccountId: targetAccountId,
    fromAccountId: null,
    userId,
    amount: rounded,
    type: 'deposit',
    description: description || 'Agent deposit',
    status: 'completed',
    createdAt: new Date(),
  });

  const updated = dataStore.getAccountById(targetAccountId);
  return {
    success: true,
    transaction_id: txn.id,
    amount: rounded,
    new_balance: updated?.balance,
    account_number: account.accountNumber,
  };
}

async function create_withdrawal(params, userId) {
  const accounts = await ensureAccounts(userId);
  const account_id = resolveAccountId(params.account_id || params.from_account_id, accounts);
  const { amount, description } = params;

  const parsedAmount = parseFloat(amount);
  if (!Number.isFinite(parsedAmount) || parsedAmount <= 0)
    return { error: 'amount must be a positive number' };
  if (parsedAmount > 1_000_000)
    return { error: 'amount cannot exceed $1,000,000' };

  let account = null;
  if (account_id) {
    account = dataStore.getAccountById(account_id);
    if (!account) return { error: `Account "${account_id}" not found` };
    if (account.userId !== userId) return { error: 'Access denied — not your account' };
  } else {
    account = accounts.find((a) => String(a.accountType || '').toLowerCase() === 'checking') || accounts[0];
    if (!account) return { error: 'No accounts found for this user' };
  }
  const targetAccountId = account.id;

  const rounded = Math.round(parsedAmount * 100) / 100;
  if (account.balance < rounded)
    return { error: `Insufficient balance (current: $${account.balance.toFixed(2)}, requested: $${rounded.toFixed(2)})` };

  if (hitlBlocksLocalWrite(userId, rounded, 'withdrawal')) {
    return {
      error: 'consent_challenge_required',
      message: HITL_LOCAL_AGENT_MESSAGE,
      consent_challenge_required: true,
      hitl_threshold_usd: txConsent.HIGH_VALUE_CONSENT_USD,
    };
  }

  await dataStore.updateAccountBalance(targetAccountId, -rounded);

  const txn = await dataStore.createTransaction({
    fromAccountId: targetAccountId,
    toAccountId: null,
    userId,
    amount: rounded,
    type: 'withdrawal',
    description: description || 'Agent withdrawal',
    status: 'completed',
    createdAt: new Date(),
  });

  const updated = dataStore.getAccountById(targetAccountId);
  return {
    success: true,
    transaction_id: txn.id,
    amount: rounded,
    new_balance: updated?.balance,
    account_number: account.accountNumber,
  };
}

async function create_transfer(params, userId) {
  const accounts = await ensureAccounts(userId);
  const from_account_id = resolveAccountId(params.from_account_id || params.fromId, accounts);
  const to_account_id   = resolveAccountId(params.to_account_id   || params.toId,   accounts);
  const { amount, description } = params;
  if (!from_account_id || !to_account_id)
    return { error: 'Please specify which accounts to transfer between (e.g. "from checking to savings").' };

  const parsedAmount = parseFloat(amount);
  if (!Number.isFinite(parsedAmount) || parsedAmount <= 0)
    return { error: 'amount must be a positive number' };
  if (parsedAmount > 1_000_000)
    return { error: 'amount cannot exceed $1,000,000' };

  const fromAccount = dataStore.getAccountById(from_account_id);
  const toAccount   = dataStore.getAccountById(to_account_id);
  if (!fromAccount) return { error: `Source account ${from_account_id} not found` };
  if (!toAccount)   return { error: `Destination account ${to_account_id} not found` };
  if (fromAccount.userId !== userId) return { error: 'Access denied — source account is not yours' };
  if (toAccount.userId !== userId)   return { error: 'Access denied — destination account is not yours' };

  const rounded = Math.round(parsedAmount * 100) / 100;
  if (fromAccount.balance < rounded)
    return { error: `Insufficient balance (current: $${fromAccount.balance.toFixed(2)}, requested: $${rounded.toFixed(2)})` };

  if (hitlBlocksLocalWrite(userId, rounded, 'transfer')) {
    return {
      error: 'consent_challenge_required',
      message: HITL_LOCAL_AGENT_MESSAGE,
      consent_challenge_required: true,
      hitl_threshold_usd: txConsent.HIGH_VALUE_CONSENT_USD,
    };
  }

  await dataStore.updateAccountBalance(from_account_id, -rounded);
  await dataStore.updateAccountBalance(to_account_id,   rounded);

  const txn = await dataStore.createTransaction({
    fromAccountId: from_account_id,
    toAccountId: to_account_id,
    userId,
    amount: rounded,
    type: 'transfer',
    description: description || 'Agent transfer',
    status: 'completed',
    createdAt: new Date(),
  });

  const updatedFrom = dataStore.getAccountById(from_account_id);
  const updatedTo   = dataStore.getAccountById(to_account_id);
  return {
    success: true,
    transaction_id: txn.id,
    amount: rounded,
    from_new_balance: updatedFrom?.balance,
    to_new_balance: updatedTo?.balance,
  };
}

// ─── inspector catalog (mirrors banking_mcp_server BankingToolRegistry user tools) ─

/** Tool definitions for MCP Inspector when WebSocket/MCP is unavailable or session has no MCP bearer. */
const LOCAL_INSPECTOR_TOOLS = [
  {
    name: 'get_my_accounts',
    description: "Retrieve user's bank accounts",
    requiresUserAuth: true,
    requiredScopes: ['banking:accounts:read'],
    inputSchema: { type: 'object', properties: {}, required: [], additionalProperties: false },
  },
  {
    name: 'get_account_balance',
    description:
      'Get balance for a specific account. Use account ID (not account number) from get_my_accounts response.',
    requiresUserAuth: true,
    requiredScopes: ['banking:accounts:read'],
    inputSchema: {
      type: 'object',
      properties: {
        account_id: {
          type: 'string',
          description:
            'Account ID (UUID format, not account number) - use the "id" field from get_my_accounts response',
          minLength: 1,
        },
      },
      required: ['account_id'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_my_transactions',
    description: "Retrieve user's transaction history",
    requiresUserAuth: true,
    requiredScopes: ['banking:transactions:read'],
    inputSchema: { type: 'object', properties: {}, required: [], additionalProperties: false },
  },
  {
    name: 'create_deposit',
    description:
      'Create a deposit transaction to an account. Use account ID (not account number) from get_my_accounts response. Amounts over $500 require human consent on the web dashboard (not available via this tool).',
    requiresUserAuth: true,
    requiredScopes: ['banking:transactions:write'],
    inputSchema: {
      type: 'object',
      properties: {
        to_account_id: {
          type: 'string',
          description:
            'Account ID (UUID format, not account number) to deposit to - use the "id" field from get_my_accounts response',
          minLength: 1,
        },
        amount: { type: 'number', description: 'Amount to deposit', minimum: 0.01, multipleOf: 0.01 },
        description: { type: 'string', description: 'Transaction description', maxLength: 255 },
      },
      required: ['to_account_id', 'amount'],
      additionalProperties: false,
    },
  },
  {
    name: 'create_withdrawal',
    description:
      'Create a withdrawal transaction from an account. Use account ID (not account number) from get_my_accounts response. Amounts over $500 require human consent on the web dashboard (not available via this tool).',
    requiresUserAuth: true,
    requiredScopes: ['banking:transactions:write'],
    inputSchema: {
      type: 'object',
      properties: {
        from_account_id: {
          type: 'string',
          description:
            'Account ID (UUID format, not account number) to withdraw from - use the "id" field from get_my_accounts response',
          minLength: 1,
        },
        amount: { type: 'number', description: 'Amount to withdraw', minimum: 0.01, multipleOf: 0.01 },
        description: { type: 'string', description: 'Transaction description', maxLength: 255 },
      },
      required: ['from_account_id', 'amount'],
      additionalProperties: false,
    },
  },
  {
    name: 'create_transfer',
    description:
      'Transfer money between accounts. Use account IDs (not account numbers) from get_my_accounts response. Amounts over $500 require human consent on the web dashboard (not available via this tool).',
    requiresUserAuth: true,
    requiredScopes: ['banking:transactions:write'],
    inputSchema: {
      type: 'object',
      properties: {
        from_account_id: {
          type: 'string',
          description:
            'Source account ID (UUID format, not account number) - use the "id" field from get_my_accounts response',
          minLength: 1,
        },
        to_account_id: {
          type: 'string',
          description:
            'Destination account ID (UUID format, not account number) - use the "id" field from get_my_accounts response',
          minLength: 1,
        },
        amount: { type: 'number', description: 'Amount to transfer (minimum $0.01)', minimum: 0.01, multipleOf: 0.01 },
        description: { type: 'string', description: 'Transfer description', maxLength: 255 },
      },
      required: ['from_account_id', 'to_account_id', 'amount'],
      additionalProperties: false,
    },
  },
];

/**
 * Returns MCP-shaped tool descriptors for the in-process fallback (same names as TOOL_MAP).
 * @returns {typeof LOCAL_INSPECTOR_TOOLS}
 */
function listLocalInspectorTools() {
  return LOCAL_INSPECTOR_TOOLS.map((t) => ({ ...t }));
}

// ─── dispatch ─────────────────────────────────────────────────────────────────

const TOOL_MAP = {
  get_my_accounts,
  get_account_balance,
  get_my_transactions,
  create_deposit,
  create_withdrawal,
  create_transfer,
  // Legacy aliases
  list_accounts:     get_my_accounts,
  list_transactions: get_my_transactions,
  deposit:           create_deposit,
  withdraw:          create_withdrawal,
  transfer:          create_transfer,
};

/**
 * Execute a banking tool locally (no MCP server required).
 *
 * @param {string} tool     - MCP tool name
 * @param {object} params   - Tool parameters
 * @param {string} userId   - Authenticated user's ID (from session)
 * @returns {Promise<{ content: Array<{ type: string, text: string }> }>}
 */
async function callToolLocal(tool, params, userId) {
  const handler = TOOL_MAP[tool];
  if (!handler) {
    return { error: `Unknown tool "${tool}". Available: ${Object.keys(TOOL_MAP).filter(k => !['list_accounts','list_transactions','deposit','withdraw','transfer'].includes(k)).join(', ')}` };
  }
  return handler(params || {}, userId);
}

module.exports = { callToolLocal, listLocalInspectorTools };
