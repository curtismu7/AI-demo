// banking_api_server/services/demoScenarioStore.js
/**
 * Per-user demo scenario: MFA step-up threshold, bankingAgentUiMode, etc.
 *
 * Persists to (first available):
 *   • Vercel KV REST — KV_REST_API_* or UPSTASH_REDIS_REST_* (@vercel/kv)
 *   • Redis protocol — REDIS_URL, or same Upstash host derived from REST URL + token
 *
 * Without any of the above, data is in-memory only (lost on restart / new serverless instance).
 */
'use strict';

const KV_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

const memory = new Map();

/** Same derivation as server.js session store so REDIS_URL-only deploys still persist demo settings. */
function resolveRedisUrl() {
  if (process.env.REDIS_URL) return process.env.REDIS_URL;
  const restUrl = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const restToken = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!restUrl || !restToken) return null;
  const host = restUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
  const encToken = encodeURIComponent(restToken);
  return `rediss://default:${encToken}@${host}:6379`;
}

function key(userId) {
  return `banking:demo-scenario:${userId}`;
}

function isPersistenceConfigured() {
  return !!(KV_URL && KV_TOKEN) || !!resolveRedisUrl();
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

/** Lazy singleton for serverless (one connection per warm instance). */
let redisClientPromise = null;

async function getRedisClient() {
  const url = resolveRedisUrl();
  if (!url) return null;
  if (!redisClientPromise) {
    redisClientPromise = (async () => {
      try {
        const { createClient } = require('redis');
        const client = createClient({
          url,
          socket: {
            connectTimeout: 5000,
            reconnectStrategy: (retries) => {
              if (retries < 2) return Math.min(retries * 200, 500);
              return new Error('[demoScenarioStore] Redis reconnect stopped');
            },
          },
        });
        client.on('error', (err) => {
          if (!client._demoLoggedErr) {
            console.warn('[demoScenarioStore] Redis error:', err.message);
            client._demoLoggedErr = true;
          }
        });
        await client.connect();
        return client;
      } catch (e) {
        console.warn('[demoScenarioStore] Redis connect failed:', e.message);
        return null;
      }
    })();
  }
  return redisClientPromise;
}

async function redisGet(k) {
  if (!resolveRedisUrl()) return null;
  try {
    const client = await getRedisClient();
    if (!client) return null;
    const raw = await client.get(k);
    if (raw == null || raw === '') return null;
    return JSON.parse(raw);
  } catch (e) {
    console.warn('[demoScenarioStore] redis get', e.message);
    return null;
  }
}

async function redisSet(k, obj) {
  if (!resolveRedisUrl()) return;
  try {
    const client = await getRedisClient();
    if (!client) return;
    await client.set(k, JSON.stringify(obj));
  } catch (e) {
    console.warn('[demoScenarioStore] redis set', e.message);
  }
}

async function remoteGet(k) {
  const fromKv = await kvGet(k);
  if (fromKv && typeof fromKv === 'object') return fromKv;
  const fromRedis = await redisGet(k);
  if (fromRedis && typeof fromRedis === 'object') return fromRedis;
  return null;
}

async function remoteSet(k, obj) {
  await kvSet(k, obj);
  await redisSet(k, obj);
}

/**
 * Load demo scenario for a user (cached in memory after first read).
 */
async function load(userId) {
  if (!userId) return { stepUpAmountThreshold: null };
  const cached = memory.get(userId);
  if (cached) return cached;

  const data = await remoteGet(key(userId));
  if (data) {
    memory.set(userId, data);
    return data;
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
  await remoteSet(key(userId), next);
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
