'use strict';

const { verticalManifest } = require('../../../services/verticalManifest');
const { createWorkforceStore } = require('./data');
const { buildWorkforceTools } = require('./tools');

const store = createWorkforceStore();
const { tools, execute } = buildWorkforceTools(store);

// Most specific first: write actions before the read views they share words with.
const HEURISTICS = [
  { re: /\bsubmit\b.*\bexpense\b|\bfile\b.*\bexpense\b/, action: 'submit_expense' },
  { re: /\brequest\b.*\btime\s+off\b|\brequest\b.*\bpto\b|\btake\s+(a\s+)?(vacation|day\s+off)\b/, action: 'request_time_off' },
  { re: /\b(my\s+)?expenses?\b|\bexpense\s+(history|reports?)\b/, action: 'list_expenses' },
  { re: /\b(check\s+|my\s+|how\s+much\s+)?(pto|time\s+off|vacation|sick\s+leave)\s*(balance|left|remaining)?\b/, action: 'pto_balance' },
  { re: /\b(my\s+)?benefits?\b|\benrollments?\b|\bmedical\b|\bdental\b/, action: 'view_benefits' },
];

function getManifest() { return verticalManifest.resolver.resolve('workforce'); }
function getSystemPrompt(ctx) {
  const role = ctx && ctx.role ? ctx.role : 'employee';
  return [
    'You are WX Workforce\'s HR Assistant, a benefits, PTO, and expense helper.',
    'You help employees review benefits enrollments, check PTO and sick leave balances, list expense reports, submit expenses, and request time off.',
    `The signed-in user role is "${role}".`,
    'Only emit one of the allowed workforce actions; never reference financial or account concepts.',
  ].join(' ');
}
function getAuthz() { const o = {}; for (const t of tools) o[t.name] = t.authz || {}; return o; }

module.exports = {
  getManifest,
  getTools: () => tools,
  getHeuristics: () => HEURISTICS,
  getSystemPrompt,
  getDataStore: () => store,
  executeTool: (name, params, ctx) => execute(name, params, ctx),
  getAuthz,
};
