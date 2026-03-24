/**
 * CRA custom dev proxy — replaces the static "proxy" field in package.json.
 *
 * Target is read from REACT_APP_API_PORT (default 3001) so run-bank.sh can
 * pass PORT=3002 without touching source files.
 *
 * Standard start:    API on :3001 HTTP  (REACT_APP_API_PORT unset / 3001)
 * run-bank.sh start: API on :3002 HTTPS (REACT_APP_API_PORT=3002, REACT_APP_API_HTTPS=true)
 *
 * Protocol selection: REACT_APP_API_HTTPS=true only enables HTTPS if the cert
 * file actually exists on disk (same check as server.js).  This prevents a
 * 500/EPROTO when the API server was started in HTTP mode (e.g. old process
 * or missing certs).
 */
const fs = require('fs');
const path = require('path');
const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function (app) {
  const apiPort = process.env.REACT_APP_API_PORT || '3001';

  // Use HTTPS automatically whenever the cert file is present — this mirrors the
  // same check in server.js so the proxy protocol always matches the server.
  // REACT_APP_API_HTTPS=true can still force-enable it even if the path differs.
  const certFile = path.join(__dirname, '../../certs/api.pingdemo.com+2.pem');
  const apiHttps = fs.existsSync(certFile) || process.env.REACT_APP_API_HTTPS === 'true';
  const protocol = apiHttps ? 'https' : 'http';
  const target = `${protocol}://localhost:${apiPort}`;

  app.use(
    '/api',
    createProxyMiddleware({
      target,
      changeOrigin: true,
      secure: false, // allow locally-trusted mkcert certs
      on: {
        error: function(err, req, res) {
          console.error('[proxy] Error forwarding', req.method, req.url, '->', target, ':', err.code || err.message);
          if (!res.headersSent) {
            res.writeHead(502, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'proxy_error', message: 'Banking API unreachable. Is the server running on port ' + apiPort + '?' }));
          }
        }
      }
    })
  );
};

