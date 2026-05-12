'use strict';
/**
 * /internal/id-token — gateway-only endpoint
 *
 * Returns the current user's id_token to the MCP Gateway server-to-server.
 * This is the ONLY place the raw id_token leaves the BFF. The endpoint:
 *   - is NOT mounted under /api/* (browser-facing prefix)
 *   - requires a shared secret (x-internal-gateway-secret) matching BFF_INTERNAL_SECRET
 *   - reads the id_token from the session store keyed by x-subject-sub
 *
 * The SPA NEVER calls this. CLAUDE.md "Token custody rule" applies.
 *
 * Status codes:
 *   200  { idToken: '<jwt>' }         — success
 *   400  missing_sub                  — x-subject-sub header absent
 *   403  forbidden                    — missing or wrong x-internal-gateway-secret
 *   404  session_not_found            — no session matched the subject sub
 *   412  id_token_missing             — session exists but no idToken (openid scope absent)
 *   503  session_store_unavailable    — memory-store fallback or store not registered
 */
const express = require('express');
const crypto = require('crypto');
const router = express.Router();

// BL-03: must match banking_mcp_gateway/src/config.ts DEFAULT_BFF_INTERNAL_SECRET.
// Production startup refuses this literal so the dev fallback can't ship.
const DEFAULT_INTERNAL_SECRET = 'dev-shared-secret-change-me';
const INTERNAL_SECRET = process.env.BFF_INTERNAL_SECRET || DEFAULT_INTERNAL_SECRET;
const INTERNAL_SECRET_BUF = Buffer.from(INTERNAL_SECRET);

if (process.env.NODE_ENV === 'production' && INTERNAL_SECRET === DEFAULT_INTERNAL_SECRET) {
  // Fail-hard at module load: /internal/id-token would otherwise be open to
  // anyone who knows the public default secret. Symmetric with the gateway
  // assertion in banking_mcp_gateway/src/config.ts::assertProductionSecrets.
  // eslint-disable-next-line no-console
  console.error(
    '[BFF] FATAL: BFF_INTERNAL_SECRET is set to the committed dev default ' +
    `('${DEFAULT_INTERNAL_SECRET}') and NODE_ENV=production. ` +
    'Refusing to start. Set BFF_INTERNAL_SECRET to a unique 32+ byte secret.',
  );
  process.exit(1);
}

router.get('/id-token', (req, res) => {
  const presented = req.headers['x-internal-gateway-secret'];
  // Constant-time comparison — short-circuit equality leaks per-byte timing to an
  // attacker with network or SSRF access to the bound 0.0.0.0 interface.
  const presentedBuf = typeof presented === 'string' ? Buffer.from(presented) : null;
  if (
    !presentedBuf ||
    presentedBuf.length !== INTERNAL_SECRET_BUF.length ||
    !crypto.timingSafeEqual(presentedBuf, INTERNAL_SECRET_BUF)
  ) {
    return res.status(403).json({ error: 'forbidden' });
  }

  // The session is bound to a cookie the gateway doesn't have; the gateway
  // identifies the user via x-subject-sub from the validated MCP token.
  const sub = req.headers['x-subject-sub'];
  if (!sub) return res.status(400).json({ error: 'missing_sub' });

  // Read the registered sessionStore. server.js calls app.set('sessionStore', sessionStore)
  // after instantiation (only when a real store is created; memory fallback does NOT
  // register, so we get undefined here and return 503 — graceful failure for fresh
  // installs that haven't migrated to a persistent store).
  const sessionStore = req.app.get('sessionStore');
  if (!sessionStore || typeof sessionStore.all !== 'function') {
    return res.status(503).json({ error: 'session_store_unavailable' });
  }

  // sqliteSessionStore.all(cb) signature: cb(err, sessions[]) where sessions is an
  // ARRAY of parsed session objects (JSON.parse already applied by the store).
  //
  // W5 NOTE (performance): this enumerates EVERY session per gateway tool call.
  // For the Phase 266 demo (<100 sessions) the cost is negligible. For any realistic
  // scale, replace with a sub-indexed lookup (e.g., add a sub_index column to the
  // sqlite session schema and SELECT WHERE sub = ?). Deferred — out of scope for Phase 266.
  sessionStore.all((err, sessions) => {
    if (err) return res.status(500).json({ error: 'session_store_error' });
    const all = Array.isArray(sessions) ? sessions : (sessions ? Object.values(sessions) : []);
    const match = all.find((s) => {
      const tokens = s && s.oauthTokens;
      if (!tokens) return false;
      return tokens.subjectSub === sub || tokens.sub === sub;
    });
    if (!match) return res.status(404).json({ error: 'session_not_found' });
    const idToken = match.oauthTokens && match.oauthTokens.idToken;
    if (!idToken) return res.status(412).json({ error: 'id_token_missing' });
    return res.json({ idToken });
  });
});

module.exports = router;
