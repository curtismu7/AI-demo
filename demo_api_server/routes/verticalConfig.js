const express = require('express');
const router = express.Router();
const {
  listVerticals,
  getActiveVertical,
  setActiveVertical,
  getVerticalConfig,
  getActiveManifest,
} = require('../services/verticalConfigService');

// GET /api/config/vertical — active vertical config + full v2 manifest (public)
router.get('/', (_req, res) => {
  try {
    const config = getVerticalConfig();
    res.json({
      activeVertical: getActiveVertical(),
      config,                        // legacy shape (kept additively)
      manifest: getActiveManifest(), // v2 manifest the client consumes
    });
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

// PUT /api/config/vertical — set active vertical, server-wide.
// Intentionally any-authenticated (not admin-only): the manifest is
// presentation-only (no scopes/auth/secrets) and the customer-persona demo
// switches themes from the dashboard ThemePicker. See REGRESSION_PLAN §1
// theme-contract note.
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
