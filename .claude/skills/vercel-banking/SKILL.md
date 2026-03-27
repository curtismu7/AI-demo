---
name: vercel-banking
description: 'Vercel serverless deployment patterns and gotchas for BX Finance banking demo. USE FOR: vercel.json rewrites, api/handler.js, Upstash Redis session store, express-session config, cookie settings, PKCE state cookie, cold start, serverless function timeouts, environment variables, configStore, buildCommand, outputDirectory, deploy to production, preview deployments, invalid_state errors, nonce_mismatch errors, session lost between instances. DO NOT USE FOR: OAuth token logic (use oauth-pingone); MCP server deployment — use Railway/Render/Fly not Vercel (use mcp-server); PingOne Management API (use pingone-api-calls).'
argument-hint: 'Describe the deployment issue or Vercel config you need to change'
---

# Vercel Deployment — BX Finance Banking Demo

## How the App is Deployed

```
vercel.json
  installCommand: npm install --prefix banking_api_server && npm install --prefix banking_api_ui
  buildCommand:   cd banking_api_ui && npm run build
  outputDirectory: banking_api_ui/build    ← React static files

Routing (rewrites in vercel.json):
  /api/:path*   →  api/handler.js          ← all API requests
  /(anything)   →  /index.html             ← SPA client-side routing

api/handler.js = module.exports = require('../banking_api_server/server');
```

Everything in `banking_api_server/` runs as a **single Vercel serverless function** at `/api/handler`. The React build is served as static files from `banking_api_ui/build/`.

---

## Critical Vercel Gotchas

### 1. Multiple Instances — Sessions Don't Share Memory

Vercel spins up multiple function instances. An OAuth flow can start on instance A and the callback land on instance B — session is gone → `invalid_state` error.

**Solution: Redis session store + signed PKCE cookie fallback**

```javascript
// server.js — session store setup
const _redisUrl = _resolveRedisUrl(); // REDIS_URL or UPSTASH_REDIS_REST_URL+TOKEN
if (_redisUrl) {
  const RedisStore = require('connect-redis').default;
  const { createClient } = require('redis');
  const redisClient = createClient({ url: _redisUrl, socket: { tls: _redisUrl.startsWith('rediss://') } });
  redisClient.connect().catch(err => console.error('[session-store] Redis error:', err.message));
  sessionStore = new RedisStore({ client: redisClient, prefix: 'banking:sess:' });
}

// Session cookie config
cookie: {
  secure: true,       // must be true on Vercel (HTTPS only)
  httpOnly: true,
  sameSite: 'none',   // required — PingOne redirects cross-domain after auth
  maxAge: 24 * 60 * 60 * 1000
}
```

**→ Always add `REDIS_URL` (Upstash) to Vercel env vars.**

### 2. `req.session.save()` Required Before Redirects

Redis sessions don't flush synchronously. Without explicit `save()`, the session may not be written before PingOne redirects back.

```javascript
// ✅ Correct
req.session.save((err) => {
  if (err) return res.status(500).json({ error: 'session_save_failed' });
  res.redirect(authUrl);
});

// ❌ Wrong — session may not be persisted
res.redirect(authUrl);
```

### 3. PKCE Cookie Fallback

Even with Redis, use a signed PKCE cookie as fallback for cross-instance callbacks:

```javascript
// On login: write to BOTH session AND signed cookie
setPkceCookie(res, { state, codeVerifier, redirectUri, nonce }, isProd());

// On callback: prefer session, fall back to cookie
const pkceData = req.session.oauthState === state
  ? { codeVerifier: req.session.oauthCodeVerifier, ... }
  : readPkceCookie(req);  // validates HMAC automatically
```

### 4. `trust proxy` Required

Vercel terminates TLS before Express. Without `trust proxy`, `req.secure` is `false` and secure cookies won't be set.

```javascript
app.set('trust proxy', 1);  // required for Vercel
```

### 5. WebSocket Not Supported

Vercel serverless does **not** support persistent WebSocket. The `banking_mcp_server` must be hosted on Railway/Render/Fly.io. Set `MCP_SERVER_URL=wss://...` in Vercel env vars.

---

## vercel.json Structure

```json
{
  "version": 2,
  "build": {
    "env": {
      "NODE_VERSION": "20",
      "CI": "false",
      "GENERATE_SOURCEMAP": "false"
    }
  },
  "installCommand": "npm install --prefix banking_api_server && npm install --prefix banking_api_ui",
  "buildCommand": "cd banking_api_ui && npm run build",
  "outputDirectory": "banking_api_ui/build",
  "rewrites": [
    { "source": "/api/:path*", "destination": "/api/handler" },
    { "source": "/((?!api/).*)", "destination": "/index.html" }
  ]
}
```

