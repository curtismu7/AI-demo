/**
 * Delegation Claims Service Tests
 * Comprehensive test suite for RFC 8693 delegation claims validation
 * 
 * Phase 58-01: User Token may_act Claim Implementation
 * Extensive testing for delegation claim structures and validation
 */

const {
  validateDelegationClaims,
  validateUserTokenMayAct,
  validateExchangedTokenAct,
  validateDelegationChain,
  validateIdentifierFormat,
  mapLegacyIdentifier,
  IDENTIFIER_FORMATS,
  DELEGATION_RULES
} = require('../../services/delegationClaimsService');

// Mock dependencies
jest.mock('../../services/exchangeAuditStore');

describe('Delegation Claims Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Identifier Format Validation', () => {
    test('should validate standard agent identifiers', () => {
      const standardAgent = 'https://banking-agent.pingdemo.com/agent/test-agent';
      const result = validateIdentifierFormat(standardAgent, 'agent');
      
      expect(result.valid).toBe(true);
      expect(result.format).toBe('standard');
      expect(result.identifier).toBe(standardAgent);
    });

    test('should validate standard MCP server identifiers', () => {
      const standardMcp = 'https://mcp-server.pingdemo.com/mcp/test-mcp';
      const result = validateIdentifierFormat(standardMcp, 'mcp_server');
      
      expect(result.valid).toBe(true);
      expect(result.format).toBe('standard');
      expect(result.identifier).toBe(standardMcp);
    });

    test('should map legacy agent identifiers', () => {
      const legacyAgent = 'test-agent';
      const result = validateIdentifierFormat(legacyAgent, 'agent');
      
      expect(result.valid).toBe(true);
      expect(result.format).toBe('legacy');
      expect(result.identifier).toBe(legacyAgent);
      expect(result.mapped).toBe('https://agent.pingdemo.com/agent/test-agent');
    });

    test('should map legacy MCP server identifiers', () => {
      const legacyMcp = 'test-mcp';
      const result = validateIdentifierFormat(legacyMcp, 'mcp_server');
      
      expect(result.valid).toBe(true);
      expect(result.format).toBe('legacy');
      expect(result.identifier).toBe(legacyMcp);
      expect(result.mapped).toBe('https://mcp_server.pingdemo.com/mcp/test-mcp');
    });

    test('should reject invalid identifiers', () => {
      const invalidAgent = 'invalid://format';
      
      expect(() => {
        validateIdentifierFormat(invalidAgent, 'agent');
      }).toThrow('Invalid agent identifier format: invalid://format');
    });

    test('should reject empty identifiers', () => {
      expect(() => {
        validateIdentifierFormat('', 'agent');
      }).toThrow('Invalid agent identifier: must be a non-empty string');
    });

    test('should reject null identifiers', () => {
      expect(() => {
        validateIdentifierFormat(null, 'agent');
      }).toThrow('Invalid agent identifier: must be a non-empty string');
    });
  });

  describe('Legacy Identifier Mapping', () => {
    test('should map legacy agent to standard format', () => {
      const result = mapLegacyIdentifier('test-agent', 'agent');
      expect(result).toBe('https://agent.pingdemo.com/agent/test-agent');
    });

    test('should map legacy MCP server to standard format', () => {
      const result = mapLegacyIdentifier('test-mcp', 'mcp_server');
      expect(result).toBe('https://mcp_server.pingdemo.com/mcp/test-mcp');
    });
  });

  describe('User Token may_act Validation', () => {
    test('should validate valid user token with proper may_act', () => {
      const userToken = {
        sub: 'user-12345',
        aud: ['banking-api'],
        iss: 'https://auth.pingone.com/123456/as',
        exp: 1640995200,
        iat: 1640991600,
        may_act: {
          sub: 'https://banking-agent.pingdemo.com/agent/test-agent'
        },
        scope: 'banking:read banking:write'
      };

      const result = validateUserTokenMayAct(userToken);
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('should reject user token without may_act claim', () => {
      const userToken = {
        sub: 'user-12345',
        aud: ['banking-api'],
        iss: 'https://auth.pingone.com/123456/as',
        exp: 1640995200,
        iat: 1640991600,
        scope: 'banking:read banking:write'
      };

      const result = validateUserTokenMayAct(userToken);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing required claim: may_act');
    });

    test('should reject user token without sub claim', () => {
      const userToken = {
        aud: ['banking-api'],
        iss: 'https://auth.pingone.com/123456/as',
        exp: 1640995200,
        iat: 1640991600,
        may_act: {
          sub: 'https://banking-agent.pingdemo.com/agent/test-agent'
        },
        scope: 'banking:read banking:write'
      };

      const result = validateUserTokenMayAct(userToken);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing required claim: sub');
    });

    test('should reject malformed may_act claim', () => {
      const userToken = {
        sub: 'user-12345',
        aud: ['banking-api'],
        iss: 'https://auth.pingone.com/123456/as',
        exp: 1640995200,
        iat: 1640991600,
        may_act: 'invalid-string',
        scope: 'banking:read banking:write'
      };

      const result = validateUserTokenMayAct(userToken);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('may_act claim must be an object');
    });

    test('should reject may_act without sub field', () => {
      const userToken = {
        sub: 'user-12345',
        aud: ['banking-api'],
        iss: 'https://auth.pingone.com/123456/as',
        exp: 1640995200,
        iat: 1640991600,
        may_act: {
          client_id: 'test-client'
        },
        scope: 'banking:read banking:write'
      };

      const result = validateUserTokenMayAct(userToken);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing required field in may_act: sub');
    });

    test('should warn about legacy agent identifiers', () => {
      const userToken = {
        sub: 'user-12345',
        aud: ['banking-api'],
        iss: 'https://auth.pingone.com/123456/as',
        exp: 1640995200,
        iat: 1640991600,
        may_act: {
          sub: 'legacy-agent'
        },
        scope: 'banking:read banking:write'
      };

      const result = validateUserTokenMayAct(userToken);
      
      expect(result.valid).toBe(true);
      expect(result.warnings).toContain('Using legacy agent identifier format: legacy-agent');
      expect(result.normalized.may_act.sub).toBe('https://agent.pingdemo.com/agent/legacy-agent');
    });

    test('should validate agent authorization', () => {
      const userToken = {
        sub: 'user-12345',
        aud: ['banking-api'],
        iss: 'https://auth.pingone.com/123456/as',
        exp: 1640995200,
        iat: 1640991600,
        may_act: {
          sub: 'https://banking-agent.pingdemo.com/agent/test-agent'
        },
        scope: 'banking:read banking:write'
      };

      const userPreferences = {
        authorizedAgents: ['https://banking-agent.pingdemo.com/agent/test-agent']
      };

      const result = validateUserTokenMayAct(userToken, userPreferences);
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('should reject unauthorized agent', () => {
      const userToken = {
        sub: 'user-12345',
        aud: ['banking-api'],
        iss: 'https://auth.pingone.com/123456/as',
        exp: 1640995200,
        iat: 1640991600,
        may_act: {
          sub: 'https://banking-agent.pingdemo.com/agent/unauthorized-agent'
        },
        scope: 'banking:read banking:write'
      };

      const userPreferences = {
        authorizedAgents: ['https://banking-agent.pingdemo.com/agent/test-agent']
      };

      const result = validateUserTokenMayAct(userToken, userPreferences);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Agent not authorized: https://banking-agent.pingdemo.com/agent/unauthorized-agent');
    });

    test('should reject expired agent authorization', () => {
      const userToken = {
        sub: 'user-12345',
        aud: ['banking-api'],
        iss: 'https://auth.pingone.com/123456/as',
        exp: 1640995200,
        iat: 1640991600,
        may_act: {
          sub: 'https://banking-agent.pingdemo.com/agent/test-agent'
        },
        scope: 'banking:read banking:write'
      };

      const userPreferences = {
        authorizedAgents: ['https://banking-agent.pingdemo.com/agent/test-agent'],
        authorizedAgentsExpiry: new Date(Date.now() - 86400000).toISOString() // 1 day ago
      };

      const result = validateUserTokenMayAct(userToken, userPreferences);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Agent authorization has expired');
    });
  });

  describe('Exchanged Token act Validation', () => {
    test('should validate valid exchanged token with proper act claim', () => {
      const exchangedToken = {
        sub: 'user-12345',
        aud: ['https://mcp-server.pingdemo.com'],
        iss: 'https://auth.pingone.com/123456/as',
        exp: 1640993400,
        iat: 1640991700,
        act: {
          sub: 'https://mcp-server.pingdemo.com/mcp/test-mcp',
          act: {
            sub: 'https://banking-agent.pingdemo.com/agent/test-agent'
          }
        },
        scope: 'banking:read banking:agent:invoke'
      };

      const result = validateExchangedTokenAct(exchangedToken);
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('should reject exchanged token without act claim', () => {
      const exchangedToken = {
        sub: 'user-12345',
        aud: ['https://mcp-server.pingdemo.com'],
        iss: 'https://auth.pingone.com/123456/as',
        exp: 1640993400,
        iat: 1640991700,
        scope: 'banking:read banking:agent:invoke'
      };

      const result = validateExchangedTokenAct(exchangedToken);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing required claim: act');
    });

    test('should reject exchanged token without sub claim', () => {
      const exchangedToken = {
        aud: ['https://mcp-server.pingdemo.com'],
        iss: 'https://auth.pingone.com/123456/as',
        exp: 1640993400,
        iat: 1640991700,
        act: {
          sub: 'https://mcp-server.pingdemo.com/mcp/test-mcp'
        },
        scope: 'banking:read banking:agent:invoke'
      };

      const result = validateExchangedTokenAct(exchangedToken);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing required claim: sub');
    });

    test('should reject malformed act claim', () => {
      const exchangedToken = {
        sub: 'user-12345',
        aud: ['https://mcp-server.pingdemo.com'],
        iss: 'https://auth.pingone.com/123456/as',
        exp: 1640993400,
        iat: 1640991700,
        act: 'invalid-string',
        scope: 'banking:read banking:agent:invoke'
      };

      const result = validateExchangedTokenAct(exchangedToken);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('act claim must be an object');
    });

    test('should reject act claim without sub field', () => {
      const exchangedToken = {
        sub: 'user-12345',
        aud: ['https://mcp-server.pingdemo.com'],
        iss: 'https://auth.pingone.com/123456/as',
        exp: 1640993400,
        iat: 1640991700,
        act: {
          act: {
            sub: 'https://banking-agent.pingdemo.com/agent/test-agent'
          }
        },
        scope: 'banking:read banking:agent:invoke'
      };

      const result = validateExchangedTokenAct(exchangedToken);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing required field in act: sub');
    });

    test('should warn about legacy MCP server identifiers', () => {
      const exchangedToken = {
        sub: 'user-12345',
        aud: ['https://mcp-server.pingdemo.com'],
        iss: 'https://auth.pingone.com/123456/as',
        exp: 1640993400,
        iat: 1640991700,
        act: {
          sub: 'legacy-mcp',
          act: {
            sub: 'https://banking-agent.pingdemo.com/agent/test-agent'
          }
        },
        scope: 'banking:read banking:agent:invoke'
      };

      const result = validateExchangedTokenAct(exchangedToken);
      
      expect(result.valid).toBe(true);
      expect(result.warnings).toContain('Using legacy MCP server identifier format: legacy-mcp');
      expect(result.normalized.act.sub).toBe('https://mcp_server.pingdemo.com/mcp/legacy-mcp');
    });

    test('should warn about legacy agent identifiers in nested act', () => {
      const exchangedToken = {
        sub: 'user-12345',
        aud: ['https://mcp-server.pingdemo.com'],
        iss: 'https://auth.pingone.com/123456/as',
        exp: 1640993400,
        iat: 1640991700,
        act: {
          sub: 'https://mcp-server.pingdemo.com/mcp/test-mcp',
          act: {
            sub: 'legacy-agent'
          }
        },
        scope: 'banking:read banking:agent:invoke'
      };

      const result = validateExchangedTokenAct(exchangedToken);
      
      expect(result.valid).toBe(true);
      expect(result.warnings).toContain('Using legacy agent identifier in act.act.sub: legacy-agent');
    });
  });

  describe('Delegation Chain Validation', () => {
    test('should validate complete delegation chain', () => {
      const userToken = {
        sub: 'user-12345',
        may_act: {
          sub: 'https://banking-agent.pingdemo.com/agent/test-agent'
        }
      };

      const exchangedToken = {
        sub: 'user-12345',
        act: {
          sub: 'https://mcp-server.pingdemo.com/mcp/test-mcp',
          act: {
            sub: 'https://banking-agent.pingdemo.com/agent/test-agent'
          }
        }
      };

      const result = validateDelegationChain(userToken, exchangedToken);
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.chain).toHaveLength(3);
      expect(result.chain[0].type).toBe('user');
      expect(result.chain[1].type).toBe('agent');
      expect(result.chain[2].type).toBe('mcp_server');
    });

    test('should reject chain with incorrect length', () => {
      const userToken = {
        sub: 'user-12345',
        may_act: {
          sub: 'https://banking-agent.pingdemo.com/agent/test-agent'
        }
      };

      const exchangedToken = {
        sub: 'user-12345',
        act: {
          sub: 'https://mcp-server.pingdemo.com/mcp/test-mcp'
        }
      };

      const result = validateDelegationChain(userToken, exchangedToken);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Invalid delegation chain length: 2');
    });

    test('should reject chain with subject not preserved', () => {
      const userToken = {
        sub: 'user-12345',
        may_act: {
          sub: 'https://banking-agent.pingdemo.com/agent/test-agent'
        }
      };

      const exchangedToken = {
        sub: 'different-user-67890', // Subject not preserved
        act: {
          sub: 'https://mcp-server.pingdemo.com/mcp/test-mcp',
          act: {
            sub: 'https://banking-agent.pingdemo.com/agent/test-agent'
          }
        }
      };

      const result = validateDelegationChain(userToken, exchangedToken);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('User subject not preserved in exchanged token');
    });

    test('should reject chain with unauthorized agent', () => {
      const userToken = {
        sub: 'user-12345',
        may_act: {
          sub: 'https://banking-agent.pingdemo.com/agent/test-agent'
        }
      };

      const exchangedToken = {
        sub: 'user-12345',
        act: {
          sub: 'https://mcp-server.pingdemo.com/mcp/test-mcp',
          act: {
            sub: 'https://banking-agent.pingdemo.com/agent/different-agent' // Different agent
          }
        }
      };

      const result = validateDelegationChain(userToken, exchangedToken);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Agent not authorized in may_act claim');
    });

    test('should reject chain with MCP server identity mismatch', () => {
      const userToken = {
        sub: 'user-12345',
        may_act: {
          sub: 'https://banking-agent.pingdemo.com/agent/test-agent'
        }
      };

      const exchangedToken = {
        sub: 'user-12345',
        act: {
          sub: 'https://different-mcp.pingdemo.com/mcp/test-mcp', // Different MCP server
          act: {
            sub: 'https://banking-agent.pingdemo.com/agent/test-agent'
          }
        }
      };

      const result = validateDelegationChain(userToken, exchangedToken);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('MCP server identity mismatch in act claim');
    });

    test('should detect circular delegation', () => {
      const userToken = {
        sub: 'user-12345',
        may_act: {
          sub: 'user-12345' // Circular reference
        }
      };

      const exchangedToken = {
        sub: 'user-12345',
        act: {
          sub: 'https://mcp-server.pingdemo.com/mcp/test-mcp',
          act: {
            sub: 'user-12345' // Circular reference
          }
        }
      };

      const result = validateDelegationChain(userToken, exchangedToken);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Circular delegation detected in chain');
    });
  });

  describe('Main Delegation Claims Validation', () => {
    test('should validate user token successfully', () => {
      const token = {
        sub: 'user-12345',
        aud: ['banking-api'],
        iss: 'https://auth.pingone.com/123456/as',
        exp: 1640995200,
        iat: 1640991600,
        may_act: {
          sub: 'https://banking-agent.pingdemo.com/agent/test-agent'
        },
        scope: 'banking:read banking:write'
      };

      const result = validateDelegationClaims(token, 'user');
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('should validate exchanged token successfully', () => {
      const token = {
        sub: 'user-12345',
        aud: ['https://mcp-server.pingdemo.com'],
        iss: 'https://auth.pingone.com/123456/as',
        exp: 1640993400,
        iat: 1640991700,
        act: {
          sub: 'https://mcp-server.pingdemo.com/mcp/test-mcp',
          act: {
            sub: 'https://banking-agent.pingdemo.com/agent/test-agent'
          }
        },
        scope: 'banking:read banking:agent:invoke'
      };

      const result = validateDelegationClaims(token, 'exchanged');
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('should reject unknown token type', () => {
      const token = {
        sub: 'user-12345',
        aud: ['banking-api'],
        scope: 'banking:read'
      };

      const result = validateDelegationClaims(token, 'unknown');
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Unknown token type: unknown');
    });

    test('should handle JWT string tokens', () => {
      const jwtToken = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyLTEyMzQ1IiwibWF5X2FjdCI6eyJzdWIiOiJodHRwczovL2JhbmtpbmctYWdlbnQucGluZ2RlbW8uY29tL2FnZW50L3Rlc3QtYWdlbnQifX0.SflKxwRJSMeQ98PjmYQhQjFzLhOA-7h5aYFFI';
      
      const result = validateDelegationClaims(jwtToken, 'user');
      
      // Should decode and validate the JWT claims
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('should handle invalid JWT tokens', () => {
      const invalidToken = 'invalid.jwt.token';
      
      const result = validateDelegationClaims(invalidToken, 'user');
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Unable to decode token claims');
    });
  });

  describe('Edge Cases and Error Handling', () => {
    test('should handle null token', () => {
      const result = validateDelegationClaims(null, 'user');
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Unable to decode token claims');
    });

    test('should handle undefined token', () => {
      const result = validateDelegationClaims(undefined, 'user');
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Unable to decode token claims');
    });

    test('should handle empty object token', () => {
      const token = {};
      
      const result = validateDelegationClaims(token, 'user');
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing required claim: sub');
      expect(result.errors).toContain('Missing required claim: may_act');
    });

    test('should handle validation errors gracefully', () => {
      // Mock the delegation claims service to simulate an internal error
      const delegationService = require('../../services/delegationClaimsService');
      const originalValidateUserTokenMayAct = delegationService.validateUserTokenMayAct;
      
      // Override the function to throw an error
      delegationService.validateUserTokenMayAct = jest.fn(() => {
        throw new Error('Internal validation error');
      });

      const token = {
        sub: 'user-12345',
        may_act: {
          sub: 'https://banking-agent.pingdemo.com/agent/test-agent'
        }
      };

      const result = delegationService.validateDelegationClaims(token, 'user');
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Delegation claims validation failed: Internal validation error');

      // Restore original function
      delegationService.validateUserTokenMayAct = originalValidateUserTokenMayAct;
    });
  });

  describe('Constants and Configuration', () => {
    test('should have correct identifier format patterns', () => {
      expect(IDENTIFIER_FORMATS.agent).toBeInstanceOf(RegExp);
      expect(IDENTIFIER_FORMATS.mcp_server).toBeInstanceOf(RegExp);
      expect(IDENTIFIER_FORMATS.legacy_agent).toBeInstanceOf(RegExp);
      expect(IDENTIFIER_FORMATS.legacy_mcp).toBeInstanceOf(RegExp);
    });

    test('should have correct delegation rules', () => {
      expect(DELEGATION_RULES.user_token).toBeDefined();
      expect(DELEGATION_RULES.exchanged_token).toBeDefined();
      expect(DELEGATION_RULES.user_token.required_claims).toContain('sub');
      expect(DELEGATION_RULES.user_token.required_claims).toContain('may_act');
      expect(DELEGATION_RULES.exchanged_token.required_claims).toContain('sub');
      expect(DELEGATION_RULES.exchanged_token.required_claims).toContain('act');
    });
  });
});
