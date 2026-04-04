'use strict';
const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const mfaService = require('../services/mfaService');
const oauthService = require('../services/oauthService');

const STEP_UP_TTL_MS = 5 * 60 * 1000; // 5 min step-up validity

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

// POST /api/auth/mfa/challenge
// Initiates PingOne deviceAuthentications for the logged-in user.
// Returns { daId, status, devices[] } with status DEVICE_SELECTION_REQUIRED.
router.post('/challenge', authenticateToken, async (req, res) => {
  try {
    const userId = req.session.user?.id;
    const userAccessToken = req.session.oauthTokens?.accessToken;
    if (!userId || !userAccessToken) {
      return res.status(401).json({ error: 'no_session', message: 'Not authenticated.' });
    }
    const result = await mfaService.initiateDeviceAuth(userId, userAccessToken);
    res.json({
      daId: result.id,
      status: result.status,
      devices: result._embedded?.devices || [],
    });
  } catch (err) {
    console.error('[MFA route] POST /challenge failed:', err.message);
    if (err.code === 'challenge_expired') {
      return res.status(410).json({ error: 'challenge_expired', message: 'MFA session expired. Please start a new challenge.' });
    }
    if (err.code === 'token_expired') {
      try {
        const newToken = await _tryRefresh(req);
        const result = await mfaService.initiateDeviceAuth(req.session.user?.id, newToken);
        return res.json({ daId: result.id, status: result.status, devices: result._embedded?.devices || [] });
      } catch (_) {
        return res.status(401).json({ error: 'session_expired', message: 'Your session has expired. Please log in again.' });
      }
    }
    res.status(err.status || 500).json({ error: 'mfa_initiate_failed', message: err.message, pingError: err.pingError });
  }
});

// PUT /api/auth/mfa/challenge/:daId
// Dispatch based on body:
//   { deviceId }             → select device (transitions to next status)
//   { deviceId, otp }        → submit OTP code (email OTP or TOTP)
//   { assertion }            → relay FIDO2/WebAuthn assertion
// Sets req.session.stepUpVerified = true on COMPLETED.
router.put('/challenge/:daId', authenticateToken, async (req, res) => {
  try {
    const { daId } = req.params;
    const { deviceId, otp, assertion } = req.body;
    const userAccessToken = req.session.oauthTokens?.accessToken;
    if (!userAccessToken) {
      return res.status(401).json({ error: 'no_session', message: 'Not authenticated.' });
    }

    let result;
    if (assertion) {
      result = await mfaService.submitFido2Assertion(daId, assertion, userAccessToken);
    } else if (otp) {
      result = await mfaService.submitOtp(daId, deviceId, otp, userAccessToken);
    } else if (deviceId) {
      result = await mfaService.selectDevice(daId, deviceId, userAccessToken);
    } else {
      return res.status(400).json({
        error: 'invalid_body',
        message: 'Provide deviceId, otp, or assertion.',
      });
    }

    const completed = result.status === 'COMPLETED';
    if (completed) {
      req.session.stepUpVerified = Date.now() + STEP_UP_TTL_MS;
      await new Promise((resolve, reject) =>
        req.session.save((err) => (err ? reject(err) : resolve()))
      );
    }

    res.json({ daId, status: result.status, completed });
  } catch (err) {
    console.error('[MFA route] PUT /challenge/:daId failed:', err.message);
    if (err.code === 'challenge_expired') {
      return res.status(410).json({ error: 'challenge_expired', message: 'MFA challenge has expired. Please start a new challenge.' });
    }
    if (err.code === 'token_expired') {
      try {
        const newToken = await _tryRefresh(req);
        const { daId } = req.params;
        const { deviceId, otp, assertion } = req.body;
        let result;
        if (assertion) result = await mfaService.submitFido2Assertion(daId, assertion, newToken);
        else if (otp) result = await mfaService.submitOtp(daId, deviceId, otp, newToken);
        else result = await mfaService.selectDevice(daId, deviceId, newToken);
        const completed = result.status === 'COMPLETED';
        if (completed) {
          req.session.stepUpVerified = Date.now() + STEP_UP_TTL_MS;
          await new Promise((resolve, reject) => req.session.save((e) => (e ? reject(e) : resolve())));
        }
        return res.json({ daId, status: result.status, completed });
      } catch (_) {
        return res.status(401).json({ error: 'session_expired', message: 'Your session has expired. Please log in again.' });
      }
    }
    res.status(err.status || 500).json({ error: 'mfa_challenge_failed', message: err.message, pingError: err.pingError });
  }
});

// GET /api/auth/mfa/challenge/:daId/status
// Poll device authentication status.
// Returns status and publicKeyCredentialRequestOptions when ASSERTION_REQUIRED (for FIDO2).
// Also sets stepUpVerified = true when COMPLETED (covers push poll completion).
router.get('/challenge/:daId/status', authenticateToken, async (req, res) => {
  try {
    const { daId } = req.params;
    const userAccessToken = req.session.oauthTokens?.accessToken;
    if (!userAccessToken) {
      return res.status(401).json({ error: 'no_session', message: 'Not authenticated.' });
    }
    const result = await mfaService.getDeviceAuthStatus(daId, userAccessToken);
    const completed = result.status === 'COMPLETED';
    if (completed) {
      req.session.stepUpVerified = Date.now() + STEP_UP_TTL_MS;
      await new Promise((resolve, reject) =>
        req.session.save((err) => (err ? reject(err) : resolve()))
      );
    }
    res.json({
      daId,
      status: result.status,
      completed,
      publicKeyCredentialRequestOptions: result.publicKeyCredentialRequestOptions || null,
    });
  } catch (err) {
    console.error('[MFA route] GET /challenge/:daId/status failed:', err.message);
    if (err.code === 'challenge_expired') {
      return res.status(410).json({ error: 'challenge_expired', message: 'MFA challenge has expired. Please start a new challenge.' });
    }
    if (err.code === 'token_expired') {
      try {
        const newToken = await _tryRefresh(req);
        const { daId } = req.params;
        const result = await mfaService.getDeviceAuthStatus(daId, newToken);
        const completed = result.status === 'COMPLETED';
        if (completed) {
          req.session.stepUpVerified = Date.now() + STEP_UP_TTL_MS;
          await new Promise((resolve, reject) => req.session.save((e) => (e ? reject(e) : resolve())));
        }
        return res.json({ daId, status: result.status, completed, publicKeyCredentialRequestOptions: result.publicKeyCredentialRequestOptions || null });
      } catch (_) {
        return res.status(401).json({ error: 'session_expired', message: 'Your session has expired. Please log in again.' });
      }
    }
    res.status(err.status || 500).json({ error: 'mfa_status_failed', message: err.message });
  }
});

module.exports = router;
