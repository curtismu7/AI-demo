'use strict';

/**
 * McpTokenExchangeClient — RFC 8693 exchange for HTTP MCP upstream tokens (D-03).
 *
 * After PingOne Authorize permits a request, this client exchanges the
 * inbound gateway-audience token for a next-hop token targeted at the
 * correct upstream MCP-server audience (olb or invest), per D-05.
 *
 * Token flow (D-04: no token to LLM):
 *   caller  →  gateway (aud=gateway)  →  exchange  →  upstream (aud=mcp-olb or mcp-invest)
 *
 * The upstream token is ONLY used by the gateway to call the MCP server.
 * It is never returned to, logged for, or visible to the LLM.
 */

import axios from 'axios';
import { routeTool, backendResourceUri } from '../router';
import type { GatewayConfig } from '../config';

export interface ExchangeResult {
  token: string;
  targetAud: string;
}

// Simple in-memory cache: sha256(subjectToken + targetAud) → { token, expiresAt }
const _cache = new Map<string, { token: string; expiresAt: number }>();

function cacheKey(subjectToken: string, targetAud: string): string {
  const { createHash } = require('crypto');
  return createHash('sha256').update(`${subjectToken}:${targetAud}`).digest('hex').slice(0, 16);
}

export class McpTokenExchangeClient {
  constructor(private readonly config: GatewayConfig) {}

  /**
   * Exchange the inbound gateway token for an upstream MCP-server token.
   *
   * @param subjectToken — the inbound bearer token (aud=gateway)
   * @param toolName     — tool name from MCP request; drives backend routing
   *                       undefined → default to OLB (for tools/list etc.)
   */
  async exchange(subjectToken: string, toolName?: string): Promise<ExchangeResult> {
    const backend = toolName ? routeTool(toolName) : 'olb';
    const targetAud = backendResourceUri(backend, this.config);

    const key = cacheKey(subjectToken, targetAud);
    const cached = _cache.get(key);
    if (cached && cached.expiresAt > Date.now() + 5000) {
      return { token: cached.token, targetAud };
    }

    const params = new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
      subject_token: subjectToken,
      subject_token_type: 'urn:ietf:params:oauth:token-type:access_token',
      requested_token_type: 'urn:ietf:params:oauth:token-type:access_token',
      audience: targetAud,
    });

    const credentials = Buffer.from(
      `${this.config.clientId}:${this.config.clientSecret}`,
    ).toString('base64');

    const response = await axios.post(
      this.config.tokenEndpoint,
      params.toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${credentials}`,
        },
        timeout: 10000,
      },
    );

    const { access_token, expires_in } = response.data as { access_token?: string; expires_in?: number };
    if (!access_token) {
      throw new Error('Token exchange response missing access_token');
    }

    _cache.set(key, {
      token: access_token,
      expiresAt: Date.now() + (expires_in ?? 300) * 1000,
    });

    return { token: access_token, targetAud };
  }

  static clearCache(): void {
    _cache.clear();
  }
}
