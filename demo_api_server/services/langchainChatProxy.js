'use strict';

/**
 * BFF ↔ langchain chat-WS proxy (Path A — CR-02/CR-04 token custody fix).
 *
 * Why this exists
 * ---------------
 * The langchain chat agent needs a cryptographically validated, PingOne-issued
 * identity token, but token custody forbids the browser from ever holding one.
 * Previously the browser connected DIRECTLY to ws://localhost:8889 and sent an
 * unverifiable `user_id`/`userEmail` (the CR-02 spoof primitive).
 *
 * This proxy inserts the BFF (the sole token custodian) into that path:
 *
 *   Browser  ──(connect.sid cookie, same-origin wss)──►  BFF /ws/langchain
 *                                                          │
 *                       resolve user token from session    │
 *                       request RFC 8693 exchange → PingOne │ (T-4: BFF requests,
 *                       (aud = langchain agent resource)    │  PingOne performs)
 *                                                           ▼
 *                                            ws://localhost:8889 (langchain)
 *
 * The BFF injects the exchanged token into the FIRST `session_init` frame
 * server-side. The browser never sends or receives a token. langchain
 * validates the token's `aud` as its own resource (T-5: per-hop audience).
 *
 * §1 note: this module only READS req.session (token custody surface). It
 * performs no session writes and does not call req.session.save(). It does not
 * alter the existing /api/mcp/tool token pipeline.
 */

const WebSocket = require('ws');
const configStore = require('./configStore');
const oauthService = require('./oauthService');
const { getSessionBearerForMcp } = require('./mcpWebSocketClient');

const LANGCHAIN_WS_PATH = '/ws/langchain';

function langchainUpstreamUrl() {
  // Loopback only; mirrors run-demo.sh chat WS port (8889).
  return (
    configStore.getEffective('langchain_chat_ws_url') ||
    process.env.LANGCHAIN_CHAT_WS_URL ||
    'ws://localhost:8889'
  );
}

function langchainAudience() {
  // Returns '' when not provisioned — callers must handle empty string
  // (performTokenExchange will fail with a clear error, not silently use a wrong audience).
  return configStore.getEffective('pingone_resource_langchain_agent_uri') || '';
}

/**
 * Resolve a token whose `aud` langchain will validate as its own resource.
 *
 * Primary path: RFC 8693 token-exchange request to PingOne for the dedicated
 * langchain audience (the BFF requests; PingOne performs — T-4).
 *
 * Fallback (opt-in, FF_LANGCHAIN_AUDIENCE_FALLBACK): if the dedicated PingOne
 * resource server is not yet provisioned, fall back to the MCP-server audience
 * so the demo is not dead while the resource is configured. This is a
 * documented, explicit opt-in — never a silent cascade. See REGRESSION_PLAN §4.
 *
 * @returns {Promise<string>} access token for langchain
 */
async function resolveLangchainToken(req) {
  const userToken = getSessionBearerForMcp(req);
  if (!userToken) {
    const err = new Error('No PingOne user token in session');
    err.code = 'no_user_token';
    throw err;
  }

  const scopes = (
    configStore.getEffective('mcp_token_exchange_scopes') ||
    'read write'
  )
    .split(/\s+/)
    .filter(Boolean);
  const primaryAud = langchainAudience();

  try {
    const exchanged = await oauthService.performTokenExchange(
      userToken,
      primaryAud,
      scopes
    );
    return exchanged;
  } catch (primaryErr) {
    const fallbackOn =
      configStore.getEffective('ff_langchain_audience_fallback') === true ||
      configStore.getEffective('ff_langchain_audience_fallback') === 'true' ||
      process.env.FF_LANGCHAIN_AUDIENCE_FALLBACK === 'true';

    if (!fallbackOn) {
      // T-5: do NOT silently send a token for a different audience. Fail.
      primaryErr.code = primaryErr.code || 'token_exchange_failed';
      throw primaryErr;
    }

    const fallbackAud =
      configStore.getEffective('pingone_resource_mcp_server_uri');
    if (!fallbackAud) throw primaryErr;

    console.warn(
      '[langchain-proxy] Dedicated langchain audience exchange failed (%s). ' +
        'FF_LANGCHAIN_AUDIENCE_FALLBACK is ON — exchanging to MCP-server audience instead. ' +
        'Provision a PingOne resource server for %s to remove this fallback.',
      primaryErr.message,
      primaryAud
    );
    return await oauthService.performTokenExchange(
      userToken,
      fallbackAud,
      scopes
    );
  }
}

