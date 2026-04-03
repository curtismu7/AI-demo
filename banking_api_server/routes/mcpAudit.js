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
 */
router.get('/', async (req, res) => {
  try {
    const base = mcpHttpBase();
    const params = new URLSearchParams();
    if (req.query.eventType) params.set('eventType', String(req.query.eventType));
    if (req.query.outcome) params.set('outcome', String(req.query.outcome));
    if (req.query.limit) params.set('limit', String(req.query.limit));
    if (req.query.since) params.set('since', String(req.query.since));
    if (req.query.summary) params.set('summary', String(req.query.summary));

    const paramStr = params.toString();
    const url = `${base}/audit${paramStr ? '?' + paramStr : ''}`;

    const upstream = await fetch(url, {
      headers: { 'Accept': 'application/json' },
    });

    if (!upstream.ok) {
      return res.status(502).json({
        error: 'mcp_audit_unavailable',
        message: `MCP server returned ${upstream.status}`,
      });
    }

    const data = await upstream.json();
    return res.json(data);
  } catch (err) {
    console.error('[mcpAudit] fetch error:', err.message);
    return res.status(502).json({
      error: 'mcp_audit_unavailable',
      message: err.message,
    });
  }
});

module.exports = router;
