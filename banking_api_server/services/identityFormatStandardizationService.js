/**
 * Identity Format Standardization Service
 * Standardizes agent and MCP server identifier formats using URI-based naming
 * 
 * Phase 58-03: Identity Format Standardization
 * Provides identifier validation, mapping, and standardization utilities
 */

'use strict';

const { writeExchangeEvent } = require('./exchangeAuditStore');

/**
 * Standardized identifier formats and patterns
 */
const IDENTITY_FORMATS = {
  // Standard URI-based formats
  agent: {
    standard: /^https:\/\/[a-zA-Z0-9.-]+\.pingdemo\.com\/agent\/[a-zA-Z0-9-]+$/,
    pattern: 'https://{domain}.pingdemo.com/agent/{agent-id}',
    examples: [
      'https://banking-agent.pingdemo.com/agent/test-agent',
      'https://ai-agent.pingdemo.com/agent/assistant-123'
    ]
  },
  mcp_server: {
    standard: /^https:\/\/[a-zA-Z0-9.-]+\.pingdemo\.com\/mcp\/[a-zA-Z0-9-]+$/,
    pattern: 'https://{domain}.pingdemo.com/mcp/{mcp-id}',
    examples: [
      'https://mcp-server.pingdemo.com/mcp/banking-mcp',
      'https://ai-mcp.pingdemo.com/mcp/assistant-mcp'
    ]
  },
  
  // Legacy formats for backward compatibility
  legacy_agent: {
    standard: /^legacy-[a-zA-Z0-9-]+$/,
    pattern: 'legacy-{agent-id}',
    examples: ['legacy-agent', 'legacy-banking-agent']
  },
  legacy_mcp: {
    standard: /^legacy-[a-zA-Z0-9-]+$/,
    pattern: 'legacy-{mcp-id}',
    examples: ['legacy-mcp', 'legacy-banking-mcp']
  }
};

/**
 * Domain mappings for standardization
 */
const DOMAIN_MAPPINGS = {
  mcp: {
    'mcp-server': 'mcp-server',
    'banking-mcp': 'mcp-server',
    'ai-mcp': 'ai-mcp',
    'default': 'mcp-server'
  },
  agent: {
    'banking-agent': 'banking-agent',
    'ai-agent': 'ai-agent',
    'assistant': 'ai-agent',
    'default': 'banking-agent'
  },
  mcp_server: {
    'mcp-server': 'mcp-server',
    'banking-mcp': 'mcp-server',
    'ai-mcp': 'ai-mcp',
    'assistant-mcp': 'ai-mcp',
    'default': 'mcp-server'
  }
};

/**
 * Identity Format Standardization Service
 */
class IdentityFormatStandardizationService {
  constructor() {
    this.formats = IDENTITY_FORMATS;
    this.domainMappings = DOMAIN_MAPPINGS;
  }

  /**
   * Validate identifier format according to specified type
   */
  validateIdentifierFormat(identifier, type) {
    const validation = {
      valid: true,
      format: 'unknown',
      identifier,
      standardized: null,
      errors: [],
      warnings: []
    };

    try {
      if (!identifier || typeof identifier !== 'string') {
        validation.valid = false;
        validation.errors.push(`Invalid ${type} identifier: must be a non-empty string`);
        return validation;
      }

      // Check standard format first
      const standardFormat = this.formats[type];
      if (!standardFormat) {
        validation.valid = false;
        validation.errors.push(`Unknown identifier type: ${type}`);
        return validation;
      }

      if (standardFormat.standard.test(identifier)) {
        validation.format = 'standard';
        validation.standardized = identifier;
        return validation;
      }

      // Check legacy format
      const legacyTypeKey = type === 'mcp_server' ? 'legacy_mcp' : `legacy_${type}`;
      const legacyFormat = this.formats[legacyTypeKey];
      if (legacyFormat && legacyFormat.standard.test(identifier)) {
        validation.format = 'legacy';
        validation.warnings.push(`Using legacy ${type} identifier format: ${identifier}`);
        // Use mapLegacyToStandard directly to avoid mutual recursion with standardizeIdentifier
        try {
          validation.standardized = this.mapLegacyToStandard(identifier, type, null);
        } catch (mapErr) {
          validation.standardized = null;
          validation.warnings.push(`Could not map legacy identifier to standard form: ${mapErr.message}`);
        }
        return validation;
      }

      // If neither format matches, it's invalid
      validation.valid = false;
      validation.errors.push(`Invalid ${type} identifier format: ${identifier}`);
      validation.errors.push(`Expected format: ${standardFormat.pattern}`);

    } catch (error) {
      validation.valid = false;
      validation.errors.push(`Identifier validation failed: ${error.message}`);
    }

    return validation;
  }

