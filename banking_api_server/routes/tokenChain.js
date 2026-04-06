const express = require('express');
const router = express.Router();
const { getTokenChain, getCurrentTokens } = require('../services/tokenChainService');

// GET /api/token-chain — get token chain for authenticated user
router.get('/', async (req, res) => {
  try {
    const tokenChain = await getTokenChain(req.user.id);
    res.json({
      tokenChain,
      metadata: {
        userId: req.user.id,
        totalEvents: tokenChain.length,
        lastUpdated: new Date().toISOString()
      }
    });
  } catch (err) {
    console.error('[tokenChain] GET error:', err.message);
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
