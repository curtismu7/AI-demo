'use strict';

const express = require('express');
const router = express.Router();
const { getMcpServerUrl } = require('../services/mcpWebSocketClient');

/**
 * Convert ws/wss MCP server URL to http/https for REST calls.
 */
function mcpHttpBase() {
  const wsUrl = getMcpServerUrl();
  return wsUrl.replace(/^ws:\/\//, 'http://').replace(/^wss:\/\//, 'https://');
}

/**
 * GET /api/mcp/audit
 * Proxy to MCP server internal /audit endpoint.
 * Supported query params: eventType, outcome, limit, since, summary
 * Requires admin session (enforced at server.js registration level).
 *
 * When the MCP server is unreachable (e.g. Vercel without a deployed MCP server),
 * returns an empty result rather than a 502 so the UI shows an empty state.
 */
router.get('/', async (req, res) => {
  const isSummary = req.query.summary === '1' || req.query.summary === 'true';
  const emptyFallback = isSummary
    ? { total: 0, byOutcome: {}, byEventType: {} }
    : [];

  try {
    const base = mcpHttpBase();
    const params = new URLSearchParams();
    if (req.query.eventType) params.set('eventType', String(req.query.eventType));
    if (req.query.outcome) params.set('outcome', String(req.query.outcome));
    if (req.query.limit) params.set('limit', String(req.query.limit));
    if (req.query.since) params.set('since', String(req.query.since));
    if (req.query.summary) params.set('summary', String(req.query.summary));
    if (req.query.agentId) params.set('agentId', String(req.query.agentId));
    if (req.query.operation) params.set('operation', String(req.query.operation));

    const paramStr = params.toString();
    const url = `${base}/audit${paramStr ? '?' + paramStr : ''}`;

    const upstream = await fetch(url, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(5000),
    });

    if (!upstream.ok) {
      console.warn(`[mcpAudit] upstream returned ${upstream.status} — returning empty fallback`);
      res.set('x-mcp-unavailable', 'true');
      return res.json(emptyFallback);
    }

    const data = await upstream.json();
    return res.json(data);
  } catch (err) {
    console.warn('[mcpAudit] MCP server unreachable:', err.message, '— returning empty fallback');
    res.set('x-mcp-unavailable', 'true');
    return res.json(emptyFallback);
  }
});

module.exports = router;
