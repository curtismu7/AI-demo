/**
 * Identity Format Standardization Service Tests
 * Comprehensive test suite for identifier format validation and standardization
 * 
 * Phase 58-03: Identity Format Standardization
 * Extensive testing for URI-based identifier formats and legacy mapping
 */

const {
  IdentityFormatStandardizationService,
  IDENTITY_FORMATS,
  DOMAIN_MAPPINGS
} = require('../../services/identityFormatStandardizationService');

// Mock dependencies
jest.mock('../../services/exchangeAuditStore');

describe('Identity Format Standardization Service', () => {
  let service;

  beforeEach(() => {
    service = new IdentityFormatStandardizationService();
    jest.clearAllMocks();
  });

  describe('Identifier Format Validation', () => {
    test('should validate standard agent identifiers', () => {
      const standardAgent = 'https://banking-agent.pingdemo.com/agent/test-agent';
      const result = service.validateIdentifierFormat(standardAgent, 'agent');
      
      expect(result.valid).toBe(true);
      expect(result.format).toBe('standard');
      expect(result.standardized).toBe(standardAgent);
      expect(result.errors).toHaveLength(0);
    });

    test('should validate standard MCP server identifiers', () => {
      const standardMcp = 'https://mcp-server.pingdemo.com/mcp/test-mcp';
      const result = service.validateIdentifierFormat(standardMcp, 'mcp_server');
      
      expect(result.valid).toBe(true);
      expect(result.format).toBe('standard');
      expect(result.standardized).toBe(standardMcp);
      expect(result.errors).toHaveLength(0);
    });

    test('should identify and map legacy agent identifiers', () => {
      const legacyAgent = 'test-agent';
      const result = service.validateIdentifierFormat(legacyAgent, 'agent');
      
      expect(result.valid).toBe(true);
      expect(result.format).toBe('legacy');
      expect(result.warnings).toContain('Using legacy agent identifier format: test-agent');
      expect(result.standardized).toBe('https://banking-agent.pingdemo.com/agent/test-agent');
    });

    test('should identify and map legacy MCP server identifiers', () => {
      const legacyMcp = 'test-mcp';
      const result = service.validateIdentifierFormat(legacyMcp, 'mcp_server');
      
      expect(result.valid).toBe(true);
      expect(result.format).toBe('legacy');
      expect(result.warnings).toContain('Using legacy mcp_server identifier format: test-mcp');
      expect(result.standardized).toBe('https://mcp-server.pingdemo.com/mcp/test-mcp');
    });

    test('should reject invalid agent identifiers', () => {
      const invalidAgent = 'invalid://format';
      const result = service.validateIdentifierFormat(invalidAgent, 'agent');
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Invalid agent identifier format: invalid://format');
    });

    test('should reject invalid MCP server identifiers', () => {
      const invalidMcp = 'invalid://format';
      const result = service.validateIdentifierFormat(invalidMcp, 'mcp_server');
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Invalid mcp_server identifier format: invalid://format');
    });

    test('should reject empty identifiers', () => {
      const result = service.validateIdentifierFormat('', 'agent');
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Invalid agent identifier: must be a non-empty string');
    });

    test('should reject null identifiers', () => {
      const result = service.validateIdentifierFormat(null, 'agent');
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Invalid agent identifier: must be a non-empty string');
    });

    test('should reject unknown identifier types', () => {
      const result = service.validateIdentifierFormat('test-id', 'unknown_type');
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Unknown identifier type: unknown_type');
    });
  });

  describe('Identifier Standardization', () => {
    test('should return standard identifiers unchanged', () => {
      const standardAgent = 'https://banking-agent.pingdemo.com/agent/test-agent';
      const result = service.standardizeIdentifier(standardAgent, 'agent');
      
      expect(result).toBe(standardAgent);
    });

    test('should standardize legacy agent identifiers', () => {
      const legacyAgent = 'test-agent';
      const result = service.standardizeIdentifier(legacyAgent, 'agent');
      
      expect(result).toBe('https://banking-agent.pingdemo.com/agent/test-agent');
    });

    test('should standardize legacy MCP server identifiers', () => {
      const legacyMcp = 'test-mcp';
      const result = service.standardizeIdentifier(legacyMcp, 'mcp_server');
      
      expect(result).toBe('https://mcp-server.pingdemo.com/mcp/test-mcp');
    });

    test('should use preferred domain when specified', () => {
      const legacyAgent = 'test-agent';
      const result = service.standardizeIdentifier(legacyAgent, 'agent', { domain: 'ai-agent' });
      
      expect(result).toBe('https://ai-agent.pingdemo.com/agent/test-agent');
    });

    test('should reject invalid identifiers for standardization', () => {
      const invalidAgent = 'invalid://format';
      
      expect(() => {
        service.standardizeIdentifier(invalidAgent, 'agent');
      }).toThrow('Cannot standardize invalid agent identifier: invalid://format');
    });
  });

  describe('Legacy to Standard Mapping', () => {
    test('should map legacy agent with default domain', () => {
      const result = service.mapLegacyToStandard('test-agent', 'agent');
      
      expect(result).toBe('https://banking-agent.pingdemo.com/agent/test-agent');
    });

    test('should map legacy agent with preferred domain', () => {
      const result = service.mapLegacyToStandard('test-agent', 'agent', 'ai-agent');
      
      expect(result).toBe('https://ai-agent.pingdemo.com/agent/test-agent');
    });

    test('should map legacy MCP server with default domain', () => {
      const result = service.mapLegacyToStandard('test-mcp', 'mcp_server');
      
      expect(result).toBe('https://mcp-server.pingdemo.com/mcp/test-mcp');
    });

    test('should map legacy MCP server with preferred domain', () => {
      const result = service.mapLegacyToStandard('test-mcp', 'mcp_server', 'ai-mcp');
      
      expect(result).toBe('https://ai-mcp.pingdemo.com/mcp/test-mcp');
    });

    test('should use default domain for unknown preferred domain', () => {
      const result = service.mapLegacyToStandard('test-agent', 'agent', 'unknown-domain');
      
      expect(result).toBe('https://banking-agent.pingdemo.com/agent/test-agent');
    });
  });

  describe('Identifier Component Extraction', () => {
    test('should extract components from standard agent identifier', () => {
      const identifier = 'https://banking-agent.pingdemo.com/agent/test-agent';
      const result = service.extractIdentifierComponents(identifier, 'agent');
      
      expect(result.valid).toBe(true);
      expect(result.domain).toBe('banking-agent');
      expect(result.type).toBe('agent');
      expect(result.id).toBe('test-agent');
      expect(result.errors).toHaveLength(0);
    });

    test('should extract components from standard MCP server identifier', () => {
      const identifier = 'https://mcp-server.pingdemo.com/mcp/test-mcp';
      const result = service.extractIdentifierComponents(identifier, 'mcp_server');
      
      expect(result.valid).toBe(true);
      expect(result.domain).toBe('mcp-server');
      expect(result.type).toBe('mcp');
      expect(result.id).toBe('test-mcp');
      expect(result.errors).toHaveLength(0);
    });

    test('should reject non-standard identifiers', () => {
      const identifier = 'legacy-agent';
      const result = service.extractIdentifierComponents(identifier, 'agent');
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Not a standardized identifier');
    });

    test('should reject malformed URIs', () => {
      const identifier = 'https://malformed-uri';
      const result = service.extractIdentifierComponents(identifier, 'agent');
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Invalid URI structure');
    });
  });

  describe('Standardized Identifier Creation', () => {
    test('should create standard agent identifier', () => {
      const result = service.createStandardizedIdentifier('banking-agent', 'agent', 'test-agent');
      
      expect(result).toBe('https://banking-agent.pingdemo.com/agent/test-agent');
    });

    test('should create standard MCP server identifier', () => {
      const result = service.createStandardizedIdentifier('mcp-server', 'mcp', 'test-mcp');
      
      expect(result).toBe('https://mcp-server.pingdemo.com/mcp/test-mcp');
    });

    test('should use default domain for unknown domain', () => {
      const result = service.createStandardizedIdentifier('unknown-domain', 'agent', 'test-agent');
      
      expect(result).toBe('https://banking-agent.pingdemo.com/agent/test-agent');
    });
  });

  describe('Batch Standardization', () => {
    test('should standardize batch of mixed format identifiers', () => {
      const identifiers = [
        'https://banking-agent.pingdemo.com/agent/standard-agent',
        'legacy-agent-1',
        'legacy-agent-2',
        'https://ai-agent.pingdemo.com/agent/ai-agent'
      ];
      
      const result = service.batchStandardize(identifiers, 'agent');
      
      expect(result.total).toBe(4);
      expect(result.successful).toBe(4);
      expect(result.failed).toBe(0);
      expect(result.results).toHaveLength(4);
      
      expect(result.results[0]).toEqual({
        original: 'https://banking-agent.pingdemo.com/agent/standard-agent',
        standardized: 'https://banking-agent.pingdemo.com/agent/standard-agent',
        status: 'success'
      });
      
      expect(result.results[1]).toEqual({
        original: 'legacy-agent-1',
        standardized: 'https://banking-agent.pingdemo.com/agent/legacy-agent-1',
        status: 'success'
      });
    });

    test('should handle batch with invalid identifiers', () => {
      const identifiers = [
        'https://banking-agent.pingdemo.com/agent/valid-agent',
        'invalid://format',
        'another-invalid-format'
      ];
      
      const result = service.batchStandardize(identifiers, 'agent');
      
      expect(result.total).toBe(3);
      expect(result.successful).toBe(1);
      expect(result.failed).toBe(2);
      expect(result.errors).toHaveLength(2);
    });
  });

  describe('Delegation Claims Validation', () => {
    test('should validate delegation claims with standard formats', () => {
      const claims = {
        sub: 'user-12345',
        may_act: {
          sub: 'https://banking-agent.pingdemo.com/agent/test-agent'
        },
        act: {
          sub: 'https://mcp-server.pingdemo.com/mcp/test-mcp',
          act: {
            sub: 'https://banking-agent.pingdemo.com/agent/test-agent'
          }
        }
      };
      
      const result = service.validateDelegationClaims(claims);
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('should validate delegation claims with legacy formats and auto-fix', () => {
      const claims = {
        sub: 'user-12345',
        may_act: {
          sub: 'legacy-agent'
        },
        act: {
          sub: 'legacy-mcp',
          act: {
            sub: 'legacy-agent'
          }
        }
      };
      
      const result = service.validateDelegationClaims(claims, { autoFix: true });
      
      expect(result.valid).toBe(true);
      expect(result.fixed).toBe(true);
      expect(result.standardized.may_act.sub).toBe('https://banking-agent.pingdemo.com/agent/legacy-agent');
      expect(result.standardized.act.sub).toBe('https://mcp-server.pingdemo.com/mcp/legacy-mcp');
      expect(result.standardized.act.act.sub).toBe('https://banking-agent.pingdemo.com/agent/legacy-agent');
    });

    test('should reject delegation claims in strict mode with warnings', () => {
      const claims = {
        sub: 'user-12345',
        may_act: {
          sub: 'legacy-agent' // Legacy format
        }
      };
      
      const result = service.validateDelegationClaims(claims, { strict: true });
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Strict validation failed: warnings present');
    });

    test('should reject invalid may_act structure', () => {
      const claims = {
        sub: 'user-12345',
        may_act: 'invalid-string'
      };
      
      const result = service.validateDelegationClaims(claims);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('may_act must be an object');
    });

    test('should reject invalid act structure', () => {
      const claims = {
        sub: 'user-12345',
        act: 'invalid-string'
      };
      
      const result = service.validateDelegationClaims(claims);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('act must be an object');
    });
  });

  describe('May_act Claim Validation', () => {
    test('should validate may_act with standard agent identifier', () => {
      const mayAct = {
        sub: 'https://banking-agent.pingdemo.com/agent/test-agent',
        client_id: 'https://banking-agent.pingdemo.com/agent/test-agent'
      };
      
      const result = service.validateMayActClaim(mayAct);
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('should validate may_act with legacy agent identifier', () => {
      const mayAct = {
        sub: 'legacy-agent',
        client_id: 'legacy-client'
      };
      
      const result = service.validateMayActClaim(mayAct);
      
      expect(result.valid).toBe(true);
      expect(result.warnings).toContain('Using legacy agent identifier format: legacy-agent');
      expect(result.warnings).toContain('Using legacy client_id format: legacy-client');
      expect(result.standardized.sub).toBe('https://banking-agent.pingdemo.com/agent/legacy-agent');
    });

    test('should reject may_act without sub field', () => {
      const mayAct = {
        client_id: 'test-client'
      };
      
      const result = service.validateMayActClaim(mayAct);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing required field in may_act: sub');
    });

    test('should reject non-object may_act', () => {
      const mayAct = 'invalid-string';
      
      const result = service.validateMayActClaim(mayAct);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('may_act must be an object');
    });
  });

  describe('Act Claim Validation', () => {
    test('should validate act with standard identifiers', () => {
      const act = {
        sub: 'https://mcp-server.pingdemo.com/mcp/test-mcp',
        act: {
          sub: 'https://banking-agent.pingdemo.com/agent/test-agent'
        }
      };
      
      const result = service.validateActClaim(act);
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('should validate act with legacy identifiers', () => {
      const act = {
        sub: 'legacy-mcp',
        act: {
          sub: 'legacy-agent'
        }
      };
      
      const result = service.validateActClaim(act);
      
      expect(result.valid).toBe(true);
      expect(result.warnings).toContain('Using legacy mcp_server identifier format: legacy-mcp');
      expect(result.warnings).toContain('Using legacy agent identifier in act.act.sub: legacy-agent');
      expect(result.standardized.sub).toBe('https://mcp-server.pingdemo.com/mcp/legacy-mcp');
      expect(result.standardized.act.sub).toBe('https://banking-agent.pingdemo.com/agent/legacy-agent');
    });

    test('should reject act without sub field', () => {
      const act = {
        act: {
          sub: 'https://banking-agent.pingdemo.com/agent/test-agent'
        }
      };
      
      const result = service.validateActClaim(act);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing required field in act: sub');
    });

    test('should reject non-object act', () => {
      const act = 'invalid-string';
      
      const result = service.validateActClaim(act);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('act must be an object');
    });
  });

  describe('Format Documentation', () => {
    test('should provide agent format documentation', () => {
      const docs = service.getFormatDocumentation('agent');
      
      expect(docs.type).toBe('agent');
      expect(docs.standard.pattern).toBe('https://{domain}.pingdemo.com/agent/{agent-id}');
      expect(docs.standard.examples).toContain('https://banking-agent.pingdemo.com/agent/test-agent');
      expect(docs.legacy.pattern).toBe('{agent-id}');
      expect(docs.legacy.examples).toContain('test-agent');
      expect(docs.migration.description).toContain('Migrate from legacy to standard agent identifiers');
    });

    test('should provide MCP server format documentation', () => {
      const docs = service.getFormatDocumentation('mcp_server');
      
      expect(docs.type).toBe('mcp_server');
      expect(docs.standard.pattern).toBe('https://{domain}.pingdemo.com/mcp/{mcp-id}');
      expect(docs.standard.examples).toContain('https://mcp-server.pingdemo.com/mcp/banking-mcp');
      expect(docs.legacy.pattern).toBe('{mcp-id}');
      expect(docs.legacy.examples).toContain('test-mcp');
    });
  });

  describe('Migration Report Generation', () => {
    test('should generate migration report for mixed identifiers', () => {
      const identifiers = [
        'https://banking-agent.pingdemo.com/agent/standard-agent',
        'legacy-agent-1',
        'legacy-agent-2',
        'invalid://format',
        'https://ai-agent.pingdemo.com/agent/ai-agent'
      ];
      
      const report = service.generateMigrationReport(identifiers, 'agent');
      
      expect(report.type).toBe('agent');
      expect(report.total).toBe(5);
      expect(report.standard).toBe(2);
      expect(report.legacy).toBe(2);
      expect(report.invalid).toBe(1);
      expect(report.details).toHaveLength(5);
      expect(report.recommendations).toContain('Standardize 2 legacy agent identifiers to URI format');
      expect(report.recommendations).toContain('Fix 1 invalid agent identifiers');
    });

    test('should generate report for all standard identifiers', () => {
      const identifiers = [
        'https://banking-agent.pingdemo.com/agent/standard-agent',
        'https://ai-agent.pingdemo.com/agent/ai-agent'
      ];
      
      const report = service.generateMigrationReport(identifiers, 'agent');
      
      expect(report.standard).toBe(2);
      expect(report.legacy).toBe(0);
      expect(report.invalid).toBe(0);
      expect(report.recommendations).toContain('All identifiers are already in standard format');
    });

    test('should generate report for all legacy identifiers', () => {
      const identifiers = [
        'legacy-agent-1',
        'legacy-agent-2'
      ];
      
      const report = service.generateMigrationReport(identifiers, 'agent');
      
      expect(report.standard).toBe(0);
      expect(report.legacy).toBe(2);
      expect(report.invalid).toBe(0);
      expect(report.recommendations).toContain('Standardize 2 legacy agent identifiers to URI format');
    });
  });

  describe('Default Domain Handling', () => {
    test('should return default domain for agent type', () => {
      const domain = service.getDefaultDomain('agent');
      expect(domain).toBe('banking-agent');
    });

    test('should return default domain for MCP server type', () => {
      const domain = service.getDefaultDomain('mcp_server');
      expect(domain).toBe('mcp-server');
    });

    test('should return default for unknown type', () => {
      const domain = service.getDefaultDomain('unknown_type');
      expect(domain).toBe('default');
    });
  });

  describe('Constants and Configuration', () => {
    test('should have correct format patterns', () => {
      expect(IDENTITY_FORMATS.agent).toBeDefined();
      expect(IDENTITY_FORMATS.mcp_server).toBeDefined();
      expect(IDENTITY_FORMATS.legacy_agent).toBeDefined();
      expect(IDENTITY_FORMATS.legacy_mcp).toBeDefined();
      
      expect(IDENTITY_FORMATS.agent.standard).toBeInstanceOf(RegExp);
      expect(IDENTITY_FORMATS.mcp_server.standard).toBeInstanceOf(RegExp);
    });

    test('should have correct domain mappings', () => {
      expect(DOMAIN_MAPPINGS.agent).toBeDefined();
      expect(DOMAIN_MAPPINGS.mcp_server).toBeDefined();
      
      expect(DOMAIN_MAPPINGS.agent['banking-agent']).toBe('banking-agent');
      expect(DOMAIN_MAPPINGS.mcp_server['mcp-server']).toBe('mcp-server');
      expect(DOMAIN_MAPPINGS.agent.default).toBe('banking-agent');
      expect(DOMAIN_MAPPINGS.mcp_server.default).toBe('mcp-server');
    });
  });

  describe('Edge Cases and Error Handling', () => {
    test('should handle validation errors gracefully', () => {
      // Mock a validation error
      const originalValidate = service.validateIdentifierFormat;
      service.validateIdentifierFormat = jest.fn(() => {
        throw new Error('Validation error');
      });

      const claims = {
        sub: 'user-12345',
        may_act: {
          sub: 'test-agent'
        }
      };

      const result = service.validateDelegationClaims(claims);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Delegation claims validation failed: Validation error');

      // Restore original method
      service.validateIdentifierFormat = originalValidate;
    });

    test('should handle component extraction errors', () => {
      const invalidIdentifier = 'not-a-valid-uri';
      
      const result = service.extractIdentifierComponents(invalidIdentifier, 'agent');
      
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    test('should handle batch standardization with mixed results', () => {
      const identifiers = [
        'https://banking-agent.pingdemo.com/agent/valid',
        'invalid-format',
        'another-invalid'
      ];
      
      const result = service.batchStandardize(identifiers, 'agent');
      
      expect(result.successful).toBe(1);
      expect(result.failed).toBe(2);
      expect(result.errors.length).toBe(2);
    });
  });
});
