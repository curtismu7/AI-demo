// OAuth Scope Configuration for Banking API
// This file defines scope mappings for different environments and user types

/**
 * Default space-separated OIDC scopes for PingOne (authorize, CIBA, client metadata fallbacks).
 * Includes offline_access so the app can receive a refresh token when PingOne allows it on the app.
 */
const PINGONE_OIDC_DEFAULT_SCOPES_SPACE = 'openid profile email offline_access';

const BANKING_SCOPES = {
  // Core banking scopes (consolidated)
  BANKING_READ: 'banking:general:read',
  BANKING_WRITE: 'banking:general:write',
  
  // Administrative scope (consolidated from admin:full, admin:read, admin:write)
  ADMIN: 'banking:admin',
  
  // Sensitive data scope (consolidated from sensitive:read, sensitive:write)
  SENSITIVE: 'banking:sensitive',
  
  // AI Agent scope (consolidated from ai:agent:read, ai:agent:write, ai:agent:admin)
  AI_AGENT: 'banking:ai:agent',
  
  // Agent identity marker
  AI_AGENT_IDENTITY: 'ai_agent'
};

// User type to scope mappings
const USER_TYPE_SCOPES = {
  // Admin users get full access
  admin: [
    BANKING_SCOPES.ADMIN,
    BANKING_SCOPES.BANKING_READ,
    BANKING_SCOPES.BANKING_WRITE,
    BANKING_SCOPES.SENSITIVE,
    BANKING_SCOPES.AI_AGENT
  ],
  
  // Customer users get read/write access but no admin
  customer: [
    BANKING_SCOPES.BANKING_READ,
    BANKING_SCOPES.BANKING_WRITE,
    BANKING_SCOPES.AI_AGENT
  ],
  
  // Read-only users get only read access
  readonly: [
    BANKING_SCOPES.BANKING_READ
  ],
  
  // AI agents get full access including AI agent scope
  ai_agent: [
    BANKING_SCOPES.AI_AGENT,
    BANKING_SCOPES.AI_AGENT_IDENTITY,
    BANKING_SCOPES.BANKING_READ,
    BANKING_SCOPES.BANKING_WRITE
  ]
};

// Environment-specific scope configurations
const ENVIRONMENT_CONFIGS = {
  development: {
    // Development allows all scopes for testing
    allowedScopes: Object.values(BANKING_SCOPES),
    strictValidation: false,
    debugScopes: true,
    defaultUserType: 'customer',
    scopeValidationTimeout: 5000, // 5 seconds
    cacheTokenValidation: false
  },
  
  test: {
    // Test environment with relaxed validation
    allowedScopes: Object.values(BANKING_SCOPES),
    strictValidation: false,
    debugScopes: true,
    defaultUserType: 'customer',
    scopeValidationTimeout: 1000, // 1 second for fast tests
    cacheTokenValidation: false,
    skipTokenSignatureValidation: true
  },
  
  staging: {
    // Staging environment with production-like settings
    allowedScopes: Object.values(BANKING_SCOPES),
    strictValidation: true,
    debugScopes: false,
    defaultUserType: 'readonly',
    scopeValidationTimeout: 10000, // 10 seconds
    cacheTokenValidation: true,
    cacheTTL: 300 // 5 minutes
  },
  
  production: {
    // Production environment with strict validation
    allowedScopes: Object.values(BANKING_SCOPES),
    strictValidation: true,
    debugScopes: false,
    defaultUserType: 'readonly',
    scopeValidationTimeout: 10000, // 10 seconds
    cacheTokenValidation: true,
    cacheTTL: 600 // 10 minutes
  }
};

