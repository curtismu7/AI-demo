/**
 * Agent Session Middleware
 * Binds agent executor to authenticated user context
 * Handles RFC 8693 token exchange setup and session validation
 */

import { refreshOAuthSession } from './bankingAgentService.js';

/**
 * Main middleware: validates session, attaches auth context
 * Should be applied to all /api/banking-agent/* routes
 */
export async function agentSessionMiddleware(req, res, next) {
  try {
    // Step 1: Verify user is authenticated
    if (!req.user || !req.user.sub) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Please log in to access the banking agent.',
      });
    }

    if (!req.session || !req.session.oauth_tokens) {
      return res.status(401).json({
        error: 'Session not found',
        message: 'Session has expired. Please log in again.',
      });
    }

    // Step 2: Check session expiry and refresh if needed
    if (req.session.expiresAt && req.session.expiresAt < Date.now()) {
      try {
        await refreshOAuthSession(req);
      } catch (error) {
        console.error('[agentSessionMiddleware] Refresh failed:', error.message);
        return res.status(401).json({
          error: 'Session expired',
          message: 'Could not refresh session. Please log in again.',
        });
      }
    }

    // Step 3: Attach auth context to request for agent service
    req.agentContext = {
      userId: req.user.sub, // PingOne user ID
      email: req.user.email || 'unknown',
      accessToken: req.session.oauth_tokens.access_token,
      refreshToken: req.session.oauth_tokens.refresh_token,
      sessionId: req.sessionID,
      // These will be populated after token exchange in Plan 02
      agentToken: null,
      tokenExchangedAt: null,
    };

    // Step 4: Initialize token events tracking for this request
    // Events will be collected during MCP tool calls and returned in response
    req.tokenEvents = [];

    // Steps 5: Add helper methods for token exchange (will be called by agent service)
    req.recordTokenEvent = (type, data) => {
      req.tokenEvents.push({
        type,
        timestamp: new Date().toISOString(),
        ...data,
      });
    };

    // All checks passed — proceed to next middleware/handler
    next();
  } catch (error) {
    console.error('[agentSessionMiddleware] Error:', error.message);
    return res
      .status(500)
      .json({ error: 'Internal server error', message: error.message });
  }
}

/**
 * Optional: Middleware to enforce agent context presence
 * Use after agentSessionMiddleware if you want double-validation
 */
export function requireAgentContext(req, res, next) {
  if (!req.agentContext) {
    return res.status(500).json({
      error: 'Agent context not initialized',
      message: 'Please ensure agentSessionMiddleware is applied before this middleware.',
    });
  }
  next();
}

/**
 * Helper to safely access auth context with defaults
 */
export function getAuthContextOrDefault(req) {
  return (
    req.agentContext || {
      userId: null,
      email: null,
      accessToken: null,
      refreshToken: null,
      sessionId: null,
      agentToken: null,
      tokenExchangedAt: null,
    }
  );
}
