'use strict';

/**
 * LMDB Session Store for express-session.
 *
 * Uses the `lmdb` npm package (pre-built binaries, no native compile step)
 * instead of better-sqlite3, eliminating Node ABI version conflicts.
 *
 * Drop-in replacement for SqliteSessionStore — same constructor options,
 * same express-session Store interface (get/set/destroy/all/length/clear).
 *
 * Data format: each session is stored as a plain JS object (msgpackr).
 * Expiry is stored alongside the session data and checked on read.
 */

const path = require('path');
const Store = require('express-session').Store;

class LmdbSessionStore extends Store {
  constructor(options = {}) {
    super();
    this.ttl  = options.ttl  || 24 * 60 * 60 * 1000; // 24 hours ms
    const dbDir = options.dbPath
      ? path.dirname(options.dbPath)          // reuse sessions.db directory
      : path.join(__dirname, '../data');
    this.envPath = path.join(dbDir, 'sessions-lmdb');

    const { open } = require('lmdb');
    this.db = open({
      path:       this.envPath,
      dupSort:    false,
      encoding:   'msgpack',
    });

    this.cleanupInterval = setInterval(() => this._cleanup(), 60 * 60 * 1000);
    console.log('[lmdb-session-store] Ready at', this.envPath);
  }

  get(sid, callback) {
    try {
      const entry = this.db.get(sid);
      if (!entry || entry.expire < Date.now()) return callback(null, null);
      callback(null, entry.sess);
    } catch (e) { callback(e); }
  }

  set(sid, sess, callback) {
    try {
      this.db.putSync(sid, { sess, expire: Date.now() + this.ttl });
      callback(null);
    } catch (e) { callback(e); }
  }

  destroy(sid, callback) {
    try {
      this.db.removeSync(sid);
      callback(null);
    } catch (e) { callback(e); }
  }

  all(callback) {
    try {
      const now = Date.now();
      const sessions = [];
      for (const { value } of this.db.getRange()) {
        if (value && value.expire > now) sessions.push(value.sess);
      }
      callback(null, sessions);
    } catch (e) { callback(e); }
  }

  length(callback) {
    try {
      let count = 0;
      const now = Date.now();
      for (const { value } of this.db.getRange()) {
        if (value && value.expire > now) count++;
      }
      callback(null, count);
    } catch (e) { callback(e); }
  }

  clear(callback) {
    try {
      this.db.clearSync();
      callback(null);
    } catch (e) { callback(e); }
  }

  _cleanup() {
    try {
      const now = Date.now();
      let removed = 0;
      for (const { key, value } of this.db.getRange()) {
        if (!value || value.expire < now) {
          this.db.removeSync(key);
          removed++;
        }
      }
      if (removed > 0) console.log(`[lmdb-session-store] Cleaned up ${removed} expired sessions`);
    } catch (e) {
      console.error('[lmdb-session-store] Cleanup error:', e.message);
    }
  }

  close() {
    if (this.cleanupInterval) clearInterval(this.cleanupInterval);
    this.db.close();
  }
}

module.exports = LmdbSessionStore;
