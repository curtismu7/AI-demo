// banking_api_server/routes/thresholds.js
// GET/POST /api/config/thresholds — demo controls for step-up threshold values
'use strict';

const express = require('express');
const router = express.Router();
const configStore = require('../services/configStore');
const runtimeSettings = require('../config/runtimeSettings');

const DEFAULT_CONFIRM = 500;
const DEFAULT_MFA = 500;

function readThresholds() {
  const confirmRaw = configStore.getEffective('confirm_threshold_usd');
  const mfaRaw = configStore.getEffective('mfa_threshold_usd');
  const confirmN = Number(confirmRaw);
  const mfaN = Number(mfaRaw);
  // Prefer live runtimeSettings value (may have been updated since boot); fall back to configStore
  const rtStepUp = runtimeSettings.get('stepUpAmountThreshold');
  const effectiveStepUp = (rtStepUp > 0) ? rtStepUp : (mfaN > 0 ? mfaN : DEFAULT_MFA);
  return {
    confirm_threshold_usd: (confirmRaw && !isNaN(confirmN) && confirmN > 0) ? confirmN : DEFAULT_CONFIRM,
    mfa_threshold_usd:     (mfaRaw    && !isNaN(mfaN)    && mfaN > 0)    ? mfaN     : DEFAULT_MFA,
    step_up_amount_threshold: effectiveStepUp,
  };
}

// GET /api/config/thresholds
router.get('/', (req, res) => {
  res.json(readThresholds());
});

// POST /api/config/thresholds  { confirm_threshold_usd?, mfa_threshold_usd? }
router.post('/', async (req, res) => {
  try {
    const { confirm_threshold_usd, mfa_threshold_usd } = req.body || {};
    const update = {};

    if (confirm_threshold_usd !== undefined) {
      const n = Number(confirm_threshold_usd);
      if (isNaN(n) || n <= 0) return res.status(400).json({ error: 'invalid_confirm_threshold', message: 'confirm_threshold_usd must be a positive number' });
      update.confirm_threshold_usd = String(n);
    }
    if (mfa_threshold_usd !== undefined) {
      const n = Number(mfa_threshold_usd);
      if (isNaN(n) || n <= 0) return res.status(400).json({ error: 'invalid_mfa_threshold', message: 'mfa_threshold_usd must be a positive number' });
      update.mfa_threshold_usd = String(n);
      // Sync to the key that transactions.js reads as configStore fallback
      update.step_up_amount_threshold = String(n);
      // Also update live runtimeSettings so the step-up gate takes effect immediately
      runtimeSettings.update({ stepUpAmountThreshold: n }, 'thresholds-api');
    }

    if (Object.keys(update).length === 0) {
      return res.status(400).json({ error: 'no_update', message: 'Provide confirm_threshold_usd or mfa_threshold_usd' });
    }

    await configStore.setConfig(update);
    console.log('[Thresholds] Updated:', update);
    res.json({ ok: true, ...readThresholds() });
  } catch (err) {
    console.error('[Thresholds] Error:', err.message);
    res.status(500).json({ error: 'save_failed', message: err.message });
  }
});

module.exports = router;
