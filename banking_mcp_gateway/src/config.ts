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

export function loadConfig(): GatewayConfig {
  const authMethod = (process.env.MCP_GW_TOKEN_ENDPOINT_AUTH_METHOD || 'basic').toLowerCase();
  return {
    port: parseInt(process.env.PORT || '3005', 10),
    host: process.env.HOST || '0.0.0.0',
    clientId: required('MCP_GW_CLIENT_ID'),
    clientSecret: required('MCP_GW_CLIENT_SECRET'),
    tokenEndpointAuthMethod: authMethod === 'post' ? 'post' : 'basic',
    tokenEndpoint: required('PINGONE_TOKEN_ENDPOINT'),
    gatewayResourceUri: required('MCP_GW_RESOURCE_URI'),
    mcpOlbWsUrl: optional('MCP_OLB_WS_URL', 'ws://localhost:8080'),
    mcpInvestWsUrl: optional('MCP_INVEST_WS_URL', 'ws://localhost:8081'),
    mcpOlbResourceUri: required('MCP_OLB_RESOURCE_URI'),
    mcpInvestResourceUri: required('MCP_INVEST_RESOURCE_URI'),
    pingAuthorizeEndpoint: optional('PINGAUTHORIZE_ENDPOINT', ''),
    pingAuthorizeWorkerId: optional('PINGAUTHORIZE_WORKER_ID', ''),
    hitlServiceUrl: optional('HITL_SERVICE_URL', ''),
    introspectionEndpoint: optional('GW_INTROSPECTION_ENDPOINT',
      optional('PINGONE_INTROSPECTION_ENDPOINT', '')),
    devBypass: DEV_BYPASS,
  };
}
