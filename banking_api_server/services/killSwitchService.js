/**
 * killSwitchService.js
 * 
 * AI Safety Red Button Kill Switch Service
 * Purpose: Immediate agent revocation at OAuth server, state capture, session invalidation
 * 
 * Requirements: REQ-159-01/02/03 — Token revocation at PingOne (not local),
 * invalid within 500ms, decoupled from agent code
 */

const axios = require('axios');
const crypto = require('crypto');
const oauthConfig = require('../config/oauth');
const configStore = require('./configStore');
const auditLogService = require('./auditLogService');

/**
 * Revoke agent's OAuth token at PingOne authorization server
 * @param {string} agentId - Agent client_id
 * @returns {Promise<{revoked: boolean, timestamp: string}>}
 */
async function revokeTokenAtPingOne(agentId) {
  try {
    const startTime = Date.now();
    
    // Get agent's refresh token from session/config store
    const refreshToken = await getAgentRefreshToken(agentId);
    if (!refreshToken) {
      console.warn(`[killSwitch] No refresh token found for agent ${agentId}`);
      return { revoked: false, timestamp: new Date().toISOString(), error: 'no_refresh_token' };
    }

    // Build PingOne revocation request
    const revokeUrl = `${oauthConfig._base}/revoke`;
    const clientId = process.env.ADMIN_CLIENT_ID || configStore.get('admin_client_id');
    const clientSecret = process.env.ADMIN_CLIENT_SECRET || configStore.get('admin_client_secret');

    const response = await axios.post(revokeUrl, {
      token: refreshToken,
      token_type_hint: 'refresh_token',
      client_id: clientId,
      client_secret: clientSecret,
    }, {
      timeout: 5000, // 5 second timeout
    });

    const revokeTime = Date.now() - startTime;

    if (response.status === 200) {
      console.log(`[killSwitch] Token revoked for agent ${agentId} in ${revokeTime}ms`);
      return {
        revoked: true,
        timestamp: new Date().toISOString(),
        time_ms: revokeTime,
      };
    }

    throw new Error(`PingOne revoke returned ${response.status}`);
  } catch (error) {
    console.error('[killSwitch] Token revocation failed:', error.message);
    throw new Error(`Token revocation failed: ${error.message}`);
  }
}

/**
 * Invalidate all agent sessions in Redis/session store
 * @param {string} agentId 
 * @returns {Promise<{invalidated: number}>}
 */
async function invalidateSessionsInRedis(agentId) {
  try {
    // Access session store (Upstash Redis or local Redis)
    const sessionStore = require('../middleware/sessionConfig').store;
    
    if (!sessionStore || !sessionStore.client) {
      console.warn('[killSwitch] Session store not available');
      return { invalidated: 0 };
    }

    // Pattern: agent:agentId:* — find all sessions for this agent
    const pattern = `agent:${agentId}:*`;
    
    // Use Redis SCAN to find matching keys (non-blocking)
    let cursor = 0;
    let invalidatedCount = 0;
    
    const scanAndDelete = async () => {
      try {
        const result = await sessionStore.client.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
        cursor = result[0];
        const keys = result[1];
        
        if (keys.length > 0) {
          await Promise.all(keys.map(key => sessionStore.client.unlink(key)));
          invalidatedCount += keys.length;
        }
        
        if (cursor !== 0) {
          return scanAndDelete();
        }
        
        return invalidatedCount;
      } catch (e) {
        console.warn('[killSwitch] Session invalidation error:', e.message);
        return invalidatedCount;
      }
    };

    invalidatedCount = await scanAndDelete();
    console.log(`[killSwitch] Invalidated ${invalidatedCount} sessions for agent ${agentId}`);
    
    return { invalidated: invalidatedCount };
  } catch (error) {
    console.error('[killSwitch] Session invalidation failed:', error.message);
    return { invalidated: 0, error: error.message };
  }
}

/**
 * Capture agent state for forensic analysis
 * @param {string} agentId 
 * @returns {Promise<Object>} State snapshot
 */
