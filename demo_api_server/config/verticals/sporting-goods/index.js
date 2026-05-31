'use strict';

const { verticalManifest } = require('../../../services/verticalManifest');
const { createSportingGoodsStore } = require('./data');
const { buildSportingGoodsTools } = require('./tools');

const store = createSportingGoodsStore();
const { tools, execute } = buildSportingGoodsTools(store);

// Most specific first: extend_rental before list_rentals; gear_order_status before list_gear.
const HEURISTICS = [
  { re: /\bextend\b.*\brental\b|\brenew\b.*\brental\b/, action: 'extend_rental' },
  { re: /\b(my\s+)?rentals?\b|\bgear\s+rentals?\b|\bdue\s+back\b/, action: 'list_rentals' },
  { re: /\border\s+status\b|\btrack\s+(my\s+)?order\b/, action: 'gear_order_status' },
  { re: /\b(my\s+)?gear\b|\bmy\s+equipment\b|\border\s+history\b/, action: 'list_gear' },
  { re: /\b(my\s+|check\s+)?(rewards?\s+points?|loyalty|point\s+balance)\b/, action: 'loyalty_balance' },
];

function getManifest() {
  return verticalManifest.resolver.resolve('sporting-goods');
}

function getSystemPrompt(ctx) {
  const role = ctx && ctx.role ? ctx.role : 'member';
  return [
    'You are Super Sports\' Sports Assistant, a gear orders, rentals, and loyalty helper.',
    'You help members review gear orders, track order status, manage equipment rentals, check loyalty points, and extend rentals.',
    `The signed-in user role is "${role}".`,
    'Only emit one of the allowed sporting-goods actions; never reference financial or account concepts.',
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
