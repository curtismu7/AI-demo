/**
 * RFC 8693 Delegation Claims Service
 * Comprehensive may_act and act claim validation and implementation
 * 
 * Phase 58-01: User Token may_act Claim Implementation
 * Ensures proper delegation claim structures and validation
 */

'use strict';

const { writeExchangeEvent } = require('./exchangeAuditStore');

/**
 * Standardized identifier formats for delegation claims
 */
const IDENTIFIER_FORMATS = {
  agent: /^https:\/\/[a-zA-Z0-9.-]+\.pingdemo\.com\/agent\/[a-zA-Z0-9-]+$/,
  mcp_server: /^https:\/\/[a-zA-Z0-9.-]+\.pingdemo\.com\/mcp\/[a-zA-Z0-9-]+$/,
  legacy_agent: /^[a-zA-Z0-9-]+$/,
  legacy_mcp: /^[a-zA-Z0-9-]+$/
};

/**
 * Delegation claim validation rules
 */
const DELEGATION_RULES = {
  // User token must have may_act claim for delegation
  user_token: {
    required_claims: ['sub', 'may_act'],
    optional_claims: ['aud', 'iss', 'exp', 'iat', 'scope'],
    may_act_structure: {
      required_fields: ['sub'],
      optional_fields: ['client_id', 'actor', 'may_act']
    }
  },
  
  // Exchanged token must have act claim preserving subject
  exchanged_token: {
    required_claims: ['sub', 'act'],
    optional_claims: ['aud', 'iss', 'exp', 'iat', 'scope'],
    act_structure: {
      required_fields: ['sub'],
      optional_fields: ['act']
    }
  }
};

/**
 * Validate identifier format according to RFC 8693 standards
 */
function validateIdentifierFormat(identifier, type) {
  if (!identifier || typeof identifier !== 'string') {
    throw new Error(`Invalid ${type} identifier: must be a non-empty string`);
  }

  const standardPattern = IDENTIFIER_FORMATS[type];
  const legacyPattern = IDENTIFIER_FORMATS[`legacy_${type}`];
  
  // Check if it matches standard format
  if (standardPattern && standardPattern.test(identifier)) {
    return { valid: true, format: 'standard', identifier };
  }
  
  // Check if it matches legacy format and map it
  if (legacyPattern && legacyPattern.test(identifier)) {
    const mappedIdentifier = mapLegacyIdentifier(identifier, type);
    return { valid: true, format: 'legacy', identifier, mapped: mappedIdentifier };
  }
  
  throw new Error(`Invalid ${type} identifier format: ${identifier}`);
}

/**
 * Map legacy identifier to standardized URI format
 */
function mapLegacyIdentifier(identifier, type) {
  return `https://${type}.pingdemo.com/${type}/${identifier}`;
}

/**
 * Validate user token may_act claim structure
 */
function validateUserTokenMayAct(claims, userPreferences = {}) {
  const validation = {
    valid: true,
    errors: [],
    warnings: [],
    normalized: { ...claims }
  };

  try {
    // Check required claims
    const requiredClaims = DELEGATION_RULES.user_token.required_claims;
    for (const claim of requiredClaims) {
      if (!claims[claim]) {
        validation.valid = false;
        validation.errors.push(`Missing required claim: ${claim}`);
      }
    }

    // Validate may_act claim structure
    if (claims.may_act) {
      const mayActValidation = validateMayActStructure(claims.may_act);
      
      if (!mayActValidation.valid) {
        validation.valid = false;
        validation.errors.push(...mayActValidation.errors);
      }
      
      validation.warnings.push(...mayActValidation.warnings);
      
      // Normalize may_act claim if needed
      if (mayActValidation.normalized) {
        validation.normalized.may_act = mayActValidation.normalized;
      }
    }

    // Validate agent authorization
    if (claims.may_act && claims.may_act.sub) {
      const agentAuth = validateAgentAuthorization(claims.may_act, userPreferences);
      
      if (!agentAuth.valid) {
        validation.valid = false;
        validation.errors.push(...agentAuth.errors);
      }
      
      validation.warnings.push(...agentAuth.warnings);
    }

  } catch (error) {
    validation.valid = false;
    validation.errors.push(`Validation error: ${error.message}`);
  }

  return validation;
}

