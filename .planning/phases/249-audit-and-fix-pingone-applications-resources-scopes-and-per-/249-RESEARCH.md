# Phase 249 Research — PingOne Apps, Resources, Scopes & Per-Hop Audience Audit

**Date:** 2026-04-30
**Status:** RESEARCH COMPLETE — live audit via Management API

---

## Live Audit Results (via Worker Token, 2026-04-30)

Script: `scripts/pingone-audit-249.js` — queries PingOne Management API with worker credentials.

---

## Applications Inventory

18 total apps in the environment. Relevant apps:

| App Name | Client ID | Type | Grants |
|----------|-----------|------|--------|
| Super Banking Admin App | `14cefa5b` | WEB_APP | TOKEN_EXCHANGE, CIBA, REFRESH_TOKEN, AUTHORIZATION_CODE |
| Super Banking User App | `b2752071` | WEB_APP | CIBA, REFRESH_TOKEN, AUTHORIZATION_CODE |
| Super Banking AI Agent App | `2533a614` | AI_AGENT | TOKEN_EXCHANGE, CLIENT_CREDENTIALS |
| Super Banking MCP Token Exchanger | `6380065f` | AI_AGENT | TOKEN_EXCHANGE, CLIENT_CREDENTIALS |
| Super Banking Worker Token | `95dc946f` | WORKER | CLIENT_CREDENTIALS |
| Ping Identity | `2b82c7c5` | AI_AGENT | (not our app) |

All banking demo apps use CLIENT_SECRET_POST token auth.
Worker Token uses CLIENT_SECRET_BASIC.

---

## Resources Inventory

| Resource Name | Audience URI | Scopes Defined |
|--------------|-------------|---------------|
| Super Banking Banking API | https://resource-server.pingdemo.com | banking:sensitive, banking:read, banking:ai:agent, banking:write, banking:mcp:invoke, banking:admin |
| Super Banking Agent Gateway | https://agent-gateway.pingdemo.com | ai_agent, banking:read, transfer:execute, banking:mcp:invoke, banking:agent:invoke |
| Super Banking AI Agent Service | https://ai-agent.pingdemo.com | banking:mcp:invoke, banking:write, transfer:execute, banking:read, banking:sensitive, banking:ai:agent, banking:admin, banking:agent:invoke |
| Super Banking MCP Gateway | https://mcp-gateway.pingdemo.com | banking:ai:agent, banking:mcp:invoke, banking:write, banking:read |
| Super Banking MCP Server | https://mcp-server.pingdemo.com | banking:read, banking:ai:agent, banking:write, banking:mcp:invoke (WRONG - see Bug 3) |
| Super Bank | "Super Bank" (invalid, not a URI) | none — orphaned resource |

---

## Scope-Resolved Grant Matrix (LIVE from PingOne API)

### Admin App (14cefa5b)
| Resource | Scopes Granted |
|----------|---------------|
| ai-agent.pingdemo.com | banking:sensitive, banking:read, banking:ai:agent, banking:admin, banking:write |

CONCERN: Admin only gets aud=ai-agent.pingdemo.com — not resource-server.pingdemo.com.
Admin tokens cannot directly call the Banking API without further exchange.

### User App (b2752071)
| Resource | Scopes Granted |
|----------|---------------|
| ai-agent.pingdemo.com | banking:agent:invoke |
| resource-server.pingdemo.com | banking:sensitive, banking:read, banking:ai:agent, banking:mcp:invoke, banking:write, banking:admin |
| openid | offline_access, email, profile |

GOOD: banking:ai:agent is on user tokens.
NOTE: banking:mcp:invoke on user token directly is redundant — acquired via exchange.

### AI Agent App (2533a614)
| Resource | Scopes Granted |
|----------|---------------|
| ai-agent.pingdemo.com | banking:read, banking:ai:agent, banking:agent:invoke, banking:write |
| openid | openid |

CRITICAL GAP: No grant for agent-gateway.pingdemo.com.
The CC actor token cannot target aud=agent-gateway.pingdemo.com without this grant.

### MCP Token Exchanger (6380065f)
| Resource | Scopes Granted |
|----------|---------------|
| mcp-server.pingdemo.com | banking:write, banking:mcp:invoke, banking:read |
| openid | openid |

CRITICAL GAP: No grant for mcp-gateway.pingdemo.com.
Exchange #2 targets aud=mcp-gateway.pingdemo.com but the app has no grant for it.
This is the primary reason the MCP token exchange produces wrong-audience tokens.

### Worker Token (95dc946f)
No resource grants (uses implicit WORKER management scope).

---

## Confirmed Bugs — Ranked by Impact

### Bug 1 (CRITICAL): MCP Token Exchanger missing mcp-gateway.pingdemo.com grant

