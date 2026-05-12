'use strict';

import dotenv from 'dotenv';
dotenv.config();

export interface GatewayConfig {
  port: number;
  host: string;
  // Gateway's own OAuth client (for acquiring actor token in re-exchange)
  clientId: string;
  clientSecret: string;
  // Token endpoint auth method: 'basic' (client_secret_basic) or 'post' (client_secret_post)
  tokenEndpointAuthMethod: 'basic' | 'post';
  // PingOne token endpoint
  tokenEndpoint: string;
  // Inbound aud — tokens sent to the GW must carry this audience
  gatewayResourceUri: string;
  // Backend MCP servers
  mcpOlbWsUrl: string;
  mcpInvestWsUrl: string;
  // Backend resource URIs (used as `audience` in the re-exchange)
  mcpOlbResourceUri: string;
  mcpInvestResourceUri: string;
  // Optional PingAuthorize endpoint for tools/list guard
  pingAuthorizeEndpoint: string;
  pingAuthorizeWorkerId: string;
  // Optional HITL service URL — when set, INDETERMINATE decisions trigger a challenge
  hitlServiceUrl: string;
  // Optional RFC 7662 introspection endpoint
  // Set GW_INTROSPECTION_ENDPOINT to enable active-token validation at the gateway.
  // Falls back to PINGONE_INTROSPECTION_ENDPOINT if unset.
  introspectionEndpoint: string;
  // Dev/mock bypass — when true, skip required-var guards and make auth pipeline passthrough.
  devBypass: boolean;
  // Phase 266: Path A — service API key for the api_key credential disposition (demo only)
  demoApiKeyServiceKey: string;
  // Phase 266: Path B — BFF-internal id_token retrieval endpoint (server-to-server)
  bffInternalIdTokenUrl: string;
  // Phase 266: shared secret for BFF /internal/id-token requests
  bffInternalSecret: string;
  // Phase 266: base URL of banking_resource_server (e.g. http://localhost:3001)
  bankingResourceServerBaseUrl: string;
  // Phase 266: OAuth audience for banking_resource_server — MUST match BANKING_API_RESOURCE_URI
  // on the backend; used as the `audience` parameter in RFC 8693 token exchange.
  // Per RFC 8707 + RFC 9068: audience values are logical URIs, not network addresses.
  bankingResourceServerResourceUri: string;
}

const DEV_BYPASS = process.env.MCP_GW_DEV_BYPASS === 'true';

// Phase 266 — must match the literal used as the optional() fallback for BFF_INTERNAL_SECRET below.
// Production startup refuses this exact value to prevent shipping the dev fallback.
const DEFAULT_BFF_INTERNAL_SECRET = 'dev-shared-secret-change-me';

function required(name: string, stub = 'dev-bypass-placeholder'): string {
  const v = process.env[name];
  if (!v) {
    if (DEV_BYPASS) {
      console.warn(`[GW] Dev bypass: using stub for ${name}`);
      return stub;
    }
    throw new Error(`Missing required env var: ${name}`);
  }
  return v;
}

function optional(name: string, fallback: string): string {
  return process.env[name] || fallback;
}

// Derive the PingOne token endpoint from envId + region when an explicit
// PINGONE_TOKEN_ENDPOINT isn't set. This matches the BFF's
// oauthEndpointResolver — every install has PINGONE_ENVIRONMENT_ID +
// PINGONE_REGION in .env after setup:fresh, so we should never actually
// require the user to set PINGONE_TOKEN_ENDPOINT by hand.
function resolveTokenEndpoint(): string {
  const explicit = process.env.PINGONE_TOKEN_ENDPOINT;
  if (explicit) return explicit;
  const envId = process.env.PINGONE_ENVIRONMENT_ID;
  const region = process.env.PINGONE_REGION || 'com';
  if (envId) return `https://auth.pingone.${region}/${envId}/as/token`;
  return required('PINGONE_TOKEN_ENDPOINT'); // surfaces a clear error
}

