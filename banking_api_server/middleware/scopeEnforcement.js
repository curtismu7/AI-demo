/**
 * Scope Enforcement Middleware
 * Validates that tokens have the required scopes for accessing resources
 * Implements least-privilege principle and prevents privilege escalation
 */

const jwt = require('jsonwebtoken');
const { logger } = require('../utils/logger');


/**
 * Parse scope string into array
 * @param {string} scopeString - Space-separated scope string
 * @returns {Array<string>} Array of scopes
 */
function parseScopes(scopeString) {
  if (!scopeString || typeof scopeString !== 'string') {
    return [];
  }
  return scopeString.split(' ').filter(s => s.length > 0);
}

/**
 * Check if token has required scopes
 * @param {Array<string>} tokenScopes - Scopes from token
 * @param {Array<string>} requiredScopes - Required scopes
 * @param {boolean} requireAll - If true, all scopes required; if false, any scope sufficient
 * @returns {object} { hasAccess: boolean, missing: Array<string> }
 */
function checkScopes(tokenScopes, requiredScopes, requireAll = false) {
  const tokenScopeSet = new Set(tokenScopes);
  const missing = [];

  for (const required of requiredScopes) {
    if (!tokenScopeSet.has(required)) {
      missing.push(required);
    }
  }

  const hasAccess = requireAll 
    ? missing.length === 0 
    : missing.length < requiredScopes.length;

  return { hasAccess, missing };
}

/**
 * Extract scopes from token
 * @param {string} token - JWT token
 * @returns {Array<string>} Scopes from token
 */
function extractScopesFromToken(token) {
  try {
    const decoded = jwt.decode(token);
    if (!decoded || !decoded.scope) {
      return [];
    }
    return parseScopes(decoded.scope);
  } catch (error) {
    logger.error('Error extracting scopes from token', { error: error.message });
    return [];
  }
}

/**
 * Create scope enforcement middleware
 * @param {Array<string>|string} requiredScopes - Required scope(s)
 * @param {object} options - Options { requireAll: boolean }
 * @returns {Function} Express middleware
 */
function requireScopes(requiredScopes, options = {}) {
  const { requireAll = false } = options;
  const scopes = Array.isArray(requiredScopes) ? requiredScopes : [requiredScopes];

  return (req, res, next) => {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      logger.warn('Scope enforcement: No token provided', { path: req.path });
      return res.status(401).json({ 
        error: 'Authentication required',
        code: 'NO_TOKEN'
      });
    }

    const token = authHeader.substring(7);
    const tokenScopes = extractScopesFromToken(token);

    // Check if token has required scopes
    const { hasAccess, missing } = checkScopes(tokenScopes, scopes, requireAll);

    if (!hasAccess) {
      logger.warn('Scope enforcement: Insufficient scopes', {
        path: req.path,
        method: req.method,
        requiredScopes: scopes,
        tokenScopes,
        missing,
        user: req.session?.user?.id
      });

      return res.status(403).json({
        error: 'Insufficient permissions',
        code: 'INSUFFICIENT_SCOPE',
        required: scopes,
        missing,
        message: requireAll 
          ? `All scopes required: ${scopes.join(', ')}`
          : `At least one scope required: ${scopes.join(', ')}`
      });
    }

    // Attach scopes to request for downstream use
    req.tokenScopes = tokenScopes;

    logger.debug('Scope enforcement: Access granted', {
      path: req.path,
      requiredScopes: scopes,
      tokenScopes
    });

    next();
  };
}

/**
 * Scope definitions for different resources
 */
const Scopes = {
  // Account scopes
  ACCOUNTS_READ: 'banking:accounts:read',
  ACCOUNTS_WRITE: 'banking:accounts:write',
  ACCOUNTS_DELETE: 'banking:accounts:delete',
  
  // Transaction scopes
  TRANSACTIONS_READ: 'banking:transactions:read',
  TRANSACTIONS_CREATE: 'banking:transactions:create',
  
  // Transfer scopes
  TRANSFERS_CREATE: 'banking:transfers:create',
  TRANSFERS_READ: 'banking:transfers:read',
  
  // Admin scopes
  ADMIN: 'banking:admin',
  ADMIN_USERS: 'banking:admin:users',
  ADMIN_AUDIT: 'banking:admin:audit',
  
  // MCP scopes
  MCP_TOOLS: 'banking:mcp:tools',
  MCP_ADMIN: 'banking:mcp:admin',
  
  // OpenID scopes
  OPENID: 'openid',
  PROFILE: 'profile',
  EMAIL: 'email'
};

/**
 * Predefined middleware for common scope requirements
 */
const ScopeMiddleware = {
  // Account operations
  readAccounts: requireScopes(Scopes.ACCOUNTS_READ),
  writeAccounts: requireScopes(Scopes.ACCOUNTS_WRITE),
  deleteAccounts: requireScopes(Scopes.ACCOUNTS_DELETE),
  
  // Transaction operations
  readTransactions: requireScopes(Scopes.TRANSACTIONS_READ),
  createTransactions: requireScopes(Scopes.TRANSACTIONS_CREATE),
  
  // Transfer operations
  createTransfers: requireScopes(Scopes.TRANSFERS_CREATE),
  readTransfers: requireScopes(Scopes.TRANSFERS_READ),
  
  // Admin operations
  adminOnly: requireScopes(Scopes.ADMIN),
  adminUsers: requireScopes(Scopes.ADMIN_USERS),
  adminAudit: requireScopes(Scopes.ADMIN_AUDIT),
  
  // MCP operations
  mcpTools: requireScopes(Scopes.MCP_TOOLS),
  mcpAdmin: requireScopes(Scopes.MCP_ADMIN),
  
  // Combined requirements (require all)
  accountsFullAccess: requireScopes(
    [Scopes.ACCOUNTS_READ, Scopes.ACCOUNTS_WRITE],
    { requireAll: true }
  ),
  
  // Flexible requirements (require any)
  accountsAnyAccess: requireScopes(
    [Scopes.ACCOUNTS_READ, Scopes.ACCOUNTS_WRITE, Scopes.ADMIN],
    { requireAll: false }
  )
};

/**
 * Middleware to log scope usage for audit
 */
function scopeAuditMiddleware(req, _res, next) {
  if (req.tokenScopes && req.tokenScopes.length > 0) {
    logger.info('Scope usage', {
      path: req.path,
      method: req.method,
      scopes: req.tokenScopes,
      user: req.session?.user?.id,
      correlationId: req.correlationId
    });
  }
  next();
}

module.exports = {
  requireScopes,
  checkScopes,
  parseScopes,
  extractScopesFromToken,
  Scopes,
  ScopeMiddleware,
  scopeAuditMiddleware
};
