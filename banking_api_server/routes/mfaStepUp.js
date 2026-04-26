// banking_api_server/routes/mfaStepUp.js
// Initiates PingOne SMS step-up for a user and verifies OTP

const express = require('express');
const mfaService = require('../services/mfaService');
const { requireSession } = require('../middleware/auth');

const router = express.Router();

// POST /api/mfa/stepup/sms
// Body: { userId? } (optional, defaults to session user)
router.post('/sms', requireSession, async (req, res) => {
  try {
    const userId = req.body.userId || req.session.user?.id;
    if (!userId) return res.status(400).json({ error: 'Missing userId' });
    const userAccessToken = req.session.user?.accessToken;
    if (!userAccessToken) return res.status(401).json({ error: 'No user access token in session' });
    // Initiate device authentication (SMS)
    const deviceAuth = await mfaService.initiateDeviceAuth(userId, userAccessToken);
    res.json({ ok: true, deviceAuth });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/mfa/stepup/sms/verify
// Body: { daId, deviceId, otp }
router.post('/sms/verify', requireSession, async (req, res) => {
  try {
    const { daId, deviceId, otp } = req.body;
    if (!daId || !deviceId || !otp) return res.status(400).json({ error: 'Missing required fields' });
    const userAccessToken = req.session.user?.accessToken;
    if (!userAccessToken) return res.status(401).json({ error: 'No user access token in session' });
    const result = await mfaService.submitOtp(daId, deviceId, otp, userAccessToken);
    res.json({ ok: true, result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
