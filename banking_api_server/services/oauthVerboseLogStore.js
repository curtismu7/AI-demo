'use strict';

/**
 * Ring buffer of OAuth verbose lines for admin viewing without the host dashboard.
 *
 * - Local: append to data/logs/oauth-verbose.log (trimmed if oversized)
 * - Hosted + KV (Upstash / Vercel KV): Redis LIST banking:oauth:verbose (LPUSH + LTRIM)
 * - Hosted without KV: in-memory only (lost on cold start; still useful for same warm instance)
 */

const fs = require('fs');
const path = require('path');

const KV_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const USE_KV = !!(KV_URL && KV_TOKEN);
const LIST_KEY = 'banking:oauth:verbose';
const MAX_LINES = 500;
const MAX_FILE_BYTES = 512 * 1024;

const memoryLines = [];

function _logDir() {
  return path.join(__dirname, '..', 'data', 'logs');
}

function _logFile() {
  return path.join(_logDir(), 'oauth-verbose.log');
}

function _ensureDir() {
  const dir = _logDir();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

/**
 * Append one line (already includes timestamp if desired). Sync + fire-and-forget KV.
 */
function appendLine(line) {
  const text = String(line).replace(/\r?\n/g, ' ');
  memoryLines.push(text);
  while (memoryLines.length > MAX_LINES) memoryLines.shift();

  if (!process.env.VERCEL) {
    try {
      _ensureDir();
      const fp = _logFile();
      fs.appendFileSync(fp, text + '\n', 'utf8');
      const st = fs.statSync(fp);
      if (st.size > MAX_FILE_BYTES) {
        const raw = fs.readFileSync(fp, 'utf8');
        const half = raw.slice(Math.floor(raw.length / 2));
        fs.writeFileSync(fp, half.trimStart() + '\n', 'utf8');
      }
    } catch (e) {
      console.error('[oauthVerboseLogStore] file append failed:', e.message);
    }
  }

  if (USE_KV) {
    const payload = JSON.stringify({ t: new Date().toISOString(), line: text });
    setImmediate(() => {
      try {
        const { createClient } = require('@vercel/kv');
        const kv = createClient({ url: KV_URL, token: KV_TOKEN });
        kv
          .lpush(LIST_KEY, payload)
          .then(() => kv.ltrim(LIST_KEY, 0, MAX_LINES - 1))
          .catch((err) => console.error('[oauthVerboseLogStore] KV append failed:', err.message));
      } catch (e) {
        console.error('[oauthVerboseLogStore] KV load failed:', e.message);
      }
    });
  }
}

/**
 * Return recent lines (oldest first for reading top-to-bottom).
 */
async function getRecentLines(limit = 200) {
  const n = Math.min(Math.max(parseInt(limit, 10) || 200, 1), MAX_LINES);

  if (USE_KV) {
    try {
      const { createClient } = require('@vercel/kv');
      const kv = createClient({ url: KV_URL, token: KV_TOKEN });
      const raw = await kv.lrange(LIST_KEY, 0, n - 1);
      const parsed = (raw || [])
        .map((r) => {
          try {
            return JSON.parse(r).line || r;
          } catch {
            return r;
          }
        })
        .filter(Boolean);
      return { lines: parsed.slice().reverse(), backend: 'kv' };
    } catch (e) {
      console.error('[oauthVerboseLogStore] KV read failed:', e.message);
    }
  }

  if (!process.env.VERCEL) {
    try {
      const fp = _logFile();
      if (fs.existsSync(fp)) {
        const raw = fs.readFileSync(fp, 'utf8');
        const all = raw.split('\n').filter(Boolean);
        return { lines: all.slice(-n), backend: 'file' };
      }
    } catch (e) {
      console.error('[oauthVerboseLogStore] file read failed:', e.message);
    }
  }

  return { lines: memoryLines.slice(-n), backend: 'memory' };
}

async function clear() {
  memoryLines.length = 0;

  if (!process.env.VERCEL) {
    try {
      const fp = _logFile();
      if (fs.existsSync(fp)) fs.writeFileSync(fp, '', 'utf8');
    } catch (e) {
      console.error('[oauthVerboseLogStore] file clear failed:', e.message);
    }
  }

  if (USE_KV) {
    const { createClient } = require('@vercel/kv');
    const kv = createClient({ url: KV_URL, token: KV_TOKEN });
    await kv.del(LIST_KEY);
  }
}

module.exports = { appendLine, getRecentLines, clear, MAX_LINES };