  /**
   * Standardize identifier to URI-based format
   */
  standardizeIdentifier(identifier, type, options = {}) {
    const { domain = null, preserveOriginal = false } = options;
    
    try {
      const validation = this.validateIdentifierFormat(identifier, type);
      
      if (!validation.valid) {
        throw new Error(`Cannot standardize invalid ${type} identifier: ${identifier}`);
      }

      // If already standard, return as-is
      if (validation.format === 'standard') {
        return validation.standardized;
      }

      // Map legacy to standard format
      if (validation.format === 'legacy') {
        return this.mapLegacyToStandard(identifier, type, domain);
      }

      return identifier;

    } catch (error) {
      throw new Error(`Identifier standardization failed: ${error.message}`);
    }
  }

  /**
   * Map legacy identifier to standard URI format
   */
  mapLegacyToStandard(identifier, type, preferredDomain = null) {
    const domain = preferredDomain || this.getDefaultDomain(type);
    const standardDomain = this.domainMappings[type][domain] || this.domainMappings[type].default;
    
    // Map type names to URL path segments (mcp_server → mcp, agent → agent)
    const pathSegments = { agent: 'agent', mcp_server: 'mcp' };
    const pathSegment = pathSegments[type] || type;
    return `https://${standardDomain}.pingdemo.com/${pathSegment}/${identifier}`;
  }

  /**
   * Get default domain for identifier type
   */
  getDefaultDomain(type) {
    const defaults = {
      agent: 'banking-agent',
      mcp_server: 'mcp-server'
    };
    return defaults[type] || 'default';
  }

  /**
   * Extract identifier components from standardized URI
   */
  extractIdentifierComponents(standardizedIdentifier, type) {
    const components = {
      valid: true,
      domain: null,
      id: null,
      type,
      errors: []
    };

    try {
      const pattern = this.formats[type].standard;
      if (!pattern.test(standardizedIdentifier)) {
        components.valid = false;
        if (standardizedIdentifier.startsWith('http://') || standardizedIdentifier.startsWith('https://')) {
          components.errors.push('Invalid URI structure');
        } else {
          components.errors.push('Not a standardized identifier');
        }
        return components;
      }

      // Parse URI: https://domain.pingdemo.com/type/id
      const url = new URL(standardizedIdentifier);
      const pathParts = url.pathname.split('/').filter(Boolean);
      
      if (pathParts.length < 2) {
        components.valid = false;
        components.errors.push('Invalid URI structure');
        return components;
      }

      components.domain = url.hostname.replace('.pingdemo.com', '');
      components.type = pathParts[0];
      components.id = pathParts[1];

    } catch (error) {
      components.valid = false;
      components.errors.push(`Failed to extract components: ${error.message}`);
    }

    return components;
  }

  /**
   * Create standardized identifier from components
   */
  createStandardizedIdentifier(domain, type, id) {
    const standardDomain = this.domainMappings[type][domain] || this.domainMappings[type].default;
    return `https://${standardDomain}.pingdemo.com/${type}/${id}`;
  }

