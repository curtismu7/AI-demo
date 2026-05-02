# Agent Flow Gap Analysis
**Date:** 2026-05-01  
**Source:** Whiteboard diagram — end-to-end agent/MCP authorization flow

---

## Flow vs. Codebase: Step-by-Step

| Step | Status | Notes |
|------|--------|-------|
| **1** — Agent client credentials token | ✅ IMPLEMENTED | `banking_agent_service/src/agentIdentity.ts` — full CC flow with caching |
| **2** — Agent gets tool list from MCP gateway | ✅ IMPLEMENTED | `mcpGatewayClient.ts` — sends `tools/list` RPC over WebSocket |
| **2a** — Gateway calls authorize on tools/list | ⚠️ PARTIAL | `pingAuthorizeGuard.ts` exists but is optional (requires `PINGAUTHORIZE_ENDPOINT`); not mandatory |
| **3–3c** — User → chatbot → LLM → selects tool | ✅ IMPLEMENTED | `BankingAgent.js` + `agentOrchestrator.ts` — full LLM tool selection loop |
| **4** — Agent calls check_balance tool | ✅ IMPLEMENTED | `mcpGatewayClient.ts` → JSON-RPC `tools/call` |
| **4a** — Gateway calls authorize | ✅ IMPLEMENTED | `authorizeMcpRequest.ts` middleware runs full pipeline |
| **4b** — Authorize denies: no subject token | ❌ MISSING | Gateway has no "missing subject token" detection; assumes user is already logged in |
| **4c** — Authorize returns required scope | ❌ MISSING | Deny responses return a reason string only — no structured `required_scope` list |
| **4d** — Gateway returns JSON-RPC unauthorized + required scope | ⚠️ PARTIAL | Returns JSON-RPC `-32403` but no `required_scope` field in error data |
| **5** — Agent tells chatbot: user must login with aud + scope | ❌ MISSING | Agent doesn't parse auth denial errors; chatbot has no login trigger |
| **5a** — App logs user in, user token has `may_act: agent1` | ⚠️ PARTIAL | Login flow exists but BFF doesn't request `may_act` claim; must come from PingOne token policy config |
| **6/6a** — RFC 8693 token exchange (actor + subject → TX token, aud: mcp-gw) | ✅ IMPLEMENTED | `tokenResolver.ts` — correct aud and scope narrowing |
| **7/7a/7b** — Gateway calls authorize with TX token + tool; returns permit | ✅ IMPLEMENTED | Full introspection → claim validation → PingOne Authorize pipeline |
| **8** — Gateway re-exchanges token for MCP backend | ✅ IMPLEMENTED | `McpTokenExchangeClient.ts` — per-backend token exchange |
| **9** — MCP performs token exchange for Resource | ⚠️ PARTIAL | `TokenExchangeService.ts` exists; no downstream credential exchange for backend APIs |
| **9a** — MCP uses vault for API key | ❌ MISSING | No vault integration; MCP calls banking API directly |
| **10** — Response chain back to chatbot | ✅ IMPLEMENTED | Full path: resource → MCP → gateway → agent → UI |
| **11/11a/11b** — Transfer via chatbot; gateway calls authorize | ✅ IMPLEMENTED | Transfer tool defined; same authorize pipeline runs |
| **11c** — Authorize returns deny + HITL requirement | ⚠️ PARTIAL | INDETERMINATE handled; deny doesn't include `required_scope: transfer` |
| **11d** — Gateway returns JSON-RPC unauthorized + HITL challenge | ⚠️ PARTIAL | Returns `-32002` with challenge ID; missing required scope in response |
| **12** — Agent invokes HITL/CIBA; re-exchanges with `balance + transfer` scope | ⚠️ PARTIAL | CIBA routes exist in BFF; agent cannot trigger CIBA directly — only BFF/UI can |
| **12a** — Repeat 6a–10 with new token | ❌ MISSING | No retry loop with expanded scopes after HITL approval |

---

## Critical Gaps (blocking the full loop)

### 1. Steps 4b–5: Auth denial → login trigger
The gateway doesn't distinguish "no user token" from other denials. The agent/chatbot have no handler for a "user must authenticate" response — the flow simply breaks silently.

**Files to change:**
- `banking_mcp_gateway/src/middleware/authorizeMcpRequest.ts` — detect missing subject token
- `banking_agent_service/src/mcpGatewayClient.ts` — parse `-32403` error codes
- `banking_api_ui/src/components/BankingAgent.js` — trigger login on auth denial

