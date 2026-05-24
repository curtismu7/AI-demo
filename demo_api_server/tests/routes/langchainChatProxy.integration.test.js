'use strict';

/**
 * Phase 3 — langchainChatProxy.integration.test.js
 *
 * Wires the real proxy onto a real http.Server with the real express-session
 * middleware and a stand-in upstream WS server (impersonating langchain on
 * :8889). Mocks only oauthService (PingOne) and configStore (audience config).
 *
 * Proves the Path A token-custody contract end to end:
 *   - unauthenticated browser (no session cookie / no oauthTokens) => the
 *     upgrade is rejected with HTTP 401, no upstream connection
 *   - authenticated session => upstream langchain receives a session_init
 *     frame carrying the BFF-resolved auth_token
 *   - the browser→proxy frame the client SENT contained NO token, and the
 *     proxy→browser stream never echoes a raw token
 */

jest.mock('../../services/configStore', () => {
  const store = {
    pingone_resource_langchain_agent_uri:
      'langchain.ping.demo (not provisioned)',
    pingone_resource_mcp_server_uri: 'mcpserver.ping.demo',
    mcp_token_exchange_scopes: 'banking:read banking:write',
    ff_langchain_audience_fallback: 'false',
  };
  return { getEffective: jest.fn((k) => store[k]), __store: store };
});

jest.mock('../../services/oauthService', () => ({
  performTokenExchange: jest.fn().mockResolvedValue('BFF.EXCHANGED.LANGCHAIN.TOKEN'),
}));

const http = require('http');
const express = require('express');
const session = require('express-session');
const WebSocket = require('ws');
const configStore = require('../../services/configStore');
const {
  attachLangchainChatProxy,
} = require('../../services/langchainChatProxy');

jest.setTimeout(15000);

let upstreamServer; // stand-in langchain WS server
let upstreamPort;
let upstreamReceived;
let app;
let server;
let bffPort;

function startUpstream() {
  return new Promise((resolve) => {
    upstreamReceived = [];
    upstreamServer = new WebSocket.Server({ port: 0 }, () => {
      upstreamPort = upstreamServer.address().port;
      resolve();
    });
    upstreamServer.on('connection', (ws) => {
      ws.on('message', (m) => {
        upstreamReceived.push(m.toString());
        // echo a benign frame back so we can assert the proxy→browser stream
        ws.send(JSON.stringify({ type: 'session_initialized', session_id: 's1' }));
      });
    });
  });
}

beforeAll(async () => {
  await startUpstream();
  configStore.__store.langchain_chat_ws_url = `ws://localhost:${upstreamPort}`;

  app = express();
  const sessionMiddleware = session({
    secret: 'test-secret-32-characters-long!!',
    resave: false,
    saveUninitialized: true,
    cookie: { httpOnly: true },
  });
  app.use(sessionMiddleware);
  app.get('/login', (req, res) => {
    req.session.oauthTokens = { accessToken: 'user.session.access.token' };
    req.session.save(() => res.json({ ok: true }));
  });
  app.get('/', (req, res) => res.json({ ok: true }));

  server = http.createServer(app);
  attachLangchainChatProxy(server, sessionMiddleware);
  await new Promise((r) => server.listen(0, r));
  bffPort = server.address().port;
});

afterAll(async () => {
  await new Promise((r) => server.close(r));
  await new Promise((r) => upstreamServer.close(r));
});

function getCookie() {
  return new Promise((resolve, reject) => {
    http
      .get(`http://localhost:${bffPort}/login`, (res) => {
        resolve(res.headers['set-cookie'][0].split(';')[0]);
        res.resume();
      })
      .on('error', reject);
  });
}

describe('langchain chat-WS proxy — Path A integration', () => {
  test('unauthenticated upgrade (no session cookie) => HTTP 401, no upstream', async () => {
    const before = upstreamReceived.length;
    const ws = new WebSocket(`ws://localhost:${bffPort}/ws/langchain`);

    const err = await new Promise((resolve) => {
      ws.on('error', resolve);
      ws.on('open', () => resolve(null));
    });

    expect(err).toBeTruthy(); // handshake rejected
    expect(String(err.message)).toMatch(/401/);
    expect(upstreamReceived.length).toBe(before);
  });

  test('authenticated => upstream gets session_init WITH token; browser stream has none', async () => {
    const cookie = await getCookie();
    const before = upstreamReceived.length;

    const ws = new WebSocket(`ws://localhost:${bffPort}/ws/langchain`, {
      headers: { Cookie: cookie },
    });

    const browserFrames = [];
    await new Promise((resolve, reject) => {
      ws.on('open', () => {
        // The browser sends session_init with NO token (token custody).
        ws.send(JSON.stringify({ type: 'session_init', session_id: 's1' }));
      });
      ws.on('message', (m) => {
        browserFrames.push(m.toString());
        resolve();
      });
      ws.on('error', reject);
      setTimeout(resolve, 3000);
    });

    // Upstream langchain received a session_init carrying the BFF token.
    const upstreamFrames = upstreamReceived.slice(before);
    expect(upstreamFrames.length).toBeGreaterThan(0);
    const init = JSON.parse(upstreamFrames[0]);
    expect(init.type).toBe('session_init');
    expect(init.auth_token).toBe('BFF.EXCHANGED.LANGCHAIN.TOKEN');

    // The token NEVER appears in the proxy→browser stream.
    for (const f of browserFrames) {
      expect(f).not.toContain('BFF.EXCHANGED.LANGCHAIN.TOKEN');
      expect(f).not.toContain('user.session.access.token');
    }
    ws.close();
  });
});
