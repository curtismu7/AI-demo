// banking_api_server/services/mcpWebSocketClient.js
/**
 * JSON-RPC over WebSocket client for banking_mcp_server (MCP 2024-11-05).
 * Shared by /api/mcp/tool and /api/mcp/inspector/*.
 */
const WebSocket = require('ws');
const configStore = require('./configStore');

/** Scopes requested for RFC 8693 token exchange per MCP tool (must match BankingToolRegistry names). */
const MCP_TOOL_SCOPES = {
  get_my_accounts: ['banking:accounts:read'],
  get_account_balance: ['banking:accounts:read'],
  get_my_transactions: ['banking:transactions:read'],
  create_transfer: ['banking:transactions:write'],
  create_deposit: ['banking:transactions:write'],
  create_withdrawal: ['banking:transactions:write'],
  query_user_by_email: ['ai_agent'],
  // Legacy aliases (if still used anywhere)
  list_accounts: ['banking:accounts:read'],
  list_transactions: ['banking:transactions:read'],
  transfer: ['banking:transactions:write'],
  deposit: ['banking:transactions:write'],
  withdraw: ['banking:transactions:write'],
};

function getMcpServerUrl() {
  return configStore.getEffective('mcp_server_url') || 'ws://localhost:8080';
}

function getSessionAccessToken(req) {
  const t = req.session?.oauthTokens;
  if (!t) return null;
  return t.accessToken || t.access_token || null;
}

/**
 * Bearer string suitable for PingOne / MCP — excludes the synthetic cookie-session marker.
 */
function getSessionBearerForMcp(req) {
  const raw = getSessionAccessToken(req);
  if (!raw || typeof raw !== 'string' || raw === '_cookie_session') return null;
  return raw;
}

/** Limit concurrent MCP WebSocket handshakes per process (connection pool / back-pressure). */
const MCP_WS_MAX_CONCURRENT = Math.max(1, parseInt(process.env.MCP_WS_MAX_CONCURRENT || '8', 10) || 8);
let mcpWsActiveCount = 0;
const mcpWsWaitQueue = [];

/**
 * Acquire a slot in the MCP WebSocket pool; release when the RPC completes (success or error).
 * @returns {Promise<void>}
 */
function acquireMcpWsSlot() {
  return new Promise((resolve) => {
    if (mcpWsActiveCount < MCP_WS_MAX_CONCURRENT) {
      mcpWsActiveCount += 1;
      resolve();
    } else {
      mcpWsWaitQueue.push(resolve);
    }
  });
}

/**
 * Release a slot and wake the next waiter if any.
 */
function releaseMcpWsSlot() {
  if (mcpWsWaitQueue.length > 0) {
    const next = mcpWsWaitQueue.shift();
    next();
  } else {
    mcpWsActiveCount -= 1;
  }
}

/**
 * After initialize, run one follow-up JSON-RPC method and return the result body.
 * @param {'tools/list'|'tools/call'} followMethod
 * @param {object} followParams
 * @param {string|null} [userSub] - User subject identifier passed as trusted metadata (not auth credential)
 * @param {string} [correlationId] - Optional correlation ID for distributed tracing
 */
function mcpRpc(agentToken, followMethod, followParams, userSub, correlationId) {
  return new Promise((resolve, reject) => {
    let released = false;
    const safeRelease = () => {
      if (!released) {
        released = true;
        releaseMcpWsSlot();
      }
    };

    acquireMcpWsSlot()
      .then(() => {
        const ws = new WebSocket(getMcpServerUrl());
        let msgId = 1;
        let initialized = false;

        const timeout = setTimeout(() => {
          ws.terminate();
          safeRelease();
          reject(new Error('MCP call timed out'));
        }, 15000);

        ws.on('error', (err) => {
          clearTimeout(timeout);
          safeRelease();
          reject(err);
        });

        ws.on('open', () => {
          const initParams = {
            protocolVersion: '2024-11-05',
            clientInfo: { name: 'banking-api-server' },
          };
          if (agentToken) initParams.agentToken = agentToken;
          // userSub is the user's PingOne sub — passed as trusted metadata so the
          // MCP server knows whose data to operate on without receiving T1 directly.
          if (userSub) initParams.userSub = userSub;
          if (correlationId) initParams.correlationId = correlationId;
          ws.send(
            JSON.stringify({
              jsonrpc: '2.0',
              id: msgId++,
              method: 'initialize',
              params: initParams,
            })
          );
        });

        ws.on('message', (raw) => {
          let msg;
          try {
            msg = JSON.parse(raw.toString());
          } catch {
            clearTimeout(timeout);
            safeRelease();
            reject(new Error('MCP invalid JSON response'));
            return;
          }

          if (!initialized) {
            initialized = true;
            ws.send(
              JSON.stringify({
                jsonrpc: '2.0',
                id: msgId++,
                method: followMethod,
                params: followParams || {},
              })
            );
            return;
          }

          clearTimeout(timeout);
          ws.close();

          if (msg.error) {
            safeRelease();
            reject(new Error(msg.error.message || JSON.stringify(msg.error)));
          } else {
            safeRelease();
            resolve(msg.result);
          }
        });
      })
      .catch((err) => {
        safeRelease();
        reject(err);
      });
  });
}

function mcpListTools(agentToken, userSub, correlationId) {
  return mcpRpc(agentToken, 'tools/list', {}, userSub, correlationId);
}

function mcpCallTool(toolName, toolParams, agentToken, userSub, correlationId) {
  return mcpRpc(agentToken, 'tools/call', {
    name: toolName,
    arguments: toolParams || {},
  }, userSub, correlationId);
}

module.exports = {
  MCP_TOOL_SCOPES,
  getMcpServerUrl,
  getSessionAccessToken,
  getSessionBearerForMcp,
  mcpListTools,
  mcpCallTool,
};
