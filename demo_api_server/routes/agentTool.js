'use strict';
/**
 * POST /internal/agent-tool
 *
 * Internal endpoint called by demo_agent_service when executing a tool
 * on behalf of the AG-UI agent run. Gated by BFF_INTERNAL_SECRET.
 *
 * Request body: { tool, args, sessionId }
 *   tool      — MCP tool name (e.g. 'get_my_accounts')
 *   args      — tool arguments object
 *   sessionId — the user's express-session ID (opaque, from agentRun.js)
 *
 * The BFF:
 *   1. Validates the internal secret
 *   2. Loads the session by sessionId to obtain oauthTokens
 *   3. Calls resolveMcpAccessTokenWithEvents (RFC 8693 exchange)
 *   4. Executes the tool via mcpWebSocketClient
 *   5. Returns { result, tokenEvents, authorizeDecision? }
 *
 * Token custody: no raw tokens reach the agent service. The agent
 * service receives only the tool result and decoded token metadata.
 *
 * NOT mounted under /api/* — not browser-facing.
 * Bound to loopback (127.0.0.1) per REGRESSION_PLAN §3.
 */

const express = require('express');
const crypto = require('crypto');
const router = express.Router();

const DEFAULT_INTERNAL_SECRET = 'dev-shared-secret-change-me';
const INTERNAL_SECRET = process.env.BFF_INTERNAL_SECRET || DEFAULT_INTERNAL_SECRET;
const INTERNAL_SECRET_BUF = Buffer.from(INTERNAL_SECRET);

if (process.env.NODE_ENV === 'production' && INTERNAL_SECRET === DEFAULT_INTERNAL_SECRET) {
  console.error(
    '[BFF/agent-tool] FATAL: BFF_INTERNAL_SECRET is the dev default in production. Refusing to start.',
  );
  process.exit(1);
}

function checkSecret(req, res) {
  const presented = req.headers['x-internal-gateway-secret'];
  const buf = typeof presented === 'string' ? Buffer.from(presented) : null;
  if (
    !buf ||
    buf.length !== INTERNAL_SECRET_BUF.length ||
    !crypto.timingSafeEqual(buf, INTERNAL_SECRET_BUF)
  ) {
    res.status(403).json({ error: 'forbidden' });
    return false;
  }
  return true;
}

router.post('/agent-tool', express.json({ limit: '256kb' }), async (req, res) => {
  if (!checkSecret(req, res)) return;

  const { tool, args, sessionId } = req.body || {};

  if (!tool || typeof tool !== 'string') {
    return res.status(400).json({ error: 'tool_required' });
  }
  if (!sessionId || typeof sessionId !== 'string') {
    return res.status(400).json({ error: 'sessionId_required' });
  }

  // ---------------------------------------------------------------------------
  // Load session from store to obtain oauthTokens
  // ---------------------------------------------------------------------------
  let session;
  try {
    session = await new Promise((resolve, reject) => {
      req.sessionStore.get(sessionId, (err, data) => {
        if (err) return reject(err);
        resolve(data);
      });
    });
  } catch (err) {
    console.error('[agent-tool] session store error:', err.message);
    return res.status(503).json({ error: 'session_store_error', message: err.message });
  }

  if (!session || !session.oauthTokens) {
    return res.status(404).json({ error: 'session_not_found_or_no_tokens' });
  }

  // Build a minimal req-like object the token service needs
  const fakeReq = {
    session: {
      ...session,
      id: sessionId,
    },
    tokenEvents: [],
    recordTokenEvent: (type, meta) => {
      fakeReq.tokenEvents.push({ type, ...meta, timestamp: new Date().toISOString() });
    },
  };

  // ---------------------------------------------------------------------------
  // Resolve MCP access token (RFC 8693 exchange)
  // ---------------------------------------------------------------------------
  let mcpToken;
  let tokenEvents = [];
  try {
    const { resolveMcpAccessTokenWithEvents } = require('../services/agentMcpTokenService');
    const resolved = await resolveMcpAccessTokenWithEvents(fakeReq, tool);
    mcpToken = resolved.token;
    tokenEvents = resolved.tokenEvents || fakeReq.tokenEvents;
  } catch (err) {
    console.error('[agent-tool] token exchange failed:', err.message);
    return res.status(502).json({
      error: err.pingoneError || 'token_exchange_failed',
      message: err.message,
      tokenEvents: err.tokenEvents || fakeReq.tokenEvents,
    });
  }

  // ---------------------------------------------------------------------------
  // Execute tool via MCP WebSocket client
  // ---------------------------------------------------------------------------
  let result;
  try {
    const { callMcpTool } = require('../services/mcpWebSocketClient');
    result = await callMcpTool(tool, args || {}, mcpToken);
  } catch (err) {
    console.error('[agent-tool] MCP tool call failed:', err.message);
    // Check for HITL signal (428 shape from MCP gateway)
    if (err.statusCode === 428 || err.code === 'hitl_required') {
      return res.status(200).json({
        result: {
          hitlRequired: true,
          interruptId: err.challengeId || ('hitl-' + Date.now()),
          consentId: err.challengeId,
          reason: err.challengeType || 'consent_required',
          message: err.message || 'User approval required',
          expiresAt: err.expiresAt || new Date(Date.now() + 5 * 60 * 1000).toISOString(),
        },
        tokenEvents,
      });
    }
    return res.status(502).json({
      error: err.code || 'tool_call_failed',
      message: err.message,
      tokenEvents,
    });
  }

  // ---------------------------------------------------------------------------
  // Return result + token events (no raw tokens)
  // ---------------------------------------------------------------------------
  res.json({ result, tokenEvents });
});

module.exports = router;
