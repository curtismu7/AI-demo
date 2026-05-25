---
name: service-logging
description: Use when implementing, reviewing, or extending logging across the banking demo services — covers per-service log files, the unified transaction log, transaction/token/exchange headers, log rotation, and what each log must contain.
---

# Service Logging

## Overview

Every service writes its own log **and** writes to a shared unified log. The unified log is the educational artefact: it narrates the full OAuth + MCP + token-exchange story in chronological order with clear transaction headers so anyone watching a demo can follow what is happening.

## Log File Locations

All logs live under `/tmp/` (ephemeral, cleared on reboot — intentional for demos):

| Service | Per-service log | Launched by |
|---|---|---|
| BFF (demo_api_server) | `/tmp/demo-api.log` | `run.sh` |
| MCP Server (demo_mcp_server) | `/tmp/mcp-server.log` | `run.sh` |
| MCP Gateway (demo_mcp_gateway) | `/tmp/demo-mcp-gateway.log` | `run.sh` |
| MCP Gateway traffic | `/tmp/demo-mcp-traffic.log` | gateway internal |
| MCP Invest | `/tmp/mcp-invest.log` | `run.sh` |
| Agent Service | `/tmp/demo-agent.log` | `run.sh` |
| HITL Service | `/tmp/demo-hitl.log` | `run.sh` |
| Mortgage Service | `/tmp/demo-mortgage.log` | `run.sh` |
| **Unified** | `/tmp/demo-unified.log` | all services append |

## Unified Log Requirements

### Purpose
The unified log is the **single source of truth** for a complete request trace. It must be human-readable during a demo presentation and machine-parseable for log correlation.

### Transaction Headers
Every logical transaction (user action, tool call, token event, OAuth exchange) MUST open with a `═══` header block and close with a `───` footer:

```
════════════════════════════════════════════════════════════════
TRANSACTION: <type>  |  <timestamp>  |  correlation_id: <id>
User: <sub>  |  Tool: <tool_name>  |  Session: <session_id_prefix>
════════════════════════════════════════════════════════════════
  STEP 1 — GATEWAY INTROSPECTION
    Token aud:  mcpgateway.ping.demo
    Token sub:  4511829e...
    Client:     d3f8fead (MCP Exchanger)
    Result:     active=true  scope="mcp:invoke read"

  STEP 2 — STEP 9 TOKEN EXCHANGE (mcpgateway → enduser)
    Exchange client:  d21c5124 (Demo AI Agent)
    Subject token:    mcpgateway.ping.demo  →  enduser.ping.demo
    Scopes:           read
    Result:           success  expires_in=3600s

  STEP 3 — BANKING API CALL
    GET /api/accounts/my
    Token aud:  enduser.ping.demo
    Result:     200  accounts=3

  RESULT: ✅ success (244ms)
────────────────────────────────────────────────────────────────
```

### Transaction Types

| Type header | Triggered by |
|---|---|
| `OAUTH: USER_LOGIN` | PingOne PKCE callback → BFF session created |
| `OAUTH: TOKEN_EXCHANGE_1` | Exchange #1 — user token → agentgateway |
| `OAUTH: TOKEN_EXCHANGE_2` | Exchange #2 — agentgateway → mcpgateway |
| `OAUTH: TOKEN_EXCHANGE_9` | Step 9 — mcpgateway → enduser (MCP server) |
| `OAUTH: INTROSPECTION` | RFC 7662 introspect call to PingOne |
| `MCP: TOOL_CALL` | Any MCP tool execution (get_my_accounts, transfer, etc.) |
| `MCP: TOOLS_LIST` | Client requests tools/list |
| `MCP: SESSION_START` | New WebSocket or HTTP MCP session established |
| `AGENT: NL_QUERY` | Natural language query received by BFF agent service |
| `AGENT: HELIX_CALL` | Reasoning call to Helix/LLM |
| `HITL: CONSENT_REQUIRED` | 428 raised for a high-value transfer |
| `HITL: OTP_SENT` | PingOne OTP dispatched |
| `HITL: CONSENT_GRANTED` | User approved via OTP |

### Required Fields in Every Header

