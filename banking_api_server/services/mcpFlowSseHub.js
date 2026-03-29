// banking_api_server/services/mcpFlowSseHub.js
'use strict';

/**
 * Per-request MCP tool flow events over Server-Sent Events (SSE).
 *
 * - Client opens GET /api/mcp/tool/events?trace=<uuid> first (claims trace for session).
 * - Client POST /api/mcp/tool with the same flowTraceId; server emits phases as it runs.
 *
 * Limitation: subscribers must hit the same Node process as POST (OK for local/long-lived;
 * multi-instance / stateless serverless may not deliver events unless backed by Redis pub/sub).
 */

/** @type {Map<string, Set<import('express').Response>>} */
const traceSubscribers = new Map();

/** @type {Map<string, { sessionId: string, claimedAt: number }>} */
const traceClaims = new Map();

/** @type {Map<string, object[]>} — replay for subscribers that connect after first publish */
const traceBuffers = new Map();
const BUFFER_MAX = 24;

const CLAIM_TTL_MS = 60_000;
const TRACE_CLEANUP_MS = 120_000;

/**
 * Record that this session claimed a trace id (first GET /events connection).
 * @param {string} traceId
 * @param {string} sessionId
 */
function claimTrace(traceId, sessionId) {
  traceClaims.set(traceId, { sessionId, claimedAt: Date.now() });
  if (!traceBuffers.has(traceId)) {
    traceBuffers.set(traceId, []);
  }
  setTimeout(() => {
    const cur = traceClaims.get(traceId);
    if (cur && cur.sessionId === sessionId) {
      traceClaims.delete(traceId);
      traceBuffers.delete(traceId);
    }
  }, TRACE_CLEANUP_MS);
}

/**
 * @param {string} traceId
 * @param {string} sessionId
 * @returns {boolean}
 */
function isValidTraceForSession(traceId, sessionId) {
  const row = traceClaims.get(traceId);
  if (!row || row.sessionId !== sessionId) return false;
  if (Date.now() - row.claimedAt > CLAIM_TTL_MS) {
    traceClaims.delete(traceId);
    return false;
  }
  return true;
}

/**
 * @param {string} traceId
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @returns {boolean} false if forbidden
 */
function attachSubscriber(traceId, req, res) {
  const sid = req.sessionID;
  if (!sid || !isValidTraceForSession(traceId, sid)) {
    return false;
  }

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  if (typeof res.flushHeaders === 'function') {
    res.flushHeaders();
  }

  res.write(': sse connected\n\n');

  const buf = traceBuffers.get(traceId);
  if (buf && buf.length > 0) {
    for (const payload of buf) {
      try {
        res.write(`data: ${JSON.stringify(payload)}\n\n`);
      } catch (_) {}
    }
  }

  let set = traceSubscribers.get(traceId);
  if (!set) {
    set = new Set();
    traceSubscribers.set(traceId, set);
  }
  set.add(res);

  const cleanup = () => {
    set.delete(res);
    if (set.size === 0) {
      traceSubscribers.delete(traceId);
    }
  };
  req.on('close', cleanup);
  res.on('close', cleanup);
  return true;
}

/**
 * @param {string|null|undefined} traceId
 * @param {object} payload — JSON-serializable (no secrets)
 */
function publish(traceId, payload) {
  if (!traceId || typeof traceId !== 'string') return;
  const full = { ...payload, t: Date.now() };
  let arr = traceBuffers.get(traceId);
  if (!arr) {
    arr = [];
    traceBuffers.set(traceId, arr);
  }
  arr.push(full);
  while (arr.length > BUFFER_MAX) {
    arr.shift();
  }

  const line = `data: ${JSON.stringify(full)}\n\n`;
  const set = traceSubscribers.get(traceId);
  if (!set || set.size === 0) return;
  for (const r of set) {
    try {
      r.write(line);
    } catch (_) {
      /* client gone */
    }
  }
}

/**
 * Call when POST /api/mcp/tool finishes (success or error) for this trace.
 * @param {string|null|undefined} traceId
 */
function endTrace(traceId) {
  if (!traceId) return;
  publish(traceId, { phase: 'stream_end' });
  traceClaims.delete(traceId);
  traceBuffers.delete(traceId);
  const set = traceSubscribers.get(traceId);
  if (set) {
    for (const r of set) {
      try {
        r.end();
      } catch (_) {}
    }
    traceSubscribers.delete(traceId);
  }
}

/**
 * Ensure trace is owned by this session (POST may register before GET).
 * @param {string} traceId
 * @param {string} sessionId
 * @returns {'ok'|'forbidden'}
 */
function ensurePostTrace(traceId, sessionId) {
  if (!traceId || !sessionId) return 'forbidden';
  const row = traceClaims.get(traceId);
  if (!row) {
    claimTrace(traceId, sessionId);
    return 'ok';
  }
  if (row.sessionId !== sessionId) return 'forbidden';
  row.claimedAt = Date.now();
  return 'ok';
}

/**
 * GET /api/mcp/tool/events?trace= — start SSE for this session + trace.
 * @returns {boolean} true if SSE stream was attached (response left open)
 */
function handleSseGet(req, res) {
  const traceId = String(req.query.trace || '').trim();
  if (!traceId || traceId.length < 12) {
    res.status(400).json({ error: 'trace_required', message: 'Query ?trace= must be a UUID from the client.' });
    return false;
  }
  if (!req.sessionID) {
    res.status(401).json({ error: 'session_required', message: 'Sign in required for MCP flow SSE.' });
    return false;
  }
  if (!traceClaims.has(traceId)) {
    claimTrace(traceId, req.sessionID);
  } else if (!isValidTraceForSession(traceId, req.sessionID)) {
    res.status(403).json({ error: 'trace_forbidden', message: 'Trace id is not valid for this session.' });
    return false;
  }
  if (!attachSubscriber(traceId, req, res)) {
    res.status(403).json({ error: 'sse_attach_failed' });
    return false;
  }
  return true;
}

module.exports = {
  claimTrace,
  isValidTraceForSession,
  ensurePostTrace,
  attachSubscriber,
  publish,
  endTrace,
  handleSseGet,
};
