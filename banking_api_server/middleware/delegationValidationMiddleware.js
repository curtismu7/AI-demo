/**
 * Delegation Claims Validation Middleware
 * Comprehensive error handling and validation for delegation claims
 * 
 * Phase 58-05: Error Handling and Validation Middleware
 * Provides middleware for claim validation and standardized error responses
 */

'use strict';

const { writeExchangeEvent } = require('../services/exchangeAuditStore');
const { validateDelegationClaims } = require('../services/delegationClaimsService');
const { IdentityFormatStandardizationService } = require('../services/identityFormatStandardizationService');
const { DelegationChainValidationService } = require('../services/delegationChainValidationService');

/**
 * Error response codes for delegation claims validation
 */
const DELEGATION_ERROR_CODES = {
  // Token format errors
  INVALID_TOKEN_FORMAT: 'DELEGATION_001',
  MISSING_TOKEN: 'DELEGATION_002',
  TOKEN_DECODE_FAILED: 'DELEGATION_003',
  
  // Claim structure errors
  MISSING_REQUIRED_CLAIM: 'DELEGATION_010',
  INVALID_CLAIM_STRUCTURE: 'DELEGATION_011',
  MALFORMED_CLAIM: 'DELEGATION_012',
  
  // may_act specific errors
  MISSING_MAY_ACT: 'DELEGATION_020',
  INVALID_MAY_ACT_STRUCTURE: 'DELEGATION_021',
  UNAUTHORIZED_AGENT: 'DELEGATION_022',
  INVALID_AGENT_IDENTIFIER: 'DELEGATION_023',
  
  // act specific errors
  MISSING_ACT: 'DELEGATION_030',
  INVALID_ACT_STRUCTURE: 'DELEGATION_031',
  INVALID_MCP_IDENTIFIER: 'DELEGATION_032',
  INVALID_NESTED_ACT: 'DELEGATION_033',
  
  // Chain validation errors
  SUBJECT_NOT_PRESERVED: 'DELEGATION_040',
  CIRCULAR_DELEGATION: 'DELEGATION_041',
  CHAIN_TOO_LONG: 'DELEGATION_042',
  MISSING_CHAIN_NODE: 'DELEGATION_043',
  
  // Identifier format errors
  INVALID_IDENTIFIER_FORMAT: 'DELEGATION_050',
  LEGACY_IDENTIFIER_FORMAT: 'DELEGATION_051',
  IDENTIFIER_MAPPING_FAILED: 'DELEGATION_052',
  
  // General validation errors
  VALIDATION_FAILED: 'DELEGATION_100',
  VALIDATION_TIMEOUT: 'DELEGATION_101',
  VALIDATION_ERROR: 'DELEGATION_102'
};

/**
 * HTTP status codes for delegation errors
 */
const DELEGATION_HTTP_STATUS = {
  [DELEGATION_ERROR_CODES.INVALID_TOKEN_FORMAT]: 400,
  [DELEGATION_ERROR_CODES.MISSING_TOKEN]: 401,
  [DELEGATION_ERROR_CODES.TOKEN_DECODE_FAILED]: 401,
  [DELEGATION_ERROR_CODES.MISSING_REQUIRED_CLAIM]: 401,
  [DELEGATION_ERROR_CODES.INVALID_CLAIM_STRUCTURE]: 401,
  [DELEGATION_ERROR_CODES.MALFORMED_CLAIM]: 401,
  [DELEGATION_ERROR_CODES.MISSING_MAY_ACT]: 403,
  [DELEGATION_ERROR_CODES.INVALID_MAY_ACT_STRUCTURE]: 401,
  [DELEGATION_ERROR_CODES.UNAUTHORIZED_AGENT]: 403,
  [DELEGATION_ERROR_CODES.INVALID_AGENT_IDENTIFIER]: 401,
  [DELEGATION_ERROR_CODES.MISSING_ACT]: 401,
  [DELEGATION_ERROR_CODES.INVALID_ACT_STRUCTURE]: 401,
  [DELEGATION_ERROR_CODES.INVALID_MCP_IDENTIFIER]: 401,
  [DELEGATION_ERROR_CODES.INVALID_NESTED_ACT]: 401,
  [DELEGATION_ERROR_CODES.SUBJECT_NOT_PRESERVED]: 403,
  [DELEGATION_ERROR_CODES.CIRCULAR_DELEGATION]: 403,
  [DELEGATION_ERROR_CODES.CHAIN_TOO_LONG]: 403,
  [DELEGATION_ERROR_CODES.MISSING_CHAIN_NODE]: 403,
  [DELEGATION_ERROR_CODES.INVALID_IDENTIFIER_FORMAT]: 401,
  [DELEGATION_ERROR_CODES.LEGACY_IDENTIFIER_FORMAT]: 200, // Warning, not error
  [DELEGATION_ERROR_CODES.IDENTIFIER_MAPPING_FAILED]: 401,
  [DELEGATION_ERROR_CODES.VALIDATION_FAILED]: 500,
  [DELEGATION_ERROR_CODES.VALIDATION_TIMEOUT]: 504,
  [DELEGATION_ERROR_CODES.VALIDATION_ERROR]: 500
};