  /**
   * Batch standardize multiple identifiers
   */
  batchStandardize(identifiers, type, options = {}) {
    const results = {
      total: identifiers.length,
      successful: 0,
      failed: 0,
      results: [],
      errors: []
    };

    for (const identifier of identifiers) {
      try {
        const standardized = this.standardizeIdentifier(identifier, type, options);
        results.successful++;
        results.results.push({
          original: identifier,
          standardized,
          status: 'success'
        });
      } catch (error) {
        results.failed++;
        results.results.push({
          original: identifier,
          error: error.message,
          status: 'failed'
        });
        results.errors.push(error.message);
      }
    }

    return results;
  }

  /**
   * Validate and standardize delegation claims
   */
  validateDelegationClaims(claims, options = {}) {
    const { strict = true, autoFix = false } = options;
    const validation = {
      valid: true,
      errors: [],
      warnings: [],
      fixed: false,
      standardized: { ...claims }
    };

    try {
      // Validate may_act claim if present
      if (claims.may_act) {
        const mayActValidation = this.validateMayActClaim(claims.may_act);
        
        if (!mayActValidation.valid) {
          validation.valid = false;
          validation.errors.push(...mayActValidation.errors);
        }
        
        validation.warnings.push(...mayActValidation.warnings);
        
        if (mayActValidation.standardized && autoFix) {
          validation.standardized.may_act = mayActValidation.standardized;
          validation.fixed = true;
        }
      }

      // Validate act claim if present
      if (claims.act) {
        const actValidation = this.validateActClaim(claims.act);
        
        if (!actValidation.valid) {
          validation.valid = false;
          validation.errors.push(...actValidation.errors);
        }
        
        validation.warnings.push(...actValidation.warnings);
        
        if (actValidation.standardized && autoFix) {
          validation.standardized.act = actValidation.standardized;
          validation.fixed = true;
        }
      }

      // Strict mode: reject any warnings
      if (strict && validation.warnings.length > 0) {
        validation.valid = false;
        validation.errors.push('Strict validation failed: warnings present');
      }

    } catch (error) {
      validation.valid = false;
      validation.errors.push(`Delegation claims validation failed: ${error.message}`);
    }

    return validation;
  }

  /**
   * Validate may_act claim structure
   */
  validateMayActClaim(mayAct) {
    const validation = {
      valid: true,
      errors: [],
      warnings: [],
      standardized: null
    };

    if (typeof mayAct !== 'object' || mayAct === null) {
        validation.valid = false;
        validation.errors.push('may_act must be an object');
        return validation;
      }

      // Validate sub field (agent identifier) — required
      if (!mayAct.sub) {
        validation.valid = false;
        validation.errors.push('Missing required field in may_act: sub');
        return validation;
      }

      if (mayAct.sub) {
        const subValidation = this.validateIdentifierFormat(mayAct.sub, 'agent');
        
        if (!subValidation.valid) {
          validation.valid = false;
          validation.errors.push(...subValidation.errors);
        }
        
        validation.warnings.push(...subValidation.warnings);
        
        if (subValidation.standardized) {
          validation.standardized = {
            ...mayAct,
            sub: subValidation.standardized
          };
        }
      }

      // Validate optional fields
      if (mayAct.client_id && typeof mayAct.client_id === 'string') {
        // client_id could be in legacy format
        const clientIdValidation = this.validateIdentifierFormat(mayAct.client_id, 'agent');
        
        if (!clientIdValidation.valid) {
          validation.warnings.push(`Invalid client_id format: ${mayAct.client_id}`);
        } else if (clientIdValidation.format === 'legacy') {
          validation.warnings.push(`Using legacy client_id format: ${mayAct.client_id}`);
          
          if (clientIdValidation.standardized) {
            validation.standardized = validation.standardized || { ...mayAct };
            validation.standardized.client_id = clientIdValidation.standardized;
            validation.fixed = true;
          }
        }
      }


    return validation;
  }

