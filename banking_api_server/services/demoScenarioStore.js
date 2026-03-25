// banking_api_server/services/demoScenarioStore.js
/**
 * Per-user demo scenario: MFA step-up threshold override and optional metadata.
 * Persists to the same KV/Upstash used for config when KV_REST_* / UPSTASH_* is set;
 * otherwise in-memory only (fine for single-instance local dev).
 *
 * Vercel: add Upstash from the Vercel Marketplace so KV_REST_API_URL + KV_REST_API_TOKEN
 * (or UPSTASH_REDIS_*) are set — same pattern as configStore. Banking accounts/transactions
 * remain in the in-memory dataStore on serverless (ephemeral); this store only holds small
 * overrides. For durable account/txn data on Vercel, use an external DB (Turso, Neon free tier)
 * or accept reset-on-cold-start for pure demos.
 */
'use strict';

const KV_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

const memory = new Map();

function key(userId) {
  return `banking:demo-scenario:${userId}`;
}

async function kvGet(k) {
  if (!KV_URL || !KV_TOKEN) return null;
  try {
    const { createClient } = require('@vercel/kv');
    const kv = createClient({ url: KV_URL, token: KV_TOKEN });
    const raw = await kv.get(k);
    if (raw == null) return null;
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch (e) {
    console.warn('[demoScenarioStore] kv get', e.message);
    return null;
  }
}

async function kvSet(k, obj) {
  if (!KV_URL || !KV_TOKEN) return;
  try {
    const { createClient } = require('@vercel/kv');
    const kv = createClient({ url: KV_URL, token: KV_TOKEN });
    await kv.set(k, JSON.stringify(obj));
  } catch (e) {
    console.warn('[demoScenarioStore] kv set', e.message);
  }
}

/**
 * Load demo scenario for a user (cached in memory after first read).
 */
async function load(userId) {
  if (!userId) return { stepUpAmountThreshold: null };
  const cached = memory.get(userId);
  if (cached) return cached;
  const fromKv = await kvGet(key(userId));
  if (fromKv && typeof fromKv === 'object') {
    memory.set(userId, fromKv);
    return fromKv;
  }
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
  await kvSet(key(userId), next);
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
};
