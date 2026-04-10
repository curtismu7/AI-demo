/**
 * SQLite Session Store for local development
 * Stores express-session data in SQLite database
 * Intended for local development only; use Redis/Upstash for production
 */

const Database = require('better-sqlite3');
const path = require('path');

class SqliteSessionStore {
  constructor(options = {}) {
    this.options = {
      dbPath: options.dbPath || path.join(__dirname, '../../data/sessions.db'),
      table: options.table || 'sessions',
      ttl: options.ttl || 24 * 60 * 60 * 1000, // 24 hours default
      ...options
    };

    this.db = new Database(this.options.dbPath);
    this.initDatabase();
    this.cleanupInterval = setInterval(() => this.cleanupExpiredSessions(), 60 * 60 * 1000); // Cleanup every hour
  }

  initDatabase() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS ${this.options.table} (
        sid TEXT PRIMARY KEY,
        sess TEXT NOT NULL,
        expire INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_expire ON ${this.options.table}(expire);
    `);
  }

  get(sid, callback) {
    try {
      const now = Date.now();
      const row = this.db.prepare(`
        SELECT sess FROM ${this.options.table}
        WHERE sid = ? AND expire > ?
      `).get(sid, now);

      if (!row) {
        return callback(null, null);
      }

      const session = JSON.parse(row.sess);
      callback(null, session);
    } catch (error) {
      callback(error);
    }
  }

  set(sid, sess, callback) {
    try {
      const expire = Date.now() + (this.options.ttl);
      this.db.prepare(`
        INSERT OR REPLACE INTO ${this.options.table} (sid, sess, expire)
        VALUES (?, ?, ?)
      `).run(sid, JSON.stringify(sess), expire);

      callback(null);
    } catch (error) {
      callback(error);
    }
  }

  destroy(sid, callback) {
    try {
      this.db.prepare(`
        DELETE FROM ${this.options.table} WHERE sid = ?
      `).run(sid);

      callback(null);
    } catch (error) {
      callback(error);
    }
  }

  all(callback) {
    try {
      const rows = this.db.prepare(`
        SELECT sess FROM ${this.options.table}
      `).all();

      const sessions = rows.map(row => JSON.parse(row.sess));
      callback(null, sessions);
    } catch (error) {
      callback(error);
    }
  }

  length(callback) {
    try {
      const row = this.db.prepare(`
        SELECT COUNT(*) as count FROM ${this.options.table}
      `).get();

      callback(null, row.count);
    } catch (error) {
      callback(error);
    }
  }

  clear(callback) {
    try {
      this.db.prepare(`
        DELETE FROM ${this.options.table}
      `).run();

      callback(null);
    } catch (error) {
      callback(error);
    }
  }

  cleanupExpiredSessions() {
    try {
      const now = Date.now();
      const result = this.db.prepare(`
        DELETE FROM ${this.options.table} WHERE expire < ?
      `).run(now);

      if (result.changes > 0) {
        console.log(`[sqlite-session-store] Cleaned up ${result.changes} expired sessions`);
      }
    } catch (error) {
      console.error('[sqlite-session-store] Cleanup error:', error);
    }
  }

  close() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.db.close();
  }
}

module.exports = SqliteSessionStore;