**Rules:**
- Rewrite order matters — `/api/:path*` must come before the SPA catch-all
- Do NOT add patterns for individual API routes — all go to `/api/handler`
- Adding a new Express route (`app.use('/api/new-route', ...)`) needs NO `vercel.json` change

---

## Environment Variables

Set in **Vercel Dashboard → Project → Settings → Environment Variables** (not in `.env`).

### Required for OAuth

| Variable | Description |
|----------|-------------|
| `REDIS_URL` | Redis connection URL (`rediss://...`) — from Upstash or Vercel KV |
| `SESSION_SECRET` | 32+ char random string |
| `PINGONE_ENVIRONMENT_ID` | PingOne env ID |
| `PINGONE_REGION` | `com` / `eu` / `ca` / `asia` |
| `PINGONE_AI_CORE_CLIENT_ID` | Admin OAuth app client ID |
| `PINGONE_AI_CORE_CLIENT_SECRET` | Admin OAuth app client secret |
| `PINGONE_AI_CORE_REDIRECT_URI` | `https://<url>/api/auth/oauth/callback` |
| `PINGONE_AI_CORE_USER_CLIENT_ID` | User OAuth app client ID |
| `PINGONE_AI_CORE_USER_REDIRECT_URI` | `https://<url>/api/auth/oauth/user/callback` |
| `REACT_APP_CLIENT_URL` | Frontend URL (for post-logout redirect) |

### Required for MCP / Banking Agent

| Variable | Value |
|----------|-------|
| `MCP_SERVER_URL` | `wss://your-mcp-server-host` |

### Optional

| Variable | Default | Description |
|----------|---------|-------------|
| `CIBA_ENABLED` | `false` | Enable CIBA flows |
| `STEP_UP_ACR_VALUE` | `Multi_factor` | DaVinci ACR for step-up |
| `SKIP_TOKEN_SIGNATURE_VALIDATION` | — | **Fatal if `true` in production** |
| `DEBUG_OAUTH` | `false` | Verbose OAuth logging (never `true` in prod) |
| `PUBLIC_APP_URL` | auto-detected | Override redirect URI base URL |

### Upstash Setup (Free Tier)

1. [upstash.com](https://upstash.com) → Create database → Copy `REDIS_URL`
2. Or: Vercel Dashboard → Storage → Add Upstash KV to get `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` auto-injected
3. Server auto-detects both — `REDIS_URL` takes priority

---

## Deploying

```bash
# Full pipeline from repo root
npm run build --prefix banking_api_ui \
  && git add -A \
  && git commit -m "..." \
  && git push origin main \
  && vercel --prod
```

**After deploying:**
1. Verify redirect URIs in PingOne match the new deployment URL
2. Check `GET /api/auth/oauth/redirect-info` for detected redirect URIs
3. First login after a new deploy may have a cold-start delay (~3-5s)

---

## Local vs Vercel

| Concern | Local | Vercel |
|---------|-------|--------|
| API server | `banking_api_server` on port 3001 | `api/handler.js` serverless |
| Sessions | In-memory (MemoryStore) | Must use Redis |
| Cookies | `secure: false`, `sameSite: lax` | `secure: true`, `sameSite: none` |
| `api/handler.js` | NOT used (`src/setupProxy.js`: `/api →` `REACT_APP_API_PORT`, default 3001) | Used for all /api/* |
| HTTPS | Plain HTTP | Enforced (301 redirect) |

Local `/api` is proxied only by `banking_api_ui/src/setupProxy.js` (do not add `package.json` `"proxy"` — it can break static files under `public/design/`).

---

## Common Deployment Issues

| Symptom | Cause | Fix |
|---------|-------|-----|
| `invalid_state` on login | No Redis → sessions lost across instances | Add `REDIS_URL` |
| `nonce_mismatch` on callback | Same root cause | Add `REDIS_URL` |
| Secure cookie not set | `trust proxy` missing | Verify `app.set('trust proxy', 1)` |
| Server exits immediately | `SKIP_TOKEN_SIGNATURE_VALIDATION=true` in prod | Remove the var |
| MCP shows "connecting..." forever | `MCP_SERVER_URL` not set | Set `MCP_SERVER_URL` in Vercel env vars |
| Redirect URI mismatch | PingOne URI ≠ deployment URL | Update PingOne app redirect URIs |
| Build fails TypeScript errors | `CI=false` missing | Ensure `"CI": "false"` in `vercel.json` build.env |
