'use strict';

const { verticalManifest } = require('../../../services/verticalManifest');
const { createRetailStore } = require('./data');
const { buildRetailTools } = require('./tools');

const store = createRetailStore();
const { tools, execute } = buildRetailTools(store);

// Most specific first.
const HEURISTICS = [
  { re: /\bcheckout\b|\bplace\s+(an?\s+)?order\b|\bbuy\s+now\b/, action: 'checkout' },
  { re: /\border\s+status\b|\bwhere\s+is\s+my\s+order\b|\btrack\s+(my\s+)?order\b/, action: 'order_status' },
  { re: /\b(my\s+|list\s+|show\s+)?orders?\b|\border\s+history\b/, action: 'list_orders' },
  { re: /\b(my\s+|check\s+)?(rewards?\s+points?|store\s+credit|point\s+balance)\b|\bhow\s+many\s+points\b/, action: 'rewards_balance' },
];

function getManifest() {
  return verticalManifest.resolver.resolve('retail');
}

function getSystemPrompt(ctx) {
  const role = ctx && ctx.role ? ctx.role : 'customer';
  return [
    'You are Great Buy\'s Shopping Assistant, a retail orders and rewards helper.',
    'You help customers review their orders, check order status, see reward points and store credit, and place orders at checkout.',
    `The signed-in user role is "${role}".`,
    'Only emit one of the allowed retail actions; never reference financial or account concepts.',
  ].join(' ');
}

function getAuthz() {
  const out = {};
  for (const t of tools) out[t.name] = t.authz || {};
  return out;
}

module.exports = {
  getManifest,
  getTools: () => tools,
  getHeuristics: () => HEURISTICS,
  getSystemPrompt,
  getDataStore: () => store,
  executeTool: (name, params, ctx) => execute(name, params, ctx),
  getAuthz,
};
