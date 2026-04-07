/**
 * Delegation Validation Middleware Tests
 * Comprehensive test suite for delegation claims validation middleware
 * 
 * Phase 58-05: Error Handling and Validation Middleware
 * Extensive testing for middleware, error handling, and validation
 */

const {
  DelegationValidationMiddleware,
  DELEGATION_ERROR_CODES,
  DELEGATION_HTTP_STATUS
} = require('../../middleware/delegationValidationMiddleware');

// Mock dependencies
jest.mock('../../services/exchangeAuditStore');
jest.mock('../../services/delegationClaimsService');
jest.mock('../../services/identityFormatStandardizationService');
jest.mock('../../services/delegationChainValidationService');

describe('Delegation Validation Middleware', () => {
  let middleware;
  let mockReq, mockRes, mockNext;

  beforeEach(() => {
    middleware = new DelegationValidationMiddleware();
    mockReq = {
      headers: {},
      body: {},
      query: {},
      user: {}
    };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
    mockNext = jest.fn();
    jest.clearAllMocks();
  });

  describe('Token Extraction', () => {
    test('should extract token from Authorization header', () => {
      mockReq.headers.authorization = 'Bearer test-token';
      
      const token = middleware.extractTokenFromRequest(mockReq);
      
      expect(token).toBe('test-token');
    });

    test('should extract token from request body', () => {
      mockReq.body.token = 'body-token';
      
      const token = middleware.extractTokenFromRequest(mockReq, 'token');
      
      expect(token).toBe('body-token');
    });

    test('should extract token from query parameter', () => {
      mockReq.query.token = 'query-token';
      
      const token = middleware.extractTokenFromRequest(mockReq, 'token');
      
      expect(token).toBe('query-token');
    });

    test('should extract token from custom headers', () => {
      mockReq.headers['x-access-token'] = 'custom-token';
      
      const token = middleware.extractTokenFromRequest(mockReq);
      
      expect(token).toBe('custom-token');
    });

    test('should return null when no token found', () => {
      const token = middleware.extractTokenFromRequest(mockReq);
      
      expect(token).toBeNull();
    });

    test('should handle malformed Authorization header', () => {
      mockReq.headers.authorization = 'InvalidFormat token';
      
      const token = middleware.extractTokenFromRequest(mockReq);
      
      expect(token).toBeNull();
    });
  });

  describe('JWT Token Decoding', () => {
    test('should decode valid JWT token', () => {
      const validToken = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyLTEyMzQ1IiwiYXVkIjpbImJhbmtpbmctYXBpIl19.SflKxwRJSMeQ98PjmYQhQjFzLhOA-7h5aYFFI';
      
      const claims = middleware.decodeTokenClaims(validToken);
      
      expect(claims.sub).toBe('user-12345');
      expect(claims.aud).toEqual(['banking-api']);
    });

    test('should reject invalid JWT format', () => {
      const invalidToken = 'invalid.jwt.format';
      
      expect(() => {
        middleware.decodeTokenClaims(invalidToken);
      }).toThrow('Failed to decode token claims: Invalid JWT format');
    });

    test('should reject malformed JWT payload', () => {
      const malformedToken = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.invalid-payload.SflKxwRJSMeQ98PjmYQhQjFzLhOA-7h5aYFFI';
      
      expect(() => {
        middleware.decodeTokenClaims(malformedToken);
      }).toThrow('Failed to decode token claims');
    });
  });

  describe('Delegation Claims Validation Middleware', () => {
    test('should validate user token successfully', async () => {
      const validToken = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyLTEyMzQ1IiwibWF5X2FjdCI6eyJzdWIiOiJodHRwczovL2JhbmtpbmctYWdlbnQucGluZ2RlbW8uY29tL2FnZW50L3Rlc3QtYWdlbnQifX0.SflKxwRJSMeQ98PjmYQhQjFzLhOA-7h5aYFFI';
      mockReq.headers.authorization = `Bearer ${validToken}`;
      
      // Mock successful validation
      const { validateDelegationClaims } = require('../../services/delegationClaimsService');
      validateDelegationClaims.mockReturnValue({
        valid: true,
        errors: [],
        warnings: [],
        normalized: { sub: 'user-12345', may_act: { sub: 'https://banking-agent.pingdemo.com/agent/test-agent' } }
      });

      const middlewareFn = middleware.validateDelegationClaims('user');
      await middlewareFn(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(req.delegationValidation).toBeDefined();
      expect(req.tokenClaims).toBeDefined();
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    test('should reject request with missing token', async () => {
      const middlewareFn = middleware.validateDelegationClaims('user');
      await middlewareFn(mockReq, mockRes, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: DELEGATION_ERROR_CODES.MISSING_TOKEN,
          message: 'Authentication token required'
        })
      );
    });

    test('should reject request with invalid token', async () => {
      mockReq.headers.authorization = 'Bearer invalid.jwt.token';
      
      const middlewareFn = middleware.validateDelegationClaims('user');
      await middlewareFn(mockReq, mockRes, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: DELEGATION_ERROR_CODES.TOKEN_DECODE_FAILED,
          message: 'Failed to decode token'
        })
      );
    });

    test('should reject request with validation errors', async () => {
      const validToken = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyLTEyMzQ1In0.SflKxwRJSMeQ98PjmYQhQjFzLhOA-7h5aYFFI';
      mockReq.headers.authorization = `Bearer ${validToken}`;
      
      // Mock validation failure - set up before creating middleware
      const { validateDelegationClaims } = require('../../services/delegationClaimsService');
      validateDelegationClaims.mockReturnValue({
        valid: false,
        errors: ['Missing may_act claim'],
        warnings: []
      });

      // Create fresh middleware instance with mocks in place
      const freshMiddleware = new DelegationValidationMiddleware();
      const middlewareFn = freshMiddleware.validateDelegationClaims('user');
      try {
        await middlewareFn(mockReq, mockRes, mockNext);
      } catch (e) {
        console.log('DEBUG: Caught exception:', e);
      }

      expect(mockNext).not.toHaveBeenCalled();
      
      // Debug: check what was actually called
      console.log('DEBUG: status calls:', mockRes.status.mock.calls);
      console.log('DEBUG: json calls:', mockRes.json.mock.calls);
      
      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: DELEGATION_ERROR_CODES.MISSING_MAY_ACT,
          message: 'Missing may_act claim in user token',
          errors: ['Missing may_act claim']
        })
      );
    });

    test('should handle validation exceptions gracefully', async () => {
      const validToken = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyLTEyMzQ1In0.SflKxwRJSMeQ98PjmYQhQjFzLhOA-7h5aYFFI';
      mockReq.headers.authorization = `Bearer ${validToken}`;
      
      // Mock validation exception
      const { validateDelegationClaims } = require('../../services/delegationClaimsService');
      validateDelegationClaims.mockImplementation(() => {
        throw new Error('Validation service error');
      });

      const middlewareFn = middleware.validateDelegationClaims('user');
      await middlewareFn(mockReq, mockRes, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: DELEGATION_ERROR_CODES.VALIDATION_ERROR,
          message: 'Internal validation error'
        })
      );
    });
  });

  describe('User Token Specific Validation', () => {
    test('should validate user token specific claims', async () => {
      const claims = {
        sub: 'user-12345',
        may_act: { sub: 'https://banking-agent.pingdemo.com/agent/test-agent' },
        aud: ['banking-api'],
        iss: 'https://auth.pingone.com/123456/as',
        exp: Date.now() / 1000 + 3600 // 1 hour from now
      };

      const validation = { valid: true, errors: [], warnings: [] };
      
      await middleware.validateUserTokenSpecifics(claims, validation);

      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    test('should reject expired user token', async () => {
      const claims = {
        sub: 'user-12345',
        may_act: { sub: 'https://banking-agent.pingdemo.com/agent/test-agent' },
        aud: ['banking-api'],
        iss: 'https://auth.pingone.com/123456/as',
        exp: Date.now() / 1000 - 3600 // 1 hour ago
      };

      const validation = { valid: true, errors: [], warnings: [] };
      
      await middleware.validateUserTokenSpecifics(claims, validation);

      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('User token has expired');
    });

    test('should warn about unexpected issuer', async () => {
      const claims = {
        sub: 'user-12345',
        may_act: { sub: 'https://banking-agent.pingdemo.com/agent/test-agent' },
        aud: ['banking-api'],
        iss: 'https://unexpected-issuer.com',
        exp: Date.now() / 1000 + 3600
      };

      const validation = { valid: true, errors: [], warnings: [] };
      
      await middleware.validateUserTokenSpecifics(claims, validation);

      expect(validation.valid).toBe(true);
      expect(validation.warnings).toContain('Unexpected token issuer');
    });

    test('should reject missing required user token claims', async () => {
      const claims = {
        sub: 'user-12345',
        may_act: { sub: 'https://banking-agent.pingdemo.com/agent/test-agent' }
        // Missing aud, iss, exp
      };

      const validation = { valid: true, errors: [], warnings: [] };
      
      await middleware.validateUserTokenSpecifics(claims, validation);

      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('Missing required user token claim: aud');
      expect(validation.errors).toContain('Missing required user token claim: iss');
      expect(validation.errors).toContain('Missing required user token claim: exp');
    });
  });

  describe('Exchanged Token Specific Validation', () => {
    test('should validate exchanged token specific claims', async () => {
      const claims = {
        sub: 'user-12345',
        act: {
          sub: 'https://mcp-server.pingdemo.com/mcp/test-mcp',
          act: { sub: 'https://banking-agent.pingdemo.com/agent/test-agent' }
        },
        aud: 'https://mcp-server.pingdemo.com'
      };

      const validation = { valid: true, errors: [], warnings: [] };
      
      await middleware.validateExchangedTokenSpecifics(claims, validation);

      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    test('should reject missing required exchanged token claims', async () => {
      const claims = {
        sub: 'user-12345'
        // Missing act, aud
      };

      const validation = { valid: true, errors: [], warnings: [] };
      
      await middleware.validateExchangedTokenSpecifics(claims, validation);

      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('Missing required exchanged token claim: act');
      expect(validation.errors).toContain('Missing required exchanged token claim: aud');
    });

    test('should reject malformed act claim', async () => {
      const claims = {
        sub: 'user-12345',
        act: 'invalid-string', // Should be object
        aud: 'https://mcp-server.pingdemo.com'
      };

      const validation = { valid: true, errors: [], warnings: [] };
      
      await middleware.validateExchangedTokenSpecifics(claims, validation);

      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('Missing sub in act claim');
    });

    test('should reject malformed nested act claim', async () => {
      const claims = {
        sub: 'user-12345',
        act: {
          sub: 'https://mcp-server.pingdemo.com/mcp/test-mcp',
          act: 'invalid-string' // Should be object
        },
        aud: 'https://mcp-server.pingdemo.com'
      };

      const validation = { valid: true, errors: [], warnings: [] };
      
      await middleware.validateExchangedTokenSpecifics(claims, validation);

      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('Missing sub in nested act claim');
    });

    test('should warn about unexpected audience', async () => {
      const claims = {
        sub: 'user-12345',
        act: {
          sub: 'https://mcp-server.pingdemo.com/mcp/test-mcp'
        },
        aud: 'https://unexpected-audience.com'
      };

      const validation = { valid: true, errors: [], warnings: [] };
      
      await middleware.validateExchangedTokenSpecifics(claims, validation);

      expect(validation.valid).toBe(true);
      expect(validation.warnings).toContain('Unexpected audience in exchanged token');
    });
  });

  describe('Error Code Mapping', () => {
    test('should map may_act errors correctly', () => {
      expect(middleware.getErrorCode('missing may_act claim')).toBe(DELEGATION_ERROR_CODES.MISSING_MAY_ACT);
      expect(middleware.getErrorCode('invalid may_act structure')).toBe(DELEGATION_ERROR_CODES.INVALID_MAY_ACT_STRUCTURE);
      expect(middleware.getErrorCode('agent not authorized')).toBe(DELEGATION_ERROR_CODES.UNAUTHORIZED_AGENT);
      expect(middleware.getErrorCode('invalid agent identifier')).toBe(DELEGATION_ERROR_CODES.INVALID_AGENT_IDENTIFIER);
    });

    test('should map act errors correctly', () => {
      expect(middleware.getErrorCode('missing act claim')).toBe(DELEGATION_ERROR_CODES.MISSING_ACT);
      expect(middleware.getErrorCode('invalid act structure')).toBe(DELEGATION_ERROR_CODES.INVALID_ACT_STRUCTURE);
      expect(middleware.getErrorCode('invalid nested act')).toBe(DELEGATION_ERROR_CODES.INVALID_NESTED_ACT);
      expect(middleware.getErrorCode('invalid mcp identifier')).toBe(DELEGATION_ERROR_CODES.INVALID_MCP_IDENTIFIER);
    });

    test('should map chain validation errors correctly', () => {
      expect(middleware.getErrorCode('subject not preserved')).toBe(DELEGATION_ERROR_CODES.SUBJECT_NOT_PRESERVED);
      expect(middleware.getErrorCode('circular delegation')).toBe(DELEGATION_ERROR_CODES.CIRCULAR_DELEGATION);
      expect(middleware.getErrorCode('chain too long')).toBe(DELEGATION_ERROR_CODES.CHAIN_TOO_LONG);
    });

    test('should map general errors correctly', () => {
      expect(middleware.getErrorCode('missing required claim')).toBe(DELEGATION_ERROR_CODES.MISSING_REQUIRED_CLAIM);
      expect(middleware.getErrorCode('invalid identifier format')).toBe(DELEGATION_ERROR_CODES.INVALID_IDENTIFIER_FORMAT);
      expect(middleware.getErrorCode('unknown error')).toBe(DELEGATION_ERROR_CODES.VALIDATION_FAILED);
    });
  });

  describe('Error Response Generation', () => {
    test('should generate standardized error response', () => {
      const context = { requestId: 'req-123', tokenType: 'user' };
      
      middleware.sendErrorResponse(mockRes, DELEGATION_ERROR_CODES.MISSING_TOKEN, context);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: DELEGATION_ERROR_CODES.MISSING_TOKEN,
        message: 'Authentication token required',
        timestamp: expect.any(String),
        requestId: 'req-123',
        tokenType: 'user'
      });
    });

    test('should handle legacy identifier format as warning', () => {
      middleware.sendErrorResponse(mockRes, DELEGATION_ERROR_CODES.LEGACY_IDENTIFIER_FORMAT, {});

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: DELEGATION_ERROR_CODES.LEGACY_IDENTIFIER_FORMAT,
          warnings: ['Using legacy identifier format - consider migrating to standard format']
        })
      );
    });

    test('should use default status for unknown error codes', () => {
      middleware.sendErrorResponse(mockRes, 'UNKNOWN_ERROR_CODE', {});

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'UNKNOWN_ERROR_CODE',
          message: 'Unknown delegation validation error'
        })
      );
    });
  });

  describe('Error Message Generation', () => {
    test('should generate appropriate error messages', () => {
      expect(middleware.getErrorMessage(DELEGATION_ERROR_CODES.MISSING_TOKEN)).toBe('Authentication token required');
      expect(middleware.getErrorMessage(DELEGATION_ERROR_CODES.INVALID_MAY_ACT_STRUCTURE)).toBe('Invalid may_act claim structure');
      expect(middleware.getErrorMessage(DELEGATION_ERROR_CODES.CIRCULAR_DELEGATION)).toBe('Circular delegation detected');
      expect(middleware.getErrorMessage('UNKNOWN_CODE')).toBe('Unknown delegation validation error');
    });
  });

  describe('Delegation Chain Validation Middleware', () => {
    test('should validate delegation chain successfully', async () => {
      const userToken = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyLTEyMzQ1IiwibWF5X2FjdCI6eyJzdWIiOiJodHRwczovL2JhbmtpbmctYWdlbnQucGluZ2RlbW8uY29tL2FnZW50L3Rlc3QtYWdlbnQifX0.SflKxwRJSMeQ98PjmYQhQjFzLhOA-7h5aYFFI';
      const exchangedToken = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyLTEyMzQ1IiwiYWN0Ijp7InN1YiI6Imh0dHBzOi8vbWNwLXNlcnZlci5waW5nZGVtby5jb20vbWNwL3Rlc3QtbWNwIn19.SflKxwRJSMeQ98PjmYQhQjFzLhOA-7h5aYFFI';
      
      mockReq.body.user_token = userToken;
      mockReq.body.exchanged_token = exchangedToken;
      
      // Mock successful chain validation
      const { DelegationChainValidationService } = require('../../services/delegationChainValidationService');
      const mockChainService = new DelegationChainValidationService();
      mockChainService.validateDelegationChain = jest.fn().mockResolvedValue({
        valid: true,
        errors: [],
        warnings: [],
        chain: []
      });
      middleware.chainService = mockChainService;

      const middlewareFn = middleware.validateDelegationChain('single_exchange');
      await middlewareFn(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(req.chainValidation).toBeDefined();
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    test('should reject missing tokens for chain validation', async () => {
      const middlewareFn = middleware.validateDelegationChain('single_exchange');
      await middlewareFn(mockReq, mockRes, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: DELEGATION_ERROR_CODES.MISSING_TOKEN,
          message: 'Authentication token required',
          missingTokens: {
            userToken: true,
            exchangedToken: true
          }
        })
      );
    });

    test('should reject chain validation errors', async () => {
      const userToken = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyLTEyMzQ1IiwibWF5X2FjdCI6eyJzdWIiOiJodHRwczovL2JhbmtpbmctYWdlbnQucGluZ2RlbW8uY29tL2FnZW50L3Rlc3QtYWdlbnQifX0.SflKxwRJSMeQ98PjmYQhQjFzLhOA-7h5aYFFI';
      const exchangedToken = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkaWZmZXJlbnQtdXNlciIsImFjdCI6eyJzdWIiOiJodHRwczovL21jcC1zZXJ2ZXIucGluZ2RlbW8uY29tL21jcC90ZXN0LW1jcCJ9fQ.SflKxwRJSMeQ98PjmYQhQjFzLhOA-7h5aYFFI';
      
      mockReq.body.user_token = userToken;
      mockReq.body.exchanged_token = exchangedToken;
      
      // Mock chain validation failure
      const { DelegationChainValidationService } = require('../../services/delegationChainValidationService');
      const mockChainService = new DelegationChainValidationService();
      mockChainService.validateDelegationChain = jest.fn().mockResolvedValue({
        valid: false,
        errors: ['Subject not preserved: expected user-12345, got different-user'],
        warnings: [],
        chain: []
      });
      middleware.chainService = mockChainService;

      const middlewareFn = middleware.validateDelegationChain('single_exchange');
      await middlewareFn(mockReq, mockRes, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: DELEGATION_ERROR_CODES.SUBJECT_NOT_PRESERVED,
          message: 'Subject not preserved through delegation',
          errors: ['Subject not preserved: expected user-12345, got different-user']
        })
      );
    });
  });

  describe('Caching', () => {
    test('should cache validation results', async () => {
      const validToken = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyLTEyMzQ1IiwibWF5X2FjdCI6eyJzdWIiOiJodHRwczovL2JhbmtpbmctYWdlbnQucGluZ2RlbW8uY29tL2FnZW50L3Rlc3QtYWdlbnQifX0.SflKxwRJSMeQ98PjmYQhQjFzLhOA-7h5aYFFI';
      mockReq.headers.authorization = `Bearer ${validToken}`;
      mockReq.headers['x-request-id'] = 'req-123';
      
      // Mock successful validation
      const { validateDelegationClaims } = require('../../services/delegationClaimsService');
      validateDelegationClaims.mockReturnValue({
        valid: true,
        errors: [],
        warnings: [],
        normalized: { sub: 'user-12345', may_act: { sub: 'https://banking-agent.pingdemo.com/agent/test-agent' } }
      });

      // First call
      const middlewareFn = middleware.validateDelegationClaims('user');
      await middlewareFn(mockReq, mockRes, mockNext);

      expect(validateDelegationClaims).toHaveBeenCalledTimes(1);

      // Reset mocks
      mockNext.mockClear();
      validateDelegationClaims.mockClear();

      // Second call (should use cache)
      await middlewareFn(mockReq, mockRes, mockNext);

      expect(validateDelegationClaims).toHaveBeenCalledTimes(0); // Should not be called due to cache
      expect(mockNext).toHaveBeenCalled();
    });

    test('should clear cache', () => {
      middleware.validationCache.set('test-key', { valid: true });
      middleware.chainService.validationCache.set('chain-key', { valid: true });

      expect(middleware.validationCache.size).toBe(1);
      expect(middleware.chainService.validationCache.size).toBe(1);

      middleware.clearCache();

      expect(middleware.validationCache.size).toBe(0);
      expect(middleware.chainService.validationCache.size).toBe(0);
    });

    test('should provide cache statistics', () => {
      middleware.validationCache.set('key1', { valid: true });
      middleware.validationCache.set('key2', { valid: false });
      middleware.chainService.validationCache.set('chain-key', { valid: true });

      const stats = middleware.getCacheStatistics();

      expect(stats.validationCache.size).toBe(2);
      expect(stats.validationCache.keys).toEqual(['key1', 'key2']);
      expect(stats.chainService.size).toBe(1);
      expect(stats.chainService.keys).toEqual(['chain-key']);
    });
  });

  describe('Convenience Methods', () => {
    test('should provide user token validation middleware', () => {
      const userMiddleware = middleware.validateUserToken();
      expect(typeof userMiddleware).toBe('function');
    });

    test('should provide exchanged token validation middleware', () => {
      const exchangedMiddleware = middleware.validateExchangedToken();
      expect(typeof exchangedMiddleware).toBe('function');
    });
  });

  describe('Constants', () => {
    test('should have correct error codes', () => {
      expect(DELEGATION_ERROR_CODES.MISSING_TOKEN).toBe('DELEGATION_002');
      expect(DELEGATION_ERROR_CODES.MISSING_MAY_ACT).toBe('DELEGATION_020');
      expect(DELEGATION_ERROR_CODES.CIRCULAR_DELEGATION).toBe('DELEGATION_041');
    });

    test('should have correct HTTP status mappings', () => {
      expect(DELEGATION_HTTP_STATUS[DELEGATION_ERROR_CODES.MISSING_TOKEN]).toBe(401);
      expect(DELEGATION_HTTP_STATUS[DELEGATION_ERROR_CODES.UNAUTHORIZED_AGENT]).toBe(403);
      expect(DELEGATION_HTTP_STATUS[DELEGATION_ERROR_CODES.VALIDATION_ERROR]).toBe(500);
    });
  });

  describe('Configuration Options', () => {
    test('should accept custom configuration', () => {
      const customMiddleware = new DelegationValidationMiddleware({
        strict: false,
        autoFix: true,
        timeout: 10000,
        enableCaching: false,
        enableAuditLogging: false,
        enableMonitoring: false
      });

      expect(customMiddleware.options.strict).toBe(false);
      expect(customMiddleware.options.autoFix).toBe(true);
      expect(customMiddleware.options.timeout).toBe(10000);
      expect(customMiddleware.options.enableCaching).toBe(false);
      expect(customMiddleware.options.enableAuditLogging).toBe(false);
      expect(customMiddleware.options.enableMonitoring).toBe(false);
    });

    test('should use default configuration', () => {
      expect(middleware.options.strict).toBe(true);
      expect(middleware.options.autoFix).toBe(false);
      expect(middleware.options.timeout).toBe(5000);
      expect(middleware.options.enableCaching).toBe(true);
      expect(middleware.options.enableAuditLogging).toBe(true);
      expect(middleware.options.enableMonitoring).toBe(true);
    });
  });
});
