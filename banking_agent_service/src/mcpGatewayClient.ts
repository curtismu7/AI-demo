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

export class McpGatewayClient {
  private ws: WebSocket | null = null;
  private initialized = false;
  private readonly pending = new Map<string | number, (msg: unknown) => void>();
  private _idSeq = 0;

  constructor(private readonly wsUrl: string, private readonly token: string) {}

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.wsUrl, {
        headers: { Authorization: `Bearer ${this.token}` },
      });

      this.ws.on('error', reject);
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
          resolve();
          return;
        }

        const cb = this.pending.get(msg.id);
        if (cb) {
          this.pending.delete(msg.id);
          cb(msg);
        }
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
      return { content: [{ type: 'text', text: response.error.message }], isError: true };
    }
    return response?.result || { content: [], isError: true };
  }

  close(): void {
    this.ws?.close();
  }

  private _send(msg: unknown): void {
    this.ws?.send(JSON.stringify(msg));
  }

  private _request(msg: any): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this.initialized) { reject(new Error('MCP client not initialized')); return; }
      const timeout = setTimeout(() => {
        this.pending.delete(msg.id);
        reject(new Error(`MCP request timeout: ${msg.method}`));
      }, 30_000);

      this.pending.set(msg.id, (response) => {
        clearTimeout(timeout);
        resolve(response);
      });
      this._send(msg);
    });
  }
}
