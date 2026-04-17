/**
 * MCP Token Validator Middleware
 * 
 * Validates token type and basic claims before MCP tool calls.
 * Token must be agent type and not expired.
 * 
 * Usage:
 *   router.post('/tools/call', mcpTokenValidator(), (req, res) => { ... })
 */

import McpErrorFormatter from '../services/mcpErrorFormatter.js';

/**
 * Create middleware that validates token for MCP server
 * @returns {function} Express middleware
 */
export default function mcpTokenValidator() {
  return (req, res, next) => {
    const token = req.user?.token;

    // Check if token exists
    if (!token) {
      return McpErrorFormatter.formatMcpError(
        res,
        'NO_TOKEN',
        'Token required for MCP tool access',
        { endpoint: req.path }
      );
    }

    // Check token type is 'agent' (not 'user' or 'system')
    const tokenType = token.token_type || token.typ;
    if (tokenType && tokenType !== 'agent') {
      return McpErrorFormatter.formatMcpError(
        res,
        'TOKEN_TYPE_MISMATCH',
        'This endpoint requires an agent token, not a user token',
        {
          actual_type: tokenType,
          required_type: 'agent',
          token_subject: token.sub,
        }
      );
    }

    // Check token expiration
    if (token.exp) {
      const nowSeconds = Math.floor(Date.now() / 1000);
      if (token.exp < nowSeconds) {
        return McpErrorFormatter.formatMcpError(
          res,
          'TOKEN_EXPIRED',
          `Token expired at ${new Date(token.exp * 1000).toISOString()}`,
          {
            expires_at: new Date(token.exp * 1000).toISOString(),
            expired_seconds_ago: nowSeconds - token.exp,
          }
        );
      }
    }

    // Token validation passed, proceed
    next();
  };
}
