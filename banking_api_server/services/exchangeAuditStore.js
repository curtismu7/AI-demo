// banking_api_server/services/exchangeAuditStore.js
/**
 * Cross-Lambda token-exchange audit log backed by Upstash Redis (Vercel KV).
 *
 * Problem: On Vercel serverless each invocation runs in an isolated Lambda.
 * The Lambda that calls /api/mcp/tool (and fails the RFC 8693 token exchange)
 * is NOT the same Lambda that later serves GET /api/logs/console. In-process
 * memory (recentLogs in logs.js) is per-Lambda, so the log viewer always
 * appears empty after a cross-Lambda exchange failure.
 *
 * Solution: write every exchange event to Redis (LPUSH + LTRIM) using the same
 * Upstash credentials that configStore.js already uses. Readers call
 * readExchangeEvents() and merge with their in-process logs.
 *
 * If Redis is not configured (local dev without KV vars) write/read are no-ops.
 */
'use strict';

const KV_URL   = process.env.KV_REST_API_URL   || process.env.UPSTASH_REDIS_REST_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN  || process.env.UPSTASH_REDIS_REST_TOKEN;
const USE_KV   = !!(KV_URL && KV_TOKEN);

const AUDIT_KEY  = 'banking:exchange-audit';
const MAX_EVENTS = 200;

function _createKv() {
  const { createClient } = require('@vercel/kv');
  return createClient({ url: KV_URL, token: KV_TOKEN });
}

/**
 * Write a token-exchange audit event to Redis.
 * Fire-and-forget from the caller — this function catches all errors internally.
 *
 * @param {object} event  Arbitrary object; `timestamp` is added if absent.
 */
async function writeExchangeEvent(event) {
  if (!USE_KV) return;
  try {
    const kv    = _createKv();
    const entry = JSON.stringify({
      ...event,
      timestamp: event.timestamp || new Date().toISOString(),
    });
    await kv.lpush(AUDIT_KEY, entry);
    await kv.ltrim(AUDIT_KEY, 0, MAX_EVENTS - 1);
  } catch (err) {
    // Non-fatal — let the main request succeed even if audit write fails.
    // Use process.stderr to avoid re-entering the console interceptor in logs.js.
    process.stderr.write(`[ExchangeAudit] Redis write failed: ${err.message}\n`);
  }
}

/**
 * Read up to `limit` most-recent exchange events from Redis (newest first).
 * Returns [] on any Redis error or when KV is not configured.
 *
 * @param {number} [limit=200]
 * @returns {Promise<object[]>}
 */
async function readExchangeEvents(limit = MAX_EVENTS) {
  if (!USE_KV) return [];
  try {
    const kv  = _createKv();
    const raw = await kv.lrange(AUDIT_KEY, 0, limit - 1);
    return raw
      .map((r) => {
        try { return typeof r === 'string' ? JSON.parse(r) : r; }
        catch { return null; }
      })
      .filter(Boolean);
  } catch (err) {
    process.stderr.write(`[ExchangeAudit] Redis read failed: ${err.message}\n`);
    return [];
  }
}

module.exports = { writeExchangeEvent, readExchangeEvents, USE_KV };
