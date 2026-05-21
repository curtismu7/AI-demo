'use strict';

/**
 * scopeTopology.ts — gateway accessor for the repo-root scope-topology.json
 * SSOT. resolveJsonModule is enabled in tsconfig, so the manifest is imported
 * natively. Single source shared with the BFF (banking_api_server/services/
 * scopeTopology.js reads the same file).
 */

// Path: banking_mcp_gateway/src/auth -> repo root is ../../../
import manifest from '../../../scope-topology.json';

type Surface = 'gateway' | 'exchange-only' | 'legacy-alias';
interface ToolEntry { requiredScopes: string[]; surface: Surface; challengeType?: 'step_up' | 'consent'; }
interface Manifest { tools: Record<string, ToolEntry>; }

const M = manifest as unknown as Manifest;

/** Tool names whose surface is gateway-enforced. */
export function gatewayToolNames(): string[] {
  return Object.keys(M.tools).filter((n) => M.tools[n].surface === 'gateway');
}

export function toolRequiredScopes(name: string): string[] | undefined {
  const t = M.tools[name];
  return t ? [...t.requiredScopes] : undefined;
}

export function toolChallengeType(name: string): 'step_up' | 'consent' | undefined {
  const t = M.tools[name];
  return t ? t.challengeType : undefined;
}
