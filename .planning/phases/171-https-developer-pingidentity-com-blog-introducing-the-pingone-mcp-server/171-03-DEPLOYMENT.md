# Deploy to Production: Security Hardening Guide

Moving from demo to production means tightening every layer. This section covers the critical configuration changes, deployment options, and monitoring checkpoints.

## PingOne Configuration Checklist

Before deploying, verify these settings in your PingOne environment:

| Setting | Demo Value | Production Value |
|---------|-----------|-----------------|
| **App type** | Single-Page App | Web App (confidential client) |
| **Token endpoint auth** | `client_secret_basic` | `client_secret_basic` (or `private_key_jwt` for highest security) |
| **PKCE** | Required | Required (always — even for confidential clients) |
| **Redirect URIs** | `https://api.pingdemo.com:4000/...` | Your production domain only |
| **Token lifetimes** | Default | Access: 15 min, Refresh: 8 hours, ID: 1 hour |
| **Scopes** | All granted | Minimum required per application |
| **CIBA** | Poll mode | Poll or Ping mode (based on infrastructure) |
| **Token exchange** | Enabled | Enabled with audience restrictions |

> **Critical:** Remove `localhost` and `pingdemo.com` from redirect URIs in production. PingOne validates the redirect URI exactly — a single leftover dev URI is an open redirect vulnerability.

## Session and Cookie Security

The BFF stores all tokens in server-side sessions. In production, use a persistent session store:

```javascript
// Production session configuration
const session = require('express-session');
const RedisStore = require('connect-redis').default;
const { createClient } = require('redis');

// Use Upstash Redis for Vercel, or self-hosted Redis for on-premises
const redisClient = createClient({ url: process.env.REDIS_URL });

app.use(session({
  store: new RedisStore({ client: redisClient }),
  secret: process.env.SESSION_SECRET,    // Strong random value, not in code
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,          // JavaScript can't access
    secure: true,            // HTTPS only
    sameSite: 'lax',         // CSRF protection
    maxAge: 8 * 60 * 60 * 1000,  // 8 hours
    domain: '.yourdomain.com',    // Scope to your domain
  }
}));
```

**Why Redis?** Without a persistent store, Vercel serverless functions lose sessions between cold starts. Upstash Redis provides a serverless-compatible Redis with per-request pricing — ideal for the BFF pattern.

## Token Handling Rules

These rules are non-negotiable in production:

1. **Tokens stay server-side.** No access tokens, refresh tokens, or ID tokens in browser localStorage, sessionStorage, or cookies.
2. **Exchange before forwarding.** Never pass the user's original access token to the MCP server. Always use RFC 8693 to issue a narrowly-scoped token.
3. **Validate audience.** The MCP server must verify that incoming tokens have the correct `aud` claim. Reject tokens intended for other services.
4. **Short lifetimes.** Exchanged tokens should live 5-15 minutes. The BFF can always re-exchange if needed.
5. **Log token events.** Every exchange, refresh, and revocation should be logged with correlation IDs for audit.

## Vercel Deployment

The BX Finance demo includes Vercel-ready configuration:

```json
// vercel.json (simplified)
{
  "rewrites": [
    { "source": "/api/(.*)", "destination": "/api/handler" }
  ],
  "functions": {
    "api/handler.js": {
      "maxDuration": 30
    }
  }
}
```

**Environment variables to set in Vercel Dashboard:**

| Variable | Purpose |
|----------|---------|
| `PINGONE_AUTH_BASE_URL` | PingOne authorization server URL |
| `PINGONE_ENV_ID` | PingOne environment ID |
| `PINGONE_CLIENT_ID` | OAuth client ID |
| `PINGONE_CLIENT_SECRET` | OAuth client secret (encrypted by Vercel) |
| `SESSION_SECRET` | Random 64+ character string |
| `REDIS_URL` | Upstash Redis connection string |
| `MCP_RESOURCE_URI` | MCP server audience URI |
| `SKIP_TOKEN_SIGNATURE_VALIDATION` | **Must be `false`** in production |

> **Hard guard:** `SKIP_TOKEN_SIGNATURE_VALIDATION` bypasses JWT signature verification. It exists for local development only. In production, this **must** be `false` (or unset). The MCP server logs a warning at startup if this is enabled.

## On-Premises Deployment

For organizations that can't use serverless:

```yaml
# docker-compose.yml (production pattern)
services:
  banking-bff:
    build: ./banking_api_server
    environment:
      - NODE_ENV=production
      - REDIS_URL=redis://redis:6379
      - SESSION_SECRET=${SESSION_SECRET}
    ports:
      - "3001:3001"
    depends_on:
      - redis

  banking-ui:
    build: ./banking_api_ui
    ports:
      - "3000:3000"

  mcp-server:
    build: ./banking_mcp_server
    environment:
      - NODE_ENV=production
      - MCP_PORT=8080
    ports:
      - "8080:8080"

  redis:
    image: redis:7-alpine
    volumes:
      - redis-data:/data
```

**Key difference from Vercel:** The MCP server runs as a separate container with its own port. In Vercel, the MCP server would be deployed to a separate service (Railway, Render, or Fly.io) because Vercel's serverless model doesn't support persistent WebSocket connections.

## Monitoring Checklist

| Metric | Alert Threshold | Why |
|--------|----------------|-----|
| Token exchange failure rate | > 5% over 5 min | PingOne config issue or network problem |
| Session creation rate | > 100/min | Possible session fixation attack |
| 428 consent challenges | Spike > 3x baseline | Agent behavior change or abuse |
| CIBA timeout rate | > 20% | Users not responding to push notifications |
| Invalid `aud` rejections | Any occurrence | Token misdirection attempt |
| `SKIP_TOKEN_SIGNATURE_VALIDATION=true` | Any occurrence in prod | **Critical:** Immediate remediation |
