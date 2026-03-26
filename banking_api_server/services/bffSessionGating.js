// banking_api_server/services/bffSessionGating.js
'use strict';

/**
 * True when the UI looks signed in but the BFF has no real OAuth tokens (Vercel cookie fallback).
 * @param {{ session?: object } | null | undefined} req
 * @returns {boolean}
 */
function isCookieOnlyBffSession(req) {
  return (
    req.session?._restoredFromCookie === true ||
    req.session?.oauthTokens?.accessToken === '_cookie_session'
  );
}

const SESSION_NOT_HYDRATED_MESSAGE =
  'Signed-in state was restored from a cookie, not a full server session — the access token is not available on this instance. ' +
  'On Vercel: use a wire-protocol Redis URL (REDIS_URL or KV_URL as rediss://…), or UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN, or KV_REST_API_URL + KV_REST_API_TOKEN. ' +
  'If REDIS_URL is https:// (REST), remove or replace it — connect-redis needs redis(s)://. Redeploy; sign out; sign in again. ' +
  'Open GET /api/auth/debug — bffSessionStore should be "redis", sessionRestored false after a fresh login. ' +
  '“Refresh access token” cannot fix cookie-only sessions until a real Redis session holds refresh_token.';

/**
 * 401 body for MCP/BFF routes when there is no bearer-equivalent session token.
 * @param {{ session?: object } | null | undefined} req
 * @param {unknown} [tokenEvents]
 * @returns {{ status: number, body: object }}
 */
function mcpNoBearerResponse(req, tokenEvents) {
  if (isCookieOnlyBffSession(req)) {
    return {
      status: 401,
      body: {
        error: 'session_not_hydrated',
        message: SESSION_NOT_HYDRATED_MESSAGE,
        tokenEvents,
      },
    };
  }
  return {
    status: 401,
    body: {
      error: 'authentication_required',
      message: 'Sign in to use the banking agent.',
      tokenEvents,
    },
  };
}

module.exports = {
  isCookieOnlyBffSession,
  mcpNoBearerResponse,
  SESSION_NOT_HYDRATED_MESSAGE,
};
