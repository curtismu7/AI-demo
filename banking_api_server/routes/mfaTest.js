/**
 * MFA Testing Routes
 * Provides endpoints for testing OTP and FIDO2 MFA flows
 * Phase 123: Extended with actual PingOne MFA API integration
 */

const express = require('express');
const router = express.Router();
const mfaService = require('../services/mfaService');
const oauthService = require('../services/oauthService');
const apiCallTrackerService = require('../services/apiCallTrackerService');

/**
 * Normalize a PingOne debug request object for UI trace display.
 * Ensures method, url, body keys are always present when a call was made.
 */
function normalizePingoneRequest(debugReq) {
  if (!debugReq || typeof debugReq !== 'object') { return undefined; }
  const out = {
    method: debugReq.method || '',
    url: debugReq.url || '',
    body: debugReq.body !== undefined ? debugReq.body : null,
  };
  if (debugReq.contentType) { out.contentType = debugReq.contentType; }
  if (debugReq.headers) { out.headers = debugReq.headers; }
  return out;
}

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
router.get('/devices', async (req, res) => {
  try {
    const userId = req.session?.user?.oauthId || req.session?.user?.id || MFA_TEST_USER_ID;
    const result = await mfaService.listMfaDevices(userId);
    res.json({ devices: result.devices });
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
  const hasSession = !!(req.session && req.session.user);
  res.json({
    authenticated: hasSession,
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
 * Resolve userId + accessToken for MFA test operations.
 * Prefers session credentials (logged-in user), falls back to worker token + test userId.
 * Test userId comes from: req.body.userId > MFA_TEST_USER_ID env > bankuser default.
 */
const MFA_TEST_USER_ID = process.env.MFA_TEST_USER_ID || '6689a774-46af-4198-a6ff-38198dc341ac';
const MFA_TEST_USER_EMAIL = process.env.MFA_TEST_USER_EMAIL || 'cmuir+bankuser@pingone.com';

async function _resolveCredentials(req) {
  // Explicit userId override from body or query (for testing other users)
  const overrideUserId = req.body?.userId || req.query?.userId;

  if (overrideUserId) {
    // Override mode: use worker token for the specified user
    const workerToken = await mfaService.getWorkerToken();
    return {
      userId: overrideUserId,
      accessToken: workerToken,
      email: req.body?.email || req.query?.email || null,
      source: 'worker-override',
    };
  }

  // Prefer session credentials if available
  // oauthId is the PingOne UUID; id may be a legacy numeric key on bootstrap users
  const sessionUserId = req.session?.user?.oauthId || req.session?.user?.id;
  const sessionToken = req.session?.oauthTokens?.accessToken;
  if (sessionUserId && sessionToken) {
    return {
      userId: sessionUserId,
      accessToken: sessionToken,
      email: req.session.user?.email,
      source: 'session',
    };
  }
  // Fall back to worker token + configurable test user
  const workerToken = await mfaService.getWorkerToken();
  const userId = MFA_TEST_USER_ID;
  const email = MFA_TEST_USER_EMAIL;
  return { userId, accessToken: workerToken, email, source: 'worker' };
}


/**
 * POST /api/mfa/test/integration/initiate
 * Initiate PingOne deviceAuthentications challenge for testing
 * Body: { method: 'sms' | 'email' | 'fido2' }
 */
router.post('/integration/initiate', async (req, res) => {
  try {
    const { method } = req.body;
    const { userId, accessToken } = await _resolveCredentials(req);

    const _t1 = Date.now();
    const result = await mfaService.initiateDeviceAuth(userId, accessToken);
    const devices = result._embedded?.devices || [];
    const resBody = {
      success: true,
      daId: result.id,
      status: result.status,
      devices,
      method,
    };
    if (result._debug) {
      resBody.pingoneRequest = normalizePingoneRequest(result._debug && result._debug.request);
      resBody.pingoneResponse = result._debug.response;
    }

    // For FIDO2: auto-select the enrolled FIDO2 device to transition to ASSERTION_REQUIRED
    // and return publicKeyCredentialRequestOptions in the same response.
    if (method === 'fido2') {
      const fidoDevice = devices.find(d => d.type === 'FIDO2');
      if (fidoDevice) {
        try {
          const selected = await mfaService.selectDevice(result.id, fidoDevice.id, accessToken);
          resBody.status = selected.status;
          resBody.selectedDeviceId = fidoDevice.id;
          let pkcro = selected.publicKeyCredentialRequestOptions || null;
          if (pkcro && typeof pkcro === 'string') pkcro = JSON.parse(pkcro);
          resBody.publicKeyCredentialRequestOptions = pkcro;
          console.log('[MFA Test] FIDO2 auto-selected device=%s status=%s', fidoDevice.id, selected.status);
        } catch (selErr) {
          console.warn('[MFA Test] FIDO2 device selection failed:', selErr.message);
        }
      } else {
        resBody.noFidoDevice = true;
      }
    }

    res.json(resBody);
    trackMfaApiCall(req, res, _t1, resBody, 'Initiate MFA device authentication');
  } catch (err) {
    console.error('[MFA Test Integration] POST /initiate failed:', err.message);
    if (err.code === 'token_expired') {
      try {
        // Try refresh if session-based, or re-acquire worker token
        const workerToken = await mfaService.getWorkerToken();
        const userId = req.body?.userId || req.session?.user?.oauthId || req.session?.user?.id || MFA_TEST_USER_ID;
        const result = await mfaService.initiateDeviceAuth(userId, workerToken);
        return res.json({
          success: true,
          daId: result.id,
          status: result.status,
          devices: result._embedded?.devices || [],
        });
      } catch (_) {
        return res.status(401).json({ success: false, error: 'session_expired', message: 'Failed to acquire token for MFA test.' });
      }
    }
    const errBody = { success: false, error: err.message, pingError: err.pingError };
    if (err._debug) {
      errBody.pingoneRequest = normalizePingoneRequest(err._debug && err._debug.request);
      errBody.pingoneResponse = err._debug.response;
    }
    res.status(err.status || 500).json(errBody);
  }
});

/**
 * POST /api/mfa/test/integration/verify-otp
 * Verify OTP code (SMS or Email) using PingOne MFA
 * Body: { daId, deviceId, otp }
 */
router.post('/integration/verify-otp', async (req, res) => {
  try {
    const { daId, deviceId, otp } = req.body;
    const { accessToken } = await _resolveCredentials(req);
    if (!daId || !deviceId || !otp) {
      return res.status(400).json({ success: false, error: 'invalid_body', message: 'Provide daId, deviceId, and otp.' });
    }

    const _t3 = Date.now();
    const result = await mfaService.submitOtp(daId, deviceId, otp, accessToken);
    const resBody = {
      success: true,
      daId,
      status: result.status,
      completed: result.status === 'COMPLETED',
    };
    if (result._debug) {
      resBody.pingoneRequest = normalizePingoneRequest(result._debug && result._debug.request);
      resBody.pingoneResponse = result._debug.response;
    }
    res.json(resBody);
    trackMfaApiCall(req, res, _t3, resBody, 'Verify OTP code via PingOne MFA');
  } catch (err) {
    console.error('[MFA Test Integration] POST /verify-otp failed:', err.message);
    const errBody = { success: false, error: err.message, pingError: err.pingError };
    if (err._debug) {
      errBody.pingoneRequest = normalizePingoneRequest(err._debug && err._debug.request);
      errBody.pingoneResponse = err._debug.response;
    }
    res.status(err.status || 500).json(errBody);
  }
});

/**
 * POST /api/mfa/test/integration/verify-fido2
 * Verify FIDO2 assertion using PingOne MFA
 * Body: { daId, assertion, origin }
 */
router.post('/integration/verify-fido2', async (req, res) => {
  try {
    const { daId, assertion, origin } = req.body;
    const { accessToken } = await _resolveCredentials(req);
    if (!daId || !assertion) {
      return res.status(400).json({ success: false, error: 'invalid_body', message: 'Provide daId and assertion.' });
    }

    const result = await mfaService.submitFido2Assertion(daId, assertion, accessToken, origin || req.headers.origin);
    const resBody = {
      success: true,
      daId,
      status: result.status,
      completed: result.status === 'COMPLETED',
    };
    if (result._debug) {
      resBody.pingoneRequest = normalizePingoneRequest(result._debug && result._debug.request);
      resBody.pingoneResponse = result._debug.response;
    }
    res.json(resBody);
  } catch (err) {
    console.error('[MFA Test Integration] POST /verify-fido2 failed:', err.message);
    const errBody = { success: false, error: err.message, pingError: err.pingError };
    if (err._debug) {
      errBody.pingoneRequest = normalizePingoneRequest(err._debug && err._debug.request);
      errBody.pingoneResponse = err._debug.response;
    }
    res.status(err.status || 500).json(errBody);
  }
});

/**
 * GET /api/mfa/test/integration/challenge/:daId/status
 * Poll device authentication status for testing
 */
router.get('/integration/challenge/:daId/status', async (req, res) => {
  try {
    const { daId } = req.params;
    const { accessToken } = await _resolveCredentials(req);
    const result = await mfaService.getDeviceAuthStatus(daId, accessToken);

    // Parse publicKeyCredentialRequestOptions if stringified; preserve PingOne's original rpId
    let pkcro = result.publicKeyCredentialRequestOptions || null;
    if (pkcro) {
      if (typeof pkcro === 'string') pkcro = JSON.parse(pkcro);
      console.log('[MFA Test] FIDO2 challenge: PingOne rpId=%s', pkcro.rpId);
    }

    res.json({
      success: true,
      daId,
      status: result.status,
      completed: result.status === 'COMPLETED',
      publicKeyCredentialRequestOptions: pkcro,
    });
  } catch (err) {
    console.error('[MFA Test Integration] GET /challenge/:daId/status failed:', err.message);
    res.status(err.status || 500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/mfa/test/integration/enroll-sms-init
 * Enroll an SMS OTP device using PingOne MFA — PingOne sends OTP to the phone.
 * Body: { phone: string }  - E.164 format e.g. +15551234567
 */
router.post('/integration/enroll-sms-init', async (req, res) => {
  try {
    const { userId, accessToken } = await _resolveCredentials(req);
    const { phone } = req.body;
    if (!phone) {
      return res.status(400).json({ success: false, error: 'missing_phone', message: 'Provide phone in E.164 format e.g. +15551234567.' });
    }
    const _t = Date.now();
    const device = await mfaService.enrollSmsDevice(userId, phone, accessToken);
    const resBody = { success: true, deviceId: device.id, type: device.type, phone: device.phone, status: device.status };
    if (device._debug) {
      resBody.pingoneRequest = normalizePingoneRequest(device._debug && device._debug.request);
      resBody.pingoneResponse = device._debug.response;
    }
    res.json(resBody);
    trackMfaApiCall(req, res, _t, resBody, 'Enroll SMS OTP device');
  } catch (err) {
    console.error('[MFA Test Integration] POST /enroll-sms-init failed:', err.message);
    const errBody = { success: false, error: err.message, pingError: err.pingError };
    if (err._debug) {
      errBody.pingoneRequest = normalizePingoneRequest(err._debug && err._debug.request);
      errBody.pingoneResponse = err._debug.response;
    }
    res.status(err.status || 500).json(errBody);
  }
});

/**
 * POST /api/mfa/test/integration/enroll-sms-complete
 * Activate an SMS device by submitting the OTP sent to the phone.
 * Body: { deviceId, otp }
 */
router.post('/integration/enroll-sms-complete', async (req, res) => {
  try {
    const { userId } = await _resolveCredentials(req);
    const { deviceId, otp } = req.body;
    if (!deviceId || !otp) {
      return res.status(400).json({ success: false, error: 'invalid_body', message: 'Provide deviceId and otp.' });
    }
    const _t = Date.now();
    const result = await mfaService.completeSmsEnrollment(userId, deviceId, otp);
    const resBody = { success: true, deviceId: result.id, status: result.status };
    if (result._debug) {
      resBody.pingoneRequest = normalizePingoneRequest(result._debug && result._debug.request);
      resBody.pingoneResponse = result._debug.response;
    }
    res.json(resBody);
    trackMfaApiCall(req, res, _t, resBody, 'Complete SMS device enrollment');
  } catch (err) {
    console.error('[MFA Test Integration] POST /enroll-sms-complete failed:', err.message);
    const errBody = { success: false, error: err.message, pingError: err.pingError };
    if (err._debug) {
      errBody.pingoneRequest = normalizePingoneRequest(err._debug && err._debug.request);
      errBody.pingoneResponse = err._debug.response;
    }
    res.status(err.status || 500).json(errBody);
  }
});

/**
 * POST /api/mfa/test/integration/enroll-email
 * Enroll an email OTP device using PingOne MFA
 * Body: { email?: string }  - if provided, overrides session email
 */
router.post('/integration/enroll-email', async (req, res) => {
  try {
    const { userId, email: sessionEmail } = await _resolveCredentials(req);
    const emailToUse = req.body?.email || sessionEmail;
    if (!userId || !emailToUse) {
      return res.status(400).json({ success: false, error: 'missing_user', message: 'No user or email available for enrollment.' });
    }
    const _t4 = Date.now();
    const device = await mfaService.enrollEmailDevice(userId, emailToUse);
    const resBody = {
      success: true,
      deviceId: device.id,
      type: device.type,
      email: device.email
    };
    if (device._debug) {
      resBody.pingoneRequest = normalizePingoneRequest(device._debug && device._debug.request);
      resBody.pingoneResponse = device._debug.response;
    }
    res.json(resBody);
    trackMfaApiCall(req, res, _t4, resBody, 'Enroll email OTP device');
  } catch (err) {
    console.error('[MFA Test Integration] POST /enroll-email failed:', err.message);
    const errBody = { success: false, error: err.message, pingError: err.pingError };
    if (err._debug) {
      errBody.pingoneRequest = normalizePingoneRequest(err._debug && err._debug.request);
      errBody.pingoneResponse = err._debug.response;
    }
    res.status(err.status || 500).json(errBody);
  }
});

/**
 * POST /api/mfa/test/integration/enroll-fido2-init
 * Initiate FIDO2/passkey device registration using PingOne MFA
 */
router.post('/integration/enroll-fido2-init', async (req, res) => {
  try {
    const { userId } = await _resolveCredentials(req);
    const _t5 = Date.now();
    // Check for existing active FIDO2 devices — PingOne only allows one active device per RP.
    // If one exists, surface it clearly so the user can delete it before re-enrolling.
    let existingFido2Device = null;
    try {
      const { devices: existingDevices } = await mfaService.listMfaDevices(userId);
      existingFido2Device = existingDevices.find(
        (d) => String(d.type || '').toUpperCase().includes('FIDO2') && d.status === 'ACTIVE'
      ) || null;
    } catch (_e) { /* non-fatal — continue to init */ }

    if (existingFido2Device) {
      console.warn('[MFA Test Integration] User %s already has active FIDO2 device %s — returning conflict', userId, existingFido2Device.id);
      return res.status(409).json({
        success: false,
        error: 'existing_fido2_device',
        message: `You already have an active FIDO2 passkey registered (device ID: ${existingFido2Device.id}). Delete it first, then re-enroll.`,
        existingDevice: existingFido2Device,
      });
    }

    const result = await mfaService.initFido2Registration(userId);

    // Parse creationOptions if stringified; preserve PingOne's original rp.id
    // so the attestation cryptographic binding matches what PingOne expects at completion.
    if (result.publicKeyCredentialCreationOptions) {
      const opts = typeof result.publicKeyCredentialCreationOptions === 'string'
        ? JSON.parse(result.publicKeyCredentialCreationOptions)
        : result.publicKeyCredentialCreationOptions;
      console.log('[MFA Test] FIDO2 init: PingOne rp.id=%s rp.name=%s attestation=%s', opts.rp?.id, opts.rp?.name, opts.attestation);
      console.log('[MFA Test] FIDO2 init: challenge type=%s value_start=%s', typeof opts.challenge, JSON.stringify(opts.challenge)?.slice(0, 40));
      console.log('[MFA Test] FIDO2 init: user.id type=%s value_start=%s', typeof opts.user?.id, JSON.stringify(opts.user?.id)?.slice(0, 40));
      console.log('[MFA Test] FIDO2 init: authenticatorSelection=%j pubKeyCredParams=%j', opts.authenticatorSelection, opts.pubKeyCredParams);
      result.publicKeyCredentialCreationOptions = opts;
    }

    const resBody = { success: true, deviceId: result.deviceId, publicKeyCredentialCreationOptions: result.publicKeyCredentialCreationOptions };
    if (result._debug) {
      resBody.pingoneRequest = normalizePingoneRequest(result._debug && result._debug.request);
      resBody.pingoneResponse = result._debug.response;
    }
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
router.post('/integration/enroll-fido2-complete', async (req, res) => {
  try {
    const { userId } = await _resolveCredentials(req);
    const { deviceId, attestation, origin } = req.body;
    if (!deviceId || !attestation) {
      return res.status(400).json({ success: false, error: 'invalid_body', message: 'Provide deviceId and attestation.' });
    }
    const result = await mfaService.completeFido2Registration(userId, deviceId, attestation, origin || req.headers.origin);
    const completeResBody = {
      success: true,
      deviceId: result.id,
      status: result.status,
    };
    if (result._debug) {
      completeResBody.pingoneRequest = normalizePingoneRequest(result._debug && result._debug.request);
      completeResBody.pingoneResponse = result._debug.response;
    }
    res.json(completeResBody);
  } catch (err) {
    console.error('[MFA Test Integration] POST /enroll-fido2-complete failed:', err.message);
    const errBody = { success: false, error: err.message, pingError: err.pingError };
    if (err._debug) {
      errBody.pingoneRequest = normalizePingoneRequest(err._debug && err._debug.request);
      errBody.pingoneResponse = err._debug.response;
    }
    res.status(err.status || 500).json(errBody);
  }
});

/**
 * GET /api/mfa/test/integration/devices
 * List enrolled MFA devices using PingOne MFA
 */
router.get('/integration/devices', async (req, res) => {
  try {
    const { userId } = await _resolveCredentials(req);

    const _t6 = Date.now();
    const result = await mfaService.listMfaDevices(userId);
    const resBody = {
      success: true,
      devices: result.devices,
      pingoneRequest: normalizePingoneRequest(result._debug && result._debug.request),
      pingoneResponse: result._debug && result._debug.response,
    };
    res.json(resBody);
    trackMfaApiCall(req, res, _t6, resBody, 'List enrolled MFA devices');
  } catch (err) {
    console.error('[MFA Test Integration] GET /devices failed:', err.message);
    const errBody = { success: false, error: err.message, pingError: err.pingError };
    if (err._debug) {
      errBody.pingoneRequest = normalizePingoneRequest(err._debug.request);
      errBody.pingoneResponse = err._debug.response;
    }
    res.status(err.status || 500).json(errBody);
  }
});

/**
 * DELETE /api/mfa/test/integration/devices/:deviceId
 * Delete an enrolled MFA device for the current user.
 */
router.delete('/integration/devices/:deviceId', async (req, res) => {
  try {
    const { userId } = await _resolveCredentials(req);
    const { deviceId } = req.params;
    if (!deviceId) return res.status(400).json({ success: false, error: 'deviceId required' });
    await mfaService.deleteDevice(userId, deviceId);
    console.log('[MFA Test Integration] Deleted device deviceId=%s userId=%s', deviceId, userId);
    res.json({ success: true, deviceId });
  } catch (err) {
    console.error('[MFA Test Integration] DELETE /devices/:deviceId failed:', err.message);
    res.status(err.status || 500).json({ success: false, error: err.message, pingError: err.pingError });
  }
});


/**
 * GET /api/mfa/test/integration/fido2-policy-diag
 * Fetch PingOne FIDO2 policy details and user devices for diagnosis.
 */
router.get('/integration/fido2-policy-diag', async (req, res) => {
  try {
    const { userId } = await _resolveCredentials(req);
    const axios = require('axios');
    const configStore = require('../services/configStore');
    const envId = configStore.getEffective('pingone_environment_id');
    const region = configStore.getEffective('pingone_region') || 'com';
    const apiBase = `https://api.pingone.${region}/v1/environments/${envId}`;
    const workerToken = await mfaService.getWorkerToken ? await mfaService.getWorkerToken() : null;
    // Fetch via mfaService internals through a workaround
    const devices = await mfaService.listMfaDevices(userId);
    const fido2Devices = devices.filter(d => String(d.type||'').includes('FIDO'));
    // Fetch MFA policies
    let policies = [];
    let policyDetail = null;
    try {
      const { data: polData } = await axios.get(`${apiBase}/mfaPolicies`, {
        headers: { Authorization: `Bearer ${(await require('../services/oauthService').getWorkerToken?.()) || ''}` },
        timeout: 10000,
      });
      policies = polData._embedded?.mfaPolicies || [];
    } catch (e) { policies = [{ error: e.message }]; }
    res.json({
      userId,
      allDevices: devices,
      fido2Devices,
      deviceCount: devices.length,
      fido2Count: fido2Devices.length,
      policies: policies.map(p => ({ id: p.id, name: p.name, default: p.default })),
      note: 'Check fido2Devices for existing registrations and policies for allowed origins'
    });
  } catch (err) {
    console.error('[MFA Test] GET /fido2-policy-diag failed:', err.message);
    res.status(err.status || 500).json({ success: false, error: err.message });
  }
});


/**
 * GET /api/mfa/test/worker-token
 * Test worker token acquisition (no user auth required — uses client_credentials)
 */
router.get('/worker-token', async (req, res) => {
  try {
    const configStore = require('../services/configStore');
    await configStore.ensureInitialized();
    const token = await oauthService.getAgentClientCredentialsTokenWithExpiry();
    res.json({
      success: true,
      status: token.token ? 'valid' : 'missing',
      expiresAt: token.expiresAt,
    });
  } catch (err) {
    console.error('[MFA Test] Worker token error:', err.message);
    res.json({ success: false, error: err.message });
  }
});

/**
 * GET /api/mfa/test/users?q=<search>
 * List PingOne users for the user picker dropdown.
 * Supports optional ?q= query to filter via PingOne SCIM filter (username/name contains).
 * Returns id, username, email, name for each user (limit 100).
 */
router.get('/users', async (req, res) => {
  try {
    const configStore = require('../services/configStore');
    const axios = require('axios');
    const region = configStore.getEffective('pingone_region') || 'com';
    const envId = configStore.getEffective('pingone_environment_id');
    const workerToken = await mfaService.getWorkerToken();

    // Optional search query — sanitize to alphanumeric + space + dot + @ + hyphen only
    const rawQ = (req.query.q || '').trim();
    const q = rawQ.replace(/[^a-zA-Z0-9 .@_-]/g, '').trim();

    const url = `https://api.pingone.${region}/v1/environments/${envId}/users?limit=100`;

    if (q) {
      // PingOne SCIM filter: match username OR name.formatted containing the query
      const filter = `(username sw "${q}") or (name.formatted co "${q}")`;
      url += `&filter=${encodeURIComponent(filter)}`;
    }

    const { data } = await axios.get(url, {
      headers: { Authorization: `Bearer ${workerToken}` },
      timeout: 10000,
    });
    const users = (data._embedded?.users || []).map((u) => ({
      id: u.id,
      username: u.username,
      email: u.email,
      name: [u.name?.given, u.name?.family].filter(Boolean).join(' ') || u.name?.formatted || u.username,
    }));
    res.json({ success: true, users, query: q || null });
  } catch (err) {
    console.error('[MFA Test] GET /users failed:', err.message);
    res.status(err.status || 500).json({ success: false, error: err.message });
  }
});

module.exports = router;