/**
 * Delegation Claims Validation Middleware Class
 */
class DelegationValidationMiddleware {
  constructor(options = {}) {
    this.options = {
      strict: true,
      autoFix: false,
      timeout: 5000,
      enableCaching: true,
      enableAuditLogging: true,
      enableMonitoring: true,
      ...options
    };
    
    this.identityService = new IdentityFormatStandardizationService();
    this.chainService = new DelegationChainValidationService();
    this.validationCache = new Map();
  }

  /**
   * Main delegation claims validation middleware
   */
  validateDelegationClaims(tokenType = 'user') {
    return async (req, res, next) => {
      const startTime = Date.now();
      const requestId = req.headers['x-request-id'] || `req-${Date.now()}`;
      
      try {
        // Extract token from request
        const token = this.extractTokenFromRequest(req);
        if (!token) {
          return this.sendErrorResponse(res, DELEGATION_ERROR_CODES.MISSING_TOKEN, {
            requestId,
            tokenType
          });
        }

        // Decode token claims
        let claims;
        try {
          claims = this.decodeTokenClaims(token);
        } catch (error) {
          return this.sendErrorResponse(res, DELEGATION_ERROR_CODES.TOKEN_DECODE_FAILED, {
            requestId,
            tokenType,
            error: error.message
          });
        }

        // Validate delegation claims
        const validation = await this.performValidation(claims, tokenType, {
          requestId,
          userPreferences: req.user?.preferences || {}
        });

        // Handle validation results
        if (!validation.valid) {
          return this.sendErrorResponse(res, this.getErrorCode(validation.errors[0]), {
            requestId,
            tokenType,
            errors: validation.errors,
            warnings: validation.warnings
          });
        }

        // Attach validation results to request
        req.delegationValidation = validation;
        req.tokenClaims = validation.normalized || claims;

        // Log successful validation
        if (this.options.enableAuditLogging) {
          await this.logValidationSuccess(requestId, tokenType, validation, Date.now() - startTime);
        }

        next();

      } catch (error) {
        console.error(`Delegation validation error [${requestId}]:`, error);
        
        if (this.options.enableAuditLogging) {
          await this.logValidationError(requestId, tokenType, error, Date.now() - startTime);
        }

        return this.sendErrorResponse(res, DELEGATION_ERROR_CODES.VALIDATION_ERROR, {
          requestId,
          tokenType,
          error: error.message
        });
      }
    };
  }

  /**
   * User token specific validation middleware
   */
  validateUserToken() {
    return this.validateDelegationClaims('user');
  }

  /**
   * Exchanged token specific validation middleware
   */
  validateExchangedToken() {
    return this.validateDelegationClaims('exchanged');
  }

