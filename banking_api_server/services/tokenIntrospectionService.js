/**
 * Token Introspection Service
 * Validates tokens by calling PingOne's RFC 7662 introspection endpoint.
 * Required for Phase 91: External MCP client access
 * 
 * Purpose: External clients use this endpoint to validate their Bearer tokens
 * and extract authorized scopes before calling MCP tools.
 */

'use strict';

const crypto = require('crypto');
const axios = require('axios');
const configStore = require('./configStore');
const { logger, LOG_CATEGORIES } = require('../utils/logger');

// In-memory token introspection cache
const introspectionCache = new Map();
const CACHE_TTL_MS = 30 * 1000; // 30 seconds

/**
 * Hash a token for cache key (never store raw token)
 * @param {string} token
 * @returns {string} SHA256 hash
 */
function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Validate a token by calling PingOne's introspection endpoint (RFC 7662).
 * Returns token metadata including scopes.
 * 
 * @param {string} token - Bearer token to validate
 * @returns {Promise<{valid: boolean, scopes: string[], sub: string, exp: number, aud: string, client_id: string, token_type: string}>}
 */
async function validateToken(token) {
  if (!token) {
    return { valid: false };
  }

  const tokenHash = hashToken(token);

  // Check cache first
  const cached = introspectionCache.get(tokenHash);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.result;
  }

  try {
    const introspectionUrl = process.env.PINGONE_INTROSPECTION_ENDPOINT;
    const clientId = process.env.PINGONE_WORKER_CLIENT_ID;
    const clientSecret = process.env.PINGONE_WORKER_CLIENT_SECRET;

    if (!introspectionUrl || !clientId || !clientSecret) {
      logger(LOG_CATEGORIES.AUTH, 'Token introspection credentials missing', {
        endpoint: !!introspectionUrl,
        clientId: !!clientId,
        clientSecret: !!clientSecret,
      });
      return { valid: false };
    }

    // Call PingOne introspection endpoint with worker app credentials
    const response = await axios.post(
      introspectionUrl,
      new URLSearchParams({
        token,
        client_id: clientId,
        client_secret: clientSecret,
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        timeout: 5000, // 5 second timeout
      }
    );

    const introspectionResult = response.data;

    // Extract and normalize scopes
    const scopes = extractScopes(introspectionResult);

    // Build result object following RFC 7662
    const result = {
      valid: introspectionResult.active === true,
      scopes,
      sub: introspectionResult.sub || null,
      exp: introspectionResult.exp || null,
      aud: introspectionResult.aud || null,
      client_id: introspectionResult.client_id || null,
      token_type: introspectionResult.token_type || 'Bearer',
      ...(introspectionResult.username && { username: introspectionResult.username }),
      ...(introspectionResult.iat && { iat: introspectionResult.iat }),
    };

    // Cache the result, but respect token expiration
    let cacheDuration = CACHE_TTL_MS;
    if (result.exp) {
      const tokenExpiresIn = result.exp * 1000 - Date.now();
      if (tokenExpiresIn > 0 && tokenExpiresIn < CACHE_TTL_MS) {
        cacheDuration = tokenExpiresIn;
      }
    }

    introspectionCache.set(tokenHash, {
      result,
      expiresAt: Date.now() + cacheDuration,
    });

    // Audit logging (never log the token itself)
    logger(LOG_CATEGORIES.AUTH, 'Token introspection completed', {
      token_hash: tokenHash.substring(0, 16),
      valid: result.valid,
      scopes: scopes.length,
      client_id: result.client_id,
    });

    return result;
  } catch (error) {
    logger(LOG_CATEGORIES.ERROR, 'Token introspection failed', {
      error: error.message,
      endpoint: process.env.PINGONE_INTROSPECTION_ENDPOINT,
      timeout: error.code === 'ECONNABORTED',
    });

    return {
      valid: false,
      error: 'token_introspection_failed',
    };
  }
}

/**
 * Extract scopes from PingOne introspection response.
 * Handles both space-separated strings and arrays.
 * 
 * @param {object} introspectionResponse - PingOne introspection API response
 * @returns {string[]} Array of scopes
 */
function extractScopes(introspectionResponse) {
  if (!introspectionResponse || !introspectionResponse.scope) {
    return [];
  }

  const scopeField = introspectionResponse.scope;

  // If scope is already an array
  if (Array.isArray(scopeField)) {
    return scopeField.filter(s => typeof s === 'string' && s.length > 0);
  }

  // If scope is a space-separated string
  if (typeof scopeField === 'string') {
    return scopeField
      .split(/\s+/)
      .filter(s => s.length > 0);
  }

  return [];
}

/**
 * Clear introspection cache (useful for testing)
 */
function clearCache() {
  introspectionCache.clear();
}

/**
 * Get cache stats (for monitoring/debugging)
 */
function getCacheStats() {
  const now = Date.now();
  let validEntries = 0;
  let expiredEntries = 0;

  for (const entry of introspectionCache.values()) {
    if (entry.expiresAt > now) {
      validEntries++;
    } else {
      expiredEntries++;
    }
  }

  return {
    size: introspectionCache.size,
    valid: validEntries,
    expired: expiredEntries,
  };
}

module.exports = {
  validateToken,
  extractScopes,
  clearCache,
  getCacheStats,
};
