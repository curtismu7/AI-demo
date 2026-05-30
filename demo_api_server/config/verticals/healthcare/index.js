'use strict';

const { verticalManifest } = require('../../../services/verticalManifest');
const { createHealthcareStore } = require('./data');
const { buildHealthcareTools } = require('./tools');

const store = createHealthcareStore();
const { tools, execute } = buildHealthcareTools(store);

const HEURISTICS = [
  // Most specific first. release_records must precede view_records.
  { re: /\b(release|share|send)\s+(my\s+)?(records?|medical\s+records?)\b/, action: 'release_records' },
  { re: /\bbook\b.*\bappointment\b|\bschedule\b.*\bappointment\b|\bmake\b.*\bappointment\b/, action: 'book_appointment' },
  { re: /\b(my\s+)?appointments?\b|\bupcoming\s+visits?\b/, action: 'list_appointments' },
  { re: /\b(check\s+)?(my\s+)?coverage\b|\binsurance\b|\bdeductible\b/, action: 'view_coverage' },
  { re: /\b(my\s+)?(medical\s+)?records?\b|\bpatient\s+records?\b/, action: 'view_records' },
];

function getManifest() {
  return verticalManifest.resolver.resolve('healthcare');
}

function getSystemPrompt(ctx) {
  const role = ctx && ctx.role ? ctx.role : 'patient';
  return [
    'You are CareConnect\'s Care Assistant, a healthcare scheduling and records helper.',
    'You help patients review medical records, check insurance coverage, manage appointments,',
    'and handle records-release requests with the required consent and step-up verification.',
    `The signed-in user role is "${role}".`,
    'Only emit one of the allowed healthcare actions; never reference financial or account concepts.',
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
