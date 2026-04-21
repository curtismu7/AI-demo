// banking_api_server/services/demoScenarioStore.js
/**
 * Per-user demo scenario: MFA step-up threshold, bankingAgentUiMode, etc.
 * Data is in-memory (lost on restart). This is demo data, not critical state.
 */
'use strict';

const memory = new Map();

function key(userId) {
  return `banking:demo-scenario:${userId}`;
}

function isPersistenceConfigured() {
  return false;
}

/**
 * Load demo scenario for a user (cached in memory).
 */
async function load(userId) {
  if (!userId) return { stepUpAmountThreshold: null };
  const cached = memory.get(userId);
  if (cached) return cached;

  const empty = { stepUpAmountThreshold: null };
  memory.set(userId, empty);
  return empty;
}

/**
 * Merge patch and persist.
 */
async function save(userId, patch) {
  const prev = await load(userId);
  const next = { ...prev, ...patch, updatedAt: new Date().toISOString() };
  memory.set(userId, next);
  return next;
}

/**
 * Effective step-up threshold for transfers/withdrawals (USD). Falls back to runtime default.
 */
async function getStepUpThreshold(userId, runtimeDefault) {
  const s = await load(userId);
  const v = s.stepUpAmountThreshold;
  if (v == null || v === '') return runtimeDefault;
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : runtimeDefault;
}

module.exports = {
  load,
  save,
  getStepUpThreshold,
  isPersistenceConfigured,
};
