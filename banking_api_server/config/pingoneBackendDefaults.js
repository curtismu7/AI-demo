'use strict';

/**
 * Optional baked-in PingOne **public** identifiers (no secrets).
 *
 * Use this file to pin the hosted app to a specific tenant without asking
 * end users to configure OAuth in the UI. Client **secrets** must never be
 * committed — supply them via deployment secrets (Vercel) or KV/SQLite.
 *
 * Leave values empty ('') to fall back to environment variables / Config UI / KV.
 *
 * Priority order (highest → lowest):
 *   1. KV / SQLite runtime config (Config UI)
 *   2. Vercel / deployment environment variables (PINGONE_ENVIRONMENT_ID, etc.)
 *   3. Values in this file (last resort — only used when env vars are absent)
 *
 * @type {Record<string, string>}
 */
module.exports = {
  // All empty — rely on Vercel env vars or Config UI.
  // Set PINGONE_ENVIRONMENT_ID, PINGONE_AI_CORE_CLIENT_ID, PINGONE_AI_CORE_USER_CLIENT_ID
  // (and their _SECRET counterparts) in your Vercel project settings.
  pingone_environment_id: '',
  admin_client_id:        '',
  user_client_id:         '',
  /** Redirect URIs are derived from the public app URL at runtime. */
  admin_redirect_uri: '',
  user_redirect_uri:  '',
  frontend_url:       '',
};
