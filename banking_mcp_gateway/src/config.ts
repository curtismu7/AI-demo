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
}

const DEV_BYPASS = process.env.MCP_GW_DEV_BYPASS === 'true';

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
  };
}