  /**
   * Validate act claim structure
   */
  validateActClaim(act) {
    const validation = {
      valid: true,
      errors: [],
      warnings: [],
      standardized: null
    };

    try {
      if (typeof act !== 'object' || act === null) {
        validation.valid = false;
        validation.errors.push('act must be an object');
        return validation;
      }

      // Validate sub field (MCP server identifier) — required
      if (!act.sub) {
        validation.valid = false;
        validation.errors.push('Missing required field in act: sub');
        return validation;
      }

      if (act.sub) {
        const subValidation = this.validateIdentifierFormat(act.sub, 'mcp_server');
        
        if (!subValidation.valid) {
          validation.valid = false;
          validation.errors.push(...subValidation.errors);
        }
        
        validation.warnings.push(...subValidation.warnings);
        
        if (subValidation.standardized) {
          validation.standardized = {
            ...act,
            sub: subValidation.standardized
          };
        }
      }

      // Validate nested act.act field (agent identifier)
      if (act.act && act.act.sub) {
        const nestedSubValidation = this.validateIdentifierFormat(act.act.sub, 'agent');
        
        if (!nestedSubValidation.valid) {
          validation.valid = false;
          validation.errors.push(...nestedSubValidation.errors);
        }
        
        // Use custom message for nested act.act.sub to indicate context
        if (nestedSubValidation.format === 'legacy') {
          validation.warnings.push(`Using legacy agent identifier in act.act.sub: ${act.act.sub}`);
        } else {
          validation.warnings.push(...nestedSubValidation.warnings);
        }
        
        if (nestedSubValidation.standardized) {
          validation.standardized = validation.standardized || { ...act };
          validation.standardized.act = {
            ...validation.standardized.act,
            sub: nestedSubValidation.standardized
          };
        }
      }

    } catch (error) {
      validation.valid = false;
      validation.errors.push(`act validation failed: ${error.message}`);
    }

    return validation;
  }

  /**
   * Get format documentation
   */
  getFormatDocumentation(type) {
    const format = this.formats[type];
    const legacyFormat = this.formats[`legacy_${type}`];
    
    return {
      type,
      standard: {
        pattern: format.pattern,
        regex: format.standard.toString(),
        examples: format.examples
      },
      legacy: legacyFormat ? {
        pattern: legacyFormat.pattern,
        regex: legacyFormat.standard.toString(),
        examples: legacyFormat.examples
      } : null,
      migration: {
        description: `Migrate from legacy to standard ${type} identifiers`,
        mapping: `legacy-{id} → https://domain.pingdemo.com/${type}/{id}`,
        recommendedDomain: this.getDefaultDomain(type)
      }
    };
  }

  /**
   * Generate migration report for identifiers
   */
  generateMigrationReport(identifiers, type) {
    const report = {
      type,
      total: identifiers.length,
      standard: 0,
      legacy: 0,
      invalid: 0,
      details: [],
      recommendations: []
    };

    for (const identifier of identifiers) {
      const validation = this.validateIdentifierFormat(identifier, type);
      
      const detail = {
        identifier,
        format: validation.format,
        valid: validation.valid,
        standardized: validation.standardized,
        errors: validation.errors,
        warnings: validation.warnings
      };

      report.details.push(detail);

      if (validation.valid) {
        if (validation.format === 'standard') {
          report.standard++;
        } else if (validation.format === 'legacy') {
          report.legacy++;
        }
      } else {
        report.invalid++;
      }
    }

    // Generate recommendations
    if (report.legacy > 0) {
      report.recommendations.push(`Standardize ${report.legacy} legacy ${type} identifiers to URI format`);
    }
    
    if (report.invalid > 0) {
      report.recommendations.push(`Fix ${report.invalid} invalid ${type} identifiers`);
    }
    
    if (report.standard === identifiers.length) {
      report.recommendations.push('All identifiers are already in standard format');
    }

    return report;
  }

  /**
   * Log standardization events
   */
  async logStandardizationEvent(event, details) {
    await writeExchangeEvent({
      type: 'identity_standardization',
      level: 'info',
      event,
      details,
      timestamp: new Date().toISOString()
    });
  }
}

module.exports = {
  IdentityFormatStandardizationService,
  IDENTITY_FORMATS,
  DOMAIN_MAPPINGS
};
