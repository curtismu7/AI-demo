'use strict';

const oauthUserService = require('../services/oauthUserService');

/**
 * Effective access-token expiry (ms). Uses session.expiresAt when set; otherwise
 * decodes JWT `exp` so we still refresh when expiresAt was never persisted.
 */
function getAccessTokenExpiryMs(tokens) {
  if (tokens.expiresAt && typeof tokens.expiresAt === 'number') {
    return tokens.expiresAt;
  }
  const at = tokens.accessToken;
  if (!at || typeof at !== 'string' || at === '_cookie_session') return null;
  const parts = at.split('.');
  if (parts.length !== 3) return null;
  try {
    let payload;
    try {
      payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    } catch {
      const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      payload = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
    }
    return payload.exp ? payload.exp * 1000 : null;
  } catch (_e) {
    return null;
  }
}

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
    const effectiveExp = getAccessTokenExpiryMs(tokens);
    if (!effectiveExp) return next();
    if ((Date.now() + MARGIN) < effectiveExp) return next();

    console.log('[tokenRefresh] Access token expiring soon (or expired), refreshing...');
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
