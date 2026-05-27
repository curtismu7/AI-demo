'use strict';
/**
 * Unit tests for mcpPingOneStdioAdapter — listTools()
 *
 * Strategy: mock child_process.spawn so no real binary is needed.
 * We intercept stdin writes and emit JSON-RPC responses on stdout.
 */

const { EventEmitter } = require('events');

// Build a fake child process that responds to JSON-RPC messages
function makeFakeProc(responseMap) {
  const proc = new EventEmitter();
  proc.killed = false;
  proc.stdin  = { write: jest.fn() };
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();

  // When stdin.write is called, parse the JSON-RPC message and emit
  // the configured response on stdout after a tick.
  proc.stdin.write.mockImplementation((msg) => {
    let parsed;
    try { parsed = JSON.parse(msg.trim()); } catch { return; }
    const response = responseMap[parsed.method];
    if (response) {
      setImmediate(() => {
        proc.stdout.emit('data', JSON.stringify({ jsonrpc: '2.0', id: parsed.id, result: response }) + '\n');
      });
    }
  });

  return proc;
}

const FAKE_TOOLS = [
  { name: 'list_applications', description: 'List apps', inputSchema: { type: 'object', properties: {} } },
  { name: 'list_environments', description: 'List envs', inputSchema: { type: 'object', properties: {} } },
];

function makeDefaultProc() {
  return makeFakeProc({
    initialize: { protocolVersion: '2025-11-25', capabilities: {} },
    'tools/list': { tools: FAKE_TOOLS },
  });
}

describe('mcpPingOneStdioAdapter', () => {
  let fakeProc;

  beforeEach(() => {
    // Reset module registry so module-level state (_toolsCache, _initialized, etc.) is fresh
    jest.resetModules();

    fakeProc = makeDefaultProc();

    // jest.doMock is not hoisted, so it can reference variables in scope
    jest.doMock('child_process', () => ({ spawn: jest.fn().mockReturnValue(fakeProc) }));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('listTools()', () => {
    it('sends tools/list and returns the tools array', async () => {
      const { listTools } = require('../services/mcpPingOneStdioAdapter');
      const tools = await listTools();

      expect(tools).toHaveLength(2);
      expect(tools[0].name).toBe('list_applications');
      expect(tools[1].name).toBe('list_environments');
    });

    it('returns cached result on second call (no extra spawn)', async () => {
      const { listTools } = require('../services/mcpPingOneStdioAdapter');

      const first  = await listTools();
      const second = await listTools();

      expect(first).toBe(second); // same reference = cached
      // spawn called once (process reuse), tools/list sent once
      const toolsListCalls = fakeProc.stdin.write.mock.calls
        .filter(([msg]) => msg.includes('tools/list'));
      expect(toolsListCalls).toHaveLength(1);
    });

    it('returns empty array when result.tools is missing', async () => {
      jest.resetModules();

      const noToolsProc = makeFakeProc({
        initialize: { protocolVersion: '2025-11-25', capabilities: {} },
        'tools/list': {}, // no .tools property
      });
      jest.doMock('child_process', () => ({ spawn: jest.fn().mockReturnValue(noToolsProc) }));

      const { listTools } = require('../services/mcpPingOneStdioAdapter');
      const tools = await listTools();
      expect(tools).toEqual([]);
    });
  });
});
