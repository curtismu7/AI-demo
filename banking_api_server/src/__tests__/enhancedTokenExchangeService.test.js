/**
 * Enhanced Token Exchange Service Tests
 * Comprehensive test suite for RFC 8693 act claim structure validation
 * 
 * Phase 58-02: Exchanged Token act Claim Structure
 * Extensive testing for enhanced token exchange with proper delegation claims
 */

const { EnhancedTokenExchangeService } = require('../../services/enhancedTokenExchangeService');

// Mock dependencies
jest.mock('../../services/exchangeAuditStore');
jest.mock('../../services/delegationClaimsService', () => ({
  validateExchangedTokenAct: jest.fn(),
  validateDelegationChain: jest.fn(),
  validateIdentifierFormat: jest.fn()
}));

const mockOAuthService = {
  performTokenExchange: jest.fn(),
  performTokenExchangeWithActor: jest.fn(),
  getClientCredentialsTokenAs: jest.fn()
};

describe('Enhanced Token Exchange Service', () => {
  let enhancedService;

  beforeEach(() => {
    enhancedService = new EnhancedTokenExchangeService(mockOAuthService);
    jest.clearAllMocks();
  });

  describe('Basic Token Exchange', () => {
    test('should perform enhanced token exchange successfully', async () => {
      const subjectToken = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyLTEyMzQ1IiwibWF5X2FjdCI6eyJzdWIiOiJodHRwczovL2JhbmtpbmctYWdlbnQucGluZ2RlbW8uY29tL2FnZW50L3Rlc3QtYWdlbnQifX0.SflKxwRJSMeQ98PjmYQhQjFzLhOA-7h5aYFFI';
      const audience = 'https://mcp-server.pingdemo.com';
      const scopes = ['banking:read', 'banking:write'];
      
      const exchangedToken = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyLTEyMzQ1IiwiYWN0Ijp7InN1YiI6Imh0dHBzOi8vbWNwLXNlcnZlci5waW5nZGVtby5jb20vbWNwL3Rlc3QtbWNwIn19.SflKxwRJSMeQ98PjmYQhQjFzLhOA-7h5aYFFI';
      
      mockOAuthService.performTokenExchange.mockResolvedValue(exchangedToken);
      
      // Mock delegation claims validation
      const { validateExchangedTokenAct, validateDelegationChain, validateIdentifierFormat } = require('../../services/delegationClaimsService');
      validateExchangedTokenAct.mockReturnValue({
        valid: true,
        errors: [],
        warnings: [],
        normalized: null
      });
      validateDelegationChain.mockReturnValue({
        valid: true,
        errors: [],
        warnings: []
      });
      validateIdentifierFormat.mockImplementation((id, type) => ({
        valid: true,
        identifier: id,
        format: 'standard'
      }));

      const result = await enhancedService.performEnhancedTokenExchange(
        subjectToken,
        audience,
        scopes
      );

      expect(result.token).toBe(exchangedToken);
      expect(result.exchangeMethod).toBe('subject-only');
      expect(result.validated).toBe(true);
      expect(mockOAuthService.performTokenExchange).toHaveBeenCalledWith(
        subjectToken,
        audience,
        scopes
      );
    });

    test('should perform token exchange with actor token', async () => {
      const subjectToken = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyLTEyMzQ1IiwibWF5X2FjdCI6eyJzdWIiOiJodHRwczovL2JhbmtpbmctYWdlbnQucGluZ2RlbW8uY29tL2FnZW50L3Rlc3QtYWdlbnQifX0.SflKxwRJSMeQ98PjmYQhQjFzLhOA-7h5aYFFI';
      const actorToken = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJjbGllbnRfaWQiOiJhZ2VudC1jbGllbnQiLCJzdWIiOiJhZ2VudC1jbGllbnQifQ.SflKxwRJSMeQ98PjmYQhQjFzLhOA-7h5aYFFI';
      const audience = 'https://mcp-server.pingdemo.com';
      const scopes = ['banking:read'];
      
      const exchangedToken = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyLTEyMzQ1IiwiYWN0Ijp7InN1YiI6Imh0dHBzOi8vbWNwLXNlcnZlci5waW5nZGVtby5jb20vbWNwL3Rlc3QtbWNwIiwiYWN0Ijp7InN1YiI6Imh0dHBzOi8vYWdlbnQtZ2F0ZXdheS5waW5nZGVtby5jb20vYWdlbnQvYWdlbnQtY2xpZW50In19fQ.SflKxwRJSMeQ98PjmYQhQjFzLhOA-7h5aYFFI';
      
      mockOAuthService.performTokenExchangeWithActor.mockResolvedValue(exchangedToken);
      
      // Mock delegation claims validation
      const { validateExchangedTokenAct, validateDelegationChain, validateIdentifierFormat } = require('../../services/delegationClaimsService');
      validateExchangedTokenAct.mockReturnValue({
        valid: true,
        errors: [],
        warnings: [],
        normalized: null
      });
      validateDelegationChain.mockReturnValue({
        valid: true,
        errors: [],
        warnings: []
      });
      validateIdentifierFormat.mockImplementation((id, type) => ({
        valid: true,
        identifier: id,
        format: 'standard'
      }));

      const result = await enhancedService.performEnhancedTokenExchange(
        subjectToken,
        audience,
        scopes,
        { actorToken, constructNestedAct: true }
      );

      expect(result.token).toBe(exchangedToken);
      expect(result.exchangeMethod).toBe('with-actor-nested');
      expect(result.validated).toBe(true);
      expect(mockOAuthService.performTokenExchangeWithActor).toHaveBeenCalledWith(
        subjectToken,
        actorToken,
        audience,
        scopes
      );
    });

    test('should reject token exchange when subject is not preserved', async () => {
      const subjectToken = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyLTEyMzQ1IiwibWF5X2FjdCI6eyJzdWIiOiJodHRwczovL2JhbmtpbmctYWdlbnQucGluZ2RlbW8uY29tL2FnZW50L3Rlc3QtYWdlbnQifX0.SflKxwRJSMeQ98PjmYQhQjFzLhOA-7h5aYFFI';
      const audience = 'https://mcp-server.pingdemo.com';
      const scopes = ['banking:read'];
      
      // Token with different subject (not preserved)
      const exchangedToken = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkaWZmZXJlbnQtdXNlciIsImFjdCI6eyJzdWIiOiJodHRwczovL21jcC1zZXJ2ZXIucGluZ2RlbW8uY29tL21jcC90ZXN0LW1jcCJ9fQ.SflKxwRJSMeQ98PjmYQhQjFzLhOA-7h5aYFFI';
      
      mockOAuthService.performTokenExchange.mockResolvedValue(exchangedToken);

      await expect(enhancedService.performEnhancedTokenExchange(
        subjectToken,
        audience,
        scopes,
        { preserveSubject: true }
      )).rejects.toThrow('Subject not preserved: expected user-12345, got different-user');
    });

    test('should handle token exchange validation errors', async () => {
      const subjectToken = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyLTEyMzQ1IiwibWF5X2FjdCI6eyJzdWIiOiJodHRwczovL2JhbmtpbmctYWdlbnQucGluZ2RlbW8uY29tL2FnZW50L3Rlc3QtYWdlbnQifX0.SflKxwRJSMeQ98PjmYQhQjFzLhOA-7h5aYFFI';
      const audience = 'https://mcp-server.pingdemo.com';
      const scopes = ['banking:read'];
      
      const exchangedToken = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyLTEyMzQ1IiwiYWN0Ijp7InN1YiI6Imh0dHBzOi8vbWNwLXNlcnZlci5waW5nZGVtby5jb20vbWNwL3Rlc3QtbWNwIn19.SflKxwRJSMeQ98PjmYQhQjFzLhOA-7h5aYFFI';
      
      mockOAuthService.performTokenExchange.mockResolvedValue(exchangedToken);
      
      // Mock validation failure
      const { validateExchangedTokenAct } = require('../../services/delegationClaimsService');
      validateExchangedTokenAct.mockReturnValue({
        valid: false,
        errors: ['Invalid act claim structure'],
        warnings: [],
        normalized: null
      });

      const result = await enhancedService.performEnhancedTokenExchange(
        subjectToken,
        audience,
        scopes
      );

      expect(result.validated).toBe(false);
      expect(result.claims.errors).toContain('Invalid act claim structure');
    });
  });

  describe('Nested Act Claim Construction', () => {
    test('should construct proper nested act claim', () => {
      const audience = 'https://mcp-server.pingdemo.com/mcp/test-mcp';
      const actorClaims = {
        client_id: 'agent-client-123',
        sub: 'https://agent-gateway.pingdemo.com/agent/test-agent'
      };
      const subjectClaims = {
        sub: 'user-12345',
        may_act: {
          sub: 'https://banking-agent.pingdemo.com/agent/test-agent'
        }
      };

      const result = enhancedService.constructNestedActClaim(
        audience,
        actorClaims,
        subjectClaims
      );

      expect(result).toEqual({
        sub: 'https://mcp-server.pingdemo.com/mcp/test-mcp',
        act: {
          sub: 'https://agent-gateway.pingdemo.com/agent/test-agent',
          client_id: 'agent-client-123',
          may_act: {
            sub: 'https://banking-agent.pingdemo.com/agent/test-agent'
          }
        }
      });
    });

    test('should handle minimal actor claims', () => {
      const audience = 'https://mcp-server.pingdemo.com/mcp/test-mcp';
      const actorClaims = {
        sub: 'https://agent-gateway.pingdemo.com/agent/test-agent'
      };
      const subjectClaims = {
        sub: 'user-12345'
      };

      const result = enhancedService.constructNestedActClaim(
        audience,
        actorClaims,
        subjectClaims
      );

      expect(result).toEqual({
        sub: 'https://mcp-server.pingdemo.com/mcp/test-mcp',
        act: {
          sub: 'https://agent-gateway.pingdemo.com/agent/test-agent'
        }
      });
    });

    test('should standardize identifiers', () => {
      const audience = 'legacy-mcp';
      const actorClaims = {
        client_id: 'legacy-agent'
      };
      const subjectClaims = { sub: 'user-12345' };

      // Mock identifier validation
      const { validateIdentifierFormat } = require('../../services/delegationClaimsService');
      validateIdentifierFormat.mockImplementation((id, type) => ({
        valid: true,
        identifier: id,
        format: 'legacy',
        mapped: `https://${type}.pingdemo.com/${type}/${id}`
      }));

      const result = enhancedService.constructNestedActClaim(
        audience,
        actorClaims,
        subjectClaims
      );

      expect(result.sub).toBe('https://mcp_server.pingdemo.com/mcp_server/legacy-mcp');
      expect(result.act.sub).toBe('https://agent.pingdemo.com/agent/legacy-agent');
    });
  });

  describe('Two-Exchange Delegation', () => {
    test('should perform complete two-exchange delegation', async () => {
      const userToken = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyLTEyMzQ1IiwibWF5X2FjdCI6eyJzdWIiOiJodHRwczovL2JhbmtpbmctYWdlbnQucGluZ2RlbW8uY29tL2FnZW50L3Rlc3QtYWdlbnQifX0.SflKxwRJSMeQ98PjmYQhQjFzLhOA-7h5aYFFI';
      const agentClientId = 'agent-client-123';
      const agentClientSecret = 'agent-secret';
      const mcpClientId = 'mcp-client-456';
      const mcpClientSecret = 'mcp-secret';
      const mcpResourceUri = 'https://mcp-server.pingdemo.com';
      const scopes = ['banking:read'];

      // Mock token responses
      const agentActorToken = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJjbGllbnRfaWQiOiJhZ2VudC1jbGllbnQtMTIzIn0.SflKxwRJSMeQ98PjmYQhQjFzLhOA-7h5aYFFI';
      const agentExchangedToken = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyLTEyMzQ1IiwiYWN0Ijp7InN1YiI6Imh0dHBzOi8vbWNwLXNlcnZlci5waW5nZGVtby5jb20vbWNwL3Rlc3QtbWNwIn19.SflKxwRJSMeQ98PjmYQhQjFzLhOA-7h5aYFFI';
      const mcpActorToken = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJjbGllbnRfaWQiOiJtY3AtY2xpZW50LTQ1NiJ9.SflKxwRJSMeQ98PjmYQhQjFzLhOA-7h5aYFFI';
      const finalToken = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyLTEyMzQ1IiwiYWN0Ijp7InN1YiI6Imh0dHBzOi8vbWNwLXNlcnZlci5waW5nZGVtby5jb20vbWNwL3Rlc3QtbWNwIiwiYWN0Ijp7InN1YiI6Imh0dHBzOi8vYWdlbnQtZ2F0ZXdheS5waW5nZGVtby5jb20vYWdlbnQvYWdlbnQtY2xpZW50In19fQ.SflKxwRJSMeQ98PjmYQhQjFzLhOA-7h5aYFFI';

      mockOAuthService.getClientCredentialsTokenAs
        .mockResolvedValueOnce(agentActorToken)
        .mockResolvedValueOnce(mcpActorToken);

      // Mock enhanced token exchange calls
      const originalPerformEnhanced = enhancedService.performEnhancedTokenExchange;
      enhancedService.performEnhancedTokenExchange = jest.fn()
        .mockResolvedValueOnce({ token: agentExchangedToken, claims: { sub: 'user-12345' } })
        .mockResolvedValueOnce({ token: finalToken, claims: { sub: 'user-12345' } });

      // Mock delegation chain validation
      const { validateDelegationChain } = require('../../services/delegationClaimsService');
      validateDelegationChain.mockReturnValue({
        valid: true,
        errors: [],
        warnings: []
      });

      const result = await enhancedService.performTwoExchangeDelegation(
        userToken,
        agentClientId,
        agentClientSecret,
        mcpClientId,
        mcpClientSecret,
        mcpResourceUri,
        scopes
      );

      expect(result.token).toBe(finalToken);
      expect(result.exchangeSteps).toHaveLength(4);
      expect(result.chainValidation.valid).toBe(true);
      expect(mockOAuthService.getClientCredentialsTokenAs).toHaveBeenCalledTimes(2);

      // Restore original method
      enhancedService.performEnhancedTokenExchange = originalPerformEnhanced;
    });

    test('should handle two-exchange delegation errors', async () => {
      const userToken = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyLTEyMzQ1IiwibWF5X2FjdCI6eyJzdWIiOiJodHRwczovL2JhbmtpbmctYWdlbnQucGluZ2RlbW8uY29tL2FnZW50L3Rlc3QtYWdlbnQifX0.SflKxwRJSMeQ98PjmYQhQjFzLhOA-7h5aYFFI';
      
      mockOAuthService.getClientCredentialsTokenAs.mockRejectedValue(
        new Error('Agent client credentials failed')
      );

      await expect(enhancedService.performTwoExchangeDelegation(
        userToken,
        'agent-client',
        'agent-secret',
        'mcp-client',
        'mcp-secret',
        'https://mcp-server.pingdemo.com',
        ['banking:read']
      )).rejects.toThrow('Agent client credentials failed');
    });
  });

  describe('Token Validation', () => {
    test('should validate existing exchange results', () => {
      const userToken = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyLTEyMzQ1IiwibWF5X2FjdCI6eyJzdWIiOiJodHRwczovL2JhbmtpbmctYWdlbnQucGluZ2RlbW8uY29tL2FnZW50L3Rlc3QtYWdlbnQifX0.SflKxwRJSMeQ98PjmYQhQjFzLhOA-7h5aYFFI';
      const exchangedToken = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyLTEyMzQ1IiwiYWN0Ijp7InN1YiI6Imh0dHBzOi8vbWNwLXNlcnZlci5waW5nZGVtby5jb20vbWNwL3Rlc3QtbWNwIn19.SflKxwRJSMeQ98PjmYQhQjFzLhOA-7h5aYFFI';

      // Mock validation functions
      const { validateExchangedTokenAct, validateDelegationChain } = require('../../services/delegationClaimsService');
      validateExchangedTokenAct.mockReturnValue({
        valid: true,
        errors: [],
        warnings: []
      });
      validateDelegationChain.mockReturnValue({
        valid: true,
        errors: [],
        warnings: []
      });

      const result = enhancedService.validateExistingExchange(userToken, exchangedToken);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('should detect subject preservation failure', () => {
      const userToken = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyLTEyMzQ1IiwibWF5X2FjdCI6eyJzdWIiOiJodHRwczovL2JhbmtpbmctYWdlbnQucGluZ2RlbW8uY29tL2FnZW50L3Rlc3QtYWdlbnQifX0.SflKxwRJSMeQ98PjmYQhQjFzLhOA-7h5aYFFI';
      const exchangedToken = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkaWZmZXJlbnQtdXNlciIsImFjdCI6eyJzdWIiOiJodHRwczovL21jcC1zZXJ2ZXIucGluZ2RlbW8uY29tL21jcC90ZXN0LW1jcCJ9fQ.SflKxwRJSMeQ98PjmYQhQjFzLhOA-7h5aYFFI';

      const result = enhancedService.validateExistingExchange(userToken, exchangedToken);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Subject claim not preserved through exchange');
    });

    test('should detect missing act claim', () => {
      const userToken = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyLTEyMzQ1IiwibWF5X2FjdCI6eyJzdWIiOiJodHRwczovL2JhbmtpbmctYWdlbnQucGluZ2RlbW8uY29tL2FnZW50L3Rlc3QtYWdlbnQifX0.SflKxwRJSMeQ98PjmYQhQjFzLhOA-7h5aYFFI';
      const exchangedToken = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyLTEyMzQ1In0.SflKxwRJSMeQ98PjmYQhQjFzLhOA-7h5aYFFI';

      const result = enhancedService.validateExistingExchange(userToken, exchangedToken);

      expect(result.valid).toBe(true);
      expect(result.warnings).toContain('No act claim present in exchanged token');
      expect(result.recommendations).toContain('Configure PingOne to include act claim in exchanged tokens');
    });

    test('should detect missing may_act in user token', () => {
      const userToken = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyLTEyMzQ1In0.SflKxwRJSMeQ98PjmYQhQjFzLhOA-7h5aYFFI';
      const exchangedToken = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyLTEyMzQ1IiwiYWN0Ijp7InN1YiI6Imh0dHBzOi8vbWNwLXNlcnZlci5waW5nZGVtby5jb20vbWNwL3Rlc3QtbWNwIn19.SflKxwRJSMeQ98PjmYQhQjFzLhOA-7h5aYFFI';

      const result = enhancedService.validateExistingExchange(userToken, exchangedToken);

      expect(result.warnings).toContain('No may_act claim in user token - delegation may not be properly authorized');
    });
  });

  describe('Utility Functions', () => {
    test('should mask tokens for logging', () => {
      const longToken = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyLTEyMzQ1IiwibWF5X2FjdCI6eyJzdWIiOiJodHRwczovL2JhbmtpbmctYWdlbnQucGluZ2RlbW8uY29tL2FnZW50L3Rlc3QtYWdlbnQifX0.SflKxwRJSMeQ98PjmYQhQjFzLhOA-7h5aYFFI';
      const shortToken = 'short.token';
      const nullToken = null;

      expect(enhancedService.maskToken(longToken)).toBe('eyJhbGci...FFI');
      expect(enhancedService.maskToken(shortToken)).toBe('[short-token]');
      expect(enhancedService.maskToken(nullToken)).toBe('[invalid-token]');
    });

    test('should decode JWT claims correctly', () => {
      const validToken = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyLTEyMzQ1IiwiYXVkIjpbImJhbmtpbmctYXBpIl19.SflKxwRJSMeQ98PjmYQhQjFzLhOA-7h5aYFFI';
      
      const claims = enhancedService.decodeTokenClaims(validToken);
      
      expect(claims.sub).toBe('user-12345');
      expect(claims.aud).toEqual(['banking-api']);
    });

    test('should handle invalid JWT format', () => {
      const invalidToken = 'invalid.jwt.format';
      
      expect(() => {
        enhancedService.decodeTokenClaims(invalidToken);
      }).toThrow('Failed to decode token claims: Invalid JWT format');
    });

    test('should compare act claims correctly', () => {
      const act1 = {
        sub: 'https://mcp-server.pingdemo.com/mcp/test-mcp',
        act: {
          sub: 'https://agent-gateway.pingdemo.com/agent/test-agent'
        }
      };
      
      const act2 = {
        sub: 'https://mcp-server.pingdemo.com/mcp/test-mcp',
        act: {
          sub: 'https://agent-gateway.pingdemo.com/agent/test-agent'
        }
      };
      
      const act3 = {
        sub: 'https://different-mcp.pingdemo.com/mcp/test-mcp',
        act: {
          sub: 'https://agent-gateway.pingdemo.com/agent/test-agent'
        }
      };

      expect(enhancedService.actClaimsEqual(act1, act2)).toBe(true);
      expect(enhancedService.actClaimsEqual(act1, act3)).toBe(false);
      expect(enhancedService.actClaimsEqual(null, null)).toBe(true);
      expect(enhancedService.actClaimsEqual(act1, null)).toBe(false);
    });

    test('should standardize identifiers with validation', () => {
      const { validateIdentifierFormat } = require('../../services/delegationClaimsService');
      
      // Test successful validation
      validateIdentifierFormat.mockReturnValue({
        valid: true,
        identifier: 'https://agent.pingdemo.com/agent/test-agent',
        format: 'standard'
      });

      const result = enhancedService.standardizeIdentifier('https://agent.pingdemo.com/agent/test-agent', 'agent');
      expect(result).toBe('https://agent.pingdemo.com/agent/test-agent');

      // Test legacy format mapping
      validateIdentifierFormat.mockReturnValue({
        valid: true,
        identifier: 'legacy-agent',
        format: 'legacy',
        mapped: 'https://agent.pingdemo.com/agent/legacy-agent'
      });

      const mappedResult = enhancedService.standardizeIdentifier('legacy-agent', 'agent');
      expect(mappedResult).toBe('https://agent.pingdemo.com/agent/legacy-agent');

      // Test validation failure (returns original)
      validateIdentifierFormat.mockImplementation(() => {
        throw new Error('Invalid format');
      });

      const fallbackResult = enhancedService.standardizeIdentifier('invalid-format', 'agent');
      expect(fallbackResult).toBe('invalid-format');
    });
  });

  describe('Error Handling', () => {
    test('should handle OAuth service errors', async () => {
      const subjectToken = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyLTEyMzQ1IiwibWF5X2FjdCI6eyJzdWIiOiJodHRwczovL2JhbmtpbmctYWdlbnQucGluZ2RlbW8uY29tL2FnZW50L3Rlc3QtYWdlbnQifX0.SflKxwRJSMeQ98PjmYQhQjFzLhOA-7h5aYFFI';
      const audience = 'https://mcp-server.pingdemo.com';
      const scopes = ['banking:read'];
      
      mockOAuthService.performTokenExchange.mockRejectedValue(
        new Error('OAuth service error')
      );

      await expect(enhancedService.performEnhancedTokenExchange(
        subjectToken,
        audience,
        scopes
      )).rejects.toThrow('OAuth service error');
    });

    test('should handle invalid subject token', async () => {
      const invalidToken = 'invalid.token';
      const audience = 'https://mcp-server.pingdemo.com';
      const scopes = ['banking:read'];

      await expect(enhancedService.performEnhancedTokenExchange(
        invalidToken,
        audience,
        scopes
      )).rejects.toThrow('Subject token missing required sub claim');
    });

    test('should handle validation errors gracefully', async () => {
      const subjectToken = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyLTEyMzQ1IiwibWF5X2FjdCI6eyJzdWIiOiJodHRwczovL2JhbmtpbmctYWdlbnQucGluZ2RlbW8uY29tL2FnZW50L3Rlc3QtYWdlbnQifX0.SflKxwRJSMeQ98PjmYQhQjFzLhOA-7h5aYFFI';
      const audience = 'https://mcp-server.pingdemo.com';
      const scopes = ['banking:read'];
      
      const exchangedToken = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyLTEyMzQ1IiwiYWN0Ijp7InN1YiI6Imh0dHBzOi8vbWNwLXNlcnZlci5waW5nZGVtby5jb20vbWNwL3Rlc3QtbWNwIn19.SflKxwRJSMeQ98PjmYQhQjFzLhOA-7h5aYFFI';
      
      mockOAuthService.performTokenExchange.mockResolvedValue(exchangedToken);
      
      // Mock validation error
      const { validateExchangedTokenAct } = require('../../services/delegationClaimsService');
      validateExchangedTokenAct.mockImplementation(() => {
        throw new Error('Validation error');
      });

      const result = await enhancedService.performEnhancedTokenExchange(
        subjectToken,
        audience,
        scopes
      );

      expect(result.validated).toBe(false);
      expect(result.claims.errors).toContain('Act claim validation failed: Validation error');
    });
  });
});