/**
 * Validate may_act claim structure according to RFC 8693
 */
function validateMayActStructure(mayAct) {
  const validation = {
    valid: true,
    errors: [],
    warnings: [],
    normalized: null
  };

  try {
    if (typeof mayAct !== 'object' || mayAct === null) {
      validation.valid = false;
      validation.errors.push('may_act claim must be an object');
      return validation;
    }

    const structure = DELEGATION_RULES.user_token.may_act_structure;
    
    // Check required fields
    for (const field of structure.required_fields) {
      if (!mayAct[field]) {
        validation.valid = false;
        validation.errors.push(`Missing required field in may_act: ${field}`);
      }
    }

    // Check sub field (agent identifier)
    if (mayAct.sub) {
      try {
        const agentValidation = validateIdentifierFormat(mayAct.sub, 'agent');
        
        if (!agentValidation.valid) {
          validation.valid = false;
          validation.errors.push(`Invalid agent identifier in may_act.sub: ${mayAct.sub}`);
        } else if (agentValidation.format === 'legacy') {
          validation.warnings.push(`Using legacy agent identifier format: ${mayAct.sub}`);
          validation.normalized = {
            ...mayAct,
            sub: agentValidation.mapped
          };
        }
      } catch (error) {
        validation.valid = false;
        validation.errors.push(`Agent identifier validation failed: ${error.message}`);
      }
    }

    // Validate optional fields
    for (const field of structure.optional_fields) {
      if (mayAct[field]) {
        if (field === 'client_id') {
          // Validate client_id format
          if (typeof mayAct[field] !== 'string') {
            validation.valid = false;
            validation.errors.push(`Invalid type for may_act.${field}: must be string`);
          }
        } else if (field === 'actor' || field === 'may_act') {
          // Validate nested actor/may_act objects
          const nestedValidation = validateNestedActor(mayAct[field], field);
          if (!nestedValidation.valid) {
            validation.valid = false;
            validation.errors.push(...nestedValidation.errors);
          }
          validation.warnings.push(...nestedValidation.warnings);
        }
      }
    }

  } catch (error) {
    validation.valid = false;
    validation.errors.push(`may_act structure validation failed: ${error.message}`);
  }

  return validation;
}

/**
 * Validate nested actor/may_act objects
 */
function validateNestedActor(actor, fieldName) {
  const validation = {
    valid: true,
    errors: [],
    warnings: []
  };

  try {
    if (typeof actor !== 'object' || actor === null) {
      validation.valid = false;
      validation.errors.push(`${fieldName} must be an object`);
      return validation;
    }

    if (actor.sub) {
      try {
        const agentValidation = validateIdentifierFormat(actor.sub, 'agent');
        if (!agentValidation.valid) {
          validation.valid = false;
          validation.errors.push(`Invalid agent identifier in ${fieldName}.sub: ${actor.sub}`);
        } else if (agentValidation.format === 'legacy') {
          validation.warnings.push(`Using legacy agent identifier in ${fieldName}.sub: ${actor.sub}`);
        }
      } catch (error) {
        validation.valid = false;
        validation.errors.push(`${fieldName}.sub validation failed: ${error.message}`);
      }
    }

  } catch (error) {
    validation.valid = false;
    validation.errors.push(`${fieldName} validation failed: ${error.message}`);
  }

  return validation;
}

/**
 * Validate agent authorization against user preferences
 */
function validateAgentAuthorization(mayAct, userPreferences) {
  const validation = {
    valid: true,
    errors: [],
    warnings: []
  };

  try {
    const authorizedAgents = userPreferences.authorizedAgents || [];
    const agentIdentifier = mayAct.sub || mayAct.client_id;

    if (!authorizedAgents.includes(agentIdentifier)) {
      validation.valid = false;
      validation.errors.push(`Agent not authorized: ${agentIdentifier}`);
      validation.warnings.push('Available authorized agents:', authorizedAgents);
    }

    // Check for authorization expiry
    if (userPreferences.authorizedAgentsExpiry) {
      const expiryTime = new Date(userPreferences.authorizedAgentsExpiry);
      if (new Date() > expiryTime) {
        validation.valid = false;
        validation.errors.push('Agent authorization has expired');
      }
    }

  } catch (error) {
    validation.valid = false;
    validation.errors.push(`Agent authorization validation failed: ${error.message}`);
  }

  return validation;
}

