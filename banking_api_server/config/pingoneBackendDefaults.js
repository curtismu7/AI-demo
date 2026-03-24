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
  pingone_environment_id: 'd02d2305-f445-406d-82ee-7cdbf6eeabfd',
  admin_client_id:        '949a748e-4dd0-44a3-944e-721ee1e3ca16f',
  user_client_id:         '5df1fbdb-0f2e-46b1-a5bb-86f456e83620',
  /** Redirect URIs are derived from the public app URL at runtime. */
  admin_redirect_uri: '',
  user_redirect_uri:  '',
  frontend_url:       '',
};