Impact: Exchange #2 (audience=mcp-gateway.pingdemo.com) fails. BFF never gets a valid
MCP Gateway token. All MCP tool calls fail at token exchange.

Fix — PingOne Console:
  Applications -> Super Banking MCP Token Exchanger -> Resources tab
  ADD resource: Super Banking MCP Gateway (https://mcp-gateway.pingdemo.com)
  Scopes: banking:mcp:invoke, banking:read, banking:write

### Bug 2 (CRITICAL): AI Agent App missing agent-gateway.pingdemo.com grant

Impact: AI Agent CC token cannot target aud=agent-gateway.pingdemo.com.
Exchange #1 actor token is invalid. Two-exchange chain broken at step 1.

Fix — PingOne Console:
  Applications -> Super Banking AI Agent App -> Resources tab
  ADD resource: Super Banking Agent Gateway (https://agent-gateway.pingdemo.com)
  Scopes: banking:agent:invoke, banking:read

### Bug 3 (MEDIUM): MCP Server resource has banking:mcp:invoke scope

Impact: This scope belongs only on mcp-gateway. Having it on mcp-server causes
the gateway re-exchange to potentially include it, which is semantically wrong.
The MCP Server should only need banking:read and banking:write.

Fix — PingOne Console:
  Resources -> Super Banking MCP Server -> Scopes
  DELETE the banking:mcp:invoke scope

### Bug 4 (MEDIUM): Gateway dev bypass still on

File: banking_mcp_gateway/.env
Line: MCP_GW_DEV_BYPASS=true
Fix: Python string replace (sed fails on this file due to comment lines)
  python3 -c "
f=open('banking_mcp_gateway/.env','r'); c=f.read(); f.close()
c=c.replace('MCP_GW_DEV_BYPASS=true','MCP_GW_DEV_BYPASS=false')
f=open('banking_mcp_gateway/.env','w'); f.write(c); f.close()
print('done')"

### Bug 5 (MEDIUM): BFF WebSocket client connects to MCP Server directly (port 8080)

File: banking_api_server/services/mcpWebSocketClient.js line 62
Code: configStore.getEffective('mcp_server_url') || 'ws://localhost:8080'
Impact: Tool calls via this path bypass the gateway transport entirely.
Need to confirm if tool execution uses this path or the HTTP mcpGatewayClient.

---

## PingOne Console — Complete Fix Checklist

### 1. MCP Token Exchanger (6380065f)
  [ ] ADD grant: Super Banking MCP Gateway
      Scopes: banking:mcp:invoke, banking:read, banking:write
  [ ] KEEP grant: Super Banking MCP Server
      REMOVE banking:mcp:invoke from this grant (after Bug 3 scope delete)

### 2. AI Agent App (2533a614)
  [ ] ADD grant: Super Banking Agent Gateway
      Scopes: banking:agent:invoke, banking:read
  [ ] KEEP grant: Super Banking AI Agent Service (existing scopes are correct)

### 3. MCP Server resource (https://mcp-server.pingdemo.com)
  [ ] DELETE scope: banking:mcp:invoke

---

## Token Chain — Correct End State

Step 0: User Token (aud=resource-server.pingdemo.com)
        scopes: banking:read, banking:write, banking:ai:agent
        may_act: { sub: "6380065f" }

Step 1: AI Agent CC Token (aud=agent-gateway.pingdemo.com)
        client: 2533a614 — REQUIRES Bug 2 fix

Step 2: Exchange #1 -> Agent Token (aud=ai-agent.pingdemo.com)
        act: { sub: "2533a614" }

Step 3: MCP Exchanger CC Token (aud=mcp-gateway.pingdemo.com)
        client: 6380065f — REQUIRES Bug 1 fix

Step 4: Exchange #2 -> MCP GW Token (aud=mcp-gateway.pingdemo.com)
        act: { sub: "6380065f", act: { sub: "2533a614" } }

Step 5: BFF -> Gateway (ws://localhost:3005)
        Gateway validates: aud == "https://mcp-gateway.pingdemo.com"

Step 6: Gateway re-exchanges -> Backend Token (aud=mcp-server.pingdemo.com)
        scopes: banking:read, banking:write

Step 7: Gateway -> MCP Server (ws://localhost:8080)

---

## Audit Script

scripts/pingone-audit-249.js — run to verify live state any time.

---

## RESEARCH COMPLETE

Next step: /gsd-plan-phase 249 --skip-research

Priority order:
1. Bug 1 + Bug 2 — PingOne Console grants (manual, ~5 min)
2. Bug 4 — disable gateway dev bypass (Python, 1 line)
3. Bug 5 — route BFF WebSocket through gateway (code change)
4. Bug 3 — remove banking:mcp:invoke from mcp-server scopes (cleanup)