```
correlation_id   — shared across all services for this request; generated at BFF entry
timestamp        — ISO 8601 with milliseconds
service          — "bff" | "mcp-server" | "gateway" | "agent" | "hitl"
user_sub         — PingOne subject (redact last 4 chars if shown in UI)
session_id       — first 16 chars only
tool_name        — for MCP transactions only
```

### Log Line Format (within a transaction block)

Each step inside the block uses indented lines with a consistent prefix:

```
  STEP N — <LABEL IN CAPS>
    key: value
    key: value
    Result: <success|failure>  <detail>
```

Error steps use:
```
  STEP N — <LABEL> ❌
    error_code:  <code>
    message:     <message>
    pingone_response: { ... } (first 500 chars)
```

## Per-Service Log Content Rules

### BFF (`/tmp/demo-api.log`)
Must include:
- All inbound HTTP requests (method, path, status, duration)
- OAuth callback events (code received, tokens stored)
- Token exchange calls with client_id, audience, scope, result
- Session create/destroy events
- HITL events (challenge created, OTP sent, consent granted/denied)
- All 4xx/5xx with request context

Must NOT include:
- Full token values (log prefix + `...` only — first 8 chars)
- Session secrets or encryption keys

### MCP Server (`/tmp/mcp-server.log`)
Must include:
- Every tool call: name, session_id, agentToken prefix
- Introspection: client_id, endpoint, active, aud, scope, exp
- Step 9 exchange: client_id, audience, scope, result token aud
- Tool result: success/failure, duration
- Token chain audit events

### MCP Gateway (`/tmp/demo-mcp-gateway.log`)
Must include:
- Inbound bearer token prefix + aud from introspection
- Policy decision (PERMIT/DENY + reason)
- Upstream forward: destination, correlation_id
- mTLS status

### Unified Log (`/tmp/demo-unified.log`)
Built by each service appending to the shared file. Each service acquires an **advisory flock** before writing a transaction block to avoid interleaved lines:

```javascript
// Node.js append with flock (advisory)
const { execSync } = require('child_process');
const line = formatTransactionBlock(event);
fs.appendFileSync('/tmp/demo-unified.log', line);
// For atomic multi-line blocks use a temp file + mv, or wrap in flock shell:
execSync(`flock /tmp/demo-unified.log.lock -c "echo '${escaped}' >> /tmp/demo-unified.log"`);
```

## Correlation ID Propagation

The BFF generates `X-Request-ID` (UUID) at request entry and passes it as:
- HTTP header `X-Request-ID` to the MCP Gateway and BFF-internal calls
- MCP JSON-RPC `_meta.correlationId` field (non-standard extension, ignored by strict clients)
- Log field `correlation_id` in every service's log line

All services MUST log `correlation_id` so `logs_correlate` MCP tool can reconstruct a full trace.

## Log Rotation

`run.sh` truncates log files on start with `> /tmp/<name>.log` (not `>>`) — each `./run.sh` starts fresh. Unified log is also truncated. This is intentional: demos restart clean.

For production-style rotation (not used in demo): use `logrotate` or `pino-roll`.

## Reading Logs During a Demo

```bash
# Watch unified log live (all services, transaction headers highlighted)
tail -f /tmp/demo-unified.log | grep --color=always -E "═══|───|TRANSACTION|STEP|Result:|error"

# Correlate one request across all services
grep "correlation_id: <id>" /tmp/demo-*.log

# Using MCP tool (Claude Code)
# mcp__banking-dev__logs_correlate({ correlationId: "<id>" })
# mcp__banking-dev__logs_oauth_flow({})   ← OAuth/exchange events only
# mcp__banking-dev__logs_tail({ service: "mcp-server", lines: 50 })
```

## Implementation Checklist

When adding a new service or log event, verify:

- [ ] Per-service log file path added to `run.sh` startup truncation block
- [ ] Transaction header emitted at the start of every multi-step operation
- [ ] `correlation_id` propagated from inbound request and logged on every line
- [ ] Token values redacted (log `prefix...` only)
- [ ] Transaction footer emitted with `✅ success` or `❌ failure (reason)` + duration
- [ ] Unified log append call added with flock
- [ ] `mcp__banking-dev__logs_tail` service name registered in `dev_mcp/banking-dev/src/tools/logs.ts`
