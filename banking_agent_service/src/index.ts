'use strict';

/**
 * banking-agent-service — entry point
 *
 * REST API surface:
 *   POST /api/agent/task   — run an agent task (requires Bearer user-access-token)
 *   GET  /health           — liveness probe
 *
 * Token flow:
 *   OLB App sends user's access token in Authorization header.
 *   Agent exchanges it (subject=user, actor=agent CC) for a GW-scoped token.
 *   Agent opens WS to MCP Gateway with GW-scoped token.
 *   Agent runs LLM + tool loop, returns final answer.
 *
 * Start: AGENT_CLIENT_ID=... AGENT_CLIENT_SECRET=... node dist/index.js
 */

import dotenv from 'dotenv';
dotenv.config();

import express, { Request, Response, NextFunction } from 'express';
import { loadConfig } from './config';
import { loadVaultIntoEnv } from './vault';
import { resolveGatewayToken } from './tokenResolver';
import { McpGatewayClient } from './mcpGatewayClient';
import { runAgentTask } from './agentOrchestrator';

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
app.use(express.json());

// ---------------------------------------------------------------------------
// Auth middleware — extract user Bearer token
// ---------------------------------------------------------------------------

/**
 * HI-04: cheap local subject_token validation. Without this, any caller could
 * submit a malformed value and trigger a PingOne RFC 8693 round trip (free
 * DoS vector against our tenant). Decoding here is base64 only — signature
 * verification is still done at the PingOne /as/token endpoint.
 */
function _validateSubjectTokenShape(token: string): { ok: true } | { ok: false; reason: string } {
  const parts = token.split('.');
  if (parts.length !== 3) return { ok: false, reason: 'jwt_must_have_three_segments' };
  let payload: any;
  try {
    payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch {
    return { ok: false, reason: 'jwt_payload_unparseable' };
  }
  if (typeof payload?.exp !== 'number') return { ok: false, reason: 'jwt_exp_missing' };
  if (payload.exp * 1000 < Date.now()) return { ok: false, reason: 'jwt_expired' };
  return { ok: true };
}

function requireBearerToken(req: Request, res: Response, next: NextFunction): void {
  const auth = req.headers.authorization || '';
  const parts = auth.split(' ');
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
    res.status(401).json({ error: 'Bearer token required' });
    return;
  }
  const validation = _validateSubjectTokenShape(parts[1]);
  if (!validation.ok) {
    res.status(400).json({ error: 'invalid_subject_token', detail: validation.reason });
    return;
  }
  (req as any).userToken = parts[1];
  next();
}

// ---------------------------------------------------------------------------
// POST /api/agent/task
// ---------------------------------------------------------------------------

app.post('/api/agent/task', requireBearerToken, async (req: Request, res: Response) => {
  const { userMessage, useCase } = req.body || {};
  if (!userMessage || typeof userMessage !== 'string') {
    res.status(400).json({ error: 'userMessage required' });
    return;
  }

  const userToken: string = (req as any).userToken;
  let gwToken: string;
  try {
    gwToken = await resolveGatewayToken(userToken, config!);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[Agent] Token exchange failed:', msg);
    res.status(502).json({ error: 'token_exchange_failed', detail: msg });
    return;
  }

  const mcpClient = new McpGatewayClient(config!.mcpGatewayWsUrl, gwToken);
  try {
    await mcpClient.connect();
    const result = await runAgentTask({ userMessage, useCase }, mcpClient, config!);
    res.json({ answer: result.answer, toolCallCount: result.toolCallCount, toolsUsed: result.toolsUsed });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[Agent] Task error:', msg);
    res.status(500).json({ error: 'agent_task_failed', detail: msg });
  } finally {
    mcpClient.close();
  }
});

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
  console.log(`[Agent] LLM provider: ${config!.llmProvider} / model: ${config!.llmModel}`);
  console.log(`[Agent] MCP Gateway: ${config!.mcpGatewayWsUrl}`);
  console.log(`[Agent] PKI creds: ${config!.usePkiCreds ? 'enabled' : 'disabled (client_secret)'}`);
});

process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));
})();
