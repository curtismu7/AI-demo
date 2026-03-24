/**
 * Token introspection middleware for Banking API
 * Implements RFC 7662 - OAuth 2.0 Token Introspection
 * 
 * Validates tokens with PingOne introspection endpoint to ensure
 * they are active and not revoked (zero-trust validation).
 */

const axios = require('axios');
const logger = require('../utils/logger');

// Cache for introspection results to reduce PingOne load
const introspectionCache = new Map();
const CACHE_TTL_MS = 60000; // 1 minute cache

/**
 * Introspect token with PingOne
 * @param {string} token - Access token to introspect
 * @returns {Promise<object>} Introspection response
 */
async function introspectToken(token) {
  const cacheKey = token.substring(0, 20); // Use token prefix as cache key
  
  // Check cache first
  const cached = introspectionCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    logger.debug('Token introspection cache hit');
    return cached.result;
  }

  const introspectionEndpoint = process.env.PINGONE_INTROSPECTION_ENDPOINT;
  const clientId = process.env.PINGONE_CLIENT_ID || process.env.ADMIN_CLIENT_ID;
  const clientSecret = process.env.PINGONE_CLIENT_SECRET || process.env.ADMIN_CLIENT_SECRET;

  if (!introspectionEndpoint) {
    throw new Error('PINGONE_INTROSPECTION_ENDPOINT not configured');
  }

  if (!clientId || !clientSecret) {
    throw new Error('Client credentials not configured for introspection');
  }

  try {
    const response = await axios.post(
      introspectionEndpoint,
      new URLSearchParams({
        token,
        token_type_hint: 'access_token'
      }),
      {
        auth: {
          username: clientId,
          password: clientSecret
        },
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        timeout: 5000 // 5 second timeout
      }
    );

    const result = response.data;
    
    // Cache the result
    introspectionCache.set(cacheKey, {
      result,
      timestamp: Date.now()
    });

    // Clean up old cache entries periodically
    if (introspectionCache.size > 1000) {
      const now = Date.now();
      for (const [key, value] of introspectionCache.entries()) {
        if (now - value.timestamp > CACHE_TTL_MS) {
          introspectionCache.delete(key);
        }
      }
    }

    return result;
  } catch (error) {
    logger.error('Token introspection failed', {
      error: error.message,
      endpoint: introspectionEndpoint
    });
    throw new Error(`Token introspection failed: ${error.message}`);
  }
}

/**
 * Middleware to introspect and validate tokens
 * Checks that token is active and not revoked
 */
async function tokenIntrospectionMiddleware(req, _res, next) {
  try {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      // No token, let auth middleware handle
      return next();
    }

    const token = authHeader.substring(7);

    // Introspect token
    const introspectionResult = await introspectToken(token);

    // Check if token is active
    if (!introspectionResult.active) {
      logger.warn('Inactive token rejected', {
        sub: introspectionResult.sub,
        path: req.path
      });
      return next(new Error('Token is not active or has been revoked'));
    }

    // Attach introspection result to request for audit logging
    req.tokenIntrospection = {
      active: introspectionResult.active,
      sub: introspectionResult.sub,
      client_id: introspectionResult.client_id,
      scope: introspectionResult.scope,
      exp: introspectionResult.exp,
      iat: introspectionResult.iat
    };

    logger.debug('Token introspection successful', {
      sub: introspectionResult.sub,
      active: introspectionResult.active,
      path: req.path
    });

    next();
  } catch (error) {
    logger.error('Token introspection middleware error', {
      error: error.message,
      path: req.path
    });
    
    // Decide whether to fail open or closed
    // For production, should fail closed (reject request)
    // For development, might fail open (allow request)
    const failOpen = process.env.INTROSPECTION_FAIL_OPEN === 'true';
    
    if (failOpen) {
      logger.warn('Introspection failed but FAIL_OPEN enabled, allowing request');
      next();
    } else {
      next(error);
    }
  }
}

/**
 * Optional middleware - only introspect if configured
 */
function optionalTokenIntrospectionMiddleware(req, res, next) {
  const introspectionEnabled = process.env.ENABLE_TOKEN_INTROSPECTION === 'true';
  
  if (!introspectionEnabled) {
    return next();
  }

  return tokenIntrospectionMiddleware(req, res, next);
}

/** Test helper: clears the in-process introspection cache between test runs. */
function clearIntrospectionCache() {
  introspectionCache.clear();
}

module.exports = {
  tokenIntrospectionMiddleware,
  optionalTokenIntrospectionMiddleware,
  introspectToken,
  clearIntrospectionCache,
};
