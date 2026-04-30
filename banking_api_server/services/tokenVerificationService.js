/**
 * Cryptographic verification of JWTs using PingOne JWKS (RFC 7517 / RFC 7518).
 * Pairs with jwksService.js to convert JWK → PEM and call jsonwebtoken.verify().
 *
 * Fail-open behaviour: by default a JWKS outage produces a warning and allows
 * the token to continue (demo-friendly).  Set JWKS_VERIFY_FAIL_OPEN=false to
 * hard-fail on signature-verification errors.
 *
 * RFC 7515 — JWS (signature structure)
 * RFC 7517 — JWK (key format)
 * RFC 7518 — JWA (algorithms)
 * RFC 7519 — JWT (claim semantics)
 */
'use strict';

const jwt = require('jsonwebtoken');
const jwksService = require('./jwksService');
const { logger, LOG_CATEGORIES } = require('../utils/logger');

/**
 * When true (default), JWKS unavailability or verification failure produces a
 * warning event instead of hard-failing the tool call.
 */
const FAIL_OPEN = process.env.JWKS_VERIFY_FAIL_OPEN !== 'false';

/**
 * Verify a JWT's RS256/RS384/RS512 signature using PingOne JWKS.
 * Never throws — all outcomes returned as a result object.
 *
 * @param {string} token  Raw JWT string.
 * @returns {Promise<{
 *   verified: boolean,
 *   claims: object|null,
 *   alg: string|null,
 *   kid: string|null,
 *   warning: string|null,
 *   error: string|null
 * }>}
 */
async function verifyExchangedToken(token) {
  if (!token || typeof token !== 'string') {
    return { verified: false, claims: null, alg: null, kid: null, error: 'no token provided', warning: null };
  }

  // --- Decode header (no cryptography yet) ---
  let header = null;
  try {
    const b64 = token.split('.')[0];
    // base64url → Buffer → string; Buffer.from handles both base64 and base64url
    header = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
  } catch {
    return { verified: false, claims: null, alg: null, kid: null, error: 'malformed JWT header', warning: null };
  }

  const kid = header?.kid || null;
  const alg = header?.alg || null;

  // Only handle asymmetric RS* algorithms (demo uses RS256)
  if (alg && !alg.startsWith('RS') && !alg.startsWith('PS') && !alg.startsWith('ES')) {
    const warning = `Algorithm ${alg} — symmetric or unknown; JWKS verification skipped`;
    return { verified: false, claims: null, alg, kid, warning, error: null };
  }

  // --- Lookup public key from JWKS ---
  let keyEntry = null;
  try {
    keyEntry = await jwksService.getPublicKey(kid);
  } catch (err) {
    logger(LOG_CATEGORIES.AUTH, `tokenVerificationService: JWKS lookup error — ${err.message}`);
  }

  if (!keyEntry) {
    const warning = 'JWKS unavailable or key not found — signature unverified (structural claims only)';
    if (FAIL_OPEN) {
      return { verified: false, claims: null, alg, kid, warning, error: null };
    }
    return { verified: false, claims: null, alg, kid, error: warning, warning: null };
  }

  // --- Export crypto.KeyObject → PEM for jsonwebtoken ---
  let pem;
  try {
    pem = keyEntry.keyObject.export({ type: 'spki', format: 'pem' });
  } catch (err) {
    const warning = `Key export failed: ${err.message}`;
    if (FAIL_OPEN) {
      return { verified: false, claims: null, alg, kid, warning, error: null };
    }
    return { verified: false, claims: null, alg, kid, error: warning, warning: null };
  }

  // --- Cryptographic verification ---
  try {
    const claims = jwt.verify(token, pem, {
      algorithms: [alg || keyEntry.alg || 'RS256'],
      complete: false,
    });

    logger(LOG_CATEGORIES.AUTH, `tokenVerificationService: JWKS verified — kid=${kid || '(none)'} alg=${alg}`);
    return { verified: true, claims, alg, kid, warning: null, error: null };
  } catch (err) {
    let errorMsg;
    if (err.name === 'TokenExpiredError') {
      errorMsg = `Token expired at ${new Date(err.expiredAt).toISOString()}`;
    } else if (err.name === 'JsonWebTokenError') {
      errorMsg = `Signature invalid: ${err.message}`;
    } else {
      errorMsg = `JWT verification failed: ${err.message}`;
    }

    logger(LOG_CATEGORIES.AUTH, `tokenVerificationService: ${errorMsg}`);

    if (FAIL_OPEN) {
      return { verified: false, claims: null, alg, kid, warning: errorMsg, error: null };
    }
    return { verified: false, claims: null, alg, kid, error: errorMsg, warning: null };
  }
}

module.exports = { verifyExchangedToken };
