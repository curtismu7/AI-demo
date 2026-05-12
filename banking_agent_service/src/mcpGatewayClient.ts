'use strict';

/**
 * MCP Gateway WebSocket client.
 *
 * Manages a single persistent connection per agent task lifecycle.
 * Performs MCP handshake then exposes callTool() and listTools().
 */

import WebSocket from 'ws';

const MCP_PROTO_VERSION = '2025-11-25';

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: unknown;
}

export interface ToolResult {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}

/**
 * Typed error thrown when the MCP Gateway returns a JSON-RPC error response.
 * Preserves code and data so callers can branch on -32403 (login_required)
 * and -32002 (hitl_required) without string-matching error messages.
 */
export class McpGatewayError extends Error {
  constructor(
    public readonly code: number,
    message: string,
    public readonly data?: unknown,
  ) {
    super(message);
    this.name = 'McpGatewayError';
  }
}

/**
 * BL-01: typed error for transport-layer failures (close / send-on-closed /
 * connect-timeout). Distinct from McpGatewayError so callers can tell the
 * difference between "server returned -32xxx" and "the WebSocket dropped".
 */
export class GatewayConnectionClosed extends Error {
  constructor(message: string, public readonly code?: number, public readonly reason?: string) {
    super(message);
    this.name = 'GatewayConnectionClosed';
  }
}

const CONNECT_TIMEOUT_MS = 10_000;
const REQUEST_TIMEOUT_MS = 30_000;

export class McpGatewayClient {
  private ws: WebSocket | null = null;
  private initialized = false;
  private closed = false;
  private readonly pending = new Map<string | number, { resolve: (msg: unknown) => void; reject: (err: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  private _idSeq = 0;

  constructor(private readonly wsUrl: string, private readonly token: string) {}

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      let settled = false;
      const settle = (fn: () => void) => {
        if (settled) return;
        settled = true;
        fn();
      };

      this.ws = new WebSocket(this.wsUrl, {
        headers: { Authorization: `Bearer ${this.token}` },
      });

      // BL-01: cap the handshake so a stuck connect doesn't dangle forever.
      const connectTimer = setTimeout(() => {
        settle(() => {
          try { this.ws?.terminate(); } catch { /* ignore */ }
          reject(new GatewayConnectionClosed(`MCP connect timeout after ${CONNECT_TIMEOUT_MS}ms`));
        });
      }, CONNECT_TIMEOUT_MS);

      this.ws.on('error', (err) => {
        settle(() => {
          clearTimeout(connectTimer);
          reject(err);
        });
      });

      this.ws.on('open', () => {
        this._send({
          jsonrpc: '2.0',
          id: 'init',
          method: 'initialize',
          params: {
            protocolVersion: MCP_PROTO_VERSION,
            capabilities: {},
            clientInfo: { name: 'banking-agent-service', version: '1.0.0' },
          },
        });
      });

      this.ws.on('message', (raw) => {
        let msg: any;
        try { msg = JSON.parse(raw.toString()); } catch { return; }

        if (msg.id === 'init' && msg.result) {
          this.ws!.send(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} }));
          this.initialized = true;
          settle(() => {
            clearTimeout(connectTimer);
            resolve();
          });
          return;
        }

        const entry = this.pending.get(msg.id);
        if (entry) {
          this.pending.delete(msg.id);
          clearTimeout(entry.timer);
          entry.resolve(msg);
        }
      });

      // BL-01: on close, fail every pending request with a typed error.
      // Without this handler, a gateway restart leaves pending callers
      // hanging until the per-request 30s timeout fires for EACH request,
      // pegging the agent for MAX_TOOL_ITERATIONS * 30s.
      this.ws.on('close', (code, reasonBuf) => {
        this.closed = true;
        this.initialized = false;
        const reason = reasonBuf?.toString() || undefined;
        const err = new GatewayConnectionClosed(
          `MCP gateway WebSocket closed (code=${code}${reason ? `, reason=${reason}` : ''})`,
          code,
          reason,
        );
        this._failAllPending(err);
        // If the close happens before init resolved, fail the connect promise too.
        settle(() => {
          clearTimeout(connectTimer);
          reject(err);
        });
      });
    });
  }

  async listTools(): Promise<ToolDefinition[]> {
    const id = ++this._idSeq;
    const response: any = await this._request({ jsonrpc: '2.0', id, method: 'tools/list', params: {} });
    return response?.result?.tools || [];
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<ToolResult> {
    const id = ++this._idSeq;
    const response: any = await this._request({
      jsonrpc: '2.0',
      id,
      method: 'tools/call',
      params: { name, arguments: args },
    });
    if (response?.error) {
      throw new McpGatewayError(
        response.error.code,
        response.error.message,
        response.error.data,
      );
    }
    return response?.result || { content: [], isError: true };
  }

  close(): void {
    this.ws?.close();
  }

  private _failAllPending(err: Error): void {
    for (const [, entry] of this.pending) {
      clearTimeout(entry.timer);
      entry.reject(err);
    }
    this.pending.clear();
  }

  private _send(msg: unknown): void {
    this.ws?.send(JSON.stringify(msg));
  }

  private _request(msg: any): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this.initialized) { reject(new Error('MCP client not initialized')); return; }
      // BL-01: never call ws.send on a closed/closing socket — `ws` would
      // throw asynchronously and the request would dangle. Reject immediately
      // with the typed connection-closed error so callers can branch on it.
      if (this.closed || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new GatewayConnectionClosed(
          `MCP gateway WebSocket not open (readyState=${this.ws?.readyState ?? 'null'})`,
        ));
        return;
      }
      const timer = setTimeout(() => {
        this.pending.delete(msg.id);
        reject(new Error(`MCP request timeout: ${msg.method}`));
      }, REQUEST_TIMEOUT_MS);

      this.pending.set(msg.id, {
        resolve,
        reject,
        timer,
      });
      this._send(msg);
    });
  }
}
