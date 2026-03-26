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
 *
 * Resilience: a CircuitBreaker wraps every Upstash call.
 *   CLOSED  → normal operation, requests flow through.
 *   OPEN    → Upstash is failing; skip Redis, serve from in-memory cache.
 *             After COOLDOWN_MS the circuit moves to HALF-OPEN for a probe.
 *   HALF-OPEN → one probe request let through; success closes, failure reopens.
 */

const { Store } = require('express-session');
const { createClient } = require('@vercel/kv');

const DEFAULT_TTL_SECONDS = 24 * 60 * 60; // 24 hours

/**
 * Circuit breaker — prevents hammering Upstash when it is over-quota or down.
 *
 * States: CLOSED (normal) → OPEN (failing, bypass Redis) → HALF_OPEN (probe)
 *   failureThreshold: consecutive failures to trip the breaker (default: 3)
 *   cooldownMs:       how long to stay OPEN before probing again (default: 60s)
 *   lastError:        most recent error message, exposed for /api/auth/debug
 */
class CircuitBreaker {
  constructor({ failureThreshold = 3, cooldownMs = 60_000 } = {}) {
    this._failures  = 0;
    this._state     = 'CLOSED';
    this._openedAt  = 0;
    this._threshold = failureThreshold;
    this._cooldown  = cooldownMs;
    this.lastError  = null;
  }

  /** True when requests should bypass Upstash. */
  get isOpen() {
    if (this._state === 'OPEN') {
      if (Date.now() - this._openedAt >= this._cooldown) {
        this._state = 'HALF_OPEN';
        return false; // allow one probe through
      }
      return true;
    }
    return false;
  }

  get state() { return this._state; }

  onSuccess() {
    this._failures = 0;
    if (this._state !== 'CLOSED') {
      console.log('[circuit-breaker] Upstash recovered — circuit CLOSED');
    }
    this._state    = 'CLOSED';
    this.lastError = null;
  }

  onFailure(err) {
    this.lastError = err?.message || String(err);
    this._failures++;
    if (this._state === 'HALF_OPEN' || this._failures >= this._threshold) {
      if (this._state !== 'OPEN') {
        console.warn(`[circuit-breaker] Upstash tripped after ${this._failures} failure(s) — circuit OPEN for ${this._cooldown / 1000}s. Error: ${this.lastError}`);
      }
      this._state    = 'OPEN';
      this._openedAt = Date.now();
    }
  }
}

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
    this._circuit   = new CircuitBreaker({
      failureThreshold: opts.circuitFailureThreshold ?? 3,
      cooldownMs:       opts.circuitCooldownMs       ?? 60_000,
    });
  }

  /** Returns TTL in seconds derived from the session cookie, or the default. */
  _ttl(session) {
    const maxAge = session?.cookie?.maxAge;
    return maxAge ? Math.ceil(maxAge / 1000) : this.defaultTtl;
  }

  /**
   * Read session — cache-first, Upstash on miss.
   * If the circuit is open, serves from cache (or null) without touching Redis.
   */
  get(sid, cb) {
    const cached = this._cache.get(sid);
    if (cached !== null) return cb(null, cached);

    // Circuit open: no Redis call; return null so cookie-only session takes over
    if (this._circuit.isOpen) return cb(null, null);

    this.kv
      .get(this.prefix + sid)
      .then((data) => {
        this._circuit.onSuccess();
        if (data) this._cache.set(sid, data);
        cb(null, data || null);
      })
      .catch((err) => {
        this._circuit.onFailure(err);
        console.error('[session-store] Upstash GET error:', err.message);
        cb(null, null);
      });
  }

  /**
   * Write session — update cache immediately; persist to Upstash async.
   * Non-fatal when circuit is open or Upstash errors — user gets cookie-only session.
   */
  set(sid, session, cb) {
    this._cache.set(sid, session); // synchronous — in-process update first
    if (this._circuit.isOpen) return cb(null); // skip Redis while tripped

    const ttl = this._ttl(session);
    this.kv
      .set(this.prefix + sid, session, { ex: ttl })
      .then(() => { this._circuit.onSuccess(); cb(null); })
      .catch((err) => {
        this._circuit.onFailure(err);
        console.error('[session-store] Upstash SET error (session not persisted to Redis):', err.message);
        cb(null);
      });
  }

  /** Delete session from cache and Upstash. Non-fatal. */
  destroy(sid, cb) {
    this._cache.del(sid);
    if (this._circuit.isOpen) return cb && cb(null);

    this.kv
      .del(this.prefix + sid)
      .then(() => { this._circuit.onSuccess(); cb && cb(null); })
      .catch((err) => {
        this._circuit.onFailure(err);
        console.error('[session-store] Upstash DEL error (ignored):', err.message);
        cb && cb(null);
      });
  }

  /**
   * Refresh TTL — suppressed when circuit is open or cache entry is fresh.
   * express-session calls touch() on every request with resave:false, so
   * without suppression every request fires an Upstash EXPIRE command.
   */
  touch(sid, session, cb) {
    if (this._cache.isFresh(sid, 15_000)) return cb && cb(null);
    if (this._circuit.isOpen) return cb && cb(null);

    const ttl = this._ttl(session);
    this.kv
      .expire(this.prefix + sid, ttl)
      .then(() => { this._circuit.onSuccess(); cb && cb(null); })
      .catch((err) => { this._circuit.onFailure(err); cb && cb(null); });
  }

  /**
   * Health check: write + read a sentinel key.
   * Returns circuit state alongside health for /api/auth/debug.
   * @returns {Promise<{ healthy: boolean, error: string|null, circuit: string }>}
   */
  async ping() {
    const key = `${this.prefix}health:ping`;
    const circuit = this._circuit.state;

    // If circuit is open, report unhealthy immediately without burning a quota call
    if (this._circuit.isOpen) {
      return { healthy: false, error: this._circuit.lastError || 'circuit open', circuit };
    }

    try {
      await this.kv.set(key, '1', { ex: 30 });
      const val = await this.kv.get(key);
      const healthy = val === '1' || val === 1 || val === true;
      if (healthy) this._circuit.onSuccess();
      return { healthy, error: healthy ? null : `unexpected ping value: ${JSON.stringify(val)}`, circuit };
    } catch (err) {
      this._circuit.onFailure(err);
      return { healthy: false, error: err.message, circuit: this._circuit.state };
    }
  }
}

module.exports = UpstashSessionStore;
