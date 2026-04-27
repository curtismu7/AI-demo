'use strict';

/**
 * JSON-RPC proxy: forward a single request to a backend MCP server over WebSocket.
 *
 * Opens a fresh WebSocket connection per request (stateless proxy model — no
 * persistent connection pool needed for demo scale; add pooling for production).
 *
 * Protocol: MCP 2025-11-25 handshake (initialize → notifications/initialized → method → close).
 */

import WebSocket from 'ws';

const MCP_PROTOCOL_VERSION = '2025-11-25';
const HANDSHAKE_TIMEOUT_MS = 10_000;
const CALL_TIMEOUT_MS = parseInt(process.env.GW_TOOL_CALL_TIMEOUT_MS || '30000', 10);

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: unknown;
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export function proxyJsonRpc(
  backendWsUrl: string,
  backendToken: string,
  request: JsonRpcRequest,
): Promise<JsonRpcResponse> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.terminate();
      reject(new Error(`Proxy timeout after ${CALL_TIMEOUT_MS}ms for ${request.method}`));
    }, CALL_TIMEOUT_MS);

    const ws = new WebSocket(backendWsUrl, {
      headers: { Authorization: `Bearer ${backendToken}` },
    });

    let initialized = false;

    ws.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });

    ws.on('open', () => {
      // MCP handshake: initialize
      const initMsg = {
        jsonrpc: '2.0',
        id: 'gw-init',
        method: 'initialize',
        params: {
          protocolVersion: MCP_PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: { name: 'banking-mcp-gateway', version: '1.0.0' },
        },
      };
      ws.send(JSON.stringify(initMsg));

      // Handshake timeout guard
      setTimeout(() => {
        if (!initialized) {
          ws.terminate();
          reject(new Error('MCP handshake timeout'));
        }
      }, HANDSHAKE_TIMEOUT_MS);
    });

    ws.on('message', (raw) => {
      let msg: JsonRpcResponse;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }

      // Step 1: handle initialize response → send notifications/initialized → send real request
      if (!initialized && msg.id === 'gw-init') {
        initialized = true;
        ws.send(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} }));
        ws.send(JSON.stringify(request));
        return;
      }

      // Step 2: match the real request's id
      if (msg.id === request.id) {
        clearTimeout(timer);
        ws.close();
        resolve(msg);
      }
    });

    ws.on('close', () => {
      clearTimeout(timer);
    });
  });
}
