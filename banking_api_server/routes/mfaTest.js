/**
 * MFA Testing Routes
 * Provides endpoints for testing OTP and FIDO2 MFA flows
 */

const express = require('express');
const router = express.Router();

/**
 * GET /api/mfa/test/config
 * Returns current MFA configuration for testing
 */
router.get('/config', (_req, res) => {
  const config = {
    mfaEnabled: process.env.PINGONE_MFA_POLICY_ID ? true : false,
    policyId: process.env.PINGONE_MFA_POLICY_ID || null,
    acrValue: process.env.PINGONE_MFA_ACR_VALUE || null,
    threshold: parseFloat(process.env.MFA_STEP_UP_THRESHOLD) || 500.00,
    methods: ['otp', 'fido2', 'push'],
    cibaEnabled: process.env.CIBA_ENABLED === 'true'
  };
  
  res.json(config);
});

/**
 * GET /api/mfa/test/methods
 * Returns available MFA methods for current user
 */
router.get('/methods', (req, res) => {
  if (!req.session || !req.session.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  
  const methods = {
    otp: true,
    fido2: true, // Would check if device registered
    push: true
  };
  
  res.json({ methods });
});

/**
 * GET /api/mfa/test/devices
 * Returns registered MFA devices for current user
 */
router.get('/devices', (req, res) => {
  if (!req.session || !req.session.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  
  // In production, this would query the database
  const devices = [
    {
      id: 'device-1',
      type: 'email',
      name: 'Email OTP',
      registeredAt: new Date().toISOString(),
      lastUsed: new Date().toISOString()
    }
  ];
  
  res.json({ devices });
});

/**
 * POST /api/mfa/test/trigger
 * Triggers MFA for testing purposes
 * Body: { amount: number, operation: string }
 */
router.post('/trigger', (req, res) => {
  if (!req.session || !req.session.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  
  const { amount = 600, operation = 'transfer' } = req.body;
  const threshold = parseFloat(process.env.MFA_STEP_UP_THRESHOLD) || 500.00;
  
  if (amount >= threshold) {
    res.json({
      mfaRequired: true,
      stepUpRequired: true,
      method: 'ciba',
      authReqId: `test-${Date.now()}`,
      message: 'Additional authentication required',
      availableMethods: ['otp', 'fido2', 'push'],
      bindingMessage: `${operation} requires additional authentication`
    });
  } else {
    res.json({
      mfaRequired: false,
      message: 'Transaction below MFA threshold'
    });
  }
});

/**
 * POST /api/mfa/test/verify-otp
 * Verifies OTP code for testing
 * Body: { otp: string, authReqId: string }
 */
router.post('/verify-otp', (req, res) => {
  if (!req.session || !req.session.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  
  const { otp } = req.body;
  
  // In production, this would validate against PingOne
  // For testing, accept any 6-digit code
  if (otp && otp.length === 6 && /^\d+$/.test(otp)) {
    res.json({
      success: true,
      message: 'OTP verified successfully',
      token: `test-token-${Date.now()}`
    });
  } else {
    res.status(400).json({
      success: false,
      error: 'Invalid OTP code',
      message: 'OTP must be 6 digits'
    });
  }
});

/**
 * POST /api/mfa/test/verify-fido2
 * Verifies FIDO2 authentication for testing
 * Body: { credential: string, authReqId: string }
 */
router.post('/verify-fido2', (req, res) => {
  if (!req.session || !req.session.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  
  const { credential } = req.body;
  
  // In production, this would validate against WebAuthn
  // For testing, accept any credential
  if (credential) {
    res.json({
      success: true,
      message: 'FIDO2 verified successfully',
      token: `test-token-${Date.now()}`
    });
  } else {
    res.status(400).json({
      success: false,
      error: 'Invalid FIDO2 credential',
      message: 'FIDO2 credential required'
    });
  }
});

/**
 * POST /api/mfa/test/simulate-otp
 * Simulates receiving OTP email for testing
 * Returns a test OTP code
 */
router.post('/simulate-otp', (req, res) => {
  if (!req.session || !req.session.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  
  // Generate a test OTP code
  const testOtp = Math.floor(100000 + Math.random() * 900000).toString();
  
  res.json({
    success: true,
    otp: testOtp,
    message: 'Test OTP generated (use this for testing)',
    expiresIn: 300 // 5 minutes
  });
});

/**
 * GET /api/mfa/test/status
 * Returns MFA testing status
 */
router.get('/status', (req, res) => {
  if (!req.session || !req.session.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  
  res.json({
    authenticated: true,
    mfaConfigured: process.env.PINGONE_MFA_POLICY_ID ? true : false,
    sessionActive: true,
    lastMfaVerification: req.session.lastMfaVerification || null
  });
});

module.exports = router;
