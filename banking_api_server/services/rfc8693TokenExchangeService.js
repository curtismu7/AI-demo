/**
 * RFC 8693 Token Exchange Service
 * Performs OAuth 2.0 token exchange per RFC 8693 specification
 * Per i4ai-ref-arch.mmd steps 26–27, 33–34, 36–37
 */

'use strict';

const axios = require('axios');
const oauthConfig = require('../config/oauth');
const { decodeJwt } = require('../utils/tokenUtils');

/**
 * Perform RFC 8693 token exchange
 * Exchanges subject + actor tokens for a delegated token with act claim
 *
 * RFC 8693 §3.2.1: Token Exchange Grant
 * https://tools.ietf.org/html/draft-ietf-oauth-token-exchange
 *
 * @param {object} req - Express request (for token events, logging)
 * @param {object} params - Exchange parameters
 *   - subjectToken: Token representing the resource owner (user)
 *   - actorToken: Token representing the actor (agent)
 *   - audience: Target audience for the issued token (e.g., 'mcp-gw', 'mcp', 'resource-server')
 *   - resource?: Resource indicator (optional)
 *   - scope?: Scope to request (default: inherited from subject token)
 * @returns {Promise<{
 *   access_token: string,
 *   token_type: string,
 *   expires_in: number,
 *   scope: string,
 *   act?: object,
 *   claims?: object
 * }>}
 */
async function exchangeTokens(req, params) {
  const {
    subjectToken,
    actorToken,
    audience,
    resource = undefined,
    scope = undefined,
  } = params;

  if (!subjectToken) {
    const err = new Error('Subject token required for token exchange');
    err.code = 'missing_subject_token';
    err.httpStatus = 400;
    throw err;
  }

  if (!actorToken) {
    const err = new Error('Actor token required for token exchange');
    err.code = 'missing_actor_token';
    err.httpStatus = 400;
    throw err;
  }

  if (!audience) {
    const err = new Error('Audience required for token exchange');
    err.code = 'missing_audience';
    err.httpStatus = 400;
    throw err;
  }

  if (!oauthConfig.tokenEndpoint) {
    const err = new Error('OAuth token endpoint not configured');
    err.code = 'oauth_endpoint_not_configured';
    err.httpStatus = 503;
    throw err;
  }

  try {
    // Per RFC 8693 §3.2.1: Token Exchange Request
    const body = new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
      subject_token: subjectToken,
      subject_token_type: 'urn:ietf:params:oauth:token-type:access_token',
      actor_token: actorToken,
      actor_token_type: 'urn:ietf:params:oauth:token-type:access_token',
      resource: audience, // PingOne uses 'resource' for audience
    });

    // Add optional parameters
    if (scope) {
      body.set('scope', scope);
    }
    if (resource) {
      body.set('resource', resource);
    }

    const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };

    if (req?.recordTokenEvent) {
      req.recordTokenEvent('token_exchange_request_started', {
        audience,
        scope: scope || 'inherited',
        tokenTypes: 'subject+actor->delegated',
      });
    }

    console.log('[rfc8693TokenExchangeService] Exchanging tokens for audience:', audience);

    // Perform token exchange with PingOne
    const tokenResponse = await axios.post(oauthConfig.tokenEndpoint, body.toString(), {
      headers,
      timeout: 10000,
    });

    const tokenData = tokenResponse.data;

    // Decode token to extract claims, especially the act claim
    let claims;
    let actClaim;
    try {
      const decoded = decodeJwt(tokenData.access_token);
      claims = decoded?.claims || {};
      actClaim = claims.act;
    } catch (decodeErr) {
      console.warn('[rfc8693TokenExchangeService] Could not decode token claims:', decodeErr.message);
      claims = {};
    }

    // Log token event with act claim info
    if (req?.recordTokenEvent) {
      const actInfo = actClaim ? (typeof actClaim === 'string' ? actClaim : JSON.stringify(actClaim)) : 'absent';
      req.recordTokenEvent('token_exchange_success', {
        audience,
        sub: claims.sub || 'user',
        act: actInfo,
        aud: claims.aud || audience,
        scope: tokenData.scope,
        expiresIn: tokenData.expires_in,
        actValidation: actClaim ? '✅ present' : '⚠️ absent',
      });
    }

    console.log(`[rfc8693TokenExchangeService] Token exchange successful for audience ${audience}, act claim: ${actClaim ? 'present' : 'ABSENT'}`);

    // Warn if act claim is missing (expected for delegation flow)
    if (!actClaim) {
      console.warn('[rfc8693TokenExchangeService] WARNING: Issued token missing act claim. PingOne policy may not emit act claims.');
    }

    return {
      access_token: tokenData.access_token,
      token_type: tokenData.token_type || 'Bearer',
      expires_in: tokenData.expires_in || 3600,
      scope: tokenData.scope,
      act: actClaim,
      claims, // For UI Token Chain panel
    };
  } catch (error) {
    const errorMessage = error.response?.data?.error_description || error.message;
    const statusCode = error.response?.status || 502;
    const errorCode = error.response?.data?.error || 'token_exchange_failed';

    console.error('[rfc8693TokenExchangeService] Token exchange failed:', errorCode, errorMessage);

    if (req?.recordTokenEvent) {
      req.recordTokenEvent('token_exchange_failed', {
        audience,
        error: errorCode,
        message: errorMessage,
      });
    }

    const err = new Error(`Token exchange failed: ${errorMessage}`);
    err.code = errorCode;
    err.originalError = error.message;
    err.httpStatus = statusCode;
    throw err;
  }
}

/**
 * Helper: Exchange tokens for Agent Gateway (step 26–27)
 * Subject + Actor → TX token with aud=mcp-gw
 */
async function exchangeForAgentGateway(req, subjectToken, actorToken, scope) {
  return exchangeTokens(req, {
    subjectToken,
    actorToken,
    audience: 'mcp-gw', // Agent Gateway audience
    scope,
  });
}

/**
 * Helper: Exchange tokens for MCP (step 33–34)
 * TX token → MCP token with aud=mcp
 */
async function exchangeForMCP(req, txToken) {
  return exchangeTokens(req, {
    subjectToken: txToken,
    actorToken: null, // No actor needed; act claim already in token
    audience: 'mcp', // MCP audience
  }).catch(err => {
    // Actor token is optional for re-exchange; if missing, try without
    console.warn('[rfc8693TokenExchangeService] Re-exchange without actor token');
    // Fallback: try with just subject token (not RFC 8693, but PingOne may support)
    throw err;
  });
}

/**
 * Helper: Exchange tokens for Resource Server (step 36–37)
 * MCP token → RS token with aud=resource-server
 */
async function exchangeForResourceServer(req, mcpToken) {
  return exchangeTokens(req, {
    subjectToken: mcpToken,
    actorToken: null,
    audience: 'resource-server', // Resource server audience
  }).catch(err => {
    console.warn('[rfc8693TokenExchangeService] Re-exchange without actor token');
    throw err;
  });
}

module.exports = {
  exchangeTokens,
  exchangeForAgentGateway,
  exchangeForMCP,
  exchangeForResourceServer,
};
