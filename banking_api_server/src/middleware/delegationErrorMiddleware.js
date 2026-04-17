/**
 * Delegation Error Middleware
 * 
 * Validates that token contains RFC 8693 delegation claim ('act') 
 * and rejects with educational error if missing.
 * Used on agent-delegated endpoints that require proof of delegation.
 * 
 * Usage:
 *   router.post('/mcp/tool/execute', 
 *     delegationErrorMiddleware(), 
 *     (req, res) => { ... })
 */

import ErrorSchemaService, { ERROR_CODES } from '../services/errorSchemaService.js';
import ErrorMessageBuilder from '../services/errorMessageBuilder.js';

/**
 * Create middleware that validates RFC 8693 delegation claim
 * 
 * @param {object} options - Additional options (e.g., allowedActors)
 * @returns {function} Express middleware
 */
export default function delegationErrorMiddleware(options = {}) {
  return (req, res, next) => {
    // Extract token from request
    const token = req.user?.token;

    // If no token at all, let other middleware handle it
    if (!token) {
      return next();
    }

    // Check for 'act' claim (RFC 8693 delegation proof)
    // act can be a string (actor id) or object { client_id: "...", sub: "..." }
    const hasActClaim = token.act !== undefined && token.act !== null;

    if (!hasActClaim) {
      const messageDetails = ErrorMessageBuilder.buildDelegationClaimMissing({
        endpoint: req.path,
        method: req.method,
      });

      const errorResponse = ErrorSchemaService.buildErrorResponse(
        ERROR_CODES.DELEGATION_CLAIM_MISSING,
        {
          message: messageDetails.what_failed,
          ...messageDetails,
        }
      );

      const statusCode = ErrorSchemaService.getStatusCode(ERROR_CODES.DELEGATION_CLAIM_MISSING);
      return res.status(statusCode).json(errorResponse);
    }

    // Optionally validate that act claim is from an allowed actor
    if (options.allowedActors && Array.isArray(options.allowedActors)) {
      const actorId = typeof token.act === 'string' 
        ? token.act 
        : (token.act?.client_id || token.act?.sub);
      
      if (!options.allowedActors.includes(actorId)) {
        // Still valid delegation, just not from allowed actor
        return res.status(403).json(
          ErrorSchemaService.buildErrorResponse(
            ERROR_CODES.INSUFFICIENT_PERMISSIONS,
            {
              message: `Delegation from unauthorized actor: ${actorId}`,
              required_role: 'allowed-actor',
              actual_role: actorId,
            }
          )
        );
      }
    }

    // Token has valid delegation claim, proceed
    next();
  };
}
