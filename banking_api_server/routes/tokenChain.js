const express = require('express');
const router = express.Router();
const { getTokenChain, getCurrentTokens, synthesizeFromSession, getMCPToolCalls } = require('../services/tokenChainService');
const { logEvent: logAppEvent } = require('../services/appEventService');

// GET /api/token-chain — get token chain for authenticated user (including MCP delegation trail)
router.get('/', async (req, res) => {
  try {
    let tokenChain = await getTokenChain(req.user.id);
    // Fallback: synthesize from session token if Map is empty (e.g. after server restart)
    if (tokenChain.length === 0 && req.session && req.session.oauthTokens && req.session.oauthTokens.accessToken) {
      tokenChain = synthesizeFromSession(req.session.oauthTokens.accessToken);
    }
    
    // Fetch MCP tool call delegation trail
    const mcpToolCallsChain = await getMCPToolCalls(req.user.id);
    
    res.json({
      tokenChain,
      mcpToolCallsChain,
      metadata: {
        userId: req.user.id,
        totalEvents: tokenChain.length,
        totalMCPToolCalls: mcpToolCallsChain.length,
        lastUpdated: new Date().toISOString()
      }
    });
    logAppEvent('token_exchange', 'info', `Token chain fetched — ${tokenChain.length} events, ${mcpToolCallsChain.length} MCP tool calls`,
      { tag: 'token_chain/fetched', metadata: { userId: req.user.id, chainLength: tokenChain.length, mcpToolCalls: mcpToolCallsChain.length } }
    );
  } catch (err) {
    console.error('[tokenChain] GET error:', err.message);
    logAppEvent('token_exchange', 'error', `Token chain fetch failed: ${err.message}`,
      { tag: 'token_chain/error', metadata: { userId: req.user?.id, error: err.message } }
    );
    res.status(500).json({ error: 'internal_error', message: err.message });
  }
});

// GET /api/token-chain/current — get current active tokens
router.get('/current', async (req, res) => {
  try {
    const currentTokens = await getCurrentTokens(req.user.id);
    res.json({ currentTokens });
  } catch (err) {
    console.error('[tokenChain] GET current error:', err.message);
    res.status(500).json({ error: 'internal_error', message: err.message });
  }
});

module.exports = router;
