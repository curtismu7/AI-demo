/**
 * delegationErrorMiddleware.js
 *
 * Express middleware that validates the presence of an 'act' claim
 * (RFC 8693 delegation) and returns educational errors if missing.
 *
 * Phase 156: Improve security error messages
 */

const { sendErrorResponse, ERROR_CODES } = require('../services/errorSchemaService');
const { buildDelegationClaimMissing } = require('../services/errorMessageBuilder');
const jwt = require('jsonwebtoken');
const { logger } = require('../utils/logger');

/**
 * Create middleware that requires a valid delegation claim ('act') on the token.
 *
 * @returns {Function} Express middleware
 */
function delegationErrorMiddleware() {
  return (req, res, next) => {
    try {
      const authHeader = req.headers.authorization;
      const sessionToken = req.session?.oauthTokens?.accessToken;
      const rawToken = authHeader?.startsWith('Bearer ')
        ? authHeader.substring(7)
        : sessionToken;

      if (!rawToken) {
        return next();
      }

      const decoded = jwt.decode(rawToken);
      if (!decoded) {
        return next();
      }

      const hasActClaim = decoded.act !== undefined && decoded.act !== null;

      if (!hasActClaim) {
        const details = buildDelegationClaimMissing({
          endpoint: req.originalUrl || req.path,
          method: req.method,
        });
        return sendErrorResponse(res, ERROR_CODES.DELEGATION_CLAIM_MISSING, {
          ...details,
          tokens_involved: {
            ...details.tokens_involved,
            token_sub: decoded.sub,
            token_iss: decoded.iss,
            token_client_id: decoded.client_id,
          },
        });
      }

      next();
    } catch (err) {
      logger.error('delegationErrorMiddleware unexpected error', { error: err.message });
      next();
    }
  };
}

module.exports = delegationErrorMiddleware;
