// banking_api_server/routes/tokens.js
/**
 * Token Chain API endpoints
 * Provides real-time token status and content for the token chain display
 */

const express = require('express');
const router = express.Router();
const configStore = require('../services/configStore');
const oauthService = require('../services/oauthService');
const { getSessionAccessToken } = require('../services/mcpWebSocketClient');
const agentMcpTokenService = require('../services/agentMcpTokenService');

/**
 * Parse token content for display
 * @param {string} token - JWT token or other token string
 * @returns {Promise<Object>} Parsed token content
 */
async function parseTokenContent(token) {
  if (!token) return null;

  try {
    // Try to parse as JWT
    if (typeof token === 'string' && token.split('.').length === 3) {
      const parts = token.split('.');
      const header = JSON.parse(Buffer.from(parts[0], 'base64').toString());
      const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());

      return {
        type: 'JWT',
        header: {
          alg: header.alg,
          typ: header.typ,
          kid: header.kid
        },
        payload: {
          iss: payload.iss,
          sub: payload.sub,
          aud: payload.aud,
          exp: payload.exp,
          iat: payload.iat,
          jti: payload.jti,
          scope: payload.scope,
          client_id: payload.client_id,
          // Include act/may_act claims if present
          act: payload.act,
          may_act: payload.may_act,
          // Include other relevant claims
          email: payload.email,
          name: payload.name,
          roles: payload.roles,
          permissions: payload.permissions
        },
        expires_at: payload.exp ? new Date(payload.exp * 1000).toISOString() : null,
        issued_at: payload.iat ? new Date(payload.iat * 1000).toISOString() : null
      };
    }
  } catch (error) {
    // Not a valid JWT or parsing failed
    console.warn('Failed to parse token as JWT:', error.message);
  }

  // If not a JWT, return basic info
  return {
    type: 'Opaque',
    token_preview: token.substring(0, 20) + '...',
    length: token.length
  };
}

/**
 * Build the same object as GET /api/tokens/chain (shared with GET /api/tokens/:tokenId).
 */
async function buildTokenChain(req) {
  const tokenChain = {};

  const sessionToken = getSessionAccessToken(req);
  if (sessionToken) {
    tokenChain['banking-app-token'] = {
      status: 'active',
      content: await parseTokenContent(sessionToken),
      error: null
    };
  } else {
    tokenChain['banking-app-token'] = {
      status: 'waiting',
      content: null,
      error: 'No session token found'
    };
  }

  try {
    if (process.env.AGENT_OAUTH_CLIENT_ID) {
      const agentToken = await oauthService.getAgentClientCredentialsToken();
      tokenChain['agent-token'] = {
        status: 'active',
        content: await parseTokenContent(agentToken),
        error: null
      };
    } else {
      tokenChain['agent-token'] = {
        status: 'waiting',
        content: null,
        error: 'Agent OAuth not configured'
      };
    }
  } catch (error) {
    tokenChain['agent-token'] = {
      status: 'error',
      content: null,
      error: error.message
    };
  }

  try {
    const mcpResourceUri = configStore.getEffective('mcp_resource_uri');
    if (mcpResourceUri && sessionToken) {
      // Derive scopes from the user's actual token — PingOne can only narrow, not grant
      // scopes not present in the subject token. Avoids "At least one scope must be granted"
      // when ENDUSER_AUDIENCE is configured and the login only carries banking:agent:invoke.
      const userPayload = (() => {
        try {
          const parts = sessionToken.split('.');
          return parts.length === 3 ? JSON.parse(Buffer.from(parts[1], 'base64url').toString()) : {};
        } catch (_) { return {}; }
      })();
      const userScopeStr = typeof userPayload.scope === 'string' ? userPayload.scope : '';
      const bankingScopes = ['banking:read', 'banking:write', 'banking:accounts:read',
        'banking:transactions:read', 'banking:transactions:write', 'banking:admin',
        'banking:agent:invoke'];
      const exchangeScopes = bankingScopes.filter((s) => userScopeStr.split(' ').includes(s));
      // Fall back to banking:read if the user token carries none of the above
      // (e.g. OIDC-only token) so there is always at least one scope to attempt.
      const scopesForExchange = exchangeScopes.length > 0 ? exchangeScopes : ['banking:read'];
      const exchangedToken = await oauthService.performTokenExchange(
        sessionToken,
        mcpResourceUri,
        scopesForExchange
      );
      tokenChain['exchanged-token-mcp'] = {
        status: 'active',
        content: await parseTokenContent(exchangedToken),
        error: null
      };
    } else {
      tokenChain['exchanged-token-mcp'] = {
        status: 'waiting',
        content: null,
        error: mcpResourceUri ? 'No session token available' : 'MCP resource URI not configured'
      };
    }
  } catch (error) {
    tokenChain['exchanged-token-mcp'] = {
      status: 'error',
      content: null,
      error: error.message
    };
  }

  try {
    const mcpServerToken = await agentMcpTokenService.resolveMcpAccessToken(req, 'banking_get_account_balance');
    if (mcpServerToken) {
      tokenChain['mcp-server-token'] = {
        status: 'active',
        content: await parseTokenContent(mcpServerToken),
        error: null
      };
    } else {
      tokenChain['mcp-server-token'] = {
        status: 'waiting',
        content: null,
        error: 'Unable to resolve MCP server token'
      };
    }
  } catch (error) {
    tokenChain['mcp-server-token'] = {
      status: 'error',
      content: null,
      error: error.message
    };
  }

  try {
    const mcpResourceUri = configStore.getEffective('mcp_resource_uri');
    if (mcpResourceUri && sessionToken) {
      const finalToken = await agentMcpTokenService.resolveMcpAccessToken(req, 'banking_create_transfer');
      if (finalToken) {
        tokenChain['mcp-exchanged-token'] = {
          status: 'active',
          content: await parseTokenContent(finalToken),
          error: null
        };
      } else {
        tokenChain['mcp-exchanged-token'] = {
          status: 'waiting',
          content: null,
          error: 'Final token exchange pending'
        };
      }
    } else {
      tokenChain['mcp-exchanged-token'] = {
        status: 'waiting',
        content: null,
        error: 'Waiting for resource access request'
      };
    }
  } catch (error) {
    tokenChain['mcp-exchanged-token'] = {
      status: 'error',
      content: null,
      error: error.message
    };
  }

  return tokenChain;
}