// Route-to-scope mapping (enhanced from existing middleware)
const ROUTE_SCOPE_MAP = {
  // Account routes
  'GET /api/accounts': [BANKING_SCOPES.BANKING_READ],
  'GET /api/accounts/my': [BANKING_SCOPES.BANKING_READ],
  'GET /api/accounts/:id': [BANKING_SCOPES.BANKING_READ],
  'GET /api/accounts/:id/balance': [BANKING_SCOPES.BANKING_READ],
  'POST /api/accounts': [BANKING_SCOPES.BANKING_WRITE],
  'PUT /api/accounts/:id': [BANKING_SCOPES.BANKING_WRITE],
  'DELETE /api/accounts/:id': [BANKING_SCOPES.BANKING_WRITE],
  
  // Transaction routes
  'GET /api/transactions': [BANKING_SCOPES.BANKING_READ],
  'GET /api/transactions/my': [BANKING_SCOPES.BANKING_READ],
  'GET /api/transactions/:id': [BANKING_SCOPES.BANKING_READ],
  'POST /api/transactions': [BANKING_SCOPES.BANKING_WRITE],
  'POST /api/transactions/deposit': [BANKING_SCOPES.BANKING_WRITE],
  'POST /api/transactions/withdraw': [BANKING_SCOPES.BANKING_WRITE],
  'POST /api/transactions/transfer': [BANKING_SCOPES.BANKING_WRITE],
  'PUT /api/transactions/:id': [BANKING_SCOPES.BANKING_WRITE],
  'DELETE /api/transactions/:id': [BANKING_SCOPES.BANKING_WRITE],
  
  // Admin routes
  'GET /api/admin/*': [BANKING_SCOPES.ADMIN],
  'POST /api/admin/*': [BANKING_SCOPES.ADMIN],
  'PUT /api/admin/*': [BANKING_SCOPES.ADMIN],
  'DELETE /api/admin/*': [BANKING_SCOPES.ADMIN],
  
  // Sensitive data routes
  'GET /api/sensitive/*': [BANKING_SCOPES.SENSITIVE],
  'POST /api/sensitive/*': [BANKING_SCOPES.SENSITIVE],
  'PUT /api/sensitive/*': [BANKING_SCOPES.SENSITIVE],
  
  // User routes (general banking read access)
  'GET /api/users': [BANKING_SCOPES.BANKING_READ],
  'GET /api/users/me': [BANKING_SCOPES.BANKING_READ],
  'GET /api/users/:id': [BANKING_SCOPES.BANKING_READ],
  'POST /api/users': [BANKING_SCOPES.BANKING_WRITE],
  'PUT /api/users/:id': [BANKING_SCOPES.BANKING_WRITE],
  'DELETE /api/users/:id': [BANKING_SCOPES.BANKING_WRITE]
};

// OAuth provider scope configuration templates
const OAUTH_PROVIDER_SCOPE_CONFIGS = {
  // PingOne AI IAM Core scope configuration
  pingone_ai_core: {
    // Admin client scopes
    adminClient: {
      defaultScopes: ['openid', 'profile', 'email', 'offline_access'],
      bankingScopes: [
        BANKING_SCOPES.ADMIN,
        BANKING_SCOPES.BANKING_READ,
        BANKING_SCOPES.BANKING_WRITE,
        BANKING_SCOPES.SENSITIVE,
        BANKING_SCOPES.AI_AGENT
      ]
    },
    
    // End user client scopes
    endUserClient: {
      defaultScopes: ['openid', 'profile', 'email'],
      bankingScopes: [
        BANKING_SCOPES.BANKING_READ,
        BANKING_SCOPES.BANKING_WRITE,
        BANKING_SCOPES.AI_AGENT
      ]
    },
    
    // AI agent client scopes
    aiAgentClient: {
      defaultScopes: ['openid', 'profile', 'offline_access'],
      bankingScopes: [
        BANKING_SCOPES.AI_AGENT,
        BANKING_SCOPES.AI_AGENT_IDENTITY,
        BANKING_SCOPES.BANKING_READ,
        BANKING_SCOPES.BANKING_WRITE
      ]
    }
  }
};

// Get configuration for current environment
const getCurrentEnvironmentConfig = () => {
  const env = process.env.NODE_ENV || 'development';
  return ENVIRONMENT_CONFIGS[env] || ENVIRONMENT_CONFIGS.development;
};

// Get scopes for user type
const getScopesForUserType = (userType) => {
  return USER_TYPE_SCOPES[userType] || USER_TYPE_SCOPES.readonly;
};

// Validate scope against environment configuration
const isValidScope = (scope) => {
  const config = getCurrentEnvironmentConfig();
  return config.allowedScopes.includes(scope);
};

// Get OAuth provider configuration
const getOAuthProviderConfig = (provider = 'pingone_ai_core') => {
  return OAUTH_PROVIDER_SCOPE_CONFIGS[provider] || OAUTH_PROVIDER_SCOPE_CONFIGS.pingone_ai_core;
};

module.exports = {
  PINGONE_OIDC_DEFAULT_SCOPES_SPACE,
  BANKING_SCOPES,
  USER_TYPE_SCOPES,
  ENVIRONMENT_CONFIGS,
  ROUTE_SCOPE_MAP,
  OAUTH_PROVIDER_SCOPE_CONFIGS,
  getCurrentEnvironmentConfig,
  getScopesForUserType,
  isValidScope,
  getOAuthProviderConfig
};