  /**
   * Delegation chain validation middleware
   */
  validateDelegationChain(chainType = 'single_exchange') {
    return async (req, res, next) => {
      const startTime = Date.now();
      const requestId = req.headers['x-request-id'] || `req-${Date.now()}`;
      
      try {
        // Extract both tokens from request
        const userToken = this.extractTokenFromRequest(req, 'user_token');
        const exchangedToken = this.extractTokenFromRequest(req, 'exchanged_token');
        
        if (!userToken || !exchangedToken) {
          return this.sendErrorResponse(res, DELEGATION_ERROR_CODES.MISSING_TOKEN, {
            requestId,
            chainType,
            missingTokens: {
              userToken: !userToken,
              exchangedToken: !exchangedToken
            }
          });
        }

        // Validate delegation chain
        const validation = await this.chainService.validateDelegationChain(
          userToken,
          exchangedToken,
          {
            chainType,
            strict: this.options.strict,
            cacheKey: this.options.enableCaching ? `${requestId}-${chainType}` : null
          }
        );

        // Handle validation results
        if (!validation.valid) {
          return this.sendErrorResponse(res, this.getErrorCode(validation.errors[0]), {
            requestId,
            chainType,
            errors: validation.errors,
            warnings: validation.warnings,
            chainLength: validation.chain?.length || 0
          });
        }

        // Attach validation results to request
        req.chainValidation = validation;

        // Log successful validation
        if (this.options.enableAuditLogging) {
          await this.logChainValidationSuccess(requestId, chainType, validation, Date.now() - startTime);
        }

        next();

      } catch (error) {
        console.error(`Delegation chain validation error [${requestId}]:`, error);
        
        if (this.options.enableAuditLogging) {
          await this.logChainValidationError(requestId, chainType, error, Date.now() - startTime);
        }

        return this.sendErrorResponse(res, DELEGATION_ERROR_CODES.VALIDATION_ERROR, {
          requestId,
          chainType,
          error: error.message
        });
      }
    };
  }

  /**
   * Extract token from request
   */
  extractTokenFromRequest(req, tokenField = 'authorization') {
    // Try Authorization header first
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }

    // Try request body field
    if (req.body && req.body[tokenField]) {
      return req.body[tokenField];
    }

    // Try query parameter
    if (req.query && req.query[tokenField]) {
      return req.query[tokenField];
    }

    // Try custom headers
    const customHeaders = ['x-access-token', 'x-auth-token', 'token'];
    for (const header of customHeaders) {
      if (req.headers[header]) {
        return req.headers[header];
      }
    }

