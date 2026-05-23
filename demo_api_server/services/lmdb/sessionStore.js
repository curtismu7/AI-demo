'use strict';
/**
 * sessionStore.lmdb.js — LMDB-backed express-session store.
 *
 * Implements the express-session Store interface (same surface as
 * sqliteSessionStore.js). Entries are stored as { sess, expire } objects.
 * Expired sessions are pruned on get() and by an hourly cleanup interval.
 *
 * NOT wired into server.js. Replace SqliteSessionStore with LmdbSessionStore
 * in server.js to activate.
 */
const { Store } = require('express-session');
const { openEnv } = require('./openEnv');

const DB_NAME = 'sessions';
const ONE_HOUR_MS = 60 * 60 * 1000;

class LmdbSessionStore extends Store {
  constructor(options = {}) {
    super();
    this.ttl = options.ttl || 24 * 60 * 60 * 1000; // 24h default
    this._db = openEnv().openDB(DB_NAME, { encoding: 'json' });
    this._startCleanup();
  }

  _startCleanup() {
    this._cleanupInterval = setInterval(() => this._cleanup(), ONE_HOUR_MS);
    if (this._cleanupInterval.unref) this._cleanupInterval.unref();
  }

  _cleanup() {
    const now = Date.now();
    for (const { key, value } of this._db.getRange()) {
      if (value.expire <= now) this._db.removeSync(key);
    }
  }

  get(sid, cb) {
    try {
      const entry = this._db.get(sid);
      if (!entry || entry.expire <= Date.now()) return cb(null, null);
      cb(null, entry.sess);
    } catch (e) { cb(e); }
  }

  set(sid, sess, cb) {
    try {
      // sess.cookie.maxAge is already in milliseconds (express-session stores
      // remaining ms, not seconds). Do NOT multiply by 1000 — that produced
      // ~3-year expiry (86 400 000 ms * 1000 ≈ 2 740 years).
      const maxAge = sess.cookie && sess.cookie.maxAge ? sess.cookie.maxAge : this.ttl;
      const expire = Date.now() + maxAge;
      this._db.putSync(sid, { sess, expire });
      cb(null);
    } catch (e) { cb(e); }
  }

  destroy(sid, cb) {
    try {
      this._db.removeSync(sid);
      cb(null);
    } catch (e) { cb(e); }
  }

  all(cb) {
    try {
      const now = Date.now();
      const sessions = {};
      for (const { key, value } of this._db.getRange()) {
        if (value.expire > now) sessions[key] = value.sess;
      }
      cb(null, sessions);
    } catch (e) { cb(e); }
  }

  length(cb) {
    try {
      const now = Date.now();
      let count = 0;
      for (const { value } of this._db.getRange()) {
        if (value.expire > now) count++;
      }
      cb(null, count);
    } catch (e) { cb(e); }
  }

  clear(cb) {
    try {
      this._db.clearSync();
      cb(null);
    } catch (e) { cb(e); }
  }

  close() {
    clearInterval(this._cleanupInterval);
  }
}

module.exports = { LmdbSessionStore };
