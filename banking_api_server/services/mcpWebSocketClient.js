// banking_api_server/services/mcpWebSocketClient.js
/**
 * JSON-RPC over WebSocket client for banking_mcp_server (MCP 2025-11-25 handshake + tools).
 * Shared by /api/mcp/tool and /api/mcp/inspector/*.
 *
 * Lifecycle: initialize → notifications/initialized → tools/list | tools/call (per MCP spec).
 */
const WebSocket = require('ws');
const configStore = require('./configStore');

/** Protocol version sent on initialize — runtime-configurable via Feature Flag 'mcp_use_legacy_protocol'.
 *  OFF (default) = 2025-11-25 (current spec).  ON = 2024-11-05 (previous spec).
 *  Falls back to MCP_CLIENT_PROTOCOL_VERSION env var, then 2025-11-25. */
const MCP_CLIENT_PROTOCOL_VERSION = process.env.MCP_CLIENT_PROTOCOL_VERSION || '2025-11-25';

/** Returns the protocol version to use for the current connection (checked at call time). */
function getMcpProtocolVersion() {
  const legacyFlag = configStore.getEffective('mcp_use_legacy_protocol');
  if (legacyFlag === true || legacyFlag === 'true') return '2024-11-05';
  return MCP_CLIENT_PROTOCOL_VERSION;
}

/** Versions this client can interoperate with — disconnect on mismatch (spec SHOULD). */
const SUPPORTED_PROTOCOL_VERSIONS = new Set(['2025-11-25', '2024-11-05']);

/** Scopes requested for RFC 8693 token exchange per MCP tool (must match BankingToolRegistry names).
 *  Each tool lists [specific, broad] so either the precise scope OR the umbrella scope is sufficient.
 *  banking:read  = view own data (accounts, balances, transactions)
 *  banking:write = mutate data (transfer, deposit, withdrawal) */
const MCP_TOOL_SCOPES = {
  // Read tools — specific scope OR broad banking:read
  get_my_accounts:             ['banking:accounts:read', 'banking:read'],
  get_account_balance:         ['banking:accounts:read', 'banking:read'],
  get_my_transactions:         ['banking:transactions:read', 'banking:read'],
  // Write tools — specific scope OR broad banking:write
  create_transfer:             ['banking:transactions:write', 'banking:write'],
  create_deposit:              ['banking:transactions:write', 'banking:write'],
  create_withdrawal:           ['banking:transactions:write', 'banking:write'],
  // Query tool — agent identity lookup scope
  query_user_by_email:         ['ai_agent'],
  // Legacy aliases (if still used anywhere)
  list_accounts:               ['banking:accounts:read', 'banking:read'],
  list_transactions:           ['banking:transactions:read', 'banking:read'],
  transfer:                    ['banking:transactions:write', 'banking:write'],
  deposit:                     ['banking:transactions:write', 'banking:write'],
  withdraw:                    ['banking:transactions:write', 'banking:write'],
  banking_get_account_balance: ['banking:accounts:read', 'banking:read'],
  banking_create_transfer:     ['banking:transactions:write', 'banking:write'],
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

function jsonRpcIdsMatch(a, b) {
  return a === b || String(a) === String(b);
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
 * After initialize + notifications/initialized, run one follow-up JSON-RPC method and return the result body.
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

    const INIT_REQUEST_ID = 1;
    const FOLLOW_REQUEST_ID = 2;

    acquireMcpWsSlot()
      .then(() => {
        const ws = new WebSocket(getMcpServerUrl());
        /** @type {'awaiting_init' | 'awaiting_follow'} */
        let phase = 'awaiting_init';

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
            protocolVersion: getMcpProtocolVersion(),
            capabilities: {},
            clientInfo: { name: 'banking-api-server', version: '1.0.0', description: 'Super Banking Banking BFF — MCP WebSocket client' },
          };
          if (agentToken) initParams.agentToken = agentToken;
          if (userSub) initParams.userSub = userSub;
          if (correlationId) initParams.correlationId = correlationId;
          ws.send(
            JSON.stringify({
              jsonrpc: '2.0',
              id: INIT_REQUEST_ID,
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

          if (phase === 'awaiting_init') {
            if (!jsonRpcIdsMatch(msg.id, INIT_REQUEST_ID)) {
              clearTimeout(timeout);
              safeRelease();
              reject(new Error(`MCP unexpected response id (expected initialize ${INIT_REQUEST_ID})`));
              return;
            }
            if (msg.error) {
              clearTimeout(timeout);
              ws.close();
              safeRelease();
              reject(new Error(msg.error.message || JSON.stringify(msg.error)));
              return;
            }
            // SHOULD (spec lifecycle): disconnect if server negotiated a version we cannot speak.
            const negotiatedVersion = msg.result && msg.result.protocolVersion;
            if (!SUPPORTED_PROTOCOL_VERSIONS.has(negotiatedVersion)) {
              clearTimeout(timeout);
              ws.close();
              safeRelease();
              reject(new Error(`MCP server negotiated unsupported protocol version: ${negotiatedVersion}`));
              return;
            }
            phase = 'awaiting_follow';
            ws.send(
              JSON.stringify({
                jsonrpc: '2.0',
                method: 'notifications/initialized',
              })
            );
            ws.send(
              JSON.stringify({
                jsonrpc: '2.0',
                id: FOLLOW_REQUEST_ID,
                method: followMethod,
                params: followParams || {},
              })
            );
            return;
          }

          if (phase === 'awaiting_follow') {
            if (!jsonRpcIdsMatch(msg.id, FOLLOW_REQUEST_ID)) {
              clearTimeout(timeout);
              safeRelease();
              reject(new Error(`MCP unexpected response id (expected ${followMethod} ${FOLLOW_REQUEST_ID})`));
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
  MCP_CLIENT_PROTOCOL_VERSION,
  getMcpProtocolVersion,
  getMcpServerUrl,
  getSessionAccessToken,
  getSessionBearerForMcp,
  mcpListTools,
  mcpCallTool,
};
