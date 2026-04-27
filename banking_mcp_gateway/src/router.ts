'use strict';

/**
 * Tool → MCP server routing table.
 *
 * Each entry maps a tool name to the backend that owns it. The gateway
 * uses this to select which MCP server to forward to and which audience
 * to request in the RFC 8693 re-exchange.
 */

import { GatewayConfig } from './config';

export type BackendTarget = 'olb' | 'invest';

const OLB_TOOLS = new Set([
  'get_my_accounts',
  'get_account_balance',
  'get_sensitive_account_details',
  'get_my_transactions',
  'create_deposit',
  'create_withdrawal',
  'create_transfer',
  'query_user_by_email',
  'sequential_think',
]);

const INVEST_TOOLS = new Set([
  'get_investment_balance',
  'get_investment_accounts',
  'get_portfolio_summary',
]);

export function routeTool(toolName: string): BackendTarget {
  if (INVEST_TOOLS.has(toolName)) return 'invest';
  // Default to OLB for all banking tools (and unknown tools — backend returns proper error)
  return 'olb';
}

export function backendWsUrl(target: BackendTarget, config: GatewayConfig): string {
  return target === 'invest' ? config.mcpInvestWsUrl : config.mcpOlbWsUrl;
}

export function backendResourceUri(target: BackendTarget, config: GatewayConfig): string {
  return target === 'invest' ? config.mcpInvestResourceUri : config.mcpOlbResourceUri;
}
