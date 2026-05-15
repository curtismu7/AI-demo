'use strict';

/**
 * HITL service client for the MCP Gateway.
 *
 * When PingAuthorize returns INDETERMINATE (HITL obligation), the gateway:
 *   1. POSTs to HITL service to create a challenge
 *   2. Returns the challengeId to agent1 in the JSON-RPC error data
 *   3. On retry, agent passes hitl_challenge_id — gateway verifies it's approved before forwarding
 */

import axios from 'axios';

export interface HitlChallenge {
  challengeId: string;
  status: 'pending' | 'approved' | 'denied' | 'expired';
  expiresAt: string;
  /**
   * Phase 2 CR-01 — caller-binding fields used by the gateway when an agent
   * retries `tools/call` with `_hitl_challenge_id` to defend against replay
   * across user/agent/tool boundaries. These mirror what the HITL service
   * already persists in its challenge store; they are optional here because
   * older HITL service versions may not include them in the GET response.
   */
  userId?: string | null;
  agentId?: string | null;
  tool?: string;
}

export async function createHitlChallenge(
  hitlServiceUrl: string,
  payload: {
    tool: string;
    userId?: string;
    agentId?: string;
    userEmail?: string;
    context?: Record<string, unknown>;
  },
): Promise<HitlChallenge> {
  const response = await axios.post(`${hitlServiceUrl}/challenges`, payload, {
    timeout: 5_000,
    headers: { 'Content-Type': 'application/json' },
  });
  return response.data as HitlChallenge;
}

export async function getHitlChallengeStatus(
  hitlServiceUrl: string,
  challengeId: string,
): Promise<HitlChallenge> {
  const response = await axios.get(`${hitlServiceUrl}/challenges/${challengeId}`, {
    timeout: 5_000,
  });
  return response.data as HitlChallenge;
}
