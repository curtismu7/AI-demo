/**
 * Tool Call Validator
 * 
 * Pre-tool-execution validation that chains all security checks:
 * 1. Token type validation (must be 'agent')
 * 2. Scope validation (must have 'mcp:execute')
 * 3. Delegation validation (must have 'act' claim)
 * 4. Rate limit check
 * 
 * Call this BEFORE executing any tool to validate preconditions.
 * 
 * Usage:
 *   const validation = ToolCallValidator.validateMessage(req, toolMessage);
 *   if (!validation.shouldExecute) {
 *     return formatError(validation.error);
 *   }
 *   // Execute tool...
 */

export default class ToolCallValidator {
  /**
   * Validate all preconditions for tool execution
   * 
   * @param {object} req - Express request (contains user token)
   * @param {object} toolMessage - MCP tool message
   * @returns {object} { shouldExecute: boolean, error?: object }
   */
  static validateMessage(req, toolMessage) {
    const token = req.user?.token;

    // Chain all validations — stop on first failure
    let validation;

    // 1. Validate token type
    validation = this.validateTokenType(token);
    if (!validation.valid) {
      return { shouldExecute: false, error: validation.error };
    }

    // 2. Validate scopes
    validation = this.validateScopes(token);
    if (!validation.valid) {
      return { shouldExecute: false, error: validation.error };
    }

    // 3. Validate delegation claim (act)
    validation = this.validateDelegation(token);
    if (!validation.valid) {
      return { shouldExecute: false, error: validation.error };
    }

    // 4. Validate rate limit
    validation = this.validateRateLimit(req);
    if (!validation.valid) {
      return { shouldExecute: false, error: validation.error };
    }

    // All validations passed
    return { shouldExecute: true };
  }

  /**
   * Validate token type is 'agent'
   * @private
   */
  static validateTokenType(token) {
    if (!token) {
      return {
        valid: false,
        error: {
          code: 'NO_TOKEN',
          message: 'No token provided',
        },
      };
    }

    const tokenType = token.token_type || token.typ;
    if (tokenType && tokenType !== 'agent') {
      return {
        valid: false,
        error: {
          code: 'TOKEN_TYPE_MISMATCH',
          message: `Token type mismatch. Expected 'agent', got '${tokenType}'`,
          context: {
            actual_type: tokenType,
            required_type: 'agent',
          },
        },
      };
    }

    return { valid: true };
  }

  /**
   * Validate token has required scopes
   * @private
   */
  static validateScopes(token) {
    const requiredScopes = ['mcp:execute'];
    const actualScopes = token?.scopes || [];

    // Check for wildcard
    const hasWildcard = actualScopes.includes('mcp:*') || actualScopes.includes('*');

    // Check for required scopes
    const hasAllScopes = requiredScopes.every(scope => actualScopes.includes(scope));

    if (!hasWildcard && !hasAllScopes) {
      const missingScopes = requiredScopes.filter(scope => !actualScopes.includes(scope));
      return {
        valid: false,
        error: {
          code: 'SCOPE_VIOLATION',
          message: `Missing required scope(s): ${missingScopes.join(', ')}`,
          context: {
            required_scopes: requiredScopes,
            actual_scopes: actualScopes,
            missing_scopes: missingScopes,
          },
        },
      };
    }

    return { valid: true };
  }

  /**
   * Validate RFC 8693 delegation claim (act) is present
   * @private
   */
  static validateDelegation(token) {
    // The 'act' claim proves the agent has permission to act on behalf of the user
    if (!token?.act) {
      return {
        valid: false,
        error: {
          code: 'DELEGATION_CLAIM_MISSING',
          message: 'Delegation claim (act) missing. Agent must prove authorization from user.',
          context: {
            endpoint: '/tools/call',
            requires_act_claim: true,
          },
        },
      };
    }

    return { valid: true };
  }

  /**
   * Validate rate limit (10 requests per 60 seconds)
   * @private
   */
  static validateRateLimit(req) {
    // TODO: Implement actual rate limiting with redis or in-memory store
    // For now, always return valid
    // In production, track request count per user/agent in a sliding window

    return { valid: true };
  }

  /**
   * Helper: Get all validation methods as map (for introspection)
   */
  static getAllValidations() {
    return {
      validateTokenType: this.validateTokenType,
      validateScopes: this.validateScopes,
      validateDelegation: this.validateDelegation,
      validateRateLimit: this.validateRateLimit,
    };
  }
}
