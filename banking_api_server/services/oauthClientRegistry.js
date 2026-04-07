/**
 * OAuth Client Registry Service
 * Dynamic OAuth client registration and management for AI integrations
 * 
 * Phase 57-01: OAuth Client Registration System
 * Security-focused implementation with extensive validation and audit logging
 */

'use strict';

const crypto = require('crypto');
const configStore = require('./configStore');
const { writeExchangeEvent } = require('./exchangeAuditStore');
const { validateTokenExchangeConfig } = require('./tokenExchangeConfigValidator');

// Use existing MCP_TOOL_SCOPES for scope validation
const { MCP_TOOL_SCOPES } = require('./mcpWebSocketClient');

/**
 * Client registration validation rules
 */
const CLIENT_VALIDATION_RULES = {
  client_name: {
    required: true,
    minLength: 3,
    maxLength: 100,
    pattern: /^[a-zA-Z0-9\s\-_]+$/,
    description: 'Client display name'
  },
  client_type: {
    required: true,
    allowed: ['confidential'],
    description: 'OAuth client type'
  },
  grant_types: {
    required: true,
    allowed: ['client_credentials'],
    description: 'Supported OAuth grant types'
  },
  scope: {
    required: true,
    validator: validateRequestedScopes,
    description: 'Requested OAuth scopes'
  },
  token_endpoint_auth_method: {
    required: true,
    allowed: ['client_secret_basic', 'client_secret_post'],
    default: 'client_secret_basic',
    description: 'Token endpoint authentication method'
  },
  redirect_uris: {
    required: false,
    validator: validateRedirectUris,
    description: 'Redirect URIs (not used for client_credentials)'
  }
};

/**
 * Client metadata storage (in-memory for now, can be migrated to database)
 */
const clientRegistry = new Map();

/**
 * Client credential rotation tracking
 */
const clientRotation = new Map();

/**
 * Audit event logging for client operations
 */
function logClientEvent(eventType, clientId, details = {}) {
  const auditEvent = {
    type: 'oauth-client-event',
    level: 'info',
    timestamp: new Date().toISOString(),
    eventType,
    clientId,
    ...details,
    security: {
      sourceIP: details.sourceIP || 'unknown',
      userAgent: details.userAgent || 'unknown',
      requestId: details.requestId || crypto.randomUUID()
    }
  };

  writeExchangeEvent(auditEvent).catch(err => {
    console.error('[ClientRegistry] Failed to log client event:', err.message);
  });
}

/**
 * Validate requested scopes against existing MCP tool scopes
 */
function validateRequestedScopes(scopes) {
  if (!Array.isArray(scopes)) {
    return { valid: false, errors: ['Scopes must be an array'] };
  }

  const errors = [];
  const validScopes = new Set();
  
  // Extract all valid scopes from MCP_TOOL_SCOPES
  const allValidScopes = new Set();
  Object.values(MCP_TOOL_SCOPES).forEach(scopeArray => {
    scopeArray.forEach(scope => allValidScopes.add(scope));
  });

  // Add administrative scopes
  ['admin:read', 'admin:write', 'admin:delete', 'users:read', 'users:manage', 'ai_agent'].forEach(scope => {
    allValidScopes.add(scope);
  });

  scopes.forEach(scope => {
    if (typeof scope !== 'string') {
      errors.push(`Invalid scope type: ${typeof scope}`);
      return;
    }

    if (!allValidScopes.has(scope)) {
      errors.push(`Unknown scope: ${scope}`);
    } else {
      validScopes.add(scope);
    }
  });

  return {
    valid: errors.length === 0,
    errors,
    validScopes: Array.from(validScopes)
  };
}

/**
 * Validate redirect URIs (not used for client_credentials but required for OAuth 2.0 compliance)
 */