async function captureAgentState(agentId) {
  const snapshot = {
    timestamp: new Date().toISOString(),
    agent_id: agentId,
    token: {
      client_id: agentId,
      scopes: [], // Would come from config
      expires_in: null,
      claims: {},
    },
    active_sessions: [],
    last_requests: [],
    config: {
      max_requests_per_minute: 10,
      approved_resources: [],
      max_transaction_amount: null,
      expires_at: null,
    },
    metrics: {
      requests_last_5m: 0,
      errors_last_5m: 0,
      rate_limit_violations: 0,
      avg_latency_ms: 0,
    },
    actions: [],
  };

  try {
    const sessionStore = require('../middleware/sessionConfig').store;
    
    // Try to get agent config from configStore
    try {
      const agentConfig = configStore.get(`agent:${agentId}:config`);
      if (agentConfig) {
        snapshot.config = {
          max_requests_per_minute: agentConfig.rate_limit || 10,
          approved_resources: agentConfig.resources || [],
          max_transaction_amount: agentConfig.max_tx,
          expires_at: agentConfig.expires_at,
        };
      }
    } catch (e) {
      // Config not available
    }

    // Get rate limit metrics from Redis
    try {
      if (sessionStore && sessionStore.client) {
        const requestCount = await sessionStore.client.get(`agent:${agentId}:requests`);
        const violationCount = await sessionStore.client.get(`agent:${agentId}:violations`);
        
        snapshot.metrics = {
          requests_last_5m: parseInt(requestCount) || 0,
          errors_last_5m: 0,
          rate_limit_violations: parseInt(violationCount) || 0,
          avg_latency_ms: 0,
        };
      }
    } catch (e) {
      // Metrics not available
    }

  } catch (error) {
    console.warn('[killSwitch] Error capturing state:', error.message);
  }

  return snapshot;
}

/**
 * Check if agent is revoked
 * @param {string} agentId 
 * @returns {Promise<boolean>}
 */
async function isAgentRevoked(agentId) {
  try {
    const sessionStore = require('../middleware/sessionConfig').store;
    
    if (!sessionStore || !sessionStore.client) {
      return false;
    }

    // Check if revoked flag is set
    const revokedKey = `agent:${agentId}:revoked`;
    const revoked = await sessionStore.client.get(revokedKey);
    
    return revoked === 'true';
  } catch (error) {
    console.warn('[killSwitch] Error checking revocation:', error.message);
    return false;
  }
}

/**
 * Get agent's refresh token from session store
 * @param {string} agentId 
 * @returns {Promise<string|null>}
 */
async function getAgentRefreshToken(agentId) {
  try {
    const sessionStore = require('../middleware/sessionConfig').store;
    
    if (!sessionStore || !sessionStore.client) {
      return null;
    }

    const key = `agent:${agentId}:refresh_token`;
    const token = await sessionStore.client.get(key);
    
    return token || null;
  } catch (error) {
    console.warn('[killSwitch] Error getting refresh token:', error.message);
    return null;
  }
}

/**
 * Main kill switch function: revoke agent token and capture state
 * @param {string} agentId 
 * @param {string} reason - Reason for kill switch activation
 * @returns {Promise<{success: boolean, revoked_at: string, state_snapshot_id: string, time_to_revoke_ms: number}>}
 */
async function killAgent(agentId, reason = 'manual_red_button') {
  const startTime = Date.now();
  
  try {
    console.log(`[killSwitch] Executing kill switch for agent ${agentId}. Reason: ${reason}`);

    // 1. Revoke token at PingOne
    const revokeResult = await revokeTokenAtPingOne(agentId);
    const timeToRevoke = Date.now() - startTime;

    if (!revokeResult.revoked) {
      // Retry once if failed
      console.warn(`[killSwitch] First revocation attempt failed, retrying...`);
      const retryResult = await revokeTokenAtPingOne(agentId);
      if (!retryResult.revoked) {
        throw new Error('Token revocation failed after 2 attempts');
      }
    }

    // 2. Capture state BEFORE invalidating sessions
    const stateSnapshot = await captureAgentState(agentId);
    const stateSnapshotId = crypto.randomBytes(8).toString('hex');

    // 3. Invalidate sessions in Redis
    await invalidateSessionsInRedis(agentId);

    // 4. Mark agent as revoked in session store
    try {
      const sessionStore = require('../middleware/sessionConfig').store;
      if (sessionStore && sessionStore.client) {
        await sessionStore.client.setex(`agent:${agentId}:revoked`, 86400, 'true'); // 24 hour expiry
      }
    } catch (e) {
      console.warn('[killSwitch] Could not set revoked flag:', e.message);
    }

    // 5. Record kill event in audit log
    await auditLogService.recordKillEvent(agentId, reason, stateSnapshot, timeToRevoke, stateSnapshotId);

    const result = {
      success: true,
      revoked_at: new Date().toISOString(),
      state_snapshot_id: stateSnapshotId,
      time_to_revoke_ms: timeToRevoke,
    };

    console.log(`[killSwitch] Kill switch completed for agent ${agentId} in ${timeToRevoke}ms`);
    return result;

  } catch (error) {
    console.error(`[killSwitch] Kill switch failed for agent ${agentId}:`, error.message);
    
    // Record failure to audit log
    try {
      await auditLogService.recordKillFailure(agentId, reason, error.message);
    } catch (auditError) {
      console.error('[killSwitch] Could not record failure to audit log:', auditError.message);
    }

    throw error;
  }
}

module.exports = {
  killAgent,
  captureAgentState,
  isAgentRevoked,
  revokeTokenAtPingOne,
  invalidateSessionsInRedis,
  getAgentRefreshToken,
};
