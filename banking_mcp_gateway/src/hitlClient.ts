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

/**
 * Phase 2 CR-01 — verify that an approved HITL challenge belongs to the
 * caller, agent, and tool that is retrying `tools/call`.
 *
 * The gateway previously trusted any `_hitl_challenge_id` whose status was
 * `approved`, which let an approved receipt issued for {userA, agentA, toolA,
 * args=$10} be replayed by {userB, agentB, toolB, args=$5000}. The downstream
 * PingAuthorize re-evaluation alone is not a sufficient gate — the receipt
 * itself must bind to the caller identity.
 *
 * Returns `{ ok: true }` when the receipt is acceptable, or
 * `{ ok: false, message }` when the gateway should reject the retry with a
 * JSON-RPC -32002 error.
 *
 * The check is intentionally lenient on absent fields: an older HITL service
 * that does not echo userId/agentId/tool in the GET response will pass the
 * check on those fields. Only mismatches cause rejection.
 *
 * Param shape:
 *   status     — the GET /challenges/:id response body
 *   expectedUserId   — decoded.sub from the inbound bearer
 *   expectedAgentId  — decoded.act?.sub from the inbound bearer (may be undef)
 *   expectedTool     — toolName from the JSON-RPC `tools/call` params
 *   now        — Date.now() at the call site (injectable for tests)
 */
export interface ReceiptVerification {
  ok: boolean;
  message?: string;
}

export function verifyHitlReceipt(
  status: HitlChallenge,
  expectedUserId: string | undefined,
  expectedAgentId: string | undefined,
  expectedTool: string,
  now: number = Date.now(),
): ReceiptVerification {
  if (status.status !== 'approved') {
    return {
      ok: false,
      message: `HITL challenge not approved (status: ${status.status})`,
    };
  }

  // Expired-but-approved receipts must NOT be honoured. The store marks
  // expired pending challenges as 'expired' at read time, but a challenge
  // approved-then-aged could still be returned as approved if its
  // expiresAt drifts past now. Don't trust the receipt past expiry.
  if (status.expiresAt) {
    const expiryMs = Date.parse(status.expiresAt);
    if (Number.isFinite(expiryMs) && expiryMs < now) {
      return { ok: false, message: 'HITL challenge expired' };
    }
  }

  if (status.userId && expectedUserId && status.userId !== expectedUserId) {
    return {
      ok: false,
      message: 'HITL challenge belongs to a different user',
    };
  }
  if (status.agentId && expectedAgentId && status.agentId !== expectedAgentId) {
    return {
      ok: false,
      message: 'HITL challenge belongs to a different agent',
    };
  }
  if (status.tool && expectedTool && status.tool !== expectedTool) {
    return {
      ok: false,
      message: 'HITL challenge belongs to a different tool',
    };
  }

  return { ok: true };
}
