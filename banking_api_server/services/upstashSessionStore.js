// banking_api_server/services/upstashSessionStore.js
'use strict';

/**
 * express-session compatible store backed by Upstash Redis REST API.
 *
 * WHY: node-redis (TCP/TLS wire protocol) is unreliable on Vercel serverless
 * because connections are killed between function invocations.  Every cold
 * start incurs a full TLS handshake that races against the session read/write
 * window.  @upstash/redis uses HTTP — stateless, no connection to re-establish,
 * no cold-start race.
 *
 * Requires: @upstash/redis (already in package.json)
 * Env vars: UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN
 *           (or KV_REST_API_URL + KV_REST_API_TOKEN)
 *
 * Both the session store and the Upstash REST endpoint share the same key
 * namespace, so switching from node-redis wire to this store (or back) is
 * transparent — existing sessions survive the switch.
 */

const { Store } = require('express-session');

const DEFAULT_TTL_SECONDS = 24 * 60 * 60; // 24 hours

class UpstashSessionStore extends Store {
  /**
   * @param {object} [opts]
   * @param {string} [opts.url]    Upstash REST URL (falls back to env)
   * @param {string} [opts.token]  Upstash REST token (falls back to env)
   * @param {string} [opts.prefix] Key prefix (default: 'banking:sess:')
   * @param {number} [opts.ttlSeconds] Default session TTL (default: 86400)
   */
  constructor(opts = {}) {
    super();
    const { Redis } = require('@upstash/redis');

    const url   = opts.url   || process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
    const token = opts.token || process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

    if (!url || !token) {
      throw new Error(
        'UpstashSessionStore requires UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN ' +
        '(or KV_REST_API_URL + KV_REST_API_TOKEN)',
      );
    }

    this.redis       = new Redis({ url, token });
    this.prefix      = opts.prefix     || 'banking:sess:';
    this.defaultTtl  = opts.ttlSeconds || DEFAULT_TTL_SECONDS;
    this.storeType   = 'upstash-rest';
  }

  /** Returns TTL in seconds derived from the session cookie, or the default. */
  _ttl(session) {
    const maxAge = session?.cookie?.maxAge;
    return maxAge ? Math.ceil(maxAge / 1000) : this.defaultTtl;
  }

  /** Read session from Upstash. Returns null on miss or error (graceful). */
  get(sid, cb) {
    this.redis
      .get(this.prefix + sid)
      .then((data) => cb(null, data || null))
      .catch((err) => {
        console.error('[session-store] Upstash GET error (returning empty session):', err.message);
        cb(null, null);
      });
  }

  /**
   * Write session to Upstash.
   * Errors are non-fatal: cb(null) so session.save() never rejects.
   * The _auth cookie provides a signed fallback for identity; this store
   * provides the full token payload that the _auth cookie cannot carry.
   */
  set(sid, session, cb) {
    const ttl = this._ttl(session);
    this.redis
      .set(this.prefix + sid, session, { ex: ttl })
      .then(() => {
        console.log(`[session-store] Upstash SET ok sid=${sid.slice(0, 8)}… ttl=${ttl}s`);
        cb(null);
      })
      .catch((err) => {
        console.error('[session-store] Upstash SET error (session not persisted):', err.message);
        cb(null); // non-fatal: user gets cookie-only session, not a crash
      });
  }

  /** Delete session from Upstash. Non-fatal. */
  destroy(sid, cb) {
    this.redis
      .del(this.prefix + sid)
      .then(() => cb && cb(null))
      .catch((err) => {
        console.error('[session-store] Upstash DEL error (ignored):', err.message);
        cb && cb(null);
      });
  }

  /** Refresh TTL without rewriting the full session body. */
  touch(sid, session, cb) {
    const ttl = this._ttl(session);
    this.redis
      .expire(this.prefix + sid, ttl)
      .then(() => cb && cb(null))
      .catch(() => cb && cb(null));
  }

  /**
   * Health check: write + read a sentinel key.
   * Used by /api/auth/debug to verify the store is functional.
   * @returns {Promise<boolean>}
   */
  async ping() {
    const key = `${this.prefix}health:ping`;
    await this.redis.set(key, '1', { ex: 30 });
    const val = await this.redis.get(key);
    return val === '1' || val === 1;
  }
}

module.exports = UpstashSessionStore;
