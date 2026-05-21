// banking_api_server/routes/thresholds.js
// GET/POST /api/config/thresholds — demo controls for step-up threshold values
'use strict';

const express = require('express');
const router = express.Router();
const configStore = require('../services/configStore');
const runtimeSettings = require('../config/runtimeSettings');
const { logEvent, EVENT_CATEGORIES } = require('../services/appEventService');

const DEFAULT_CONFIRM = 250; // HITL (Human-In-Loop) consent threshold
const DEFAULT_MFA = 500;     // MFA step-up threshold

function readThresholds() {
  const confirmRaw = configStore.getEffective('confirm_threshold_usd');
  const mfaRaw = configStore.getEffective('mfa_threshold_usd');
  const confirmN = Number(confirmRaw);
  const mfaN = Number(mfaRaw);
  // Prefer live runtimeSettings value (may have been updated since boot); fall back to configStore
  const rtStepUp = runtimeSettings.get('stepUpAmountThreshold');
  const effectiveStepUp = (rtStepUp > 0) ? rtStepUp : (mfaN > 0 ? mfaN : DEFAULT_MFA);
  return {
    confirm_threshold_usd: String((confirmRaw && !isNaN(confirmN) && confirmN > 0) ? confirmN : DEFAULT_CONFIRM),
    mfa_threshold_usd:     String((mfaRaw    && !isNaN(mfaN)    && mfaN > 0)    ? mfaN     : DEFAULT_MFA),
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
      // Mirror into the simulated Authorize server's CANONICAL input key so a
      // Setup-page / control-button edit actually changes AS decisions. The AS
      // (simulatedAuthorizeService.getConfirmAmountUsd) reads ONLY
      // SIMULATED_AUTHORIZE_CONFIRM_AMOUNT — without this mirror, this surface
      // wrote a key the AS never read and threshold edits were silently inert.
      // Single user input → both consumer namespaces (HITL consent reads
      // confirm_threshold_usd; simulated AS reads SIMULATED_AUTHORIZE_*).
      update.SIMULATED_AUTHORIZE_CONFIRM_AMOUNT = String(n);
    }
    if (mfa_threshold_usd !== undefined) {
      const n = Number(mfa_threshold_usd);
      if (isNaN(n) || n <= 0) return res.status(400).json({ error: 'invalid_mfa_threshold', message: 'mfa_threshold_usd must be a positive number' });
      update.mfa_threshold_usd = String(n);
      // Sync to the key that transactions.js reads as configStore fallback
      update.step_up_amount_threshold = String(n);
      // Mirror into the simulated Authorize server's CANONICAL step-up key
      // (same rationale as confirm above — AS reads only this key).
      update.SIMULATED_AUTHORIZE_STEPUP_AMOUNT = String(n);
      // Also update live runtimeSettings so the step-up gate takes effect immediately
      runtimeSettings.update({ stepUpAmountThreshold: n }, 'thresholds-api');
    }

    if (Object.keys(update).length === 0) {
      return res.status(400).json({ error: 'no_update', message: 'Provide confirm_threshold_usd or mfa_threshold_usd' });
    }

    await configStore.setConfig(update);
    logEvent(EVENT_CATEGORIES.THRESHOLD, 'info',
      `Thresholds updated — confirm=$${update.confirm_threshold_usd || '(unchanged)'} mfa=$${update.mfa_threshold_usd || '(unchanged)'}`,
      { tag: 'threshold/updated', metadata: update });
    res.json({ ok: true, ...readThresholds() });
  } catch (err) {
    console.error('[Thresholds] Error:', err.message);
    res.status(500).json({ error: 'save_failed', message: err.message });
  }
});

module.exports = router;
