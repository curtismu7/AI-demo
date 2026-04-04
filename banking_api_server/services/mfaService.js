'use strict';
const axios = require('axios');
const configStore = require('./configStore');

function _authBaseUrl() {
  const region = configStore.getEffective('pingone_region') || 'com';
  const envId = configStore.getEffective('pingone_environment_id');
  return `https://auth.pingone.${region}/${envId}`;
}

function _apiBaseUrl() {
  const region = configStore.getEffective('pingone_region') || 'com';
  const envId = configStore.getEffective('pingone_environment_id');
  return `https://api.pingone.${region}/v1/environments/${envId}`;
}

async function _getWorkerToken() {
  const region = configStore.getEffective('pingone_region') || 'com';
  const envId = configStore.getEffective('pingone_environment_id');
  const clientId = configStore.getEffective('pingone_client_id');
  const clientSecret = configStore.getEffective('pingone_client_secret');
  if (!envId || !clientId || !clientSecret) throw new Error('PingOne worker credentials not configured');
  const tokenUrl = `https://auth.pingone.${region}/${envId}/as/token`;
  const resp = await axios.post(tokenUrl, 'grant_type=client_credentials', {
    auth: { username: clientId, password: clientSecret },
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    timeout: 10000,
  });
  return resp.data.access_token;
}

function _wrapError(fnName, err) {
  const pingErr = err.response?.data;
  console.error(`[MFA] ${fnName} failed:`, pingErr || err.message);
  const e = new Error(pingErr?.message || pingErr?.detail || 'MFA operation failed');
  e.status = err.response?.status || 500;
  e.pingError = pingErr;
  // Attach semantic code for challenge lifecycle errors
  const status = err.response?.status;
  if (status === 401) e.code = 'token_expired';
  else if (status === 404 || status === 410) e.code = 'challenge_expired';
  return e;
}

/**
 * Initiate PingOne deviceAuthentications for a user.
 * Uses the user's own access token (not worker token).
 * Returns { id (daId), status, _embedded: { devices[] } }
 * Status at this point: DEVICE_SELECTION_REQUIRED
 */
async function initiateDeviceAuth(userId, userAccessToken) {
  try {
    const policyId = configStore.getEffective('pingone_mfa_policy_id');
    if (!policyId) {
      throw new Error('PINGONE_MFA_POLICY_ID is not configured. Set it in .env or via admin UI.');
    }
    const url = `${_authBaseUrl()}/deviceAuthentications`;
    const { data } = await axios.post(
      url,
      { user: { id: userId }, policy: { id: policyId } },
      {
        headers: {
          Authorization: `Bearer ${userAccessToken}`,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      }
    );
    console.log('[MFA] initiated deviceAuth daId=%s status=%s', data.id, data.status);
    return data;
  } catch (err) {
    throw _wrapError('initiateDeviceAuth', err);
  }
}

/**
 * Select a device to use for authentication.
 * Body: { selectedDevice: { id: deviceId } }
 * Returns updated device authentication status.
 * Status transitions: DEVICE_SELECTION_REQUIRED → OTP_REQUIRED | ASSERTION_REQUIRED | PUSH_CONFIRMATION_REQUIRED
 */
async function selectDevice(daId, deviceId, userAccessToken) {
  try {
    const url = `${_authBaseUrl()}/deviceAuthentications/${daId}`;
    const { data } = await axios.put(
      url,
      { selectedDevice: { id: deviceId } },
      {
        headers: {
          Authorization: `Bearer ${userAccessToken}`,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      }
    );
    return data;
  } catch (err) {
    throw _wrapError('selectDevice', err);
  }
}

/**
 * Submit an OTP or TOTP code for verification.
 * Body: { selectedDevice: { id: deviceId, otp: "123456" } }
 * Status transitions: OTP_REQUIRED → COMPLETED | FAILED
 */
async function submitOtp(daId, deviceId, otp, userAccessToken) {
  try {
    const url = `${_authBaseUrl()}/deviceAuthentications/${daId}`;
    const { data } = await axios.put(
      url,
      { selectedDevice: { id: deviceId, otp: String(otp) } },
      {
        headers: {
          Authorization: `Bearer ${userAccessToken}`,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      }
    );
    return data;
  } catch (err) {
    throw _wrapError('submitOtp', err);
  }
}

/**
 * Poll or fetch the current device authentication status.
 * Used for:
 *   - Push: poll until COMPLETED or PUSH_CONFIRMATION_TIMED_OUT
 *   - FIDO2: retrieve publicKeyCredentialRequestOptions (status: ASSERTION_REQUIRED)
 */
async function getDeviceAuthStatus(daId, userAccessToken) {
  try {
    const url = `${_authBaseUrl()}/deviceAuthentications/${daId}`;
    const { data } = await axios.get(url, {
      headers: { Authorization: `Bearer ${userAccessToken}` },
      timeout: 10000,
    });
    return data;
  } catch (err) {
    throw _wrapError('getDeviceAuthStatus', err);
  }
}

/**
 * Submit a FIDO2/WebAuthn assertion.
 * Body: { assertion: { ... } } — base64-encoded fields from navigator.credentials.get()
 * Status transitions: ASSERTION_REQUIRED → COMPLETED | FAILED
 */
async function submitFido2Assertion(daId, assertion, userAccessToken) {
  try {
    const url = `${_authBaseUrl()}/deviceAuthentications/${daId}`;
    const { data } = await axios.put(
      url,
      { assertion },
      {
        headers: {
          Authorization: `Bearer ${userAccessToken}`,
          'Content-Type': 'application/json',
        },
        timeout: 15000,
      }
    );
    return data;
  } catch (err) {
    throw _wrapError('submitFido2Assertion', err);
  }
}

/**
 * List active MFA devices for a user via Management API (worker token).
 * Used for device management UI — NOT required for the step-up challenge flow
 * (deviceAuthentications already returns devices at DEVICE_SELECTION_REQUIRED).
 */
async function listMfaDevices(userId) {
  try {
    const workerToken = await _getWorkerToken();
    const url = `${_apiBaseUrl()}/users/${userId}/devices?filter=(status eq "ACTIVE")`;
    const { data } = await axios.get(url, {
      headers: { Authorization: `Bearer ${workerToken}` },
      timeout: 10000,
    });
    return data._embedded?.devices || [];
  } catch (err) {
    throw _wrapError('listMfaDevices', err);
  }
}

module.exports = {
  initiateDeviceAuth,
  selectDevice,
  submitOtp,
  getDeviceAuthStatus,
  submitFido2Assertion,
  listMfaDevices,
};
