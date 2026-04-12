/**
 * MFA Testing Routes
 * Provides endpoints for testing OTP and FIDO2 MFA flows
 * Phase 123: Extended with actual PingOne MFA API integration
 */

const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const mfaService = require('../services/mfaService');
const oauthService = require('../services/oauthService');
const apiCallTrackerService = require('../services/apiCallTrackerService');

/** Track a completed API call for the mfa-test session display */
function trackMfaApiCall(req, res, startTime, responseData, description) {
  try {
    apiCallTrackerService.trackApiCall({
      sessionId: 'mfa-test',
      method: req.method,
      url: req.originalUrl,
      requestHeaders: req.headers,
      requestBody: req.body,
      responseStatus: res.statusCode || (responseData.success !== false ? 200 : 500),
      responseHeaders: res.getHeaders ? res.getHeaders() : {},
      responseBody: responseData,
      duration: Date.now() - startTime,
      category: 'mfa-test',
      description
    });
  } catch (_e) { /* non-fatal */ }
}

/**
 * GET /api/mfa/test/config
 * Returns current MFA configuration for testing
 */
router.get('/config', (_req, res) => {
  const explicitPolicyId = process.env.PINGONE_MFA_POLICY_ID;
  const config = {
    mfaEnabled: true,
    policyId: explicitPolicyId || '(default — auto-resolved)',
    policySource: explicitPolicyId ? 'configured' : 'auto',
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
 * Returns registered MFA devices for current user (proxies to PingOne Management API)
 */
router.get('/devices', authenticateToken, async (req, res) => {
  try {
    const userId = req.session.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    const devices = await mfaService.listMfaDevices(userId);
    res.json({ devices });
  } catch (err) {
    console.error('[MFA Test] GET /devices failed:', err.message);
    res.status(err.status || 500).json({ error: err.message });
  }
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
    // mfaConfigured is always true — if no explicit policy ID the server auto-resolves default
    mfaConfigured: true,
    policySource: process.env.PINGONE_MFA_POLICY_ID ? 'configured' : 'auto',
    sessionActive: true,
    lastMfaVerification: req.session.lastMfaVerification || null
  });
});

// ─── Phase 123: Actual PingOne MFA Integration Test Routes ─────────────────────

/**
 * Attempt a one-shot silent token refresh and update the session.
 * Returns the new accessToken if successful, throws if not.
 */
async function _tryRefresh(req) {
  const refreshToken = req.session?.oauthTokens?.refreshToken;
  if (!refreshToken) throw new Error('no_refresh_token');
  const tokenData = await oauthService.refreshAccessToken(refreshToken);
  req.session.oauthTokens = {
    ...req.session.oauthTokens,
    accessToken:  tokenData.access_token,
    refreshToken: tokenData.refresh_token || req.session.oauthTokens.refreshToken,
    expiresAt:    Date.now() + ((tokenData.expires_in || 3600) * 1000),
  };
  await new Promise((resolve, reject) =>
    req.session.save((err) => (err ? reject(err) : resolve()))
  );
  return req.session.oauthTokens.accessToken;
}

/**
 * POST /api/mfa/test/integration/initiate
 * Initiate PingOne deviceAuthentications challenge for testing
 * Body: { method: 'sms' | 'email' | 'fido2' }
 */
router.post('/integration/initiate', authenticateToken, async (req, res) => {
  try {
    const { method } = req.body;
    const userId = req.session.user?.id;
    const userAccessToken = req.session.oauthTokens?.accessToken;
    if (!userId || !userAccessToken) {
      return res.status(401).json({ success: false, error: 'no_session', message: 'Not authenticated.' });
    }

    const _t1 = Date.now();
    const result = await mfaService.initiateDeviceAuth(userId, userAccessToken);
    const resBody = {
      success: true,
      daId: result.id,
      status: result.status,
      devices: result._embedded?.devices || [],
      method,
    };
    res.json(resBody);
    trackMfaApiCall(req, res, _t1, resBody, 'Initiate MFA device authentication');
  } catch (err) {
    console.error('[MFA Test Integration] POST /initiate failed:', err.message);
    if (err.code === 'token_expired') {
      try {
        const newToken = await _tryRefresh(req);
        const result = await mfaService.initiateDeviceAuth(req.session.user?.id, newToken);
        return res.json({
          success: true,
          daId: result.id,
          status: result.status,
          devices: result._embedded?.devices || [],
        });
      } catch (_) {
        return res.status(401).json({ success: false, error: 'session_expired', message: 'Your session has expired. Please log in again.' });
      }
    }
    res.status(err.status || 500).json({ success: false, error: err.message, pingError: err.pingError });
  }
});

/**
 * POST /api/mfa/test/integration/verify-otp
 * Verify OTP code (SMS or Email) using PingOne MFA
 * Body: { daId, deviceId, otp }
 */
router.post('/integration/verify-otp', authenticateToken, async (req, res) => {
  try {
    const { daId, deviceId, otp } = req.body;
    const userAccessToken = req.session.oauthTokens?.accessToken;
    if (!userAccessToken) {
      return res.status(401).json({ success: false, error: 'no_session', message: 'Not authenticated.' });
    }
    if (!daId || !deviceId || !otp) {
      return res.status(400).json({ success: false, error: 'invalid_body', message: 'Provide daId, deviceId, and otp.' });
    }

    const _t3 = Date.now();
    const result = await mfaService.submitOtp(daId, deviceId, otp, userAccessToken);
    const resBody = {
      success: true,
      daId,
      status: result.status,
      completed: result.status === 'COMPLETED',
    };
    res.json(resBody);
    trackMfaApiCall(req, res, _t3, resBody, 'Verify OTP code via PingOne MFA');
  } catch (err) {
    console.error('[MFA Test Integration] POST /verify-otp failed:', err.message);
    res.status(err.status || 500).json({ success: false, error: err.message, pingError: err.pingError });
  }
});

/**
 * POST /api/mfa/test/integration/verify-fido2
 * Verify FIDO2 assertion using PingOne MFA
 * Body: { daId, assertion }
 */
router.post('/integration/verify-fido2', authenticateToken, async (req, res) => {
  try {
    const { daId, assertion } = req.body;
    const userAccessToken = req.session.oauthTokens?.accessToken;
    if (!userAccessToken) {
      return res.status(401).json({ success: false, error: 'no_session', message: 'Not authenticated.' });
    }
    if (!daId || !assertion) {
      return res.status(400).json({ success: false, error: 'invalid_body', message: 'Provide daId and assertion.' });
    }

    const result = await mfaService.submitFido2Assertion(daId, assertion, userAccessToken);
    res.json({
      success: true,
      daId,
      status: result.status,
      completed: result.status === 'COMPLETED',
    });
  } catch (err) {
    console.error('[MFA Test Integration] POST /verify-fido2 failed:', err.message);
    res.status(err.status || 500).json({ success: false, error: err.message, pingError: err.pingError });
  }
});

/**
 * GET /api/mfa/test/integration/challenge/:daId/status
 * Poll device authentication status for testing
 */
router.get('/integration/challenge/:daId/status', authenticateToken, async (req, res) => {
  try {
    const { daId } = req.params;
    const userAccessToken = req.session.oauthTokens?.accessToken;
    if (!userAccessToken) {
      return res.status(401).json({ success: false, error: 'no_session', message: 'Not authenticated.' });
    }
    const result = await mfaService.getDeviceAuthStatus(daId, userAccessToken);
    res.json({
      success: true,
      daId,
      status: result.status,
      completed: result.status === 'COMPLETED',
      publicKeyCredentialRequestOptions: result.publicKeyCredentialRequestOptions || null,
    });
  } catch (err) {
    console.error('[MFA Test Integration] GET /challenge/:daId/status failed:', err.message);
    res.status(err.status || 500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/mfa/test/integration/enroll-email
 * Enroll an email OTP device using PingOne MFA
 */
router.post('/integration/enroll-email', authenticateToken, async (req, res) => {
  try {
    const userId = req.session.user?.id;
    const email = req.session.user?.email;
    if (!userId || !email) {
      return res.status(401).json({ success: false, error: 'no_session', message: 'Not authenticated.' });
    }
    const _t4 = Date.now();
    const device = await mfaService.enrollEmailDevice(userId, email);
    const resBody = {
      success: true,
      deviceId: device.id,
      type: device.type,
      email: device.email
    };
    res.json(resBody);
    trackMfaApiCall(req, res, _t4, resBody, 'Enroll email OTP device');
  } catch (err) {
    console.error('[MFA Test Integration] POST /enroll-email failed:', err.message);
    res.status(err.status || 500).json({ success: false, error: err.message, pingError: err.pingError });
  }
});

/**
 * POST /api/mfa/test/integration/enroll-fido2-init
 * Initiate FIDO2/passkey device registration using PingOne MFA
 */
router.post('/integration/enroll-fido2-init', authenticateToken, async (req, res) => {
  try {
    const userId = req.session.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'no_session', message: 'Not authenticated.' });
    }
    const _t5 = Date.now();
    const result = await mfaService.initFido2Registration(userId);
    const resBody = { success: true, ...result };
    res.json(resBody);
    trackMfaApiCall(req, res, _t5, resBody, 'Initiate FIDO2/passkey registration');
  } catch (err) {
    console.error('[MFA Test Integration] POST /enroll-fido2-init failed:', err.message);
    res.status(err.status || 500).json({ success: false, error: err.message, pingError: err.pingError });
  }
});

/**
 * POST /api/mfa/test/integration/enroll-fido2-complete
 * Complete FIDO2/passkey registration using PingOne MFA
 * Body: { deviceId, attestation }
 */
router.post('/integration/enroll-fido2-complete', authenticateToken, async (req, res) => {
  try {
    const userId = req.session.user?.id;
    const { deviceId, attestation } = req.body;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'no_session', message: 'Not authenticated.' });
    }
    if (!deviceId || !attestation) {
      return res.status(400).json({ success: false, error: 'invalid_body', message: 'Provide deviceId and attestation.' });
    }
    const result = await mfaService.completeFido2Registration(userId, deviceId, attestation);
    res.json({
      success: true,
      deviceId: result.id,
      status: result.status
    });
  } catch (err) {
    console.error('[MFA Test Integration] POST /enroll-fido2-complete failed:', err.message);
    res.status(err.status || 500).json({ success: false, error: err.message, pingError: err.pingError });
  }
});

/**
 * GET /api/mfa/test/integration/devices
 * List enrolled MFA devices using PingOne MFA
 */
router.get('/integration/devices', authenticateToken, async (req, res) => {
  try {
    const userId = req.session.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'no_session', message: 'Not authenticated.' });
    }

    const _t6 = Date.now();
    const devices = await mfaService.listMfaDevices(userId);
    const resBody = { success: true, devices };
    res.json(resBody);
    trackMfaApiCall(req, res, _t6, resBody, 'List enrolled MFA devices');
  } catch (err) {
    console.error('[MFA Test Integration] GET /devices failed:', err.message);
    res.status(err.status || 500).json({ success: false, error: err.message, pingError: err.pingError });
  }
});

module.exports = router;
