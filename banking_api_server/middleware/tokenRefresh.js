'use strict';

const oauthUserService = require('../services/oauthUserService');

/**
 * Auto-refresh middleware (RFC 6749 §6).
 * If the session holds an end-user access token that is within 5 minutes of
 * expiry, silently refresh it before forwarding the request.
 * Skips cookie-restored sessions (accessToken === '_cookie_session') because
 * those do not have a real bearer token on this server.
 * Non-fatal: refresh errors are logged and the request continues unchanged.
 */
async function refreshIfExpiring(req, res, next) {
  try {
    const tokens = req.session?.oauthTokens;
    if (!tokens?.refreshToken) return next();
    if (tokens.accessToken === '_cookie_session') return next();

    const MARGIN = 5 * 60 * 1000; // 5 minutes
    if (!tokens.expiresAt || (Date.now() + MARGIN) < tokens.expiresAt) return next();

    console.log('[tokenRefresh] Access token expiring soon, refreshing...');
    const tokenData = await oauthUserService.refreshAccessToken(tokens.refreshToken);

    req.session.oauthTokens = {
      ...tokens,
      accessToken:  tokenData.access_token,
      refreshToken: tokenData.refresh_token || tokens.refreshToken,
      idToken:      tokenData.id_token      || tokens.idToken,
      expiresAt:    Date.now() + ((tokenData.expires_in || 3600) * 1000),
      tokenType:    tokenData.token_type    || 'Bearer',
    };

    req.session.save((err) => {
      if (err) console.error('[tokenRefresh] Session save error:', err);
    });

    next();
  } catch (err) {
    console.warn('[tokenRefresh] Auto-refresh failed (continuing):', err.message);
    next(); // Don't block the request on a refresh failure
  }
}

module.exports = { refreshIfExpiring };