/**
 * Validate exchanged token act claim structure
 */
function validateExchangedTokenAct(claims) {
  const validation = {
    valid: true,
    errors: [],
    warnings: [],
    normalized: { ...claims }
  };

  try {
    // Check required claims
    const requiredClaims = DELEGATION_RULES.exchanged_token.required_claims;
    for (const claim of requiredClaims) {
      if (!claims[claim]) {
        validation.valid = false;
        validation.errors.push(`Missing required claim: ${claim}`);
      }
    }

    // Validate act claim structure
    if (claims.act) {
      const actValidation = validateActStructure(claims.act);
      
      if (!actValidation.valid) {
        validation.valid = false;
        validation.errors.push(...actValidation.errors);
      }
      
      validation.warnings.push(...actValidation.warnings);
      
      // Normalize act claim if needed
      if (actValidation.normalized) {
        validation.normalized.act = actValidation.normalized;
      }
    }

  } catch (error) {
    validation.valid = false;
    validation.errors.push(`Exchanged token validation error: ${error.message}`);
  }

  return validation;
}

/**
 * Validate act claim structure for exchanged tokens
 */
function validateActStructure(act) {
  const validation = {
    valid: true,
    errors: [],
    warnings: [],
    normalized: null
  };

  try {
    if (typeof act !== 'object' || act === null) {
      validation.valid = false;
      validation.errors.push('act claim must be an object');
      return validation;
    }

    const structure = DELEGATION_RULES.exchanged_token.act_structure;
    
    // Check required fields
    for (const field of structure.required_fields) {
      if (!act[field]) {
        validation.valid = false;
        validation.errors.push(`Missing required field in act: ${field}`);
      }
    }

    // Validate sub field (MCP server identifier)
    if (act.sub) {
      try {
        const mcpValidation = validateIdentifierFormat(act.sub, 'mcp_server');
        
        if (!mcpValidation.valid) {
          validation.valid = false;
          validation.errors.push(`Invalid MCP server identifier in act.sub: ${act.sub}`);
        } else if (mcpValidation.format === 'legacy') {
          validation.warnings.push(`Using legacy MCP server identifier format: ${act.sub}`);
          validation.normalized = {
            ...act,
            sub: mcpValidation.mapped
          };
        }
      } catch (error) {
        validation.valid = false;
        validation.errors.push(`MCP server identifier validation failed: ${error.message}`);
      }
    }

    // Validate nested act.act field (agent identifier)
    if (act.act && act.act.sub) {
      try {
        const agentValidation = validateIdentifierFormat(act.act.sub, 'agent');
        
        if (!agentValidation.valid) {
          validation.valid = false;
          validation.errors.push(`Invalid agent identifier in act.act.sub: ${act.act.sub}`);
        } else if (agentValidation.format === 'legacy') {
          validation.warnings.push(`Using legacy agent identifier in act.act.sub: ${act.act.sub}`);
          
          // Update normalized structure
          if (validation.normalized) {
            validation.normalized.act = {
              ...validation.normalized.act,
              act: {
                ...validation.normalized.act.act,
                sub: agentValidation.mapped
              }
            };
          }
        }
      } catch (error) {
        validation.valid = false;
        validation.errors.push(`Agent identifier in nested act validation failed: ${error.message}`);
      }
    }

  } catch (error) {
    validation.valid = false;
    validation.errors.push(`act structure validation failed: ${error.message}`);
  }

  return validation;
}

/**
 * Validate complete delegation chain integrity
 */
