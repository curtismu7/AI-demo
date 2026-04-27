'use strict';

import dotenv from 'dotenv';
dotenv.config();

export interface GatewayConfig {
  port: number;
  host: string;
  // Gateway's own OAuth client (for acquiring actor token in re-exchange)
  clientId: string;
  clientSecret: string;
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
  // Dev/mock bypass — when true, skip required-var guards and make auth pipeline passthrough.
  // Set MCP_GW_DEV_BYPASS=true in .env.development to run without real PingOne credentials.
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
  return {
    port: parseInt(process.env.PORT || '3005', 10),
    host: process.env.HOST || '0.0.0.0',
    clientId: required('MCP_GW_CLIENT_ID'),
    clientSecret: required('MCP_GW_CLIENT_SECRET'),
    tokenEndpoint: required('PINGONE_TOKEN_ENDPOINT'),
    gatewayResourceUri: required('MCP_GW_RESOURCE_URI'),
    mcpOlbWsUrl: optional('MCP_OLB_WS_URL', 'ws://localhost:8080'),
    mcpInvestWsUrl: optional('MCP_INVEST_WS_URL', 'ws://localhost:8081'),
    mcpOlbResourceUri: required('MCP_OLB_RESOURCE_URI'),
    mcpInvestResourceUri: required('MCP_INVEST_RESOURCE_URI'),
    pingAuthorizeEndpoint: optional('PINGAUTHORIZE_ENDPOINT', ''),
    pingAuthorizeWorkerId: optional('PINGAUTHORIZE_WORKER_ID', ''),
    hitlServiceUrl: optional('HITL_SERVICE_URL', ''),
    devBypass: DEV_BYPASS,
  };
}