/**
 * Pipe frames between the browser WS and the langchain WS for the life of the
 * session. The FIRST `session_init` frame from the browser is rewritten to
 * carry the BFF-resolved token (the browser's frame never contains one).
 *
 * @param {WebSocket} browserWs   accepted browser connection
 * @param {string}    langchainToken token to inject into session_init
 */
function pipe(browserWs, langchainToken) {
  const upstream = new WebSocket(langchainUpstreamUrl());
  let upstreamOpen = false;
  let sessionInitInjected = false;
  const preOpenQueue = [];

  const closeBoth = (code, reason) => {
    try {
      if (browserWs.readyState === WebSocket.OPEN) browserWs.close(code, reason);
    } catch (_) {}
    try {
      if (upstream.readyState === WebSocket.OPEN) upstream.close(code, reason);
    } catch (_) {}
  };

  upstream.on('open', () => {
    upstreamOpen = true;
    for (const frame of preOpenQueue.splice(0)) upstream.send(frame);
  });

  upstream.on('message', (data) => {
    if (browserWs.readyState === WebSocket.OPEN) browserWs.send(data);
  });

  upstream.on('close', () => closeBoth(1000, 'upstream closed'));
  upstream.on('error', () => {
    try {
      if (browserWs.readyState === WebSocket.OPEN) {
        browserWs.send(
          JSON.stringify({
            type: 'error',
            error_code: 'upstream_unavailable',
            error_message: 'Chat backend is unavailable',
          })
        );
      }
    } catch (_) {}
    closeBoth(1011, 'upstream error');
  });

  browserWs.on('message', (raw) => {
    let outbound = raw;

    // Inject the BFF-resolved token into the first session_init only. The
    // browser-supplied frame is parsed defensively; on any parse failure we
    // forward unchanged (langchain will refuse a tokenless session_init).
    if (!sessionInitInjected) {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg && msg.type === 'session_init') {
          // Strip any client-claimed identity — Path A: identity is
          // token-derived. Never let the browser influence it.
          delete msg.userEmail;
          msg.auth_token = langchainToken;
          outbound = JSON.stringify(msg);
          sessionInitInjected = true;
        }
      } catch (_) {
        // non-JSON / not session_init — forward as-is
      }
    }

    if (upstreamOpen) upstream.send(outbound);
    else preOpenQueue.push(outbound);
  });

  browserWs.on('close', () => closeBoth(1000, 'client closed'));
  browserWs.on('error', () => closeBoth(1011, 'client error'));
}

/**
 * Attach the langchain chat-WS proxy to an existing HTTP/HTTPS server.
 *
 * Authenticates the WebSocket upgrade with the SAME express-session middleware
 * used for HTTP requests (cookie-based; the browser sends only connect.sid).
 *
 * @param {http.Server|https.Server} server
 * @param {import('express').RequestHandler} sessionMiddleware  the app's session() instance
 */
function attachLangchainChatProxy(server, sessionMiddleware) {
  const wss = new WebSocket.Server({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    let pathname;
    try {
      pathname = new URL(req.url, 'http://localhost').pathname;
    } catch (_) {
      pathname = req.url;
    }
    if (pathname !== LANGCHAIN_WS_PATH) {
      // Not ours — leave other upgrade listeners (if any) to handle it.
      return;
    }

    // Run express-session to populate req.session from the connect.sid cookie.
    sessionMiddleware(req, {}, () => {
      const authed =
        req.session &&
        req.session.oauthTokens &&
        (req.session.oauthTokens.accessToken ||
          req.session.oauthTokens.access_token);

      if (!authed) {
        socket.write(
          'HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n'
        );
        socket.destroy();
        return;
      }

      wss.handleUpgrade(req, socket, head, async (browserWs) => {
        try {
          const token = await resolveLangchainToken(req);
          pipe(browserWs, token);
        } catch (err) {
          try {
            browserWs.send(
              JSON.stringify({
                type: 'error',
                error_code: 'identity_unresolved',
                error_message:
                  'Could not establish an authenticated chat identity',
              })
            );
          } catch (_) {}
          browserWs.close(1011, 'identity unresolved');
          console.warn(
            '[langchain-proxy] token resolution failed: %s',
            err.message
          );
        }
      });
    });
  });

  console.log(
    `[langchain-proxy] BFF chat-WS proxy attached at ${LANGCHAIN_WS_PATH} → ${langchainUpstreamUrl()}`
  );
  return wss;
}

module.exports = {
  attachLangchainChatProxy,
  resolveLangchainToken,
  LANGCHAIN_WS_PATH,
};
