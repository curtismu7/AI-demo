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
  return createHash('sha256').update(t).digest('hex').slice(0, 16);
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

  const response = await axios.post(config.tokenEndpoint, params.toString(), {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${credentials}`,
    },
    timeout: 10_000,
  });

  const { access_token, expires_in } = response.data;
  if (!access_token) throw new Error('Token exchange response missing access_token');

  _cache.set(key, access_token, Date.now() + (expires_in || 300) * 1000);
  return access_token;
}
