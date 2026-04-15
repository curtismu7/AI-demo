/**
 * agentRateLimit.js
 * 
 * Agent rate limiting middleware for AI Safety
 * Purpose: External rate limiting (not in agent code), auto-kill trigger
 * 
 * Requirements: REQ-159-03/06 — External rate limiting, auto-kill at threshold
 */

const killSwitchService = require('../services/killSwitchService');
const auditLogService = require('../services/auditLogService');

/**
 * Agent rate limit configuration
 * Default: 10 requests per 60 seconds
 */
const AGENT_RATE_LIMIT = {
  requests_per_window: parseInt(process.env.AGENT_RATE_LIMIT_REQUESTS || '10'),
  window_seconds: 60,
  auto_kill_violation_threshold: 5, // Kill after 5 violations in 5 minutes
  violation_window_minutes: 5,
};

/**
 * Check auto-kill trigger: has agent exceeded violation threshold?
 * @param {string} agentId 
 * @param {Object} sessionStore 
 * @returns {Promise<boolean>}
 */
async function checkAutoKill(agentId, sessionStore) {
  try {
    if (!sessionStore || !sessionStore.client) {
      return false;
    }

    // Count violations in last 5 minutes
    const violationKey = `agent:${agentId}:violations`;
    const violationCount = await sessionStore.client.get(violationKey);
    const count = parseInt(violationCount) || 0;

    const threshold = AGENT_RATE_LIMIT.auto_kill_violation_threshold;
    
    if (count >= threshold) {
      console.warn(`[rateLimit] Auto-kill triggered for agent ${agentId}: ${count} violations >= ${threshold}`);
      return true;
    }

    return false;
  } catch (error) {
    console.warn('[rateLimit] Error checking auto-kill:', error.message);
    return false;
  }
}

/**
 * Main rate limiting middleware
 * Applied BEFORE agent request handlers (external, cannot be bypassed)
 * 
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @param {Function} next - Express next()
 */
async function agentRateLimitMiddleware(req, res, next) {
  try {
    // Extract agent ID from token
    const agentId = req.user?.client_id;

    // Not an agent request - skip rate limiting
    if (!agentId) {
      return next();
    }

    // Is this agent revoked?
    const isRevoked = await killSwitchService.isAgentRevoked(agentId);
    if (isRevoked) {
      return res.status(401).json({
        error: 'agent_revoked',
        message: 'This agent has been revoked and cannot make further requests',
        error_code: 'AGENT_REVOKED',
      });
    }

    const sessionStore = require('../middleware/sessionConfig').store;
    if (!sessionStore || !sessionStore.client) {
      console.warn('[rateLimit] Session store not available, bypassing rate limit check');
      return next();
    }

    // Rate limit check
    const limitKey = `agent:${agentId}:requests`;
    const windowKey = `agent:${agentId}:window`;
    
    // Increment request count in current window
    const requestCount = await sessionStore.client.incr(limitKey);

    // Set window expiry on first request
    if (requestCount === 1) {
      // EXPIRE sets 60-second TTL
      await sessionStore.client.expire(limitKey, AGENT_RATE_LIMIT.window_seconds);
      console.log(`[rateLimit] Started new rate limit window for agent ${agentId}`);
    }

    const limit = AGENT_RATE_LIMIT.requests_per_window;

    // Check if exceeded
    if (requestCount > limit) {
      // Record violation
      await auditLogService.recordRateLimitViolation(agentId, requestCount, limit);

      // Increment violation counter
      const violationKey = `agent:${agentId}:violations`;
      const violationCount = await sessionStore.client.incr(violationKey);

      // Set violation window (5 minutes)
      if (violationCount === 1) {
        await sessionStore.client.expire(
          violationKey,
          AGENT_RATE_LIMIT.violation_window_minutes * 60
        );
      }

      console.warn(`[rateLimit] Rate limit exceeded for agent ${agentId}: ${requestCount}/${limit} (violation: ${violationCount})`);

      // Check auto-kill trigger
      const shouldAutoKill = await checkAutoKill(agentId, sessionStore);
      if (shouldAutoKill) {
        try {
          // Auto-trigger kill switch
          await killSwitchService.killAgent(agentId, 'Auto-triggered: rate limit violations');
          
          return res.status(429).json({
            error: 'agent_killed',
            message: 'Agent exceeded rate limits and was automatically stopped',
            error_code: 'AGENT_RATE_LIMIT_AUTO_KILL',
            auto_kill_reason: 'rate_limit_violations',
            admin_notification: `Red button auto-triggered for Agent ${agentId}`,
          });
        } catch (killError) {
          console.error('[rateLimit] Auto-kill failed:', killError.message);
          // Still reject the request even if kill fails
          return res.status(429).json({
            error: 'rate_limit_exceeded',
            message: 'Rate limit exceeded and killing agent failed',
            error_code: 'AGENT_RATE_LIMIT_KILL_ERROR',
          });
        }
      }

      // Normal rate limit exceeded (no auto-kill)
      return res.status(429).json({
        error: 'rate_limit_exceeded',
        message: `Agent rate limit: ${limit} requests per ${AGENT_RATE_LIMIT.window_seconds} seconds`,
        error_code: 'AGENT_RATE_LIMIT_EXCEEDED',
        current_count: requestCount,
        limit,
        window: `${AGENT_RATE_LIMIT.window_seconds}s`,
        violations_total: violationCount,
        auto_kill_threshold: AGENT_RATE_LIMIT.auto_kill_violation_threshold,
      });
    }

    // Request allowed - proceed
    req.agentRateLimit = {
      requests: requestCount,
      limit,
      remaining: limit - requestCount,
    };

    next();

  } catch (error) {
    console.error('[rateLimit] Middleware error:', error.message);
    // Fail open (allow request) if middleware fails
    // But log the error for debugging
    next();
  }
}

/**
 * Reset rate limit for an agent (e.g., for testing)
 * @param {string} agentId 
 * @returns {Promise<void>}
 */
async function resetRateLimit(agentId) {
  try {
    const sessionStore = require('../middleware/sessionConfig').store;
    if (sessionStore && sessionStore.client) {
      await sessionStore.client.unlink(
        `agent:${agentId}:requests`,
        `agent:${agentId}:window`,
        `agent:${agentId}:violations`
      );
      console.log(`[rateLimit] Rate limit reset for agent ${agentId}`);
    }
  } catch (error) {
    console.warn('[rateLimit] Error resetting rate limit:', error.message);
  }
}

module.exports = {
  agentRateLimitMiddleware,
  checkAutoKill,
  resetRateLimit,
  AGENT_RATE_LIMIT,
};