function validateRedirectUris(uris) {
  if (!Array.isArray(uris)) {
    return { valid: false, errors: ['Redirect URIs must be an array'] };
  }

  const errors = [];
  
  uris.forEach(uri => {
    if (typeof uri !== 'string') {
      errors.push(`Invalid URI type: ${typeof uri}`);
      return;
    }

    try {
      const url = new URL(uri);
      if (!['http', 'https'].includes(url.protocol)) {
        errors.push(`Invalid protocol in URI: ${uri}`);
      }
    } catch (err) {
      errors.push(`Invalid URI format: ${uri}`);
    }
  });

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Validate client registration request
 */
function validateClientRegistration(request) {
  const errors = [];
  const validated = {};

  Object.entries(CLIENT_VALIDATION_RULES).forEach(([field, rule]) => {
    const value = request[field];

    // Check required fields
    if (rule.required && (value === undefined || value === null || value === '')) {
      errors.push(`${field} is required`);
      return;
    }

    // Skip validation if field is not provided and not required
    if (!rule.required && (value === undefined || value === null)) {
      return;
    }

    // Apply validation rules
    if (rule.allowed && !rule.allowed.includes(value)) {
      errors.push(`${field} must be one of: ${rule.allowed.join(', ')}`);
      return;
    }

    if (rule.minLength && value.length < rule.minLength) {
      errors.push(`${field} must be at least ${rule.minLength} characters`);
      return;
    }

    if (rule.maxLength && value.length > rule.maxLength) {
      errors.push(`${field} must be no more than ${rule.maxLength} characters`);
      return;
    }

    if (rule.pattern && !rule.pattern.test(value)) {
      errors.push(`${field} contains invalid characters`);
      return;
    }

    // Apply custom validator
    if (rule.validator) {
      const validation = rule.validator(value);
      if (!validation.valid) {
        errors.push(...validation.errors.map(err => `${field}: ${err}`));
        return;
      }
      // Store validated result if validator returns one
      if (validation.validScopes) {
        validated[field] = validation.validScopes;
      } else {
        validated[field] = value;
      }
    } else {
      validated[field] = value;
    }
  });

  return {
    valid: errors.length === 0,
    errors,
    validated
  };
}

/**
 * Generate secure client credentials
 */
function generateClientCredentials() {
  const clientId = `mcp-client-${crypto.randomBytes(16).toString('hex')}`;
  const clientSecret = crypto.randomBytes(32).toString('hex');
  
  return {
    client_id: clientId,
    client_secret: clientSecret,
    client_id_issued_at: Math.floor(Date.now() / 1000),
    client_secret_expires_at: 0, // Non-expiring for client_credentials
    registration_access_token: crypto.randomBytes(32).toString('hex')
  };
}

/**
 * Register a new OAuth client
 */
async function registerOAuthClient(request, metadata = {}) {
  // Validate request
  const validation = validateClientRegistration(request);
  if (!validation.valid) {
    const error = new Error('Client registration validation failed');
    error.errors = validation.errors;
    error.status = 400;
    throw error;
  }

  // Generate client credentials
  const credentials = generateClientCredentials();
  
  // Create client record
  const clientRecord = {
    ...credentials,
    ...validation.validated,
    registration_metadata: {
      registered_at: new Date().toISOString(),
      registered_by: metadata.registeredBy || 'system',
      source_ip: metadata.sourceIP,
      user_agent: metadata.userAgent,
      request_id: metadata.requestId
    },
    status: 'active',
    last_used: null,
    usage_count: 0
  };

  // Store client record
  clientRegistry.set(credentials.client_id, clientRecord);

  // Log registration event
  logClientEvent('client_registered', credentials.client_id, {
    client_name: validation.validated.client_name,
    scopes: validation.validated.scope,
    grant_types: validation.validated.grant_types,
    ...metadata
  });

  // Return client credentials (only shown once)
  return {
    client_id: credentials.client_id,
    client_secret: credentials.client_secret,
    client_id_issued_at: credentials.client_id_issued_at,
    client_secret_expires_at: credentials.client_secret_expires_at,
    registration_access_token: credentials.registration_access_token,
    scope: validation.validated.scope.join(' ')
  };
}

/**
 * Get client information (for management)
 */
function getClient(clientId, includeSecret = false) {
  const client = clientRegistry.get(clientId);
  if (!client) {
    const error = new Error('Client not found');
    error.status = 404;
    throw error;
  }

  const response = {
    client_id: client.client_id,
    client_name: client.client_name,
    client_type: client.client_type,
    grant_types: client.grant_types,
    scope: client.scope,
    token_endpoint_auth_method: client.token_endpoint_auth_method,
    redirect_uris: client.redirect_uris || [],
    client_id_issued_at: client.client_id_issued_at,
    client_secret_expires_at: client.client_secret_expires_at,
    status: client.status,
    registration_metadata: client.registration_metadata,
    last_used: client.last_used,
    usage_count: client.usage_count
  };

  if (includeSecret) {
    response.client_secret = client.client_secret;
  }

  return response;
}

/**
 * Update client information
 */
function updateClient(clientId, updates, metadata = {}) {
  const client = clientRegistry.get(clientId);
  if (!client) {
    const error = new Error('Client not found');
    error.status = 404;
    throw error;
  }

  // Validate updates
  const validation = validateClientRegistration({ ...client, ...updates });
  if (!validation.valid) {
    const error = new Error('Client update validation failed');
    error.errors = validation.errors;
    error.status = 400;
    throw error;
  }

  // Update client record
  const updatedClient = {
    ...client,
    ...validation.validated,
    updated_at: new Date().toISOString(),
    updated_by: metadata.updatedBy || 'system',
    update_metadata: {
      source_ip: metadata.sourceIP,
      user_agent: metadata.userAgent,
      request_id: metadata.requestId
    }
  };

  clientRegistry.set(clientId, updatedClient);

  // Log update event
  logClientEvent('client_updated', clientId, {
    updates: Object.keys(updates),
    ...metadata
  });

  return getClient(clientId);
}

/**
 * Delete client
 */
function deleteClient(clientId, metadata = {}) {
  const client = clientRegistry.get(clientId);
  if (!client) {
    const error = new Error('Client not found');
    error.status = 404;
    throw error;
  }

  // Remove client
  clientRegistry.delete(clientId);
  clientRotation.delete(clientId);

  // Log deletion event
  logClientEvent('client_deleted', clientId, {
    client_name: client.client_name,
    ...metadata
  });
}

/**
 * Rotate client secret
 */
function rotateClientSecret(clientId, metadata = {}) {
  const client = clientRegistry.get(clientId);
  if (!client) {
    const error = new Error('Client not found');
    error.status = 404;
    throw error;
  }

  // Generate new secret
  const newSecret = crypto.randomBytes(32).toString('hex');
  
  // Update client with new secret
  const updatedClient = {
    ...client,
    client_secret: newSecret,
    client_secret_rotated_at: new Date().toISOString(),
    client_secret_rotation_count: (client.client_secret_rotation_count || 0) + 1,
    updated_at: new Date().toISOString(),
    updated_by: metadata.updatedBy || 'system'
  };

  clientRegistry.set(clientId, updatedClient);

  // Track rotation
  clientRotation.set(clientId, {
    last_rotation: new Date().toISOString(),
    rotation_count: updatedClient.client_secret_rotation_count,
    rotation_reason: metadata.reason || 'manual'
  });

  // Log rotation event
  logClientEvent('client_secret_rotated', clientId, {
    rotation_count: updatedClient.client_secret_rotation_count,
    ...metadata
  });

  return {
    client_id: clientId,
    client_secret: newSecret,
    client_secret_rotated_at: updatedClient.client_secret_rotated_at
  };
}

/**
 * List all clients (admin only)
 */
function listClients(filter = {}) {
  const clients = Array.from(clientRegistry.entries()).map(([clientId, client]) => ({
    client_id: clientId,
    client_name: client.client_name,
    client_type: client.client_type,
    grant_types: client.grant_types,
    scope: client.scope,
    status: client.status,
    client_id_issued_at: client.client_id_issued_at,
    last_used: client.last_used,
    usage_count: client.usage_count,
    registration_metadata: client.registration_metadata
  }));

  // Apply filters
  if (filter.status) {
    return clients.filter(client => client.status === filter.status);
  }

  if (filter.client_type) {
    return clients.filter(client => client.client_type === filter.client_type);
  }

  return clients;
}

/**
 * Validate client credentials for authentication
 */
function validateClientCredentials(clientId, clientSecret) {
  const client = clientRegistry.get(clientId);
  if (!client) {
    return { valid: false, error: 'Client not found' };
  }

  if (client.status !== 'active') {
    return { valid: false, error: 'Client is not active' };
  }

  if (client.client_secret !== clientSecret) {
    return { valid: false, error: 'Invalid client secret' };
  }

  // Update usage tracking
  client.last_used = new Date().toISOString();
  client.usage_count = (client.usage_count || 0) + 1;
  clientRegistry.set(clientId, client);

  return { valid: true, client };
}

/**
 * Get client statistics
 */
function getClientStatistics() {
  const clients = Array.from(clientRegistry.values());
  
  const stats = {
    total_clients: clients.length,
    active_clients: clients.filter(c => c.status === 'active').length,
    inactive_clients: clients.filter(c => c.status === 'inactive').length,
    clients_by_type: {},
    scope_usage: {},
    registrations_by_month: {},
    recent_registrations: clients
      .filter(c => {
        const regDate = new Date(c.registration_metadata.registered_at);
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        return regDate > thirtyDaysAgo;
      })
      .map(c => ({
        client_id: c.client_id,
        client_name: c.client_name,
        registered_at: c.registration_metadata.registered_at,
        usage_count: c.usage_count
      }))
  };

  // Count by client type
  clients.forEach(client => {
    stats.clients_by_type[client.client_type] = (stats.clients_by_type[client.client_type] || 0) + 1;
  });

  // Count scope usage
  clients.forEach(client => {
    client.scope.forEach(scope => {
      stats.scope_usage[scope] = (stats.scope_usage[scope] || 0) + 1;
    });
  });

  // Count registrations by month
  clients.forEach(client => {
    const month = new Date(client.registration_metadata.registered_at).toISOString().slice(0, 7);
    stats.registrations_by_month[month] = (stats.registrations_by_month[month] || 0) + 1;
  });

  return stats;
}

module.exports = {
  registerOAuthClient,
  getClient,
  updateClient,
  deleteClient,
  rotateClientSecret,
  listClients,
  validateClientCredentials,
  getClientStatistics
};
