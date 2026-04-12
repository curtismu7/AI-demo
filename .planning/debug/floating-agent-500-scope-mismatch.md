---
status: investigating
trigger: "Investigate 'Could not parse: undefined' error in floating agent → 500 Internal Server Error from api/banking-agent/message endpoint. User just updated PingOne scopes and wants verification that scope config matches."
created: 2026-04-10T00:00:00Z
updated: 2026-04-10T00:00:00Z
symptoms_prefilled: true
---

## Current Focus

hypothesis: Backend throws unstructured error (or error with no message field) when MCP tool fails; frontend stringifies undefined message
test: Trace error through processAgentMessage → createBankingAgent → agentBuilder LangChain agent → scope/token validation
expecting: Find where undefined error.message is generated
next_action: Check if agentBuilder.createAgent throws error without message; check token exchange errors

## Symptoms

expected: Floating agent receives "show my accounts" request and returns account information
actual: "Could not parse: undefined" error displayed to user; API responds with 500
errors:
  - Frontend: api/banking-agent/message:1 Failed to load resource: 500 (Internal Server Error)
  - Message: "Could not parse: undefined"
reproduction:
  1. New incognito browser session
  2. Login via PingOne successfully
  3. Activate floating agent
  4. Ask "show my accounts"
  5. Get "Could not parse: undefined" error
timeline: Brand new incognito session; PingOne scopes were just updated; issue happens immediately
context: User just updated scopes on PingOne and wants verification that code expectations match PingOne app configuration

## Investigation Scope

1. Find and examine api/banking-agent/message handler (api/handler.js likely)
2. Find where "Could not parse" error is thrown (search codebase)
3. Locate MCP tool registry for "show my accounts" / accounts command
4. Check floating agent tool definitions and scope requirements
5. Compare PingOne scope configuration (current vs code expectations)
6. Review logs for 500 error details
7. Check scope validation/authorization flow for floating agent requests

## Eliminated

(none yet)

## Evidence

- timestamp: 2026-04-10T00:00:00Z
  checked: Call chain for /api/banking-agent/message
  found: Route handler → processAgentMessage() → createBankingAgent() → createMcpToolRegistry() → callMcpTool() → POST /api/mcp/tool
  implication: Error must originate from MCP tool invocation or response parsing

- timestamp: 2026-04-10T00:00:00Z
  checked: BankingAgent.js error handling (line 2221)
  found: `addMessage('assistant', \`Could not parse: ${err.message}\`)` - if err.message is undefined, displays "Could not parse: undefined"
  implication: Backend is throwing error with undefined or missing message property

- timestamp: 2026-04-10T00:00:00Z
  checked: frontend sendAgentMessage (bankingAgentService.js:387)
  found: Fetches /api/banking-agent/message, on error transforms response to {_status, ...data}. Returns data structure or JSON parse error {error: 'HTTP 500'}
  implication: When backend returns 500, frontend gets response.error and checks it; if still error, calls reportNlFailure(err) from catch block

- timestamp: 2026-04-10T00:00:00Z
  checked: bankingAgentRoutes.js POST /message handler (line 38-70)
  found: Route catches error and returns `res.status(500).json({ error: error.message })` - but error.message could be undefined if error object has no message
  implication: If processAgentMessage throws error with no message property, backend sends {error: undefined} which becomes "Could not parse: undefined"

## Resolution

root_cause: 
fix: 
verification: 
files_changed: []
