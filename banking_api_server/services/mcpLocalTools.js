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

// ─── tool implementations ─────────────────────────────────────────────────────

async function get_my_accounts(params, userId) {
  const accounts = await ensureAccounts(userId);
  return { accounts };
}

async function get_account_balance(params, userId) {
  const { account_id } = params;
  if (!account_id) return { error: 'account_id is required' };

  const account = dataStore.getAccountById(account_id);
  if (!account) return { error: `Account ${account_id} not found` };
  if (account.userId !== userId) return { error: 'Access denied — not your account' };

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
  const { account_id, amount, description } = params;
  if (!account_id) return { error: 'account_id is required' };

  const parsedAmount = parseFloat(amount);
  if (!Number.isFinite(parsedAmount) || parsedAmount <= 0)
    return { error: 'amount must be a positive number' };
  if (parsedAmount > 1_000_000)
    return { error: 'amount cannot exceed $1,000,000' };

  const account = dataStore.getAccountById(account_id);
  if (!account) return { error: `Account ${account_id} not found` };
  if (account.userId !== userId) return { error: 'Access denied — not your account' };

  const rounded = Math.round(parsedAmount * 100) / 100;
  await dataStore.updateAccountBalance(account_id, rounded);

  const txn = await dataStore.createTransaction({
    toAccountId: account_id,
    fromAccountId: null,
    userId,
    amount: rounded,
    type: 'deposit',
    description: description || 'Agent deposit',
    status: 'completed',
    createdAt: new Date(),
  });

  const updated = dataStore.getAccountById(account_id);
  return {
    success: true,
    transaction_id: txn.id,
    amount: rounded,
    new_balance: updated?.balance,
    account_number: account.accountNumber,
  };
}

async function create_withdrawal(params, userId) {
  const { account_id, amount, description } = params;
  if (!account_id) return { error: 'account_id is required' };

  const parsedAmount = parseFloat(amount);
  if (!Number.isFinite(parsedAmount) || parsedAmount <= 0)
    return { error: 'amount must be a positive number' };
  if (parsedAmount > 1_000_000)
    return { error: 'amount cannot exceed $1,000,000' };

  const account = dataStore.getAccountById(account_id);
  if (!account) return { error: `Account ${account_id} not found` };
  if (account.userId !== userId) return { error: 'Access denied — not your account' };

  const rounded = Math.round(parsedAmount * 100) / 100;
  if (account.balance < rounded)
    return { error: `Insufficient balance (current: $${account.balance.toFixed(2)}, requested: $${rounded.toFixed(2)})` };

  await dataStore.updateAccountBalance(account_id, -rounded);

  const txn = await dataStore.createTransaction({
    fromAccountId: account_id,
    toAccountId: null,
    userId,
    amount: rounded,
    type: 'withdrawal',
    description: description || 'Agent withdrawal',
    status: 'completed',
    createdAt: new Date(),
  });

  const updated = dataStore.getAccountById(account_id);
  return {
    success: true,
    transaction_id: txn.id,
    amount: rounded,
    new_balance: updated?.balance,
    account_number: account.accountNumber,
  };
}

async function create_transfer(params, userId) {
  const { from_account_id, to_account_id, amount, description } = params;
  if (!from_account_id || !to_account_id)
    return { error: 'from_account_id and to_account_id are required' };

  const parsedAmount = parseFloat(amount);
  if (!Number.isFinite(parsedAmount) || parsedAmount <= 0)
    return { error: 'amount must be a positive number' };
  if (parsedAmount < 50)
    return { error: 'Transfer amount must be at least $50' };
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

module.exports = { callToolLocal };
