const http = require('http');

/**
 * Build an AG-UI CUSTOM event object.
 * @param {string} name - Event name (e.g., 'token_chain_bearer_obtained')
 * @param {object} value - Event payload
 * @returns {object} { type: 'CUSTOM', name, value }
 */
function buildCustomEvent(name, value) {
  return {
    type: 'CUSTOM',
    name,
    value,
  };
}

/**
 * Map token event IDs to AG-UI CUSTOM event names.
 * @param {string} tokenEventId - The token event id
 * @returns {string} AG-UI event name
 */
function mapTokenEventIdToEventName(tokenEventId) {
  if (tokenEventId === 'user-token') {
    return 'token_chain_bearer_obtained';
  }
  if (tokenEventId === 'exchange-in-progress') {
    return 'token_chain_exchange_started';
  }
  if (
    tokenEventId === 'exchanged-token' ||
    tokenEventId.startsWith('exchanged-token') ||
    tokenEventId.includes('exchanged')
  ) {
    return 'token_chain_mcp_token_obtained';
  }
  // Default: convert id to event name (replace hyphens with underscores)
  return `token_chain_${tokenEventId.replace(/-/g, '_')}`;
}

/**
 * Convert token events from agentMcpTokenService to AG-UI CUSTOM events.
 * @param {array} tokenEvents - Array of token event objects
 * @returns {array} Array of AG-UI CUSTOM event objects
 */
function buildTokenChainEvents(tokenEvents) {
  return tokenEvents.map((tokenEvent) => {
    const eventName = mapTokenEventIdToEventName(tokenEvent.id);
    const eventValue = {
      label: tokenEvent.label,
      status: tokenEvent.status,
      claims: tokenEvent.claims,
    };
    return buildCustomEvent(eventName, eventValue);
  });
}

/**
 * Write an SSE event to the response.
 * @param {object} res - Express response object
 * @param {object} eventObj - Event object with 'type', 'name', 'value' or 'data'
 */
function writeSseEvent(res, eventObj) {
  const jsonStr = JSON.stringify(eventObj);
  res.write(`data: ${jsonStr}\n\n`);
}

/**
 * Proxy agent SSE stream to browser, injecting token chain events first.
 * @param {object} options
 * @param {object} options.browserRes - Express response to browser
 * @param {string} options.runId - Run ID
 * @param {string} options.sessionId - Session ID
 * @param {string} options.message - User message
 * @param {string} options.authToken - Auth token
 * @param {array} options.tokenChainEvents - Token chain events to inject
 */
function proxyAgentSse(options) {
  const {
    browserRes,
    runId,
    sessionId,
    message,
    authToken,
    tokenChainEvents,
  } = options;

  const agentUrl = process.env.LANGCHAIN_AGENT_HTTP_URL || 'http://127.0.0.1:8888';

  // Inject token chain events first
  if (tokenChainEvents && Array.isArray(tokenChainEvents)) {
    tokenChainEvents.forEach((event) => {
      writeSseEvent(browserRes, event);
    });
  }

  // Build request body
  const requestBody = JSON.stringify({
    message,
    session_id: sessionId,
    auth_token: authToken,
    run_id: runId,
  });

  const requestOptions = {
    hostname: new URL(agentUrl).hostname,
    port: new URL(agentUrl).port || 80,
    path: '/run',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(requestBody),
      'Accept': 'text/event-stream',
    },
  };

  const req = http.request(requestOptions, (agentRes) => {
    // Pipe agent's SSE stream to browser
    agentRes.pipe(browserRes);
  });

  req.on('error', (err) => {
    console.error('[aguiSseProxy] Agent request error:', err.message);
    // Emit error event and finish
    writeSseEvent(browserRes, {
      type: 'ERROR',
      error: err.message,
    });
    writeSseEvent(browserRes, {
      type: 'RUN_FINISHED',
      status: 'error',
    });
    browserRes.end();
  });

  req.write(requestBody);
  req.end();
}

module.exports = {
  buildCustomEvent,
  buildTokenChainEvents,
  writeSseEvent,
  proxyAgentSse,
};
