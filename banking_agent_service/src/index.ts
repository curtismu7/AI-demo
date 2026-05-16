'use strict';

/**
 * banking-agent-service — entry point
 *
 * REST API surface:
 *   POST /api/agent/reason — stateless reasoning step (shared-secret gated;
 *                            BFF keeps token custody — no user token crosses
 *                            this boundary)
 *   GET  /health           — liveness probe
 *
 * Start: BFF_INTERNAL_SECRET=... node dist/index.js
 */

import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import { loadConfig } from './config';
import { loadVaultIntoEnv } from './vault';
import { makeReasonHandler } from './reasonRoute';

// Vault load MUST run (and complete) BEFORE loadConfig() reads process.env.
// loadVaultIntoEnv is async (Argon2id KDF), so — exactly like
// banking_mcp_gateway/src/index.ts — the entire module body is wrapped in a
// single async IIFE. All existing logic below is byte-for-byte preserved
// inside it. dotenv.config() stays at top-of-module (above) so .env still
// loads first for non-secret vars; vault entries override .env per allowlist.
let config: ReturnType<typeof loadConfig>;
(async () => {
try {
  const vaultResult = await loadVaultIntoEnv();
  if (vaultResult.loaded) {
    console.log('[Agent vault] loaded ' + vaultResult.entries + ' entries into process.env');
  }
} catch (err) {
  console.error(
    '[Agent vault] startup load failed; refusing to start.',
    err instanceof Error ? err.message : err,
  );
  process.exit(1);
}

try {
  config = loadConfig();
} catch (err) {
  console.error('[Agent] Configuration error:', err instanceof Error ? err.message : err);
  process.exit(1);
}

const app = express();

// ---------------------------------------------------------------------------
// POST /api/agent/reason
// :3006 is reasoning-only — the BFF keeps token custody. This endpoint is
// gated by the same x-internal-gateway-secret shared-secret convention as the
// repo's existing /internal/id-token path. Fail hard if the secret is unset so
// a misconfigured deploy can't expose an open reasoning endpoint.
// ---------------------------------------------------------------------------

const INTERNAL_SECRET = process.env.BFF_INTERNAL_SECRET || '';
if (!INTERNAL_SECRET) {
  console.error('[Agent] FATAL: BFF_INTERNAL_SECRET unset — /api/agent/reason would be open. Refusing to start.');
  process.exit(1);
}
app.post('/api/agent/reason', express.json({ limit: '256kb' }), makeReasonHandler(INTERNAL_SECRET));

// ---------------------------------------------------------------------------
// GET /health
// ---------------------------------------------------------------------------

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'banking-agent-service', ts: new Date().toISOString() });
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

app.listen(config.port, config.host, () => {
  console.log(`[Agent] banking-agent-service running on ${config!.host}:${config!.port}`);
  if (config!.host === '0.0.0.0') {
    console.warn(
      `[Agent] ⚠️  Bound to ALL interfaces (0.0.0.0). :3006 is loopback-only per ` +
        `REGRESSION_PLAN §3 — set HOST=127.0.0.1 unless this deploy is firewalled.`,
    );
  }
  console.log(`[Agent] LLM provider: ${config!.llmProvider} / model: ${config!.llmModel}`);
  console.log(`[Agent] Mode: reasoning-only (BFF holds token custody)`);
  console.log(`[Agent] PKI creds: ${config!.usePkiCreds ? 'enabled' : 'disabled (client_secret)'}`);
});

process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));
})();
