/**
 * SQLite Session Store for local development
 * Stores express-session data in SQLite database
 * Intended for local development only; use Redis/Upstash for production
 *
 * Database driver priority:
 *   1. better-sqlite3  — synchronous, fast, supports Node 20/22 LTS
 *   2. node:sqlite     — built-in since Node 22.5; experimental but works on Node 25+
 *      when better-sqlite3 native addon is compiled for a different Node version
 */

const path = require('path');
const Store = require('express-session').Store;

/** Load a compatible SQLite driver: better-sqlite3 first, node:sqlite fallback. */
function loadSqliteDriver() {
  try {
    const Database = require('better-sqlite3');
    // Verify it actually works at runtime (native addon version check)
    const probe = new Database(':memory:');
    probe.close();
    return { driver: 'better-sqlite3', Database };
  } catch (_) {
    // better-sqlite3 native addon not compatible with current Node.js version
  }

  try {
    const { DatabaseSync } = require('node:sqlite');
    // Wrap node:sqlite in a better-sqlite3-compatible interface
    function NodeSqliteDatabase(dbPath) {
      if (dbPath === ':memory:') {
        this._db = new DatabaseSync(':memory:');
      } else {
        this._db = new DatabaseSync(dbPath);
      }
      const self = this;
      this.exec = (sql) => self._db.exec(sql);
      this.prepare = (sql) => {
        const stmt = self._db.prepare(sql);
        return {
          run: (...args) => stmt.run(...args),
          get: (...args) => stmt.get(...args),
          all: (...args) => stmt.all(...args),
        };
      };
      this.close = () => {};
    }
    // Probe it
    const probe = new NodeSqliteDatabase(':memory:');
    probe.exec('SELECT 1');
    return { driver: 'node:sqlite', Database: NodeSqliteDatabase };
  } catch (_) {
    // node:sqlite not available
  }

  return null;
}

const sqliteDriver = loadSqliteDriver();
if (!sqliteDriver) {
  throw new Error('No SQLite driver available — install better-sqlite3 or use Node 22.5+');
}

const { Database } = sqliteDriver;
if (sqliteDriver.driver === 'node:sqlite') {
  // Suppress ExperimentalWarning for node:sqlite in local dev logs
  process.removeAllListeners('warning');
  process.on('warning', (w) => {
    if (w.name === 'ExperimentalWarning' && w.message && w.message.includes('SQLite')) return;
    process.stderr.write(`[warning] ${w.name}: ${w.message}\n`);
  });
  console.log('[sqlite-session-store] Using node:sqlite built-in (better-sqlite3 unavailable for current Node.js)');
}

class SqliteSessionStore extends Store {
  constructor(options = {}) {
    super();
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
