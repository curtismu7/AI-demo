// banking_api_server/services/upstashSessionStore.js
'use strict';

/**
 * express-session compatible store backed by Upstash Redis REST API via @vercel/kv.
 *
 * WHY: node-redis (TCP/TLS wire protocol) is unreliable on Vercel serverless
 * because connections are killed between function invocations.  Every cold
 * start incurs a full TLS handshake that races against the session read/write
 * window.  @vercel/kv uses HTTP — stateless, no connection to re-establish,
 * no cold-start race, and is already a confirmed dependency of this package.
 *
 * @vercel/kv is in banking_api_server/package.json and confirmed working
 * (configStore uses it).  @upstash/redis is NOT a direct dependency here —
 * using @vercel/kv avoids version-mismatch issues.
 *
 * Env vars: UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN
 *           (or KV_REST_API_URL + KV_REST_API_TOKEN)
 */

const { Store } = require('express-session');
const { createClient } = require('@vercel/kv');

const DEFAULT_TTL_SECONDS = 24 * 60 * 60; // 24 hours

/**
 * In-process session cache — drastically reduces Upstash REST calls.
 *
 * On Vercel serverless, each warm Lambda instance handles many requests
 * sequentially. Without caching every request fires 2+ Upstash commands
 * (GET + EXPIRE), burning through the 500k/day free-tier quota in hours.
 *
 * Strategy:
 *   get()     → serve from cache if fresh; fall through to Upstash on miss.
 *   set()     → write to cache immediately; write to Upstash async (non-blocking).
 *   destroy() → evict from cache; delete from Upstash.
 *   touch()   → skip Upstash EXPIRE if cache entry has plenty of TTL left;
 *               only call Upstash when the cache entry is within 15s of expiry.
 *
 * Cache TTL: 45 seconds. A warm Lambda handling 10 req/s saves ~90 Upstash
 * calls per 45-second window vs. hitting Redis on every request.
 * Max 100 entries to bound memory usage (each session ≈ 2-4 KB).
 */
class SessionMemoryCache {
  constructor({ ttlMs = 45_000, maxSize = 100 } = {}) {
    this._map    = new Map();
    this._ttlMs  = ttlMs;
    this._max    = maxSize;
  }

  get(sid) {
    const entry = this._map.get(sid);
    if (!entry) return null;
    if (Date.now() > entry.exp) { this._map.delete(sid); return null; }
    return entry.data;
  }

  set(sid, data) {
    if (this._map.size >= this._max) {
      // Evict the oldest entry (Maps preserve insertion order)
      this._map.delete(this._map.keys().next().value);
    }
    this._map.set(sid, { data, exp: Date.now() + this._ttlMs });
  }

  del(sid) { this._map.delete(sid); }

  /** True when the entry exists and has > thresholdMs remaining. */
  isFresh(sid, thresholdMs = 15_000) {
    const entry = this._map.get(sid);
    return !!entry && (entry.exp - Date.now()) > thresholdMs;
  }
}

const DEFAULT_TTL_SECONDS_CONST = 24 * 60 * 60;

class UpstashSessionStore extends Store {
  /**
   * @param {object} [opts]
   * @param {string} [opts.url]         Upstash REST URL (falls back to env)
   * @param {string} [opts.token]       Upstash REST token (falls back to env)
   * @param {string} [opts.prefix]      Key prefix (default: 'banking:sess:')
   * @param {number} [opts.ttlSeconds]  Default session TTL (default: 86400)
   * @param {number} [opts.cacheTtlMs]  In-memory cache TTL ms (default: 45000)
   */
  constructor(opts = {}) {
    super();

    const url   = opts.url   || process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
    const token = opts.token || process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

    if (!url || !token) {
      throw new Error(
        'UpstashSessionStore requires UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN ' +
        '(or KV_REST_API_URL + KV_REST_API_TOKEN)',
      );
    }

    this.kv         = createClient({ url, token });
    this.prefix     = opts.prefix     || 'banking:sess:';
    this.defaultTtl = opts.ttlSeconds || DEFAULT_TTL_SECONDS_CONST;
    this.storeType  = 'upstash-rest';
    this._cache     = new SessionMemoryCache({ ttlMs: opts.cacheTtlMs || 45_000 });
  }

  /** Returns TTL in seconds derived from the session cookie, or the default. */
  _ttl(session) {
    const maxAge = session?.cookie?.maxAge;
    return maxAge ? Math.ceil(maxAge / 1000) : this.defaultTtl;
  }

  /**
   * Read session — cache-first, Upstash on miss.
   * Saves one GET per request for warm Lambda instances.
   */
  get(sid, cb) {
    const cached = this._cache.get(sid);
    if (cached !== null) return cb(null, cached);

    this.kv
      .get(this.prefix + sid)
      .then((data) => {
        if (data) this._cache.set(sid, data);
        cb(null, data || null);
      })
      .catch((err) => {
        console.error('[session-store] Upstash GET error (returning empty session):', err.message);
        cb(null, null);
      });
  }

  /**
   * Write session — update cache immediately; persist to Upstash async.
   * Errors are non-fatal: cb(null) so session.save() never rejects.
   * The _auth cookie provides a signed fallback for identity; this store
   * provides the full token payload that the _auth cookie cannot carry.
   */
  set(sid, session, cb) {
    this._cache.set(sid, session); // synchronous — in-process update
    const ttl = this._ttl(session);
    this.kv
      .set(this.prefix + sid, session, { ex: ttl })
      .then(() => cb(null))
      .catch((err) => {
        console.error('[session-store] Upstash SET error (session not persisted to Redis):', err.message);
        cb(null); // non-fatal: user gets cookie-only session, not a crash
      });
  }

  /** Delete session from cache and Upstash. Non-fatal. */
  destroy(sid, cb) {
    this._cache.del(sid);
    this.kv
      .del(this.prefix + sid)
      .then(() => cb && cb(null))
      .catch((err) => {
        console.error('[session-store] Upstash DEL error (ignored):', err.message);
        cb && cb(null);
      });
  }

  /**
   * Refresh TTL — suppressed when cache entry still has >15s remaining.
   * express-session calls touch() on every request with resave:false, so
   * without this suppression every request fires an Upstash EXPIRE command.
   */
  touch(sid, session, cb) {
    if (this._cache.isFresh(sid, 15_000)) return cb && cb(null);
    const ttl = this._ttl(session);
    this.kv
      .expire(this.prefix + sid, ttl)
      .then(() => cb && cb(null))
      .catch(() => cb && cb(null));
  }

  /**
   * Health check: write + read a sentinel key.
   * Used by /api/auth/debug to verify the store is functional.
   * @returns {Promise<{ healthy: boolean, error: string|null }>}
   */
  async ping() {
    const key = `${this.prefix}health:ping`;
    try {
      await this.kv.set(key, '1', { ex: 30 });
      const val = await this.kv.get(key);
      const healthy = val === '1' || val === 1 || val === true;
      return { healthy, error: healthy ? null : `unexpected ping value: ${JSON.stringify(val)}` };
    } catch (err) {
      return { healthy: false, error: err.message };
    }
  }
}

module.exports = UpstashSessionStore;