---

### 2. Steps 4c / 4d / 11c / 11d: Required scope absent from error responses
All deny responses return a plain reason string. The receiving agent cannot determine what scopes to request next, so the recovery path (login with correct scope, or scope expansion) is impossible.

**Files to change:**
- `banking_mcp_gateway/src/index.ts` — add `required_scope` to JSON-RPC error data
- `banking_mcp_gateway/src/auth/PingOneAuthorizeClient.ts` — surface scope info from Authorize decision

---

### 3. Step 12: Agent-initiated CIBA
HITL/CIBA can only be triggered from the BFF or UI. The agent service has no mechanism to:
- Push a CIBA challenge to the user
- Poll/wait for approval
- Resume the tool call after approval

**Files to change:**
- `banking_agent_service/src/agentOrchestrator.ts` — HITL detection + CIBA initiation
- `banking_api_server/routes/ciba.js` — expose agent-callable CIBA endpoint (or reuse existing)
- `banking_api_ui/src/components/BankingAgent.js` — surface CIBA challenge to user

---

### 4. Step 12a: Scope expansion + retry after HITL approval
After HITL approval there is no flow to re-exchange the token with `balance + transfer` scopes and retry the tool call. The approval is a dead end.

**Files to change:**
- `banking_agent_service/src/tokenResolver.ts` — support scope expansion in exchange
- `banking_agent_service/src/agentOrchestrator.ts` — retry tool call with new token

---

### 5. Step 5a: `may_act` claim on user token (PingOne config gap)
The user token won't contain `may_act: agent1` unless PingOne's token policy is configured to emit it. This is primarily a PingOne configuration task, but the BFF should request or validate it.

**Action:** Configure PingOne resource token policy to emit `may_act` claim mapping `agent1` client ID.

---

### 6. Step 9a: Vault / downstream credential exchange (out of scope for demo)
The MCP server calls banking APIs directly with no credential delegation or vault lookup. Full implementation is out of scope for the demo but is a real gap vs. the reference architecture.

---

## Component Coverage Summary

| Component | Coverage | Key Gaps |
|-----------|----------|----------|
| Agent Service (`banking_agent_service/`) | ~85% | Auth denial handling, login trigger, scope expansion + retry after HITL |
| MCP Gateway (`banking_mcp_gateway/`) | ~80% | `required_scope` in error responses, missing-subject-token detection |
| MCP Server (`banking_mcp_server/`) | ~70% | Downstream resource token exchange, vault integration |
| BFF (`banking_api_server/`) | ~75% | `may_act` at login, HITL approval → token re-exchange |
| UI (`banking_api_ui/`) | ~60% | Login trigger on auth denial, CIBA challenge display, scope consent, retry after approval |
| HITL Service (`banking_hitl_service/`) | ~40% | Isolated; no agent integration, no scope re-exchange trigger on approval |




In our Mythos slide, **“Agent Gateway behavioral enforcement”** is shorthand for: *using Agent Gateway as the inline policy enforcement point on MCP traffic, so you can allow/block/throttle agent calls based on how the agent is actually behaving in real time, not just whether it has a valid token*.&lt;cite&gt;citation_0:114-121,citation_1:36-43,citation_3:6-13,citation_9:30-36&lt;/cite&gt;

Concretely, that means the gateway can:

- **Validate and constrain every MCP request** (agent token, scopes, audience) before it reaches tools or data, enforcing delegated least privilege per action.&lt;cite&gt;citation_3:10-13,16-18,citation_9:30-35&lt;/cite&gt;  
- **Apply policy and rate rules over behavior** (which tools an agent is calling, what operations, how often, from where) and throttle or block patterns that look like exfiltration or abuse, even if the token itself is “valid.”&lt;cite&gt;citation_3:16-19,26-33,citation_9:30-36&lt;/cite&gt;  
- **Feed and consume risk signals** from things like PingOne Authorize/Protect so anomalous or high‑risk agent behavior can be dynamically denied, stepped‑up, or shut down at the gateway.&lt;cite&gt;citation_1:47-56,citation_8:13-18,citation_6:19-21&lt;/cite&gt;  

So “behavioral enforcement” here is really “**runtime, behavior‑aware policy enforcement on MCP traffic at the gateway**,” not a separate product surface.
