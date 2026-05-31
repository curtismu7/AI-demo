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

// Returns the plugin if the active vertical has one AND `tool` is one of its tools, else null.
function resolvePluginToolOwner(tool) {
  const { verticalManifest } = require('../services/verticalManifest');
  const verticalDispatch = require('../services/verticalDispatch');
  const activeId = verticalManifest.resolver.activeId();
  const plugin = verticalDispatch.resolvePlugin(activeId);
  if (plugin && plugin.getTools().some((t) => t.name === tool)) return { activeId, verticalDispatch };
  return null;
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

router.post('/agent-tool', async (req, res) => {
  if (!checkSecret(req, res)) return;

  const { tool, args, sessionId } = req.body || {};

  if (!tool || typeof tool !== 'string') {
    return res.status(400).json({ error: 'tool_required' });
  }
  if (!sessionId || typeof sessionId !== 'string') {
    return res.status(400).json({ error: 'sessionId_required' });
  }

  // Per-vertical plugin tool: execute in-BFF over the vertical's own data store.
  // No MCP token needed (plugin reads local data), so this precedes the RFC 8693 exchange.
  const pluginOwner = resolvePluginToolOwner(tool);
  if (pluginOwner) {
    try {
      const out = await pluginOwner.verticalDispatch.executeToolFor(
        pluginOwner.activeId, tool, args || {}, { sessionId },
        () => ({ result: { error: `unknown tool: ${tool}` }, render: 'text' }),
      );
      return res.json({ result: out && out.result, render: out && out.render, tokenEvents: [] });
    } catch (err) {
      console.error('[agent-tool] vertical plugin tool failed:', err.message);
      return res.status(502).json({ error: 'vertical_tool_failed', message: err.message, tokenEvents: [] });
    }
  }

  // ---------------------------------------------------------------------------
  // Load session from store to obtain oauthTokens
  // ---------------------------------------------------------------------------
  if (!req.sessionStore) {
    return res.status(503).json({ error: 'session_store_unavailable' });
  }
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
    const { mcpCallTool } = require('../services/mcpWebSocketClient');
    result = await mcpCallTool(tool, args || {}, mcpToken);
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
module.exports.__test = { resolvePluginToolOwner };