export function loadConfig(): GatewayConfig {
  const authMethod = (process.env.MCP_GW_TOKEN_ENDPOINT_AUTH_METHOD || 'basic').toLowerCase();
  return {
    port: parseInt(process.env.PORT || '3005', 10),
    host: process.env.HOST || '0.0.0.0',
    clientId: required('MCP_GW_CLIENT_ID'),
    clientSecret: required('MCP_GW_CLIENT_SECRET'),
    tokenEndpointAuthMethod: authMethod === 'post' ? 'post' : 'basic',
    tokenEndpoint: resolveTokenEndpoint(),
    gatewayResourceUri: required('MCP_GW_RESOURCE_URI'),
    mcpOlbWsUrl: optional('MCP_OLB_WS_URL', 'ws://localhost:8080'),
    mcpInvestWsUrl: optional('MCP_INVEST_WS_URL', 'ws://localhost:8081'),
    // Resource URIs default to the audiences bootstrap provisions. Setup
    // writes ENDUSER_AUDIENCE and MCP_RESOURCE_URI; we accept either the
    // service-specific var or those fallbacks.
    mcpOlbResourceUri: optional('MCP_OLB_RESOURCE_URI',
      optional('MCP_RESOURCE_URI', 'mcp-server.bxf.com')),
    mcpInvestResourceUri: optional('MCP_INVEST_RESOURCE_URI',
      optional('MCP_INVEST_AUDIENCE', 'mcp-invest.bxf.com')),
    pingAuthorizeEndpoint: optional('PINGAUTHORIZE_ENDPOINT', ''),
    pingAuthorizeWorkerId: optional('PINGAUTHORIZE_WORKER_ID', ''),
    hitlServiceUrl: optional('HITL_SERVICE_URL', ''),
    introspectionEndpoint: optional('GW_INTROSPECTION_ENDPOINT',
      optional('PINGONE_INTROSPECTION_ENDPOINT', '')),
    devBypass: DEV_BYPASS,
    // Phase 266 fields
    demoApiKeyServiceKey: optional('DEMO_APIKEY_SERVICE_KEY', 'demo-api-key-0000'),
    bffInternalIdTokenUrl: optional('BFF_INTERNAL_ID_TOKEN_URL', 'http://localhost:3001/internal/id-token'),
    bffInternalSecret: optional('BFF_INTERNAL_SECRET', DEFAULT_BFF_INTERNAL_SECRET),
    bankingResourceServerBaseUrl: optional('BANKING_RESOURCE_SERVER_BASE_URL', 'http://localhost:3001'),
    bankingResourceServerResourceUri: optional('BANKING_RESOURCE_SERVER_RESOURCE_URI', 'https://banking-resource-server.bxf.com'),
  };
}

/**
 * BL-03 startup assertion: refuse the committed dev-fallback BFF_INTERNAL_SECRET
 * when running in production. The same default literal lives on the BFF side
 * (banking_api_server/routes/agentIdToken.js); both processes must reject it
 * symmetrically so a misconfigured deploy fails closed instead of silently
 * exposing /internal/id-token to anyone who guesses the public default.
 *
 * Pure assertion — call from process entry (index.ts) so the gateway exits
 * non-zero before binding any port.
 */
export function assertProductionSecrets(cfg: GatewayConfig): void {
  if (process.env.NODE_ENV !== 'production') return;
  if (cfg.bffInternalSecret === DEFAULT_BFF_INTERNAL_SECRET) {
    // eslint-disable-next-line no-console
    console.error(
      '[GW] FATAL: BFF_INTERNAL_SECRET is set to the committed dev default ' +
      `('${DEFAULT_BFF_INTERNAL_SECRET}') and NODE_ENV=production. ` +
      'Refusing to start. Set BFF_INTERNAL_SECRET to a unique 32+ byte secret.',
    );
    process.exit(1);
  }
  // HI-08: dev bypass forwards the inbound user token unchanged. This is
  // a localhost-only debugging affordance and must never run on a
  // production deploy. The /admin/config route already refuses to flip
  // devBypass=true (BL-01); this catches the env-var startup path so the
  // gateway exits non-zero rather than silently shipping in bypass mode.
  if (cfg.devBypass) {
    // eslint-disable-next-line no-console
    console.error(
      '[GW] FATAL: MCP_GW_DEV_BYPASS=true and NODE_ENV=production. ' +
      'Dev bypass forwards inbound bearer tokens with zero policy evaluation. ' +
      'Refusing to start.',
    );
    process.exit(1);
  }
}
