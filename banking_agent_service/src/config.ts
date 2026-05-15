'use strict';

import dotenv from 'dotenv';
dotenv.config();

export interface AgentConfig {
  port: number;
  host: string;
  // agent1's own OAuth client credentials (actor token source)
  clientId: string;
  clientSecret: string;
  // PingOne endpoints
  tokenEndpoint: string;
  // MCP Gateway
  mcpGatewayWsUrl: string;
  mcpGatewayResourceUri: string;
  // LLM provider
  llmProvider: 'openai' | 'anthropic' | 'none';
  llmApiKey: string;
  llmModel: string;
  // Feature flags
  usePkiCreds: boolean;
  agentCertPath: string;
}

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function optional(name: string, fallback: string): string {
  return process.env[name] || fallback;
}

// Compute the PingOne token endpoint from envId + region when an explicit
// PINGONE_TOKEN_ENDPOINT isn't set. Same logic as banking_mcp_gateway and
// the BFF's oauthEndpointResolver — every setup:fresh writes
// PINGONE_ENVIRONMENT_ID + PINGONE_REGION, so users shouldn't have to set
// PINGONE_TOKEN_ENDPOINT manually.
function resolveTokenEndpoint(): string {
  const explicit = process.env.PINGONE_TOKEN_ENDPOINT;
  if (explicit) return explicit;
  const envId = process.env.PINGONE_ENVIRONMENT_ID;
  const region = process.env.PINGONE_REGION || 'com';
  if (envId) return `https://auth.pingone.${region}/${envId}/as/token`;
  return required('PINGONE_TOKEN_ENDPOINT');
}

export function loadConfig(): AgentConfig {
  return {
    port: parseInt(process.env.PORT || '3006', 10),
    // :3006 is loopback-only per REGRESSION_PLAN §3. Default to 127.0.0.1 so a
    // misconfigured deploy can't expose the token-exchange endpoint on all
    // interfaces; staging/prod can still bind 0.0.0.0 via an explicit HOST env.
    host: process.env.HOST || '127.0.0.1',
    clientId: required('AGENT_CLIENT_ID'),
    clientSecret: optional('AGENT_CLIENT_SECRET', ''),
    tokenEndpoint: resolveTokenEndpoint(),
    mcpGatewayWsUrl: optional('MCP_GATEWAY_WS_URL', 'ws://localhost:3005'),
    mcpGatewayResourceUri: required('MCP_GW_RESOURCE_URI'),
    llmProvider: (optional('LLM_PROVIDER', 'none') as AgentConfig['llmProvider']),
    llmApiKey: optional('LLM_API_KEY', ''),
    llmModel: optional('LLM_MODEL', 'claude-sonnet-4.6'),
    usePkiCreds: optional('USE_PKI_AGENT_CREDS', 'false') === 'true',
    agentCertPath: optional('AGENT_CERT_PATH', ''),
  };
}
