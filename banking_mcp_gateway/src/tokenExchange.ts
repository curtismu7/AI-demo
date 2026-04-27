'use strict';

/**
 * RFC 8693 token re-exchange for MCP Gateway.
 *
 * The gateway receives a delegated token from agent1 (aud: mcp-gw.bxf.com, sub: user, act: agent1).
 * It re-exchanges that token against PingOne to get a backend-scoped token
 * (aud: mcp-olb.bxf.com or mcp-invest.bxf.com) with the full act chain preserved.
 */

import axios from 'axios';
import { GatewayConfig } from './config';

// Simple in-memory cache: gatewayToken+targetAud → { token, expiresAt }
const _cache = new Map<string, { token: string; expiresAt: number }>();

function cacheKey(subjectToken: string, targetAud: string): string {
  // Hash to avoid storing raw tokens as map keys
  const { createHash } = require('crypto');
  return createHash('sha256').update(`${subjectToken}:${targetAud}`).digest('hex').slice(0, 16);
}

export async function exchangeTokenForBackend(
  subjectToken: string,
  targetAudience: string,
  config: GatewayConfig,
): Promise<string> {
  const key = cacheKey(subjectToken, targetAudience);
  const cached = _cache.get(key);
  if (cached && cached.expiresAt > Date.now() + 5000) {
    return cached.token;
  }

  const params = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
    subject_token: subjectToken,
    subject_token_type: 'urn:ietf:params:oauth:token-type:access_token',
    requested_token_type: 'urn:ietf:params:oauth:token-type:access_token',
    audience: targetAudience,
    // GW's client credentials are the actor token source (sent via Basic auth below)
  });

  const credentials = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64');

  const response = await axios.post(config.tokenEndpoint, params.toString(), {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${credentials}`,
    },
    timeout: 10000,
  });

  const { access_token, expires_in } = response.data;
  if (!access_token) throw new Error('Token exchange response missing access_token');

  _cache.set(key, {
    token: access_token,
    expiresAt: Date.now() + (expires_in || 300) * 1000,
  });

  return access_token;
}

export function clearTokenCache(): void {
  _cache.clear();
}
