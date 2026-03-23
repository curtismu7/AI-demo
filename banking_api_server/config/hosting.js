'use strict';

/**
 * Deployment target detection (Vercel, Replit, local).
 * Replit usually has a persistent filesystem (SQLite works); Vercel serverless does not.
 */

function isVercel() {
  return !!process.env.VERCEL;
}

/** True in a Replit Repl or Replit Deployment (env set by the platform). */
function isReplit() {
  return !!(process.env.REPL_ID || process.env.REPLIT_DEPLOYMENT);
}

/**
 * OAuth client IDs/secrets are supplied only via env/KV — Config UI hides the full editor (hosted demo style).
 * On Replit, set REPLIT_MANAGED_OAUTH=true when mirroring the old Vercel demo behavior.
 */
function isDeploymentManagedPingOneOAuth() {
  return isVercel() || process.env.REPLIT_MANAGED_OAUTH === 'true';
}

/**
 * Prefer ADMIN_CONFIG_PASSWORD + X-Config-Password when sessions are unreliable (Vercel), or opt-in on Replit.
 */
function useConfigPasswordHeader() {
  return isVercel() || process.env.REPLIT_CONFIG_PASSWORD_MODE === 'true';
}

/**
 * Extra referer logging for OAuth callbacks on known hosted stacks (canonical URL / PingOne flows).
 */
function shouldCheckOAuthCallbackReferer() {
  return isVercel() || isReplit();
}

module.exports = {
  isVercel,
  isReplit,
  isDeploymentManagedPingOneOAuth,
  useConfigPasswordHeader,
  shouldCheckOAuthCallbackReferer,
};
