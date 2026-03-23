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
 * @type {Record<string, string>}
 */
module.exports = {
  // ── Hosted demo defaults (Replit / Vercel) ─────────────────────────────────
  // Pre-filled so visitors never need to enter OAuth credentials.
  // Both apps use Authorization Code + PKCE (public client — no secret required).
  // Both support CIBA (back-channel auth) and RFC 8693 token exchange.
  // Secrets must still be supplied via deployment environment variables;
  // public IDs here are sufficient for PKCE-only flows.
  pingone_environment_id: 'b9817c16-9910-4415-b67e-4ac687da74d9',
  admin_client_id:  'c5762563-8c9f-4bcb-959e-a9d27eae06d7',
  user_client_id:   'a4f963ea-0736-456a-be72-b1fa4f63f81f',
  /** Redirect URIs are derived from the public app URL at runtime. */
  admin_redirect_uri: '',
  user_redirect_uri: '',
  frontend_url: '',
};
