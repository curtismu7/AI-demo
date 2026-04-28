'use strict';
/**
 * mcpPingOneStdioAdapter.js
 *
 * Adapter that spawns the `pingidentity/pingone-mcp-server` stdio binary and
 * routes MCP tool calls through it via JSON-RPC stdio transport.
 *
 * Binary command: PINGONE_MCP_SERVER_CMD env var (default: 'npx')
 * Binary args:    PINGONE_MCP_SERVER_ARGS env var, space-separated
 *                 (default: '--yes @pingidentity/mcp-server')
 *
 * The process is reused across calls. On exit it is re-spawned on next call.
 * Access tokens are passed as MCP _meta — never logged.
 */
const { spawn } = require('child_process');

let _proc        = null;   // spawned child process
let _buffer      = '';     // stdout line buffer
let _msgId       = 0;      // JSON-RPC id counter
let _pending     = new Map(); // id → { resolve, reject }
let _initialized = false;
let _initPromise = null;

const TIMEOUT_MS = 30_000;

function _getCmd() {
    return process.env.PINGONE_MCP_SERVER_CMD || 'npx';
}

function _getArgs() {
    if (process.env.PINGONE_MCP_SERVER_ARGS) {
        return process.env.PINGONE_MCP_SERVER_ARGS.split(' ').filter(Boolean);
    }
    return ['--yes', '@pingidentity/mcp-server'];
}

function _ensureProcess() {
    if (_proc && !_proc.killed) return _proc;

    // Reset state on respawn
    _initialized = false;
    _initPromise  = null;
    _buffer       = '';
    _msgId        = 0;
    for (const { reject } of _pending.values()) {
        reject(new Error('pingone-mcp-server: process restarting'));
    }
    _pending.clear();

    const cmd  = _getCmd();
    const args = _getArgs();
    console.log('[mcpPingOneStdioAdapter] spawning: %s %s', cmd, args.join(' '));

    _proc = spawn(cmd, args, {
        env:   { ...process.env },
        stdio: ['pipe', 'pipe', 'pipe'],
    });

    _proc.stdout.on('data', (chunk) => {
        _buffer += chunk.toString();
        const lines = _buffer.split('\n');
        _buffer = lines.pop(); // keep incomplete last line
        for (const line of lines) {
            if (!line.trim()) continue;
            try {
                const msg = JSON.parse(line);
                if (msg.id != null && _pending.has(msg.id)) {
                    const { resolve, reject } = _pending.get(msg.id);
                    _pending.delete(msg.id);
                    if (msg.error) {
                        const err = new Error(msg.error.message || 'MCP stdio error');
                        err.code    = 'mcp_stdio_error';
                        err.mcpCode = msg.error.code;
                        reject(err);
                    } else {
                        resolve(msg.result);
                    }
                }
            } catch {
                // Ignore non-JSON stdout lines (e.g. startup banners)
            }
        }
    });

    _proc.stderr.on('data', (chunk) => {
        // Log stderr at warn level for debugging; access tokens are not part of stderr output
        const text = chunk.toString().trim();
        if (text) console.warn('[mcpPingOneStdioAdapter] stderr: %s', text);
    });

    _proc.on('exit', (code, signal) => {
        console.warn('[mcpPingOneStdioAdapter] process exited: code=%s signal=%s', code, signal);
        _proc        = null;
        _initialized = false;
        _initPromise  = null;
        for (const { reject } of _pending.values()) {
            reject(new Error(`pingone-mcp-server exited unexpectedly (code=${code})`));
        }
        _pending.clear();
    });

    _proc.on('error', (err) => {
        console.error('[mcpPingOneStdioAdapter] spawn error: %s', err.message);
        _proc        = null;
        _initialized = false;
        _initPromise  = null;
        for (const { reject: rej } of _pending.values()) {
            rej(new Error(`pingone-mcp-server spawn error: ${err.message}`));
        }
        _pending.clear();
    });

    return _proc;
}

function _send(method, params) {
    return new Promise((resolve, reject) => {
        const proc = _ensureProcess();
        const id   = ++_msgId;
        _pending.set(id, { resolve, reject });

        const msg = JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n';
        proc.stdin.write(msg);

        const timer = setTimeout(() => {
            if (_pending.has(id)) {
                _pending.delete(id);
                reject(new Error(`pingone-mcp-server: request timeout (${method}, ${TIMEOUT_MS}ms)`));
            }
        }, TIMEOUT_MS);
        // Don't block process exit on the timer
        if (timer.unref) timer.unref();
    });
}

async function _ensureInitialized() {
    if (_initialized) return;
    if (_initPromise)  return _initPromise;

    _initPromise = _send('initialize', {
        protocolVersion: '2025-11-25',
        capabilities:    {},
        clientInfo:      { name: 'bff', version: '1.0' },
    }).then(() => {
        _initialized = true;
    }).catch((err) => {
        _initialized = false;
        _initPromise  = null;
        throw err;
    });

    return _initPromise;
}

/**
 * Call a tool via the PingOne MCP Server stdio binary.
 *
 * @param {string} tool          MCP tool name
 * @param {object} params        Tool input parameters
 * @param {string} accessToken   RFC 8693 delegated access token — NOT logged
 * @param {string} [userSub]     User subject identifier
 * @param {string} [correlationId]
 * @returns {Promise<object>}    MCP tools/call result
 */
async function callToolViaStdio(tool, params, accessToken, userSub, correlationId) {
    await _ensureInitialized();

    const result = await _send('tools/call', {
        name:      tool,
        arguments: params || {},
        _meta: {
            // Access token forwarded to the MCP server as opaque metadata.
            // Not logged or exposed in error messages.
            authorization: `Bearer ${accessToken}`,
            user_sub:       userSub       || undefined,
            correlation_id: correlationId || undefined,
        },
    });

    return result;
}

module.exports = { callToolViaStdio };
