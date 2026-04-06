const express = require('express');
const router = express.Router();
const { listVerticals, getActiveVertical, setActiveVertical, getVerticalConfig } = require('../services/verticalConfigService');

// GET /api/config/vertical — current active vertical config (public)
router.get('/', (_req, res) => {
  try {
    const config = getVerticalConfig();
    res.json({ activeVertical: getActiveVertical(), config });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/config/verticals — list all available verticals (public)
router.get('/list', (_req, res) => {
  try {
    res.json({ verticals: listVerticals() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/config/vertical — set active vertical (requires auth)
router.put('/', async (req, res) => {
  try {
    const { verticalId } = req.body || {};
    if (!verticalId) {
      return res.status(400).json({ error: 'verticalId is required' });
    }
    const config = await setActiveVertical(verticalId);
    res.json({ activeVertical: verticalId, config });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
