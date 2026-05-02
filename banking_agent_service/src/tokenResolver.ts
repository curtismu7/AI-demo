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

/** Maximum number of entries in the module-level token cache. Prevents unbounded growth. */
const MAX_CACHE_SIZE = 200;

// Cache: scopedTokenKey → { gwToken, expiresAt }
const _cache = new Map<string, { token: string; expiresAt: number }>();

function tokenHash(t: string): string {
  return createHash('sha256').update(t).digest('hex').slice(0, 16);
}

export async function resolveGatewayToken(
  userAccessToken: string,
  config: AgentConfig,
  requestedScopes?: string[],
): Promise<string> {
  const scopeKey = requestedScopes ? [...requestedScopes].sort().join(',') : '';
  const key = `${tokenHash(userAccessToken)}:${scopeKey}`;
  const cached = _cache.get(key);
  if (cached && cached.expiresAt > Date.now() + 5_000) return cached.token;

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

  // Enforce max cache size: evict oldest entry (FIFO) when full.
  if (_cache.size >= MAX_CACHE_SIZE) {
    const oldestKey = _cache.keys().next().value as string | undefined;
    if (oldestKey !== undefined) _cache.delete(oldestKey);
  }
  _cache.set(key, { token: access_token, expiresAt: Date.now() + (expires_in || 300) * 1000 });
  return access_token;
}
