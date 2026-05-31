'use strict';

const { verticalManifest } = require('../../../services/verticalManifest');
const { getBankingToolDefinitions } = require('../../../services/agentBuilder');
const { dispatchBankingAction } = require('../../../services/demoAgentLangGraphService');

// Banking heuristics: phrase → action map
// Extracted from nlIntentParser.js parseBanking() for consistency
const HEURISTICS = [
  // mcp_tools
  { re: /\b(list|show|get|what).*(mcp.*tools?|tools?.*available|available.*tools?)\b|\btools?\s*(list|available)\b/, action: 'mcp_tools' },
  // sensitive_account_details (must precede general accounts check)
  { re: /\b(sensitive account details|full account|routing number|account number|account details)\b/, action: 'sensitive_account_details' },
  // mortgage_demo (must precede balance check)
  { re: /\b(show|view|see|get|my|whats?|what is)\s*(mortgage|home\s*loan)\b|\b(mortgage|home\s*loan)\s*(data|info|details|balance|summary|payment)\b|^mortgage$|^home\s*loan$/, action: 'mortgage_demo' },
  // balance (must precede accounts check)
  { re: /\bbalances?\b/, action: 'balance' },
  // accounts
  { re: /\b(accounts?|account\s*(list|overview|summary)|my\s*accounts?|check\s*accounts?|view\s*accounts?)\b/, action: 'accounts' },
  // biggest_purchase / spending_summary
  { re: /\b(biggest|largest|highest|top)\s*(purchase|spend|transaction)\b|\bwhere.*i.*spend\b/, action: 'biggest_purchase' },
  { re: /\b(spending|spend)\s*(summary|analysis|breakdown|report)\b|\bmy\s*spending\b/, action: 'spending_summary' },
  // transactions
  { re: /\b(transactions?|activity|history|recent|last)\b|\b(view|show|list)\s*(transactions?|activity)\b/, action: 'transactions' },
  // transfer (must precede deposit/withdraw for specificity)
  { re: /\btransfer\b|\bmove\s*(money|funds)\b|\bsend\s*(money|funds)\b/, action: 'transfer' },
  // deposit
  { re: /\bdeposit\b|\badd\s*(money|funds)\b/, action: 'deposit' },
  // withdraw
  { re: /\bwithdraw\b|\bremove\s*(money|funds)\b/, action: 'withdraw' },
];

function getManifest() {
  return verticalManifest.resolver.resolve('banking');
}

function getSystemPrompt(ctx) {
  const role = ctx && ctx.role ? ctx.role : 'customer';
  return [
    'You are a Super Banking agent. Help customers check account balances, view transaction history, transfer funds, and manage their accounts.',
    'Use banking language: accounts are checking, savings, or loan accounts, transactions are deposits, withdrawals, or transfers, balance is account balance.',
    `The signed-in user role is "${role}".`,
    'Be professional and clear. For write operations (transfer, deposit, withdraw), confirm the details with the user before proceeding.',
  ].join(' ');
}

function getToolsWithActionAliases() {
  const bankingTools = getBankingToolDefinitions();
  // Add action-name aliases for dispatchVerticalIntent authz/validation.
  // When heuristic parser returns action:'accounts', we need a tool def named 'accounts'.
  const actionAliases = [
    {
      name: 'accounts',
      description: 'Show the user\'s bank accounts.',
      inputSchema: { type: 'object', properties: {} },
      scopes: ['read'],
      authz: {},
    },
    {
      name: 'balance',
      description: 'Check account balance.',
      inputSchema: { type: 'object', properties: { accountId: { type: 'string' }, accountType: { type: 'string' } } },
      scopes: ['read'],
      authz: {},
    },
    {
      name: 'transactions',
      description: 'View recent transactions.',
      inputSchema: { type: 'object', properties: {} },
      scopes: ['read'],
      authz: {},
    },
    {
      name: 'transfer',
      description: 'Transfer funds between accounts.',
      inputSchema: { type: 'object', properties: { fromId: { type: 'string' }, toId: { type: 'string' }, amount: { type: 'number' } } },
      scopes: ['write'],
      authz: { consent: true },
    },
    {
      name: 'deposit',
      description: 'Deposit funds to an account.',
      inputSchema: { type: 'object', properties: { toId: { type: 'string' }, amount: { type: 'number' } } },
      scopes: ['write'],
      authz: { consent: true },
    },
    {
      name: 'withdraw',
      description: 'Withdraw funds from an account.',
      inputSchema: { type: 'object', properties: { fromId: { type: 'string' }, amount: { type: 'number' } } },
      scopes: ['write'],
      authz: { consent: true },
    },
    {
      name: 'sensitive_account_details',
      description: 'View sensitive account details.',
      inputSchema: { type: 'object', properties: {} },
      scopes: ['read'],
      authz: { consent: true },
    },
  ];
  // Return both real MCP tool defs + action aliases for dispatchVerticalIntent routing
  return [...bankingTools, ...actionAliases];
}

function getAuthz() {
  const tools = getToolsWithActionAliases();
  const out = {};
  for (const t of tools) {
    out[t.name] = t.authz || {};
  }
  return out;
}

module.exports = {
  getManifest,
  getTools: () => getToolsWithActionAliases(),
  getHeuristics: () => HEURISTICS,
  getSystemPrompt,
  getDataStore: () => ({ get: () => ({}) }), // MCP-backed, no local store
  executeTool: async (name, params, ctx) => {
    // Banking actions: delegate to dispatchBankingAction (extracted from executeHeuristicBanking)
    // These actions are dispatched by the heuristic parser or LLM reasoning
    const bankingActions = ['accounts', 'balance', 'transactions', 'transfer', 'deposit', 'withdraw', 'sensitive_account_details'];

    if (bankingActions.includes(name)) {
      // Construct the action context for dispatchBankingAction
      const dispatchCtx = {
        userToken: ctx && ctx.userToken ? ctx.userToken : null,
        req: ctx && ctx.req ? ctx.req : null,
        subjectToken: ctx && ctx.subjectToken ? ctx.subjectToken : null,
        isAdmin: ctx && ctx.isAdmin ? ctx.isAdmin : false,
        terminology: (ctx && ctx.manifest && ctx.manifest.terminology) || null,
      };

      const result = await dispatchBankingAction(name, params || {}, ctx.userId, dispatchCtx);
      // Map result to plugin execute envelope if needed (or return as-is if compatible)
      return result;
    }

    // Unknown action
    return { result: { error: `unknown banking action: ${name}` }, render: 'text' };
  },
  getAuthz,
};