'use strict';

/**
 * RFC 8693 token exchange: user access token + agent actor token → GW-scoped delegated token.
 *
 * subject_token  = user's access token (forwarded from OLB App in Authorization header)
 * actor_token    = agent1's client-credentials token (getActorToken())
 * audience       = MCP_GW_RESOURCE_URI (mcp-gw.bxf.com)
 *
 * Result: token with sub=user, act={ sub: agent_client_id }, aud=mcp-gw.bxf.com
 * The MCP Gateway validates the aud, re-exchanges further to per-backend aud.
 */

import { createHash } from 'crypto';
import axios from 'axios';
import { AgentConfig } from './config';
import { getActorToken } from './agentIdentity';

/**
 * TTL-aware in-process cache for RFC 8693 gateway tokens.
 * Mirrors the pattern in banking_mcp_server/src/services/tokenCacheService.ts:
 *   - Background sweep evicts expired entries every sweepIntervalMs.
 *   - FIFO eviction when maxSize is reached.
 *   - destroy() allows clean shutdown / test teardown.
 */
class TokenCache {
  private readonly cache = new Map<string, { token: string; expiresAt: number }>();
  private readonly maxSize: number;
  private readonly sweepHandle: ReturnType<typeof setInterval> | null;

  constructor(maxSize = 200, sweepIntervalMs = 300_000) {
    this.maxSize = maxSize;
    if (sweepIntervalMs > 0) {
      const handle = setInterval(() => this.sweepExpired(), sweepIntervalMs);
      // Allow the Node.js event loop to exit without waiting for the sweep timer.
      if (typeof (handle as NodeJS.Timeout).unref === 'function') {
        (handle as NodeJS.Timeout).unref();
      }
      this.sweepHandle = handle;
    } else {
      this.sweepHandle = null;
    }
  }

  private sweepExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache) {
      if (now >= entry.expiresAt) this.cache.delete(key);
    }
  }

  get(key: string, bufferMs = 5_000): string | null {
    const entry = this.cache.get(key);
    if (!entry || Date.now() + bufferMs >= entry.expiresAt) {
      if (entry) this.cache.delete(key);
      return null;
    }
    return entry.token;
  }

  set(key: string, token: string, expiresAt: number): void {
    if (this.cache.size >= this.maxSize) {
      this.sweepExpired();
      // Still at capacity after sweep — evict the oldest inserted entry (FIFO).
      if (this.cache.size >= this.maxSize) {
        const oldestKey = this.cache.keys().next().value as string | undefined;
        if (oldestKey !== undefined) this.cache.delete(oldestKey);
      }
    }
    this.cache.set(key, { token, expiresAt });
  }

  /** Stop the background sweep timer and clear all entries. Call on shutdown or in test teardown. */
  destroy(): void {
    if (this.sweepHandle) clearInterval(this.sweepHandle);
    this.cache.clear();
  }
}

const _cache = new TokenCache();

function tokenHash(t: string): string {
  // BL-02: use the full 64-char SHA-256 digest. The previous .slice(0, 16)
  // truncated to 64 bits, which is a probabilistic collision surface for a
  // primitive that gates user-token isolation in the gateway-token cache.
  return createHash('sha256').update(t).digest('hex');
}

export async function resolveGatewayToken(
  userAccessToken: string,
  config: AgentConfig,
  requestedScopes?: string[],
): Promise<string> {
  const scopeKey = requestedScopes ? [...requestedScopes].sort().join(',') : '';
  const key = `${tokenHash(userAccessToken)}::${scopeKey}`;
  const cached = _cache.get(key);
  if (cached) return cached;

  const actorToken = await getActorToken(config);

  const credentials = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64');
  const params = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
    subject_token: userAccessToken,
    subject_token_type: 'urn:ietf:params:oauth:token-type:access_token',
    actor_token: actorToken,
    actor_token_type: 'urn:ietf:params:oauth:token-type:access_token',
    requested_token_type: 'urn:ietf:params:oauth:token-type:access_token',
    audience: config.mcpGatewayResourceUri,
  });

  // HI-03: axios's default Error carries `err.config.data` (the
  // URL-encoded body containing subject_token + actor_token JWTs) and
  // `err.request._header` — both leak raw bearer tokens via any caller
  // that prints `err`, `err.stack`, or JSON.stringifies the thrown error.
  // Re-throw a sanitized Error so the upstream `console.error('[Agent]
  // Token exchange failed:', msg)` in index.ts cannot ever emit the body.
  let response;
  try {
    response = await axios.post(config.tokenEndpoint, params.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${credentials}`,
      },
      timeout: 10_000,
    });
  } catch (e: any) {
    const status = e?.response?.status;
    const detail = e?.response?.data?.error || e?.response?.data?.error_description || e?.message || 'unknown';
    throw new Error(`token_exchange_failed status=${status ?? 'n/a'} detail=${detail}`);
  }

  const { access_token, expires_in } = response.data;
  if (!access_token) throw new Error('Token exchange response missing access_token');

  // HI-05: assert the returned token is aud-narrowed to the gateway and
  // (best-effort) that act.sub matches the agent's CC client_id. PingOne
  // issued the token to us seconds ago, so a decode-without-verify is
  // sound here — we only need to confirm the policy didn't widen.
  _assertGatewayTokenShape(access_token, config);

  _cache.set(key, access_token, Date.now() + (expires_in || 300) * 1000);
  return access_token;
}

/**
 * HI-05: decode the returned gateway token and verify it is narrowed to the
 * MCP gateway audience and (when present) carries `act.sub` matching this
 * agent's CC client_id. Throws on aud mismatch; only warns on `act.sub`
 * mismatch since PingOne policy may not emit `act` in all configurations
 * (see CLAUDE.md → "Why `act` claim might be absent").
 */
function _assertGatewayTokenShape(accessToken: string, config: AgentConfig): void {
  const parts = accessToken.split('.');
  if (parts.length !== 3) {
    throw new Error('token_exchange returned malformed JWT (segments != 3)');
  }
  let payload: any;
  try {
    payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch {
    throw new Error('token_exchange returned JWT with unparseable payload');
  }
  const expected = config.mcpGatewayResourceUri;
  const aud = payload?.aud;
  const audMatches = Array.isArray(aud) ? aud.includes(expected) : aud === expected;
  if (!audMatches) {
    throw new Error(`token_exchange returned wrong aud (expected=${expected})`);
  }
  if (payload?.act?.sub && payload.act.sub !== config.clientId) {
    console.warn(
      `[Agent] Gateway token act.sub mismatch (got=${payload.act.sub}, expected=${config.clientId}) — delegation chain may be broken`,
    );
  }
}
