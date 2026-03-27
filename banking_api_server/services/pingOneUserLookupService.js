// banking_api_server/services/pingOneUserLookupService.js
/**
 * Resolves PingOne directory users for admin lookup (Management API, worker token).
 * Used to enrich banking demo data with authoritative name, email, and phone when available.
 */
'use strict';

const axios = require('axios');
const configStore = require('./configStore');
const { getManagementToken } = require('./pingOneClientService');

/** Escape a value for use inside a SCIM filter string double-quoted segment. */
function escapeScimFilterValue(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function digitsOnly(s) {
  return String(s || '').replace(/\D/g, '');
}

/**
 * Normalize PingOne user API resource shape.
 * @param {object} raw
 */
function normalizePingOneUser(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const given = raw.name?.given || raw.name?.givenName || '';
  const family = raw.name?.family || raw.name?.familyName || '';
  const fullName = [given, family].filter(Boolean).join(' ').trim() || raw.username || '';
  const mobilePhone =
    raw.mobilePhone ||
    raw.phoneNumber ||
    (typeof raw.phone === 'object' && raw.phone !== null ? raw.phone.number : '') ||
    (typeof raw.phone === 'string' ? raw.phone : '') ||
    '';
  return {
    id: raw.id,
    username: raw.username,
    email: raw.email || '',
    fullName,
    givenName: given,
    familyName: family,
    mobilePhone: mobilePhone || '',
    lifecycleStatus: raw.lifecycle?.status || raw.status || '',
    enabled: raw.enabled !== false,
  };
}

/**
 * GET /environments/{envId}/users/{userId}
 */
async function fetchPingOneUserById(userId) {
  const envId = configStore.getEffective('pingone_environment_id');
  const region = configStore.getEffective('pingone_region') || 'com';
  if (!envId || !userId) {
    return { user: null, error: 'not_configured' };
  }
  try {
    const token = await getManagementToken();
    const url = `https://api.pingone.${region}/v1/environments/${envId}/users/${encodeURIComponent(userId)}`;
    const { data } = await axios.get(url, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 12000,
    });
    return { user: normalizePingOneUser(data), error: null };
  } catch (err) {
    const status = err.response?.status;
    if (status === 404) {
      return { user: null, error: 'not_found' };
    }
    console.warn('[PingOneUserLookup] GET user by id failed:', status, err.response?.data || err.message);
    return { user: null, error: err.response?.data?.message || err.message || 'request_failed' };
  }
}

/**
 * GET /environments/{envId}/users?filter=username eq "..."
 */
async function fetchPingOneUserByUsername(username) {
  const envId = configStore.getEffective('pingone_environment_id');
  const region = configStore.getEffective('pingone_region') || 'com';
  if (!envId || !username) {
    return { user: null, error: 'not_configured' };
  }
  try {
    const token = await getManagementToken();
    const filter = `username eq "${escapeScimFilterValue(username)}"`;
    const url = `https://api.pingone.${region}/v1/environments/${envId}/users`;
    const { data } = await axios.get(url, {
      params: { filter, limit: 5 },
      headers: { Authorization: `Bearer ${token}` },
      timeout: 12000,
    });
    const users = data?._embedded?.users || [];
    if (users.length === 0) {
      return { user: null, error: 'not_found' };
    }
    return { user: normalizePingOneUser(users[0]), error: null };
  } catch (err) {
    console.warn('[PingOneUserLookup] user search failed:', err.response?.status, err.response?.data || err.message);
    return { user: null, error: err.response?.data?.message || err.message || 'request_failed' };
  }
}

/**
 * Prefer PingOne user linked by oauthId (sub), then search by username.
 * @param {{ oauthId?: string, username?: string }} localUser
 */
async function resolvePingOneUserForLookup(localUser) {
  if (localUser.oauthId) {
    const byId = await fetchPingOneUserById(localUser.oauthId);
    if (byId.user) {
      return { user: byId.user, matchedBy: 'oauthId', error: null };
    }
  }
  if (localUser.username) {
    const byName = await fetchPingOneUserByUsername(localUser.username);
    if (byName.user) {
      return { user: byName.user, matchedBy: 'username', error: null };
    }
    return { user: null, matchedBy: null, error: byName.error || 'not_found' };
  }
  return { user: null, matchedBy: null, error: 'not_configured' };
}

/**
 * Phone last 4 must match the PingOne mobile phone and/or local phone on file (any match).
 */
function phoneLast4Matches(want4, localUser, pingOneUser) {
  const candidates = [];
  if (pingOneUser?.mobilePhone) candidates.push(pingOneUser.mobilePhone);
  if (localUser?.phone) candidates.push(localUser.phone);
  if (candidates.length === 0) return false;
  return candidates.some((c) => {
    const d = digitsOnly(c);
    return d.length >= 4 && d.slice(-4) === want4;
  });
}

module.exports = {
  normalizePingOneUser,
  resolvePingOneUserForLookup,
  phoneLast4Matches,
  fetchPingOneUserById,
  fetchPingOneUserByUsername,
};
