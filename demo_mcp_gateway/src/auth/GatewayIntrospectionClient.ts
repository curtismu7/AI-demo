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

import { createHash } from 'node:crypto';
import axios from 'axios';
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
// HI-01: in production the positive-cache TTL is the residual revocation
// window — a token marked inactive at the AS still works for up to TTL
// against the gateway. 5s is a reasonable trade for a banking deployment;
// dev keeps 30s to limit AS round trips during demos. Document this in
// bff-sessions skill.
const CACHE_TTL_MS = process.env.NODE_ENV === 'production' ? 5_000 : 30_000;

function cacheKey(token: string): string {
  // Full hex digest — the cosmetic .slice(0, 24) is a 96-bit collision
  // surface for a cache used in a security-sensitive code path. Memory
  // cost of the extra 40 hex chars is trivial.
  return createHash('sha256').update(token).digest('hex');
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

      // Authenticate introspection request using the gateway's configured method.
      // PingOne apps provisioned with token_endpoint_auth_method=post require
      // client credentials in the POST body (client_secret_post); apps using
      // client_secret_basic require an Authorization: Basic header.
      // MCP_GW_TOKEN_ENDPOINT_AUTH_METHOD controls this (default: 'basic').
      // Use dedicated introspection credentials when configured; otherwise
      // fall back to the gateway's own client credentials. PingOne only returns
      // active:true for a token when the introspecting client is the issuing
      // client or a resource server that owns the token's audience — so if the
      // gateway is not that resource server, set GW_INTROSPECTION_CLIENT_ID +
      // GW_INTROSPECTION_CLIENT_SECRET to the appropriate client.
      const introspectClientId = this.config.introspectionClientId || this.config.clientId;
      const introspectClientSecret = this.config.introspectionClientSecret || this.config.clientSecret;

      const introspectHeaders: Record<string, string> = {
        'Content-Type': 'application/x-www-form-urlencoded',
      };
      if (this.config.tokenEndpointAuthMethod === 'post') {
        // client_secret_post: credentials go in the POST body
        params.set('client_id', introspectClientId);
        params.set('client_secret', introspectClientSecret);
      } else {
        // client_secret_basic: credentials go in the Authorization header
        const credentials = Buffer.from(
          `${introspectClientId}:${introspectClientSecret}`
        ).toString('base64');
        introspectHeaders.Authorization = `Basic ${credentials}`;
      }

      const response = await axios.post(
        this.config.introspectionEndpoint,
        params.toString(),
        {
          headers: introspectHeaders,
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
