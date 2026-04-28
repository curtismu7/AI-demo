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

export function loadConfig(): AgentConfig {
  return {
    port: parseInt(process.env.PORT || '3006', 10),
    host: process.env.HOST || '0.0.0.0',
    clientId: required('AGENT_CLIENT_ID'),
    clientSecret: optional('AGENT_CLIENT_SECRET', ''),
    tokenEndpoint: required('PINGONE_TOKEN_ENDPOINT'),
    mcpGatewayWsUrl: optional('MCP_GATEWAY_WS_URL', 'ws://localhost:3005'),
    mcpGatewayResourceUri: required('MCP_GW_RESOURCE_URI'),
    llmProvider: (optional('LLM_PROVIDER', 'none') as AgentConfig['llmProvider']),
    llmApiKey: optional('LLM_API_KEY', ''),
    llmModel: optional('LLM_MODEL', 'claude-sonnet-4-6'),
    usePkiCreds: optional('USE_PKI_AGENT_CREDS', 'false') === 'true',
    agentCertPath: optional('AGENT_CERT_PATH', ''),
  };
}
