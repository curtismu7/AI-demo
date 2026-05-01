'use strict';

/**
 * GatewayIntrospectionClient — RFC 7662 active-token introspection.
 *
 * Called by authorizeMcpRequest before GatewayTokenPolicy to confirm the inbound
 * token is currently active (not revoked, not expired at the AS). Caches results
 * 30 s per token to avoid hammering PingOne on every tool call.
 *
 * Fails CLOSED: network errors → active: false (caller should reject the request).
 * If introspectionEndpoint is not configured → skips and returns { active: true, skipped: true }
 * so dev environments work without configuring the endpoint.
 */

import axios from 'axios';
import { createHash } from 'crypto';
import type { GatewayConfig } from '../config';

export interface IntrospectionResult {
  active: boolean;
  skipped?: boolean;   // true when endpoint not configured
  sub?: string;
  scope?: string;
  exp?: number;
  aud?: string | string[];
  client_id?: string;
  error?: string;
}

const _cache = new Map<string, { result: IntrospectionResult; expiresAt: number }>();
const CACHE_TTL_MS = 30_000;

function cacheKey(token: string): string {
  return createHash('sha256').update(token).digest('hex').slice(0, 24);
}

export class GatewayIntrospectionClient {
  constructor(private readonly config: GatewayConfig) {}

  async introspect(token: string): Promise<IntrospectionResult> {
    // Skip when endpoint not configured (dev mode)
    if (!this.config.introspectionEndpoint) {
      return { active: true, skipped: true };
    }

    const key = cacheKey(token);
    const cached = _cache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.result;
    }

    try {
      const params = new URLSearchParams({
        token,
        token_type_hint: 'access_token',
      });

      // Use the gateway's own client credentials for introspection auth (client_secret_basic)
      const credentials = Buffer.from(
        `${this.config.clientId}:${this.config.clientSecret}`
      ).toString('base64');

      const response = await axios.post(
        this.config.introspectionEndpoint,
        params.toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': `Basic ${credentials}`,
          },
          timeout: 5000,
        }
      );

      const data = response.data as Record<string, unknown>;
      const result: IntrospectionResult = {
        active: data.active === true,
        sub: data.sub as string | undefined,
        scope: data.scope as string | undefined,
        exp: data.exp as number | undefined,
        aud: data.aud as string | string[] | undefined,
        client_id: data.client_id as string | undefined,
      };

      _cache.set(key, { result, expiresAt: Date.now() + CACHE_TTL_MS });
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn('[GatewayIntrospection] Introspection failed — failing closed:', msg);
      const result: IntrospectionResult = { active: false, error: msg };
      // Cache negative result briefly (5 s) to avoid hammering on repeated failures
      _cache.set(key, { result, expiresAt: Date.now() + 5_000 });
      return result;
    }
  }

  static clearCache(): void {
    _cache.clear();
  }
}
