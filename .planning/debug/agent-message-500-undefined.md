---
status: investigating
trigger: "Agent message 500 — typing 'show my accounts' returns 'Could not parse: undefined', /api/banking-agent/message returns 500"
created: 2026-04-10T00:00:00Z
updated: 2026-04-10T00:00:00Z
symptoms_prefilled: true
goal: find_and_fix
---

## Current Focus

hypothesis: Route handler lacks proper try/catch, causing Express to emit generic 500 with no JSON body; UI receives empty/non-JSON response and shows "Could not parse: undefined"
test: Read bankingAgentRoutes.js message POST handler and BankingAgent.js error handling
expecting: Missing catch block or catch block that doesn't return JSON; UI code concatenates "Could not parse: " + undefined
next_action: Read key files in parallel

## Symptoms

expected: Agent processes "show my accounts" and returns account list
actual: UI shows "Could not parse: undefined", server returns 500 on /api/banking-agent/message
errors: |
  api/banking-agent/message: 500 (Internal Server Error)
  UI shows: "Could not parse: undefined"
reproduction: 1. Open incognito browser, 2. Login via PingOne OAuth, 3. Open floating banking agent, 4. Type "show my accounts", 5. Submit
started: New issue on fresh session — token has ONLY openid offline_access profile email scopes, no banking scopes

## Eliminated

(none yet)

## Evidence

- timestamp: 2026-04-10T00:00:00Z
  checked: critical_clue from investigation brief
  found: Token scopes are only "openid offline_access profile email" — no banking scopes. Audience is "https://api.pingone.com" not a banking API audience.
  implication: createBankingAgent() / token exchange / LangChain likely throws; question is whether the throw is caught and returned as JSON

## Resolution

root_cause:
fix:
verification:
files_changed: []
