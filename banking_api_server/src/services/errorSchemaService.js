/**
 * ErrorSchemaService — Standardized error response builder
 * 
 * Provides consistent error response formatting across all security error types.
 * Converts raw errors into educational responses with teaching moments.
 * 
 * Error codes:
 * - TOKEN_TYPE_MISMATCH: User vs Agent token type validation failed
 * - SCOPE_VIOLATION: Required scopes missing from token
 * - AUDIENCE_MISMATCH: Token audience != endpoint audience
 * - DELEGATION_CLAIM_MISSING: No 'act' claim in delegation token
 * - TOKEN_EXPIRED: Token expiration time has passed
 * - RATE_LIMIT_EXCEEDED: Too many requests in time window
 * - INSUFFICIENT_PERMISSIONS: User role doesn't have permission
 * - POLICY_VIOLATION: Transaction limit or policy constraint
 */

/**
 * Error codes as constants — prevents typos, enables autocomplete
 */
export const ERROR_CODES = {
  TOKEN_TYPE_MISMATCH: 'TOKEN_TYPE_MISMATCH',
  SCOPE_VIOLATION: 'SCOPE_VIOLATION',
  AUDIENCE_MISMATCH: 'AUDIENCE_MISMATCH',
  DELEGATION_CLAIM_MISSING: 'DELEGATION_CLAIM_MISSING',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  INSUFFICIENT_PERMISSIONS: 'INSUFFICIENT_PERMISSIONS',
  POLICY_VIOLATION: 'POLICY_VIOLATION',
};

/**
 * HTTP status code mapping for each error type
 */
const STATUS_CODE_MAP = {
  TOKEN_TYPE_MISMATCH: 403,           // Forbidden - wrong token type
  SCOPE_VIOLATION: 403,                // Forbidden - insufficient scope
  AUDIENCE_MISMATCH: 401,              // Unauthorized - wrong audience
  DELEGATION_CLAIM_MISSING: 403,       // Forbidden - no delegation proof
  TOKEN_EXPIRED: 401,                  // Unauthorized - expired
  RATE_LIMIT_EXCEEDED: 429,            // Too Many Requests
  INSUFFICIENT_PERMISSIONS: 403,       // Forbidden - insufficient role
  POLICY_VIOLATION: 403,               // Forbidden - policy breach
};

export default class ErrorSchemaService {
  /**
   * Build standardized error response
   * 
   * @param {string} errorCode - Error code (from ERROR_CODES)
   * @param {object} details - Error details (what_failed, why, teaching, fix, tokens_involved, message)
   * @returns {object} Standardized error response object
   */
  static buildErrorResponse(errorCode, details = {}) {
    return {
      error: errorCode,
      message: details.message || 'An error occurred',
      details: {
        what_failed: details.what_failed || 'Unknown validation failure',
        why: details.why || 'Check documentation for details',
        teaching: details.teaching || 'This is a security checkpoint',
        tokens_involved: details.tokens_involved || {},
        fix: details.fix || 'Consult documentation or contact support',
      },
      documentation_link: `https://docs.mybank.com/errors/${errorCode}`,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Get HTTP status code for error type
   * 
   * @param {string} errorCode - Error code
   * @returns {number} HTTP status code (default 500)
   */
  static getStatusCode(errorCode) {
    return STATUS_CODE_MAP[errorCode] || 500;
  }

  /**
   * Check if error code is valid
   * 
   * @param {string} errorCode - Error code to check
   * @returns {boolean} True if code is recognized
   */
  static isValidErrorCode(errorCode) {
    return Object.values(ERROR_CODES).includes(errorCode);
  }

  /**
   * Get all error codes (for introspection/documentation)
   * 
   * @returns {object} All available error codes
   */
  static getAllErrorCodes() {
    return { ...ERROR_CODES };
  }

  /**
   * Get status code map (for introspection/documentation)
   * 
   * @returns {object} All error codes with their status codes
   */
  static getStatusCodeMap() {
    return { ...STATUS_CODE_MAP };
  }
}
