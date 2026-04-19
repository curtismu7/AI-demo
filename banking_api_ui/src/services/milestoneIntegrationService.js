/**
 * Milestone Integration Service
 * Provides helpers to wire token exchange and agent flow events into the timeline
 * 
 * Usage in bankingAgentService.js:
 *   const { trackOidcLogin, trackExchangeStart, trackExchangeComplete, trackToolCall } = require('./milestoneIntegrationService');
 *   
 *   // In the agent message handler:
 *   const oidcMilestoneId = trackOidcLogin();
 *   const exchangeId = trackExchangeStart(exchangePath);
 *   // ... exchange happens ...
 *   trackExchangeComplete(exchangeId, exchangePath);
 */

/**
 * Phase 194 Plan 01 integration guide:
 * This service is imported into bankingAgentService.js to track milestones
 * as the agent flow progresses.
 */

// Track OIDC login milestone
// Call this when user is authenticated and about to start agent interaction
// Returns milestone ID for future updates
export function trackOidcLogin() {
  // Get useFlowMilestones from TokenChainContext in browser
  // This is a reference implementation; actual usage requires React hook context
  return {
    userId: 'current-user',
    timestamp: new Date().toISOString(),
    description: 'User authenticated via OIDC'
  };
}

// Track token exchange initiation
// Call when /api/exchange-token is about to be invoked
export function trackExchangeStart(exchangePath = '1-exchange') {
  return {
    type: 'exchange_start',
    exchangePath,
    timestamp: new Date().toISOString(),
    description: `Starting ${exchangePath} token exchange`
  };
}

// Track token exchange completion
// Call after /api/exchange-token succeeds
export function trackExchangeComplete(exchangeStartId, exchangePath = '1-exchange') {
  return {
    type: 'exchange_complete',
    exchangePath,
    timestamp: new Date().toISOString(),
    description: `Completed ${exchangePath} token exchange`
  };
}

// Track MCP tool call
// Call when MCP tool is about to be invoked
export function trackToolCall(toolName) {
  return {
    type: 'mcp_tool_call',
    toolName,
    timestamp: new Date().toISOString(),
    description: `Invoking MCP tool: ${toolName}`
  };
}

// Track backend operation
// Call when a banking API endpoint completes
export function trackBackendOperation(operationName, endpoint, status, durationMs) {
  return {
    type: 'backend_operation',
    operationName,
    endpoint,
    status,
    durationMs,
    timestamp: new Date().toISOString(),
    description: `${status === 'success' ? '✓' : '✕'} ${operationName} (${durationMs}ms)`
  };
}

// Flow complete
// Call when entire agent flow finishes
export function trackFlowComplete() {
  return {
    type: 'flow_complete',
    timestamp: new Date().toISOString(),
    description: 'Agent flow complete'
  };
}

export default {
  trackOidcLogin,
  trackExchangeStart,
  trackExchangeComplete,
  trackToolCall,
  trackBackendOperation,
  trackFlowComplete
};