    return null;
  }

  /**
   * Perform comprehensive validation
   */
  async performValidation(claims, tokenType, context = {}) {
    const { requestId, userPreferences = {} } = context;
    
    // Check cache first
    const cacheKey = this.options.enableCaching ? 
      `${requestId}-${tokenType}-${JSON.stringify(claims).slice(0, 100)}` : null;
    
    if (cacheKey && this.validationCache.has(cacheKey)) {
      const cached = this.validationCache.get(cacheKey);
      if (cached.timestamp > Date.now() - 300000) { // 5 minute cache
        return cached.validation;
      }
    }

    // Perform validation
    const validation = validateDelegationClaims(claims, tokenType, userPreferences);

    // Additional validation based on token type
    if (tokenType === 'user') {
      await this.validateUserTokenSpecifics(claims, validation);
    } else if (tokenType === 'exchanged') {
      await this.validateExchangedTokenSpecifics(claims, validation);
    }

    // Cache results
    if (cacheKey) {
      this.validationCache.set(cacheKey, {
        validation,
        timestamp: Date.now()
      });
    }

    return validation;
  }

  /**
   * User token specific validation
   */
  async validateUserTokenSpecifics(claims, validation) {
    // Check for required user token claims
    const requiredClaims = ['sub', 'aud', 'iss', 'exp'];
    for (const claim of requiredClaims) {
      if (!claims[claim]) {
        validation.valid = false;
        validation.errors.push(`Missing required user token claim: ${claim}`);
      }
    }

    // Check token expiration
    if (claims.exp && claims.exp < Date.now() / 1000) {
      validation.valid = false;
      validation.errors.push('User token has expired');
    }

    // Validate issuer
    if (claims.iss && !claims.iss.includes('pingone.com')) {
      validation.warnings.push('Unexpected token issuer');
    }
  }

  /**
   * Exchanged token specific validation
   */
  async validateExchangedTokenSpecifics(claims, validation) {
    // Check for required exchanged token claims
    const requiredClaims = ['sub', 'act', 'aud'];
    for (const claim of requiredClaims) {
      if (!claims[claim]) {
        validation.valid = false;
        validation.errors.push(`Missing required exchanged token claim: ${claim}`);
      }
    }

    // Validate act claim structure
    if (claims.act) {
      if (!claims.act.sub) {
        validation.valid = false;
        validation.errors.push('Missing sub in act claim');
      }

      // Check for nested act claim
      if (claims.act.act && !claims.act.act.sub) {
        validation.valid = false;
        validation.errors.push('Missing sub in nested act claim');
      }
    }

    // Validate audience
    if (claims.aud && !claims.aud.includes('mcp')) {
      validation.warnings.push('Unexpected audience in exchanged token');
    }
  }

  /**
   * Decode JWT claims safely
   */
  decodeTokenClaims(token) {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) {
        throw new Error('Invalid JWT format');
      }

      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
      return payload;
    } catch (error) {
      throw new Error(`Failed to decode token claims: ${error.message}`);
    }
  }

  /**
   * Get error code from error message
   */
  getErrorCode(errorMessage) {
    // Map common error messages to codes
    if (errorMessage.includes('may_act')) {
      if (errorMessage.includes('missing')) return DELEGATION_ERROR_CODES.MISSING_MAY_ACT;
      if (errorMessage.includes('structure')) return DELEGATION_ERROR_CODES.INVALID_MAY_ACT_STRUCTURE;
      if (errorMessage.includes('unauthorized')) return DELEGATION_ERROR_CODES.UNAUTHORIZED_AGENT;
      if (errorMessage.includes('identifier')) return DELEGATION_ERROR_CODES.INVALID_AGENT_IDENTIFIER;
    }
    
    if (errorMessage.includes('act')) {
      if (errorMessage.includes('missing')) return DELEGATION_ERROR_CODES.MISSING_ACT;
      if (errorMessage.includes('structure')) return DELEGATION_ERROR_CODES.INVALID_ACT_STRUCTURE;
      if (errorMessage.includes('nested')) return DELEGATION_ERROR_CODES.INVALID_NESTED_ACT;
      if (errorMessage.includes('MCP') || errorMessage.includes('mcp')) {
        return DELEGATION_ERROR_CODES.INVALID_MCP_IDENTIFIER;
      }
    }
    
    if (errorMessage.includes('subject') && errorMessage.includes('preserved')) {
      return DELEGATION_ERROR_CODES.SUBJECT_NOT_PRESERVED;
    }
    
    if (errorMessage.includes('circular')) {
      return DELEGATION_ERROR_CODES.CIRCULAR_DELEGATION;
    }
    
    if (errorMessage.includes('chain') && errorMessage.includes('length')) {
      return DELEGATION_ERROR_CODES.CHAIN_TOO_LONG;
    }
    
    if (errorMessage.includes('identifier') && errorMessage.includes('format')) {
      return DELEGATION_ERROR_CODES.INVALID_IDENTIFIER_FORMAT;
    }
    
    if (errorMessage.includes('required') && errorMessage.includes('claim')) {
      return DELEGATION_ERROR_CODES.MISSING_REQUIRED_CLAIM;
    }
    
    return DELEGATION_ERROR_CODES.VALIDATION_FAILED;
  }

  /**
   * Send standardized error response
   */
  sendErrorResponse(res, errorCode, context = {}) {
    const status = DELEGATION_HTTP_STATUS[errorCode] || 500;
    
    const errorResponse = {
      error: errorCode,
      message: this.getErrorMessage(errorCode),
      timestamp: new Date().toISOString(),
      ...context
    };

    // Add warnings for non-error codes
    if (errorCode === DELEGATION_ERROR_CODES.LEGACY_IDENTIFIER_FORMAT) {
      errorResponse.warnings = ['Using legacy identifier format - consider migrating to standard format'];
    }

    res.status(status).json(errorResponse);
  }

  /**
   * Get error message for error code
   */
  getErrorMessage(errorCode) {
    const messages = {
      [DELEGATION_ERROR_CODES.INVALID_TOKEN_FORMAT]: 'Invalid token format',
      [DELEGATION_ERROR_CODES.MISSING_TOKEN]: 'Authentication token required',
      [DELEGATION_ERROR_CODES.TOKEN_DECODE_FAILED]: 'Failed to decode token',
      [DELEGATION_ERROR_CODES.MISSING_REQUIRED_CLAIM]: 'Missing required claim in token',
      [DELEGATION_ERROR_CODES.INVALID_CLAIM_STRUCTURE]: 'Invalid claim structure',
      [DELEGATION_ERROR_CODES.MALFORMED_CLAIM]: 'Malformed claim in token',
      [DELEGATION_ERROR_CODES.MISSING_MAY_ACT]: 'Missing may_act claim in user token',
      [DELEGATION_ERROR_CODES.INVALID_MAY_ACT_STRUCTURE]: 'Invalid may_act claim structure',
      [DELEGATION_ERROR_CODES.UNAUTHORIZED_AGENT]: 'Agent not authorized for delegation',
      [DELEGATION_ERROR_CODES.INVALID_AGENT_IDENTIFIER]: 'Invalid agent identifier format',
      [DELEGATION_ERROR_CODES.MISSING_ACT]: 'Missing act claim in exchanged token',
      [DELEGATION_ERROR_CODES.INVALID_ACT_STRUCTURE]: 'Invalid act claim structure',
      [DELEGATION_ERROR_CODES.INVALID_MCP_IDENTIFIER]: 'Invalid MCP server identifier format',
      [DELEGATION_ERROR_CODES.INVALID_NESTED_ACT]: 'Invalid nested act claim structure',
      [DELEGATION_ERROR_CODES.SUBJECT_NOT_PRESERVED]: 'Subject not preserved through delegation',
      [DELEGATION_ERROR_CODES.CIRCULAR_DELEGATION]: 'Circular delegation detected',
      [DELEGATION_ERROR_CODES.CHAIN_TOO_LONG]: 'Delegation chain too long',
      [DELEGATION_ERROR_CODES.MISSING_CHAIN_NODE]: 'Missing required node in delegation chain',
      [DELEGATION_ERROR_CODES.INVALID_IDENTIFIER_FORMAT]: 'Invalid identifier format',
      [DELEGATION_ERROR_CODES.LEGACY_IDENTIFIER_FORMAT]: 'Legacy identifier format detected',
      [DELEGATION_ERROR_CODES.IDENTIFIER_MAPPING_FAILED]: 'Failed to map legacy identifier',
      [DELEGATION_ERROR_CODES.VALIDATION_FAILED]: 'Delegation validation failed',
      [DELEGATION_ERROR_CODES.VALIDATION_TIMEOUT]: 'Validation timeout',
      [DELEGATION_ERROR_CODES.VALIDATION_ERROR]: 'Internal validation error'
    };

    return messages[errorCode] || 'Unknown delegation validation error';
  }

  /**
   * Log validation success
   */
  async logValidationSuccess(requestId, tokenType, validation, duration) {
    await writeExchangeEvent({
      type: 'delegation_validation_success',
      level: 'info',
      requestId,
      tokenType,
      valid: validation.valid,
      errors: validation.errors,
      warnings: validation.warnings,
      fixed: validation.fixed,
      duration,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Log validation error
   */
  async logValidationError(requestId, tokenType, error, duration) {
    await writeExchangeEvent({
      type: 'delegation_validation_error',
      level: 'error',
      requestId,
      tokenType,
      error: error.message,
      stack: error.stack,
      duration,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Log chain validation success
   */
  async logChainValidationSuccess(requestId, chainType, validation, duration) {
    await writeExchangeEvent({
      type: 'delegation_chain_validation_success',
      level: 'info',
      requestId,
      chainType,
      valid: validation.valid,
      errors: validation.errors,
      warnings: validation.warnings,
      chainLength: validation.chain?.length || 0,
      statistics: validation.chain ? this.chainService.getChainStatistics(validation.chain) : null,
      duration,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Log chain validation error
   */
  async logChainValidationError(requestId, chainType, error, duration) {
    await writeExchangeEvent({
      type: 'delegation_chain_validation_error',
      level: 'error',
      requestId,
      chainType,
      error: error.message,
      stack: error.stack,
      duration,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Clear validation cache
   */
  clearCache() {
    this.validationCache.clear();
    this.chainService.clearCache();
  }

  /**
   * Get cache statistics
   */
  getCacheStatistics() {
    return {
      validationCache: {
        size: this.validationCache.size,
        keys: Array.from(this.validationCache.keys())
      },
      chainService: this.chainService.getCacheStatistics()
    };
  }
}

module.exports = {
  DelegationValidationMiddleware,
  DELEGATION_ERROR_CODES,
  DELEGATION_HTTP_STATUS
};