/**
 * Get the current token chain status and content
 * GET /api/tokens/chain
 */
router.get('/chain', async (req, res) => {
  try {
    const tokenChain = await buildTokenChain(req);
    res.json(tokenChain);
  } catch (error) {
    console.error('Token chain API error:', error);
    res.status(500).json({ error: 'Failed to fetch token chain data' });
  }
});

/**
 * Token Chain dashboard preview: User Token from session + waiting/skipped rows (no exchange call).
 * GET /api/tokens/session-preview
 */
router.get('/session-preview', (req, res) => {
  try {
    const { tokenEvents } = agentMcpTokenService.buildSessionPreviewTokenEvents(req);
    res.json({ tokenEvents });
  } catch (error) {
    console.error('Token session-preview error:', error);
    res.status(500).json({ error: 'Failed to load session token preview' });
  }
});

/**
 * Get detailed information about a specific token in the chain (same keys as GET /chain).
 * GET /api/tokens/:tokenId
 */
router.get('/:tokenId', async (req, res) => {
  try {
    const { tokenId } = req.params;
    const chainData = await buildTokenChain(req);
    const tokenInfo = chainData[tokenId];
    if (!tokenInfo) {
      return res.status(404).json({
        error: 'Token not found',
        knownIds: Object.keys(chainData),
      });
    }
    res.json(tokenInfo);
  } catch (error) {
    console.error('Token detail API error:', error);
    res.status(500).json({ error: 'Failed to fetch token details' });
  }
});

/**
 * Validate a token
 * POST /api/tokens/validate
 */
router.post('/validate', async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) {
      return res.status(400).json({ error: 'Token is required' });
    }

    // Use OAuth service to validate token
    try {
      const validation = await oauthService.validateToken(token);
      res.json({
        valid: true,
        validation: validation
      });
    } catch (error) {
      res.json({
        valid: false,
        error: error.message
      });
    }
  } catch (error) {
    console.error('Token validation API error:', error);
    res.status(500).json({ error: 'Failed to validate token' });
  }
});

module.exports = router;