function validateDelegationChain(userToken, exchangedToken) {
  const validation = {
    valid: true,
    errors: [],
    warnings: [],
    chain: null
  };

  try {
    // Reconstruct delegation chain
    const chain = reconstructDelegationChain(userToken, exchangedToken);
    validation.chain = chain;

    // Verify chain structure: user -> agent -> mcp_server
    if (chain.length !== 3) {
      validation.valid = false;
      validation.errors.push(`Invalid delegation chain length: ${chain.length}`);
    }

    const [user, agent, mcpServer] = chain;

    // Verify user subject preservation
    if (user.sub !== exchangedToken.sub) {
      validation.valid = false;
      validation.errors.push('User subject not preserved in exchanged token');
    }

    // Verify agent authorization
    if (user.may_act && user.may_act.sub !== agent.sub) {
      validation.valid = false;
      validation.errors.push('Agent not authorized in may_act claim');
    }

    // Verify MCP server identity
    if (exchangedToken.act && exchangedToken.act.sub !== mcpServer.sub) {
      validation.valid = false;
      validation.errors.push('MCP server identity mismatch in act claim');
    }

    // Detect circular delegation
    const subjects = chain.map(node => node.sub);
    const uniqueSubjects = new Set(subjects);
    if (subjects.length !== uniqueSubjects.size) {
      validation.valid = false;
      validation.errors.push('Circular delegation detected in chain');
    }

  } catch (error) {
    validation.valid = false;
    validation.errors.push(`Delegation chain validation failed: ${error.message}`);
  }

  return validation;
}

/**
 * Reconstruct delegation chain from tokens
 */
function reconstructDelegationChain(userToken, exchangedToken) {
  return [
    {
      type: 'user',
      sub: userToken.sub,
      may_act: userToken.may_act,
      timestamp: new Date().toISOString()
    },
    {
      type: 'agent',
      sub: userToken.may_act?.sub,
      timestamp: new Date().toISOString()
    },
    {
      type: 'mcp_server',
      sub: exchangedToken.act?.sub,
      timestamp: new Date().toISOString()
    }
  ];
}

/**
 * Main delegation claims validation middleware
 */
function validateDelegationClaims(token, tokenType, userPreferences = {}) {
  const validation = {
    valid: true,
    errors: [],
    warnings: [],
    normalized: null,
    chain: null
  };

  try {
    let claims = token;

    // Decode JWT if needed
    if (typeof token === 'string') {
      claims = decodeJwtClaims(token);
    }

    if (!claims) {
      validation.valid = false;
      validation.errors.push('Unable to decode token claims');
      return validation;
    }

    // Validate based on token type
    if (tokenType === 'user') {
      const userValidation = validateUserTokenMayAct(claims, userPreferences);
      
      if (!userValidation.valid) {
        validation.valid = false;
        validation.errors.push(...userValidation.errors);
      }
      
      validation.warnings.push(...userValidation.warnings);
      
      if (userValidation.normalized) {
        validation.normalized = userValidation.normalized;
      }

    } else if (tokenType === 'exchanged') {
      const exchangedValidation = validateExchangedTokenAct(claims);
      
      if (!exchangedValidation.valid) {
        validation.valid = false;
        validation.errors.push(...exchangedValidation.errors);
      }
      
      validation.warnings.push(...exchangedValidation.warnings);
      
      if (exchangedValidation.normalized) {
        validation.normalized = exchangedValidation.normalized;
      }

    } else {
      validation.valid = false;
      validation.errors.push(`Unknown token type: ${tokenType}`);
    }

    // Log validation result
    writeExchangeEvent({
      type: 'delegation_claims_validation',
      level: validation.valid ? 'info' : 'error',
      tokenType,
      valid: validation.valid,
      errors: validation.errors,
      warnings: validation.warnings,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    validation.valid = false;
    validation.errors.push(`Delegation claims validation failed: ${error.message}`);
  }

  return validation;
}

/**
 * Decode JWT claims (simplified implementation)
 */
function decodeJwtClaims(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return null;
    }

    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    return payload;
  } catch (error) {
    return null;
  }
}

module.exports = {
  validateDelegationClaims,
  validateUserTokenMayAct,
  validateExchangedTokenAct,
  validateDelegationChain,
  validateIdentifierFormat,
  mapLegacyIdentifier,
  IDENTIFIER_FORMATS,
  DELEGATION_RULES
};
